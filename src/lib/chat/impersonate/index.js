import { getModelProfile } from '../../modelProfiles.js';
import { OLLAMA_DEFAULT_URL, DEFAULT_MODEL_NAME } from '../../defaults.js';
import { assembleRuntimeContext, buildRuntimeState } from '../../chatRuntime/index.js';
import { ASSIST_BUDGET_CONFIG, deriveAssistBudgetTier, getModelCtx, getModelCapabilities } from '../../ollama/index.js';
import { cleanTranscriptArtifacts } from '../common.js';
import { isElectron } from '../platform.js';
import {
  escapeRegex,
  repairLeadingActionBlock,
  repairLeadingNarrationSegment
} from '../language.js';

let impersonateAbortController = null;
const WRITE_FOR_ME_GENERIC_PATTERN = /\b(?:electricity between us|cannot deny|there'?s no denying|lingering for a heartbeat longer than necessary|beneath those long lashes|warm smile spreads|vision bathed in|presence has come to mean|hint of color in her cheeks|warmth between us|something unspoken)\b/i;
const WRITE_FOR_ME_META_LEAD_PATTERN = /^(?:here(?:'s| is)?|sure|okay|alright|i can|i'll|let me|try this|you could say|maybe)\b/i;
const WRITE_FOR_ME_MALFORMED_LEAD_PATTERN = /^\*?\s*I\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/;

export function abortImpersonateCall() {
  if (impersonateAbortController) {
    impersonateAbortController.abort();
    impersonateAbortController = null;
  }
  if (isElectron() && window.electronAPI?.abortAiChat) {
    window.electronAPI.abortAiChat('impersonate');
  }
}

function hasInvalidImpersonateLead(text, userName, charName = '') {
  const trimmed = String(text || '').trim();
  if (!trimmed) return true;
  if (WRITE_FOR_ME_MALFORMED_LEAD_PATTERN.test(trimmed)) return true;
  const escapedUserName = escapeRegex(userName);
  const invalidLeads = [
    'You\\b',
    'Your\\b',
    "You're\\b",
    "You've\\b",
    "You'll\\b",
    "You'd\\b",
    `${escapedUserName}\\b`,
    `${escapedUserName}'s\\b`,
    '\\*?\\s*(?:She|He|Her|His)\\b'
  ];

  if (charName) {
    invalidLeads.push(`${escapeRegex(charName)}\\b`);
  }

  return new RegExp(`^(?:${invalidLeads.join('|')})`, 'i').test(trimmed);
}

function scoreWriteForMeDraft(text, history = [], options = {}) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return -Infinity;

  const assistMode = options.assistMode || 'sfw_only';
  let score = 100;
  const words = trimmed.split(/\s+/).filter(Boolean);
  const sentenceCount = trimmed.split(/(?<=[.!?])\s+/).filter(Boolean).length;
  const recentUserMessages = (history || [])
    .filter((message) => message.role === 'user')
    .slice(-3)
    .map((message) => String(message.content || '').trim().toLowerCase());

  if (trimmed.length < 18) score -= 40;
  if (!/[.!?*"”]$/.test(trimmed)) score -= 12;
  if (words.length < 4) score -= 12;
  if (words.length > 32) score -= 10 + Math.ceil((words.length - 32) / 4) * 5;
  if (sentenceCount > 2) score -= 10 + (sentenceCount - 2) * 8;
  if (WRITE_FOR_ME_GENERIC_PATTERN.test(trimmed)) score -= 16;
  if (!/\b(?:I|me|my|I'm|I’d|I'd|I’ll|I'll|I’ve|I've)\b/.test(trimmed)) score -= 24;
  if (!/[*"]/.test(trimmed)) score -= 4;
  if (!/\b(?:ask|tell|invite|offer|pull|touch|kiss|move|sit|stay|admit|answer|lean|take|guide|bring|hold|want|need|let|smile|nod|look|meet|step|follow|reach|trace|press)\b/i.test(trimmed)) {
    score -= 6;
  }
  if (/^(?:I|User)\s*:/i.test(trimmed)) score -= 32;
  if (WRITE_FOR_ME_META_LEAD_PATTERN.test(trimmed)) score -= 12;
  if (WRITE_FOR_ME_MALFORMED_LEAD_PATTERN.test(trimmed)) score -= 80;
  if (assistMode === 'bot_conversation' && /\b(?:kiss|waist|thigh|lap|body|moan|cum)\b/i.test(trimmed)) score -= 60;
  if (assistMode === 'sfw_only' && /\b(?:cock|pussy|cum|fuck|spread your legs)\b/i.test(trimmed)) score -= 45;
  if (assistMode === 'mixed_transition' && /\b(?:cock|pussy|cum|hardcore)\b/i.test(trimmed)) score -= 32;

  if (recentUserMessages.some((message) => message && trimmed.toLowerCase() === message)) {
    score -= 35;
  }

  return score;
}

function shortenWriteForMeDraft(text) {
  let trimmed = String(text || '').trim().replace(/\n{3,}/g, '\n\n');
  if (!trimmed) return '';

  const sentences = trimmed
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (sentences.length > 2) {
    trimmed = sentences.slice(0, 2).join(' ').trim();
  }

  const words = trimmed.split(/\s+/).filter(Boolean);

  if (trimmed.length > 220 || words.length > 38) {
    trimmed = sentences[0] || trimmed;
  }

  if (trimmed.length > 220) {
    const clipped = trimmed.slice(0, 220);
    const sentenceEnd = Math.max(clipped.lastIndexOf('. '), clipped.lastIndexOf('! '), clipped.lastIndexOf('? '), clipped.lastIndexOf('" '), clipped.lastIndexOf('* '));
    trimmed = sentenceEnd > 90 ? clipped.slice(0, sentenceEnd + 1).trim() : clipped.trim();
  }

  return trimmed;
}

function isUsableWriteForMeDraft(finalized, history = [], options = {}) {
  if (!finalized?.valid || !finalized.text) return false;

  const trimmed = finalized.text.trim();
  if (trimmed.length < 18) return false;

  const score = scoreWriteForMeDraft(trimmed, history, options);
  return score >= 18;
}

function normalizeWriteForMeDraft(draft) {
  if (!draft) {
    return {
      text: '',
      repaired: false,
      valid: false
    };
  }

  const shortenedText = shortenWriteForMeDraft(draft.text);
  return {
    ...draft,
    text: shortenedText,
    valid: Boolean(draft.valid && shortenedText)
  };
}

export function finalizeImpersonateDraft(rawText, { charName = '', userName = 'User' } = {}) {
  let cleaned = String(rawText || '').trim();
  if (!cleaned) {
    return {
      text: '',
      repaired: false,
      valid: false
    };
  }

  cleaned = cleaned.replace(/<\/s>/g, '');
  cleaned = cleaned.replace(/\[TOOL_CALLS\]/g, '');
  cleaned = cleaned.replace(/<\|[^|]*\|>/g, '');
  cleaned = cleaned.replace(/~+\s*$/g, '');
  cleaned = cleaned.replace(/\s*\(\d+\s*words?\)\s*/gi, ' ');
  cleaned = cleaned.replace(/^[./]+(?=\*)/gm, '');
  const metaCut = cleaned.search(/\n---|\n\n(?:I chose|I picked|This |The |Here |Note)/i);
  if (metaCut > 0) cleaned = cleaned.substring(0, metaCut);
  cleaned = cleanTranscriptArtifacts(cleaned, charName);

  const lastCh = cleaned.slice(-1);
  if (lastCh && !['.', '!', '?', '"', '*', ')'].includes(lastCh)) {
    const end = Math.max(cleaned.lastIndexOf('*'), cleaned.lastIndexOf('"'), cleaned.lastIndexOf('.'), cleaned.lastIndexOf('!'), cleaned.lastIndexOf('?'));
    if (end > 0 && end > cleaned.length * 0.3) cleaned = cleaned.substring(0, end + 1);
  }

  if (cleaned.startsWith(`${charName}:`) || cleaned.startsWith(`${charName} :`)) {
    cleaned = '';
  }

  const charSpeakIdx = cleaned.indexOf(`\n${charName}:`);
  if (charSpeakIdx >= 0) {
    cleaned = cleaned.substring(0, charSpeakIdx).trim();
  }

  if (cleaned.startsWith(`${userName}:`) || cleaned.startsWith(`${userName} :`)) {
    cleaned = cleaned.replace(/^\S+:\s*/, '');
  }

  cleaned = cleaned.replace(/^I:\s*/i, '');
  cleaned = cleaned.replace(/^User:\s*/i, '');

  const beforeRepair = cleaned;
  cleaned = repairLeadingActionBlock(cleaned, userName);

  if (!cleaned.startsWith('*')) {
    cleaned = repairLeadingNarrationSegment(cleaned, userName);
  }

  cleaned = cleaned.trim();

  return {
    text: cleaned,
    repaired: cleaned !== beforeRepair,
    valid: Boolean(cleaned) && !hasInvalidImpersonateLead(cleaned, userName, charName)
  };
}

/**
 * Generate a user-perspective reply using the AI model (SillyTavern-style).
 * Streams tokens into `onToken` callback so the input field fills live.
 * Uses same generation settings as chat — no special overrides.
 * @param {Array} history - Conversation history
 * @param {string} charName - Character name
 * @param {string} userName - User name
 * @param {number} passionLevel - Current passion level 0-100
 * @param {object} settings - App settings (ollamaUrl, ollamaModel)
 * @param {function} onToken - Called with (null, fullDisplayText) on each token
 * @returns {Promise<string>} Full generated text
 */
export async function impersonateUser(history, character, userName, passionLevel, settings, onToken, sceneMemory = null, unchainedMode = false) {
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
  const profile = getModelProfile(model);
  const charName = character?.name || 'Character';
  const runtimeState = buildRuntimeState({
    character,
    history,
    userName,
    runtimeSteering: {
      profile: 'impersonate',
      availableContextTokens: Math.max(320, impersonateNumCtx - budgetConfig.impersonateContextReserve),
      passionLevel,
      unchainedMode,
      assistBudgetTier,
      persistedSceneMemory: sceneMemory
    }
  });
  const runtimeContext = assembleRuntimeContext({ profile: 'impersonate', runtimeState });
  console.log('[API] Impersonate runtime:', runtimeContext.debug);
  const stop = [`\n${charName}:`, `\n${charName} :`, `${charName}:`];

  const generateDraft = async ({ numPredict, promptSuffix = '', temperature = settings.temperature ?? profile.temperature }) => {
    const messages = [
      { role: 'system', content: runtimeContext.systemPrompt },
      { role: 'user', content: `${runtimeContext.userPrompt}${promptSuffix}` }
    ];
    const options = {
      num_predict: numPredict,
      temperature,
      num_ctx: impersonateNumCtx,
      top_k: settings.topK ?? profile.topK,
      top_p: settings.topP ?? profile.topP,
      min_p: settings.minP ?? profile.minP,
      repeat_penalty: settings.repeatPenalty ?? profile.repeatPenalty,
      repeat_last_n: settings.repeatLastN ?? profile.repeatLastN,
      penalize_newline: settings.penalizeNewline ?? profile.penalizeNewline
    };

    if (isElectron()) {
      impersonateAbortController = {
        abort: () => window.electronAPI.abortAiChat?.('impersonate')
      };

      try {
        const result = await window.electronAPI.aiChat({
          messages: [{ role: 'user', content: `${runtimeContext.userPrompt}${promptSuffix}` }],
          systemPrompt: runtimeContext.systemPrompt,
          model,
          isOllama: true,
          ollamaUrl,
          temperature: options.temperature,
          maxTokens: options.num_predict,
          num_ctx: options.num_ctx,
          top_k: options.top_k,
          top_p: options.top_p,
          min_p: options.min_p,
          repeat_penalty: options.repeat_penalty,
          repeat_last_n: options.repeat_last_n,
          penalize_newline: options.penalize_newline,
          stop,
          tag: 'impersonate'
        });
        if (!result.success) {
          throw new Error(result.error || 'Chat failed');
        }
        return normalizeWriteForMeDraft(finalizeImpersonateDraft(result.content || '', { charName, userName }));
      } finally {
        impersonateAbortController = null;
      }
    } else {
      impersonateAbortController = new AbortController();

      const res = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: impersonateAbortController.signal,
        body: JSON.stringify({ model, messages, stream: false, options: { ...options, stop } })
      });

      if (!res.ok || !res.body) {
        throw new Error(`Ollama request failed: ${res.status}`);
      }

      try {
        const data = await res.json();
        return normalizeWriteForMeDraft(finalizeImpersonateDraft(data.message?.content || '', { charName, userName }));
      } finally {
        impersonateAbortController = null;
      }
    }
  };

  const scoreDraft = (draft) => (
    draft.valid && draft.text
      ? scoreWriteForMeDraft(draft.text, history, { assistMode: runtimeState.assistMode })
      : -Infinity
  );
  const isStructurallyInvalid = (draft) => !draft?.valid || !draft?.text || draft.text.trim().length < 18;

  let finalized = await generateDraft({
    numPredict: budgetConfig.impersonateFirstTokens,
    temperature: Math.max(0.58, (settings.temperature ?? profile.temperature) - 0.04)
  });
  let finalizedScore = scoreDraft(finalized);

  if (
    (budgetConfig.allowWeakRetry && (!isUsableWriteForMeDraft(finalized, history, { assistMode: runtimeState.assistMode }) || finalizedScore < 44))
    || (budgetConfig.allowInvalidRetry && isStructurallyInvalid(finalized))
  ) {
    console.info('[API] Impersonate retry: first draft too weak or generic, retrying with stronger completion prompt');
    const retryDraft = await generateDraft({
      numPredict: budgetConfig.impersonateRetryTokens,
      promptSuffix: '\n\nWrite one complete first-person reply that clearly moves the scene forward while still sounding like the user. Stay grounded in the exact current beat. Prefer a natural, sendable reply over a perfect one. End cleanly after one to three sentences.',
      temperature: Math.max(0.55, (settings.temperature ?? profile.temperature) - 0.08)
    });
    const retryScore = scoreDraft(retryDraft);

    if (retryScore >= finalizedScore || !isUsableWriteForMeDraft(finalized, history, { assistMode: runtimeState.assistMode })) {
      finalized = retryDraft;
      finalizedScore = retryScore;
    }
  }

  if (!isUsableWriteForMeDraft(finalized, history, { assistMode: runtimeState.assistMode })) {
    throw new Error('Failed to generate a usable draft');
  }

  onToken(null, finalized.text);
  return finalized.text;
}
