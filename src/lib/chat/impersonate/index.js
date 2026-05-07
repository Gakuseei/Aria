import { resolveProfile } from '../../modelProfiles.js';
import { OLLAMA_DEFAULT_URL, DEFAULT_MODEL_NAME } from '../../defaults.js';
import { assembleRuntimeContext, buildRuntimeState } from '../../chatRuntime/index.js';
import { ASSIST_BUDGET_CONFIG, deriveAssistBudgetTier, getModelCtx, getModelCapabilities } from '../../ollama/index.js';
import { isElectron } from '../platform.js';
import {
  finalizeImpersonateDraft,
  isStructurallyValid
} from './draftValidator.js';

const FIRST_REPLY_NUM_PREDICT_CAP = 120;

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
function trimToCompleteSentences(text, maxSentences = 2) {
  let cleaned = String(text || '').trim();
  if (!cleaned) return cleaned;

  const ELLIPSIS_TAIL = /(?:\.{3}|…)["'*)\]]?\s*$/;
  if (ELLIPSIS_TAIL.test(cleaned)) {
    cleaned = cleaned.replace(ELLIPSIS_TAIL, '').trim();
    const lastClose = Math.max(
      cleaned.lastIndexOf('."'),
      cleaned.lastIndexOf('!"'),
      cleaned.lastIndexOf('?"'),
      cleaned.lastIndexOf('.*'),
      cleaned.lastIndexOf('!*'),
      cleaned.lastIndexOf('?*'),
      cleaned.lastIndexOf('.'),
      cleaned.lastIndexOf('!'),
      cleaned.lastIndexOf('?')
    );
    if (lastClose > 0) cleaned = cleaned.substring(0, lastClose + 1).trim();
  }

  const asteriskCount = (cleaned.match(/\*/g) || []).length;
  if (asteriskCount % 2 === 1) {
    const lastAsterisk = cleaned.lastIndexOf('*');
    if (lastAsterisk > 0) {
      const beforeAsterisk = cleaned.substring(0, lastAsterisk).trimEnd();
      const lastEnd = Math.max(
        beforeAsterisk.lastIndexOf('."'),
        beforeAsterisk.lastIndexOf('!"'),
        beforeAsterisk.lastIndexOf('?"'),
        beforeAsterisk.lastIndexOf('.'),
        beforeAsterisk.lastIndexOf('!'),
        beforeAsterisk.lastIndexOf('?')
      );
      cleaned = lastEnd > 0 ? beforeAsterisk.substring(0, lastEnd + 1).trim() : beforeAsterisk;
    }
  }

  const sentenceParts = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentenceParts.length > maxSentences) {
    cleaned = sentenceParts.slice(0, maxSentences).join(' ').trim();
  }

  return cleaned;
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
  onToken
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
    repeat_last_n: sampler?.repeatLastN ?? 64,
    penalize_newline: sampler?.penalizeNewline ?? false
  };

  let accumulated = '';
  let unsubscribe = () => {};

  if (isElectron()) {
    unsubscribe = window.electronAPI.onOllamaStreamToken(({ requestId: incoming, token }) => {
      if (incoming !== requestId || typeof token !== 'string') return;
      accumulated += token;
      if (isPossiblePrefixPrefix(accumulated, userName)) return;
      const visible = stripAssistantPrefix(accumulated, userName);
      onToken(token, visible);
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
      if (result?.aborted) {
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

  const numPredictForRun = ctx.debug?.firstReply
    ? Math.min(budgetConfig.impersonateFirstTokens, FIRST_REPLY_NUM_PREDICT_CAP)
    : budgetConfig.impersonateFirstTokens;

  const runOnce = () => runStreamingDraft({
    ollamaUrl,
    model,
    numCtx: impersonateNumCtx,
    numPredict: numPredictForRun,
    systemPrompt: ctx.systemPrompt,
    userPrompt: ctx.userPrompt,
    assistantPrefix: ctx.assistantPrefix,
    stopStrings: ctx.stopStrings,
    sampler: ctx.sampler,
    userName,
    charName,
    onToken
  });

  let finalized = await runOnce();
  if (ctx.debug?.firstReply && finalized.text) {
    finalized = { ...finalized, text: trimToCompleteSentences(finalized.text, 2) };
  }
  if (!isStructurallyValid(finalized.text, userName, charName)) {
    console.info('[API] Impersonate retry: first stream produced invalid structure');
    onToken(null, '');
    finalized = await runOnce();
    if (ctx.debug?.firstReply && finalized.text) {
      finalized = { ...finalized, text: trimToCompleteSentences(finalized.text, 2) };
    }
  }
  if (!isStructurallyValid(finalized.text, userName, charName)) {
    onToken(null, '');
    throw new Error('Failed to generate a usable draft');
  }

  onToken(null, finalized.text);
  return finalized.text;
}
