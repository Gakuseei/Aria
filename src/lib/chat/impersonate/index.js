import { resolveProfile, resolveImpersonateSampler } from '../../modelProfiles.js';
import { OLLAMA_DEFAULT_URL, DEFAULT_MODEL_NAME } from '../../defaults.js';
import { assembleRuntimeContext, buildRuntimeState } from '../../chatRuntime/index.js';
import { ASSIST_BUDGET_CONFIG, deriveAssistBudgetTier, getModelCtx, getModelCapabilities } from '../../ollama/index.js';
import { isElectron } from '../platform.js';
import {
  finalizeImpersonateDraft,
  isStructurallyValid
} from './draftValidator.js';
import { checkPhraseRepetition, checkGestureRepetition, REPETITION_RETRY_HINT } from '../repetitionGuard.js';

/**
 * Translate user voice features into a sentence-count target for impersonate drafts.
 * First reply or thin history → 1 (short opener). Otherwise map avgWords:
 *   <= 8 words → 1 sentence, <= 25 → 2, > 25 → 3.
 *
 * @param {{ avgWords: number, exampleCount: number } | null | undefined} voiceFeatures
 * @param {boolean} isFirstReply
 * @returns {1|2|3}
 */
export function computeSentenceTarget(voiceFeatures, isFirstReply) {
  if (isFirstReply) return 1;
  if (!voiceFeatures || (voiceFeatures.exampleCount ?? 0) < 2) return 1;
  const avg = Number(voiceFeatures.avgWords) || 0;
  if (avg <= 8) return 1;
  if (avg <= 25) return 2;
  return 3;
}

/**
 * Compute Ollama num_predict for impersonate. Safety-net behind streaming early-stop.
 * Formula: sentenceTarget * 50 + 30 (≈ Nemo sentence ≈ 35-50 tokens, +30 buffer).
 * Clamped to [60, profileCap].
 *
 * @param {1|2|3} sentenceTarget
 * @param {number} profileCap - typically budgetConfig.impersonateRetryTokens
 * @returns {number}
 */
export function computeNumPredict(sentenceTarget, profileCap) {
  const raw = sentenceTarget * 50 + 30;
  const ceiling = Math.max(60, Math.min(profileCap, raw));
  return ceiling;
}

let activeRequestId = null;

export function abortImpersonateCall() {
  if (activeRequestId && isElectron() && window.electronAPI?.ollamaStreamAbort) {
    window.electronAPI.ollamaStreamAbort(activeRequestId, 'user');
  }
  activeRequestId = null;
}

function stripAssistantPrefix(fullText, userName) {
  const text = String(fullText || '');
  const withSpace = `${userName}: `;
  const withoutSpace = `${userName}:`;
  if (text.startsWith(withSpace)) return text.slice(withSpace.length);
  if (text.startsWith(withoutSpace)) return text.slice(withoutSpace.length).replace(/^\s+/, '');
  return text;
}

function isPossiblePrefixPrefix(accumulated, userName) {
  const withSpace = `${userName}: `;
  if (accumulated.length >= withSpace.length) return false;
  return withSpace.startsWith(accumulated);
}

/**
 * Trim a draft to complete sentences for first-reply outputs.
 *
 * Drops trailing ellipsis-truncation markers (`..."`, `...*`, `…"`),
 * fixes orphan trailing asterisks from unclosed action segments, and caps
 * the result to a sentence ceiling.
 *
 * @param {string} text - Draft text after finalize.
 * @param {number} [maxSentences=2] - Maximum sentences to keep.
 * @returns {string} Cleaned text.
 */
export function trimToCompleteSentences(text, maxSentences = 2) {
  let cleaned = String(text || '').trim();
  if (!cleaned) return cleaned;

  const SENTENCE_END_RE = /(?<![.!?])[.!?]["'*)\]]?(?=\s|$)/g;

  function lastSentenceBoundary(input) {
    let lastIdx = -1;
    let lastLen = 0;
    const re = new RegExp(SENTENCE_END_RE.source, 'g');
    let m;
    while ((m = re.exec(input)) !== null) {
      lastIdx = m.index;
      lastLen = m[0].length;
    }
    return lastIdx >= 0 ? lastIdx + lastLen : -1;
  }

  const ELLIPSIS_TAIL = /(?:\.{3}|…)["'*)\]]?\s*$/;
  if (ELLIPSIS_TAIL.test(cleaned)) {
    cleaned = cleaned.replace(ELLIPSIS_TAIL, '').trim();
    const quoteCount = (cleaned.match(/"/g) || []).length;
    if (quoteCount % 2 === 1) {
      const lastQuote = cleaned.lastIndexOf('"');
      if (lastQuote >= 0) cleaned = cleaned.substring(0, lastQuote).trim();
    }
    const boundary = lastSentenceBoundary(cleaned);
    if (boundary > 0) cleaned = cleaned.substring(0, boundary).trim();
  }

  const asteriskCount = (cleaned.match(/\*/g) || []).length;
  if (asteriskCount % 2 === 1) {
    const lastAsterisk = cleaned.lastIndexOf('*');
    if (lastAsterisk > 0) {
      const beforeAsterisk = cleaned.substring(0, lastAsterisk).trimEnd();
      const boundary = lastSentenceBoundary(beforeAsterisk);
      cleaned = boundary > 0 ? beforeAsterisk.substring(0, boundary).trim() : beforeAsterisk.trim();
    }
  }

  const sentenceEnds = [];
  const allRe = new RegExp(SENTENCE_END_RE.source, 'g');
  let match;
  while ((match = allRe.exec(cleaned)) !== null) {
    sentenceEnds.push(match.index + match[0].length);
  }
  if (sentenceEnds.length > maxSentences) {
    cleaned = cleaned.substring(0, sentenceEnds[maxSentences - 1]).trim();
  }

  return cleaned;
}

function countCompletedUnits(text) {
  if (!text) return 0;
  let count = 0;
  let inQuote = false;
  let inAction = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"' && !inAction) {
      if (inQuote) count += 1;
      inQuote = !inQuote;
    } else if (ch === '*' && !inQuote) {
      if (inAction) count += 1;
      inAction = !inAction;
    } else if (!inQuote && !inAction && (ch === '.' || ch === '!' || ch === '?')) {
      const prev = text[i - 1];
      if (prev === '.' || prev === '!' || prev === '?') continue;
      let lookback = i - 1;
      while (lookback >= 0 && /\s/.test(text[lookback])) lookback -= 1;
      if (lookback >= 0 && text[lookback] === '"') continue;
      const next = text[i + 1];
      if (!next || /\s/.test(next)) count += 1;
    }
  }
  return count;
}

async function runStreamingDraft({
  ollamaUrl,
  model,
  numCtx,
  numPredict,
  systemPrompt,
  userPrompt,
  assistantPrefix,
  stopStrings,
  sampler,
  userName,
  charName,
  onToken,
  earlyStopMaxSentences = 0
}) {
  const requestId = `impersonate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
    { role: 'assistant', content: assistantPrefix }
  ];

  const options = {
    num_predict: numPredict,
    num_ctx: numCtx,
    temperature: sampler?.temperature ?? 0.7,
    top_k: sampler?.topK ?? 40,
    top_p: sampler?.topP ?? 0.9,
    min_p: sampler?.minP ?? 0,
    repeat_penalty: sampler?.repeatPenalty ?? 1.0,
    repeat_last_n: sampler?.repeatLastN ?? 256,
    penalize_newline: sampler?.penalizeNewline ?? false
  };
  if (sampler?.flags?.dry) {
    options.dry_multiplier = sampler.flags.dryMultiplier ?? 0.8;
    options.dry_base = sampler.flags.dryBase ?? 1.75;
    options.dry_allowed_length = sampler.flags.dryAllowedLength ?? 2;
    options.dry_penalty_last_n = sampler.flags.dryPenaltyLastN ?? 512;
  }

  let accumulated = '';
  let earlyStopFired = false;
  let unsubscribe = () => {};

  if (isElectron()) {
    unsubscribe = window.electronAPI.onOllamaStreamToken(({ requestId: incoming, token }) => {
      if (incoming !== requestId || typeof token !== 'string') return;
      accumulated += token;
      if (isPossiblePrefixPrefix(accumulated, userName)) return;
      const visible = stripAssistantPrefix(accumulated, userName);
      onToken(token, visible);
      if (
        earlyStopMaxSentences > 0
        && !earlyStopFired
        && countCompletedUnits(visible) >= earlyStopMaxSentences
      ) {
        earlyStopFired = true;
        if (window.electronAPI?.ollamaStreamAbort) {
          window.electronAPI.ollamaStreamAbort(requestId, 'auto-length');
        }
      }
    });
    activeRequestId = requestId;

    try {
      const result = await window.electronAPI.ollamaChatStream({
        requestId,
        ollamaUrl,
        model,
        messages,
        options,
        stop: stopStrings
      });
      if (!result?.success && !result?.aborted) {
        throw new Error(result?.error || 'Ollama stream failed');
      }
      if (result?.aborted && !result?.success) {
        const err = new Error('Aborted');
        err.name = 'AbortError';
        throw err;
      }
    } finally {
      unsubscribe();
      if (activeRequestId === requestId) activeRequestId = null;
    }
  } else {
    throw new Error('impersonateUser requires Electron streaming');
  }

  const stripped = stripAssistantPrefix(accumulated, userName);
  return finalizeImpersonateDraft(stripped, { charName, userName });
}

/**
 * Generate a user-perspective reply by streaming tokens live into onToken.
 *
 * @param {Array} history - Conversation history
 * @param {object} character - Character object (must have .name)
 * @param {string} userName - User name
 * @param {number} passionLevel - Current passion level 0-100
 * @param {object} settings - App settings (ollamaUrl, ollamaModel, customProfiles, userGender, userPronouns, contextSize, maxResponseTokens)
 * @param {function} onToken - Called with (token, displayText) on each token, then once with (null, finalText)
 * @param {object|null} sceneMemory - Persisted scene memory (optional)
 * @param {boolean} unchainedMode - Whether unchained mode is active
 * @returns {Promise<string>} Final cleaned draft text
 */
export async function impersonateUser(
  history,
  character,
  userName,
  passionLevel,
  settings,
  onToken,
  sceneMemory = null,
  unchainedMode = false
) {
  abortImpersonateCall();

  const ollamaUrl = settings.ollamaUrl || OLLAMA_DEFAULT_URL;
  const model = settings.ollamaModel || DEFAULT_MODEL_NAME;
  const numCtx = await getModelCtx(ollamaUrl, model, settings.contextSize || 4096);
  const modelCapabilities = await getModelCapabilities(ollamaUrl, model);
  const assistBudgetTier = deriveAssistBudgetTier({
    parameterSize: modelCapabilities.parameterSize,
    modelName: model,
    contextSize: settings.contextSize || 4096,
    maxResponseTokens: settings.maxResponseTokens
  });
  const budgetConfig = ASSIST_BUDGET_CONFIG[assistBudgetTier];
  const impersonateNumCtx = Math.min(numCtx, budgetConfig.impersonateNumCtxCap);
  const profile = resolveProfile(model, settings.customProfiles);
  const charName = character?.name || 'Character';
  const userGender = settings.userGender || 'male';
  const userPronouns = settings.userPronouns || 'he/him';

  const runtimeState = buildRuntimeState({
    character,
    history,
    userName,
    userGender,
    userPronouns,
    runtimeSteering: {
      profile: 'impersonate',
      availableContextTokens: Math.max(320, impersonateNumCtx - budgetConfig.impersonateContextReserve),
      passionLevel,
      unchainedMode,
      assistBudgetTier,
      persistedSceneMemory: sceneMemory,
      resolvedProfile: profile
    }
  });

  const ctx = assembleRuntimeContext({ profile: 'impersonate', runtimeState });
  console.log('[API] Impersonate runtime:', ctx.debug);

  if (ctx.narratorSkip) {
    onToken(null, '');
    return '';
  }

  const sentenceTarget = ctx.debug?.sentenceTarget || 1;
  const profileCap = budgetConfig.impersonateRetryTokens;
  const numPredictForRun = computeNumPredict(sentenceTarget, profileCap);
  const earlyStopMaxSentences = sentenceTarget;
  const impersonateSampler = resolveImpersonateSampler(model, settings.customProfiles);
  const effectiveSampler = {
    temperature: impersonateSampler.temperature,
    topK: impersonateSampler.topK,
    topP: impersonateSampler.topP,
    minP: impersonateSampler.minP,
    repeatPenalty: impersonateSampler.repeatPenalty,
    repeatLastN: impersonateSampler.repeatLastN,
    penalizeNewline: impersonateSampler.penalizeNewline,
    flags: impersonateSampler.flags || {}
  };

  const runOnce = (extraSystemHint = '') => runStreamingDraft({
    ollamaUrl,
    model,
    numCtx: impersonateNumCtx,
    numPredict: numPredictForRun,
    systemPrompt: extraSystemHint ? `${ctx.systemPrompt}\n\n${extraSystemHint}` : ctx.systemPrompt,
    userPrompt: ctx.userPrompt,
    assistantPrefix: ctx.assistantPrefix,
    stopStrings: ctx.stopStrings,
    sampler: effectiveSampler,
    earlyStopMaxSentences,
    userName,
    charName,
    onToken
  });

  let finalized = await runOnce();
  if (finalized.text) {
    finalized = { ...finalized, text: trimToCompleteSentences(finalized.text, sentenceTarget) };
  }
  if (!isStructurallyValid(finalized.text, userName, charName)) {
    console.info('[API] Impersonate retry: first stream produced invalid structure');
    onToken(null, '');
    finalized = await runOnce();
    if (finalized.text) {
      finalized = { ...finalized, text: trimToCompleteSentences(finalized.text, sentenceTarget) };
    }
  }
  if (!isStructurallyValid(finalized.text, userName, charName)) {
    onToken(null, '');
    throw new Error('Failed to generate a usable draft');
  }

  const recentUserReplies = (history || [])
    .filter((message) => message && message.role === 'user' && typeof message.content === 'string')
    .slice(-5)
    .map((message) => message.content);
  const evaluateImpersonateRepetition = (candidate) => {
    const phrase = checkPhraseRepetition(candidate, recentUserReplies, { charName, userName });
    if (phrase.banned) return phrase;
    const gesture = checkGestureRepetition(candidate, recentUserReplies);
    return gesture.banned ? { banned: true, source: 'gesture', phrase: gesture.gesture } : { banned: false };
  };
  const initialImpersonateRepetition = evaluateImpersonateRepetition(finalized.text);
  console.info(`[API] Impersonate repetition guard: history=${recentUserReplies.length}, banned=${initialImpersonateRepetition.banned}${initialImpersonateRepetition.banned ? `, source=${initialImpersonateRepetition.source}` : ''}`);
  if (initialImpersonateRepetition.banned) {
    console.warn(`[API] Impersonate repetition guard — ${initialImpersonateRepetition.source}: "${initialImpersonateRepetition.phrase}", retrying`);
    onToken(null, '');
    let retryFinalized = await runOnce(REPETITION_RETRY_HINT);
    if (retryFinalized.text) {
      retryFinalized = { ...retryFinalized, text: trimToCompleteSentences(retryFinalized.text, sentenceTarget) };
    }
    if (isStructurallyValid(retryFinalized.text, userName, charName)) {
      const retryRepetition = evaluateImpersonateRepetition(retryFinalized.text);
      if (!retryRepetition.banned) {
        finalized = retryFinalized;
      } else {
        console.warn('[API] Impersonate repetition retry still banned, accepting original');
      }
    } else {
      console.warn('[API] Impersonate repetition retry produced invalid structure, accepting original');
    }
  }

  onToken(null, finalized.text);
  return finalized.text;
}
