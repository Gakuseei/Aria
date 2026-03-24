// ============================================================================
// ARIA v2.0 — Lean Roleplay Engine
// ============================================================================
// Character-first prompt design. Minimal rules. One-line content gate.
// ~300-500 token system prompts (vs ~2000 in v1)
// ============================================================================

import { passionManager, getSpeedMultiplier } from './PassionManager.js';
import { getModelProfile } from './modelProfiles.js';
import { OLLAMA_DEFAULT_URL, DEFAULT_MODEL_NAME, IMAGE_GEN_DEFAULT_URL, VOICE_DEFAULT_URL, API_TIMEOUT_MS, DATA_VERSION } from './defaults.js';
import { didUserRequestShortReply, getEffectiveResponseMode, getResponseModeTokenLimit, normalizeResponseMode } from './responseModes.js';
import { assembleRuntimeContext, buildRuntimeState, estimateTokens as estimateRuntimeTokens, renderActiveScene } from './chatRuntime/index.js';


// ============================================================================
// v0.2.5: TRANSCRIPT ARTIFACT CLEANING
// ============================================================================

/**
 * Removes any "User:" or "Assistant:" hallucinations from the AI response
 * This prevents the AI from speaking for the user or breaking immersion
 */
export function cleanTranscriptArtifacts(text, charName = '') {
  if (!text || typeof text !== 'string') return '';

  let cleaned = text;

  // Strip model special tokens — cut everything from first special token onwards
  const specialTokenIdx = cleaned.search(/<\|(?:endoftext|im_start|im_end|end|eot_id|start_header_id)\|>/i);
  if (specialTokenIdx !== -1) {
    cleaned = cleaned.substring(0, specialTokenIdx).trim();
  }

  // Remove any occurrence of "User:", "Human:", "Assistant:" etc.
  // If found, cut everything from that point onwards
  const stopPatterns = [
    /\n\s*User\s*:/i,
    /\n\s*Human\s*:/i,
    /\n\s*Assistant\s*:/i,
    /\n\s*AI\s*:/i,
    /\n\s*Character\s*:/i
  ];

  for (const pattern of stopPatterns) {
    const match = cleaned.match(pattern);
    if (match) {
      console.info('[Cleaner] Found transcript artifact, cutting at:', match[0]);
      cleaned = cleaned.substring(0, match.index).trim();
    }
  }

  // Remove AI writing-assistant meta-commentary preambles
  cleaned = cleaned.replace(/^(?:Here(?:'s| is) (?:a |the |my )?(?:response|completion|continuation|reply|scene|roleplay|version)[\s\S]*?:\s*\n*)/i, '');

  // Remove "---" separator lines (scene break artifacts)
  cleaned = cleaned.replace(/^\s*---+\s*\n?/gm, '');

  // Remove meta-commentary paragraphs (author notes about the character/scene)
  const metaPatterns = [
    /^This (?:is|keeps|shows|demonstrates|maintains|sets up).*?(?:character|behavior|scene|personality|roleplay|intimacy).*$/gim,
    /^(?:The (?:key|goal|idea|point|breakthrough|problem) (?:is|here|comes)|Remember:).*$/gim,
    /^(?:She|He)'s (?:not |genuinely |actually |really |just )?(?:playing|making|giving|trying|doing|being|setting).*$/gim
  ];

  for (const pattern of metaPatterns) {
    cleaned = cleaned.replace(pattern, '').trim();
  }

  // Strip character name prefixes (e.g. "**Sophia:**", "Alice:", "Sophia said:")
  if (charName) {
    const escapedName = charName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(new RegExp(`^\\*{0,2}${escapedName}\\*{0,2}\\s*:\\s*`, 'gim'), '');
  }

  // Strip markdown headers (e.g. "### The Velvet Room's Signature Surprise")
  cleaned = cleaned.replace(/^#{1,6}\s+\*{0,2}.*\*{0,2}\s*$/gm, '');
  cleaned = cleaned.replace(/^#{1,6}\s+.*$/gm, '');

  // Trim incomplete sentences — if num_predict cuts mid-sentence, trim to last complete one
  // If response was cut off mid-sentence by num_predict, trim to last complete sentence
  const lastChar = cleaned.trim().slice(-1);
  if (lastChar && !['.', '!', '?', '"', '*', '~', ')'].includes(lastChar)) {
    const sentenceEnd = Math.max(
      cleaned.lastIndexOf('*'),
      cleaned.lastIndexOf('"'),
      cleaned.lastIndexOf('.'),
      cleaned.lastIndexOf('!'),
      cleaned.lastIndexOf('?')
    );
    if (sentenceEnd > 0 && sentenceEnd > cleaned.length * 0.5) {
      console.info(`[Cleaner] Trimmed incomplete sentence (cut at ${sentenceEnd}/${cleaned.length})`);
      cleaned = cleaned.substring(0, sentenceEnd + 1);
    }
  }

  // Strip leading dots/slashes before asterisks (model outputs ".*action*" or "/*action*")
  cleaned = cleaned.replace(/^[./]+(?=\*)/gm, '');

  // Clean up excessive blank lines left after removals
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}

function stripStreamingArtifacts(text) {
  if (!text || typeof text !== 'string') return '';

  let cleaned = text
    .replace(/<\|[^|]*\|>/g, '')
    .replace(/\[TOOL_CALLS\]/g, '');

  const stopPatterns = [
    /\n\s*User\s*:/i,
    /\n\s*Human\s*:/i,
    /\n\s*Assistant\s*:/i,
    /\n\s*AI\s*:/i,
    /\n\s*Character\s*:/i
  ];

  for (const pattern of stopPatterns) {
    const match = cleaned.match(pattern);
    if (match) {
      cleaned = cleaned.substring(0, match.index).trimEnd();
      break;
    }
  }

  return cleaned.replace(/^[./]+(?=\*)/gm, '').trimEnd();
}

function countStreamingSentences(text) {
  const normalized = String(text || '')
    .replace(/[*"_~`]/g, ' ');

  return (normalized.match(/[.!?]+/g) || []).length;
}

function hasBalancedFormatting(text) {
  const candidate = String(text || '');
  const markerPairs = ['*', '"', '_', '~', '`'];
  return markerPairs.every((marker) => ((candidate.match(new RegExp(`\\${marker}`, 'g')) || []).length % 2) === 0);
}

export function buildRoleplaySceneContext(history, charName, userName, characterDescription = '', characterScenario = '', characterInstructions = '') {
  const runtimeState = buildRuntimeState({
    character: {
      name: charName,
      systemPrompt: characterDescription || '',
      instructions: characterInstructions || '',
      scenario: characterScenario || ''
    },
    history,
    userName,
    runtimeSteering: {
      profile: 'reply',
      availableContextTokens: 1024,
      responseMode: 'normal',
      passionLevel: 0,
      unchainedMode: false
    }
  });
  const recentHistory = runtimeState.selectedRecentHistory.messages.map((message) => ({
    role: message.role,
    content: message.content
  }));
  const historyText = recentHistory
    .map(m => `${m.role === 'user' ? userName : charName}: ${m.content}`)
    .join('\n');

  const lastUserMsg = recentHistory.filter(m => m.role === 'user').pop()?.content || '';
  const lastAssistantMsg = recentHistory.filter(m => m.role === 'assistant').pop()?.content || '';
  const currentBeat = [
    lastAssistantMsg ? `${charName}: ${lastAssistantMsg}` : '',
    lastUserMsg ? `${userName}: ${lastUserMsg}` : ''
  ].filter(Boolean).join('\n');

  const sceneSummary = renderActiveScene(runtimeState.activeScene, { compact: false });

  return {
    recentHistory,
    historyText,
    lastUserMsg,
    lastAssistantMsg,
    currentBeat,
    sceneSummary
  };
}

export function shouldAutoStopStreamingResponse(text, responseMode = 'normal') {
  if (normalizeResponseMode(responseMode) !== 'short') return false;

  const cleaned = stripStreamingArtifacts(text);
  if (!cleaned) return false;

  const trimmed = cleaned.trimEnd();
  const visibleChars = trimmed.replace(/\s+/g, ' ').trim().length;
  const sentenceCount = countStreamingSentences(trimmed);
  const lastChar = trimmed.slice(-1);
  const endsCleanly = ['.', '!', '?', '"', '*', '~', ')'].includes(lastChar);

  if (!endsCleanly) return false;
  if (!hasBalancedFormatting(trimmed)) return false;

  return sentenceCount >= 2 && visibleChars >= 90;
}

export function isUnderfilledShortReply(text, userMessage = '', responseMode = 'normal') {
  if (normalizeResponseMode(responseMode) !== 'short') return false;
  if (didUserRequestShortReply(userMessage)) return false;

  const cleaned = String(text || '').trim();
  if (!cleaned) return true;

  const sentenceCount = countStreamingSentences(cleaned);
  const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
  const visibleChars = cleaned.replace(/\s+/g, ' ').trim().length;
  const endsCleanly = ['.', '!', '?', '"', '*', '~', ')'].includes(cleaned.slice(-1));

  return sentenceCount < 2 || wordCount < 12 || visibleChars < 80 || !endsCleanly;
}

/**
 * Replaces {{char}} and {{user}} template variables in text.
 * Industry-standard placeholders ({{char}} / {{user}}).
 * @param {string} text - Text containing {{char}} / {{user}} placeholders
 * @param {string} charName - Character's display name
 * @param {string} userName - User's display name (from settings)
 * @returns {string} Text with placeholders replaced
 */
export function resolveTemplates(text, charName, userName) {
  if (!text || typeof text !== 'string') return text || '';
  return text
    .replace(/\{\{char\}\}/gi, charName || 'Character')
    .replace(/\{\{user\}\}/gi, userName || 'User');
}

// ============================================================================
// DEFAULT SETTINGS - OLLAMA ONLY
// ============================================================================

const DEFAULT_SETTINGS = {
  dataVersion: DATA_VERSION,
  ollamaUrl: OLLAMA_DEFAULT_URL,
  ollamaModel: DEFAULT_MODEL_NAME,
  temperature: 0.8,
  topK: 30,
  topP: 0.9,
  minP: 0.05,
  repeatPenalty: 1.1,
  repeatLastN: 256,
  penalizeNewline: false,
  contextSize: 4096,
  fontSize: 'medium',
  autoSave: true,
  soundEnabled: true,
  animationsEnabled: true,
  oledMode: false,
  preferredLanguage: 'en',
  userName: 'User',
  userGender: 'male',
  imageGenEnabled: false,
  imageGenUrl: IMAGE_GEN_DEFAULT_URL,
  voiceEnabled: false,
  voiceUrl: VOICE_DEFAULT_URL,
  maxResponseTokens: 256
};

const MODEL_CAPS_CACHE = {};
const MODEL_CAPS_CACHE_MAX = 16;

function cacheModelCaps(key, caps) {
  const keys = Object.keys(MODEL_CAPS_CACHE);
  if (keys.length >= MODEL_CAPS_CACHE_MAX) {
    delete MODEL_CAPS_CACHE[keys[0]];
  }
  MODEL_CAPS_CACHE[key] = caps;
}

/**
 * Invalidate cached model capabilities.
 * Call when ollamaUrl or model changes to prevent stale context lengths.
 */
export function invalidateModelCapsCache() {
  for (const key of Object.keys(MODEL_CAPS_CACHE)) {
    delete MODEL_CAPS_CACHE[key];
  }
}

/**
 * Context size presets (tokens). Users pick a tier in Settings.
 * Ollama offloads to CPU if VRAM is exceeded — safe to overshoot.
 */
export const CONTEXT_SIZE_OPTIONS = [2048, 3072, 4096, 6144, 8192, 12288, 16384];

const LEGACY_CONTEXT_SIZE_MAP = {
  low: 3072,
  medium: 4096,
  high: 6144,
  max: 8192
};

function parseModelParamB(modelName = '') {
  const match = String(modelName).toLowerCase().match(/(\d+(?:\.\d+)?)\s*b\b/);
  return match ? parseFloat(match[1]) : null;
}

export function getRecommendedContextSizeForModel(modelName = '') {
  const paramB = parseModelParamB(modelName);
  if (!Number.isFinite(paramB)) return 4096;
  if (paramB <= 14) return 4096;
  return 6144;
}

export function normalizeContextSize(value, modelName = '') {
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (LEGACY_CONTEXT_SIZE_MAP[trimmed]) return LEGACY_CONTEXT_SIZE_MAP[trimmed];
    const numeric = Number.parseInt(trimmed, 10);
    if (Number.isFinite(numeric)) value = numeric;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return getRecommendedContextSizeForModel(modelName);
  }

  const bounded = Math.max(CONTEXT_SIZE_OPTIONS[0], Math.min(CONTEXT_SIZE_OPTIONS[CONTEXT_SIZE_OPTIONS.length - 1], Math.round(value)));
  return CONTEXT_SIZE_OPTIONS.reduce((nearest, option) => {
    return Math.abs(option - bounded) < Math.abs(nearest - bounded) ? option : nearest;
  }, CONTEXT_SIZE_OPTIONS[0]);
}

/**
 * Compute the capped num_ctx for a given model.
 * Centralised so every Ollama request uses the same value.
 */
export async function getModelCtx(ollamaUrl, model, requestedContextSize = 4096) {
  const caps = await getModelCapabilities(ollamaUrl, model);
  const normalizedContextSize = normalizeContextSize(requestedContextSize, model || caps.parameterSize);
  return Math.min(caps.contextLength, normalizedContextSize);
}

/**
 * Unload model from Ollama to fully clear KV cache.
 * Call this when switching characters / leaving chat.
 */
export async function unloadOllamaModel(settings) {
  try {
    const ollamaUrl = settings?.ollamaUrl || OLLAMA_DEFAULT_URL;
    const model = settings?.ollamaModel || DEFAULT_MODEL_NAME;
    if (isElectron()) {
      await window.electronAPI.ollamaUnload({ ollamaUrl, model });
    } else {
      await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [], keep_alive: 0 })
      });
    }
    console.log('[API] Model unloaded (keep_alive: 0)');
  } catch (err) {
    console.warn('[API] Model unload failed:', err?.message);
  }
}

async function getModelCapabilities(ollamaUrl, modelName) {
  const cacheKey = `${ollamaUrl}::${modelName}`;
  if (MODEL_CAPS_CACHE[cacheKey]) return MODEL_CAPS_CACHE[cacheKey];

  const defaults = { contextLength: 4096, parameterSize: '7B' };
  try {
    if (isElectron()) {
      const result = await window.electronAPI.ollamaModelInfo({ ollamaUrl, model: modelName });
      const caps = {
        contextLength: result.contextLength || 4096,
        parameterSize: result.parameterSize || '7B'
      };
      cacheModelCaps(cacheKey, caps);
      return caps;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    const res = await fetch(`${ollamaUrl}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ name: modelName })
    });
    clearTimeout(timer);
    if (!res.ok) return defaults;
    const info = await res.json();

    let ctxParam = info.model_info?.['general.context_length']
      || info.model_info?.['llama.context_length']
      || info.model_info?.['qwen2.context_length']
      || info.model_info?.['qwen35.context_length'];
    if (typeof ctxParam !== 'number') {
      const mi = info.model_info || {};
      for (const key of Object.keys(mi)) {
        if (key.endsWith('.context_length') && typeof mi[key] === 'number') {
          ctxParam = mi[key];
          break;
        }
      }
    }
    const contextLength = typeof ctxParam === 'number' ? ctxParam : 4096;

    const paramRaw = info.details?.parameter_size || '7B';
    const caps = { contextLength, parameterSize: paramRaw };
    cacheModelCaps(cacheKey, caps);
    return caps;
  } catch (err) {
    console.warn('[API] getModelCapabilities failed for', modelName, ':', err?.message);
    return defaults;
  }
}

function estimatePassionHeuristic(userMessage = '', aiMessage = '', currentPassionLevel = 0) {
  const combined = `${userMessage}\n${aiMessage}`.toLowerCase();
  let score = 0;

  const weightedSignals = [
    { pattern: /\bkiss(?:ed|es|ing)?\b|\blips?\b|\bmouth\b/g, value: 2 },
    { pattern: /\bhand\b|\bwaist\b|\bneck\b|\blap\b|\bthigh\b|\bbreast\b|\bchest\b/g, value: 1.5 },
    { pattern: /\btouch(?:ing)?\b|\bcaress\b|\bstroke\b|\bunder the hem\b|\bunder your dress\b|\bmore intimately\b/g, value: 2 },
    { pattern: /\bblush(?:ing)?\b|\bflutter(?:ing)?\b|\bshiver(?:ing)?\b|\btrembl(?:e|ing)\b|\bbreath(?:less|ing)?\b/g, value: 1 },
    { pattern: /\bdesire\b|\barous(?:ed|ing)\b|\bheat\b|\bache\b|\bneed(?:y)?\b/g, value: 1.5 },
    { pattern: /\bbetween (?:my|your|her|his) legs\b|\buntouched body\b|\bintimate pleasures\b/g, value: 2.5 }
  ];

  for (const { pattern, value } of weightedSignals) {
    const matches = combined.match(pattern);
    if (matches) {
      score += matches.length * value;
    }
  }

  if (/["“”]/.test(aiMessage) && /\*(.*?)\*/.test(aiMessage)) {
    score += 0.5;
  }

  if (currentPassionLevel >= 15 && /\bkiss|touch|waist|neck|lap|intimate\b/.test(combined)) {
    score += 1;
  }

  return Math.max(0, Math.min(10, Math.round(score)));
}

function applyPassionHeuristic(userMessage, aiMessage, sessionId, character, currentPassionLevel = 0) {
  const heuristicScore = estimatePassionHeuristic(userMessage, aiMessage, currentPassionLevel);
  if (heuristicScore <= 0) return currentPassionLevel;
  const adjustedScore = heuristicScore * getSpeedMultiplier(character?.passionSpeed);
  const nextLevel = passionManager.applyScore(sessionId, adjustedScore);
  console.log(`[API] Passion heuristic: ${currentPassionLevel} → ${nextLevel} (raw=${heuristicScore}, adj=${adjustedScore.toFixed(1)})`);
  return nextLevel;
}

// ============================================================================
// HELPER: CHECK IF RUNNING IN ELECTRON
// ============================================================================

function isElectron() {
  return typeof window !== 'undefined' && 
         typeof window.electronAPI !== 'undefined';
}

// ============================================================================
// v3.0: TEMPLATE-BASED PROMPT SYSTEM
// ============================================================================

/**
 * Abort controller for the current suggestion call.
 * Exported so callers can cancel before starting a new chat request.
 */
let suggestionAbortController = null;
let suggestionRequestId = 0;
const MIN_USABLE_SUGGESTIONS = 2;
const SUGGESTION_TARGET_COUNT = 3;
const SUGGESTION_MAX_WORDS = 9;
const SUGGESTION_MAX_CHARS = 72;
const SUGGESTION_ROLE_ORDER = ['safe', 'bold', 'progress'];

const SUGGESTION_META_PATTERN = /^(?:here(?:'s| are)?|these(?: are)?|sure|okay|note|options?|suggestions?)\b/i;
const SUGGESTION_NON_ACTION_PATTERN = /^(?:explain|describe|clarify|suggest|propose)\b/i;
const SUGGESTION_LABEL_PATTERN = /^(?:safe|bold|progress|option\s*\d+|action\s*\d+|match the current pace|current pace|same scene|bolder(?: or more forward)?|fresh angle|unexpected(?: angle)?)\s*[:\-]\s*/i;
const SUGGESTION_BAD_LEAD_PATTERN = /^(?:i|you|he|she|they|we|it|this|that|these|those|there|here|please|option|action|pace|scene|same|bolder|fresh)\b/i;
const SUGGESTION_DIALOGUE_PATTERN = /["“”]/;
const SUGGESTION_OVEREXPLAIN_PATTERN = /\b(?:because|while|so that|which makes|letting|making|feeling|as you|as she|as he)\b/i;
const SUGGESTION_DIRECT_DIALOGUE_VERB_PATTERN = /\b(?:say|saying|said|murmur|murmuring|whisper|whispering|tell|telling|ask|asking)\b/i;
const SUGGESTION_PROGRESSIVE_TAIL_PATTERN = /\s+and\s+(?:begin|starting|start|continue|continuing|keep|keeping|list|listing|tell|telling|explain|explaining|show|showing|reveal|revealing)\b/i;
const SUGGESTION_PASSIVE_PATTERN = /\b(?:smile|nod|look|glance|watch|wait|pause|listen)\b/i;
const SUGGESTION_PROGRESS_PATTERN = /\b(?:invite|pull|guide|lead|bring|take|sit|move|close|touch|kiss|confess|admit|answer|ask|offer|decide|tell|reveal|reach)\b/i;
const SUGGESTION_BOLD_PATTERN = /\b(?:touch|kiss|pull|guide|lean|closer|waist|thigh|lap|admit|confess|breath|neck)\b/i;
const WRITE_FOR_ME_GENERIC_PATTERN = /\b(?:electricity between us|cannot deny|there'?s no denying|lingering for a heartbeat longer than necessary|beneath those long lashes|warm smile spreads|vision bathed in|presence has come to mean|hint of color in her cheeks|can't help but notice|linger in the air|associate with her presence|warmth between us|something unspoken)\b/i;

function detectSuggestionRole(text = '') {
  const lowered = String(text || '').toLowerCase();
  if (/^\s*safe\s*[:\-]/i.test(lowered)) return 'safe';
  if (/^\s*bold\s*[:\-]/i.test(lowered)) return 'bold';
  if (/^\s*progress\s*[:\-]/i.test(lowered)) return 'progress';
  return null;
}

function cleanSuggestionCandidate(part) {
  let candidate = String(part || '').trim();
  if (!candidate) return '';

  candidate = candidate
    .replace(/^[-•]\s*/, '')
    .replace(/^['"“”`*:.\-\d)\s]+/, '')
    .replace(/['"“”`*:,|.\-\s]+$/, '')
    .replace(SUGGESTION_LABEL_PATTERN, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (/^[A-Za-z][A-Za-z\s]{1,24}:\s+/.test(candidate)) {
    const [prefix, rest] = candidate.split(/:\s+/, 2);
    if (/\b(option|action|pace|scene|angle|move)\b/i.test(prefix || '')) {
      candidate = String(rest || '').trim();
    }
  }

  return candidate;
}

function collapseImmediateSuggestionRepeat(candidate) {
  const words = String(candidate || '').trim().split(/\s+/).filter(Boolean);
  if (words.length < 4) return String(candidate || '').trim();

  for (let size = Math.min(8, Math.floor(words.length / 2)); size >= 2; size--) {
    const left = words.slice(0, size).join(' ').toLowerCase();
    const right = words.slice(size, size * 2).join(' ').toLowerCase();
    if (left && left === right) {
      return words.slice(0, size).concat(words.slice(size * 2)).join(' ').trim();
    }
  }

  return words.join(' ');
}

function trimSuggestionCandidate(candidate) {
  let compact = collapseImmediateSuggestionRepeat(candidate);
  if (!compact) return '';

  compact = compact.replace(/\s+/g, ' ').trim();
  compact = compact.replace(/\s*["“”][^"“”]*["“”]\s*$/g, '').trim();

  const dialogueCut = compact.search(/\s+["“”]/);
  if (dialogueCut > 0) {
    compact = compact.slice(0, dialogueCut).trim();
  }

  const sentenceCut = compact.search(/[.!?](?:\s|$)/);
  if (sentenceCut > 0) {
    compact = compact.slice(0, sentenceCut).trim();
  }

  if (compact.length > SUGGESTION_MAX_CHARS || compact.split(/\s+/).filter(Boolean).length > SUGGESTION_MAX_WORDS) {
    const clauseParts = compact
      .split(/(?:\s+-\s+|;\s+|,\s+|(?=\s+(?:because|while|so that|letting|making|as)\b)|(?=\s+and\s+(?:begin|starting|start|continue|continuing|keep|keeping|list|listing|tell|telling|explain|explaining|show|showing|reveal|revealing)\b))/i)
      .map((part) => part.trim())
      .filter(Boolean);
    if (clauseParts.length > 1) {
      compact = clauseParts[0];
    }
  }

  if ((compact.length > SUGGESTION_MAX_CHARS || compact.split(/\s+/).filter(Boolean).length > SUGGESTION_MAX_WORDS) && SUGGESTION_PROGRESSIVE_TAIL_PATTERN.test(compact)) {
    compact = compact.split(SUGGESTION_PROGRESSIVE_TAIL_PATTERN)[0].trim();
  }

  if (compact.length > SUGGESTION_MAX_CHARS || compact.split(/\s+/).filter(Boolean).length > SUGGESTION_MAX_WORDS) {
    compact = compact.split(/\s+/).slice(0, SUGGESTION_MAX_WORDS).join(' ');
  }

  return compact
    .replace(/\b(?:and|or|to|with|into|onto|from|for|of|on|at|the|a|an|that|this|there|before|after)$/i, '')
    .replace(/['"“”`*:,|.\-\s]+$/, '')
    .trim();
}

function compactSuggestionCandidate(candidate) {
  let compact = trimSuggestionCandidate(candidate);
  if (!compact) return '';

  const wordCount = compact.split(/\s+/).filter(Boolean).length;
  if (compact.length <= SUGGESTION_MAX_CHARS && wordCount <= SUGGESTION_MAX_WORDS) {
    return compact;
  }

  return compact;
}

function dedupeSuggestionAgainstHistory(candidate, lastUserMsg, previousSuggestions = []) {
  if (lastUserMsg) {
    const candidateLower = candidate.toLowerCase().trim();
    const lastUserLower = lastUserMsg.toLowerCase().trim();
    if (lastUserLower.includes(candidateLower) || candidateLower.includes(lastUserLower)) {
      return false;
    }
  }

  const stopWords = new Set(['her', 'his', 'him', 'she', 'the', 'your', 'you', 'my', 'and', 'into', 'with', 'from', 'that', 'this', 'then', 'them', 'their', 'its', 'our', 'for']);
  const toWords = (text) => text
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));
  const candidateWords = toWords(candidate);

  if (candidateWords.length === 0) {
    return true;
  }

  return !previousSuggestions.some((previous) => {
    const previousWords = toWords(previous);
    if (previousWords.length === 0) {
      return false;
    }
    const overlap = candidateWords.filter((word) => previousWords.includes(word)).length;
    const shorter = Math.min(candidateWords.length, previousWords.length);
    const threshold = shorter <= 3 ? 0.5 : 0.7;
    return overlap >= shorter * threshold;
  });
}

function scoreSuggestionCandidate(candidate, rawCandidate = '', role = null) {
  const text = String(candidate || '').trim();
  if (!text) return -Infinity;

  const words = text.split(/\s+/).filter(Boolean);
  const lower = text.toLowerCase();
  let score = 100;

  if (words.length < 2) score -= 40;
  if (words.length > 7) score -= (words.length - 7) * 7;
  if (text.length > 64) score -= Math.ceil((text.length - 64) / 6) * 5;
  if (SUGGESTION_BAD_LEAD_PATTERN.test(text)) score -= 18;
  if (SUGGESTION_DIALOGUE_PATTERN.test(rawCandidate)) score -= 16;
  if (SUGGESTION_OVEREXPLAIN_PATTERN.test(text)) score -= 14;
  if (/[,:;]/.test(text)) score -= 8;
  if (/\b(?:master|mistress|sir)\b/i.test(lower)) score -= 10;
  if (SUGGESTION_DIRECT_DIALOGUE_VERB_PATTERN.test(text) && SUGGESTION_DIALOGUE_PATTERN.test(rawCandidate)) score -= 12;
  if (!/^[A-Za-z]/.test(text)) score -= 10;
  if (SUGGESTION_PROGRESS_PATTERN.test(text)) score += 12;
  if (SUGGESTION_BOLD_PATTERN.test(text)) score += 6;
  if (SUGGESTION_PASSIVE_PATTERN.test(text) && !SUGGESTION_PROGRESS_PATTERN.test(text)) score -= 8;

  if (role === 'safe') {
    if (SUGGESTION_PASSIVE_PATTERN.test(text)) score += 4;
    if (SUGGESTION_BOLD_PATTERN.test(text)) score -= 4;
  } else if (role === 'bold') {
    if (SUGGESTION_BOLD_PATTERN.test(text)) score += 10;
    if (/\b(?:wait|pause|watch quietly)\b/i.test(text)) score -= 8;
  } else if (role === 'progress') {
    if (SUGGESTION_PROGRESS_PATTERN.test(text)) score += 14;
    if (SUGGESTION_PASSIVE_PATTERN.test(text) && !SUGGESTION_PROGRESS_PATTERN.test(text)) score -= 16;
  }

  return score;
}

export function normalizeSuggestionDisplayValue(suggestion) {
  return collapseImmediateSuggestionRepeat(trimSuggestionCandidate(suggestion))
    .replace(/\s+/g, ' ')
    .trim();
}

function isTooSimilarToSelected(candidate, selected) {
  const currentWords = String(candidate || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);

  if (currentWords.length === 0) return true;

  const currentLead = currentWords[0];
  return selected.some((existing) => {
    const existingWords = String(existing || '')
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .split(/\s+/)
      .filter(Boolean);
    if (existingWords.length === 0) return false;

    const overlap = currentWords.filter((word) => existingWords.includes(word)).length;
    const shorter = Math.min(currentWords.length, existingWords.length);
    const sameLead = existingWords[0] === currentLead;
    return overlap >= Math.max(2, Math.ceil(shorter * 0.7)) || (sameLead && overlap >= Math.max(2, shorter - 1));
  });
}

export function parseSuggestionResponse(raw, lastUserMsg = '', previousSuggestions = []) {
  const cleaned = String(raw || '').trim()
    .replace(/\[TOOL_CALLS\]/gi, '')
    .replace(/<\/?s>/gi, '')
    .replace(/\bassistant\b/gi, '')
    .replace(/```[\s\S]*?```/g, '')
    .trim();

  let parts = cleaned
    .split(/[|\n]/)
    .map((part) => ({ raw: String(part || '').trim(), cleaned: cleanSuggestionCandidate(part) }))
    .filter((part) => part.raw || part.cleaned);

  if (parts.length < 2) {
    parts = cleaned
      .split(/\d+[.)]\s*/)
      .map((part) => ({ raw: String(part || '').trim(), cleaned: cleanSuggestionCandidate(part) }))
      .filter((part) => part.raw || part.cleaned);
  }

  if (parts.length < 2) {
    parts = cleaned
      .split(/\s*;\s*/)
      .map((part) => ({ raw: String(part || '').trim(), cleaned: cleanSuggestionCandidate(part) }))
      .filter((part) => part.raw || part.cleaned);
  }

  const selected = [];
  const roleBuckets = { safe: null, bold: null, progress: null };

  parts.forEach(({ raw: rawPart, cleaned: cleanedPart }) => {
    const role = detectSuggestionRole(rawPart);
    const compact = compactSuggestionCandidate(cleanedPart);
    if (!compact) return;
    const wordCount = compact.split(/\s+/).filter(Boolean).length;
    if (compact.length < 2 || compact.length > SUGGESTION_MAX_CHARS || wordCount < 2 || wordCount > SUGGESTION_MAX_WORDS) return;
    if (SUGGESTION_META_PATTERN.test(compact) || SUGGESTION_NON_ACTION_PATTERN.test(compact)) return;
    if (!dedupeSuggestionAgainstHistory(compact, lastUserMsg, previousSuggestions)) return;
    if (isTooSimilarToSelected(compact, selected)) return;
    if (scoreSuggestionCandidate(compact, rawPart, role) < 44) return;
    if (role && !roleBuckets[role]) {
      roleBuckets[role] = compact;
      selected.push(compact);
      return;
    }
    selected.push(compact);
  });

  const ordered = SUGGESTION_ROLE_ORDER
    .map((role) => roleBuckets[role])
    .filter(Boolean);

  selected.forEach((candidate) => {
    if (ordered.length >= SUGGESTION_TARGET_COUNT) return;
    if (ordered.includes(candidate)) return;
    ordered.push(candidate);
  });

  return ordered.slice(0, SUGGESTION_TARGET_COUNT);
}

/**
 * Abort any in-flight suggestion generation.
 * Call before sendMessage/regenerate so Ollama is free for the chat stream.
 */
export function abortSuggestionCall() {
  suggestionRequestId++;
  if (suggestionAbortController) {
    suggestionAbortController.abort();
    suggestionAbortController = null;
  }
  if (isElectron() && window.electronAPI?.abortAiChat) {
    window.electronAPI.abortAiChat('suggestions');
  }
}

/**
 * Generate smart suggestions in background via /api/chat.
 * Sends last 6 messages + OOC instruction to get user response options.
 * @param {Array} history - Full conversation messages array
 * @param {string} charName - Character name
 * @param {string} charDescription - Character description for context
 * @param {string} userName - User display name
 * @param {object} settings - App settings
 * @param {function} callback - Receives string[] or null
 * @param {string[]} [previousSuggestions] - Previous suggestions to avoid repeating
 * @param {number} [passionLevel=0] - Current passion level (0-100) for intensity matching
 */
export async function generateSuggestionsBackground(history, character, userName, settings, callback, previousSuggestions = [], passionLevel = 0, sceneMemory = null) {
  abortSuggestionCall();
  const currentRequestId = ++suggestionRequestId;

  const ollamaUrl = settings.ollamaUrl || OLLAMA_DEFAULT_URL;
  const model = settings.ollamaModel || DEFAULT_MODEL_NAME;
  const numCtx = await getModelCtx(ollamaUrl, model, settings.contextSize || 4096);
  const suggestionNumCtx = Math.min(numCtx, 3072);
  const lastUserMsg = [...(history || [])].reverse().find((message) => message?.role === 'user')?.content || '';
  const runtimeState = buildRuntimeState({
    character,
    history,
    userName,
    runtimeSteering: {
      profile: 'suggestions',
      availableContextTokens: Math.max(256, suggestionNumCtx - 896),
      passionLevel,
      avoidSuggestions: [...previousSuggestions, lastUserMsg ? lastUserMsg.slice(0, 80) : ''].filter(Boolean),
      persistedSceneMemory: sceneMemory
    }
  });
  const runtimeContext = assembleRuntimeContext({ profile: 'suggestions', runtimeState });
  const retrySystemPrompt = `${runtimeContext.systemPrompt}\n\nFORMAT CHECK:\n- Return exactly 3 short actions separated by |.\n- No numbering, labels, commentary, explanations, quotes, or dialogue.\n- Keep every action in the same current scene and make it directly clickable.\n- Keep actions compact and click-ready, about 3-9 words each.`;
  const parseSuggestions = (raw) => parseSuggestionResponse(raw, lastUserMsg, previousSuggestions);

  const chatParams = {
    messages: [{ role: 'user', content: runtimeContext.userPrompt }],
    systemPrompt: runtimeContext.systemPrompt,
    model,
    isOllama: true,
    ollamaUrl,
    temperature: 0.72,
    maxTokens: 64,
    num_ctx: suggestionNumCtx
  };
  const retryChatParams = {
    ...chatParams,
    systemPrompt: retrySystemPrompt,
    temperature: 0.6,
    maxTokens: 56
  };

  console.log('[API] Suggestions runtime:', runtimeContext.debug);

  if (isElectron()) {
    suggestionAbortController = null;
    const taggedParams = { ...chatParams, tag: 'suggestions' };
    const retryTaggedParams = { ...retryChatParams, tag: 'suggestions' };

    window.electronAPI.aiChat(taggedParams)
      .then(result => {
        if (currentRequestId !== suggestionRequestId) return;
        if (!result.success) { callback(null); return; }
        const raw = result.content || '';
        const suggestions = parseSuggestions(raw);
        console.log(`[API] Suggestions: ${suggestions.length} from "${raw.trim().slice(0, 120)}"`);
        if (suggestions.length >= MIN_USABLE_SUGGESTIONS) {
          callback(suggestions);
          return;
        }
        console.log(`[API] Suggestions: retrying (got ${suggestions.length})`);
        return window.electronAPI.aiChat(retryTaggedParams).then(retryResult => {
          if (currentRequestId !== suggestionRequestId) return;
          const retryRaw = retryResult.success ? retryResult.content || '' : '';
          const retrySuggestions = parseSuggestions(retryRaw);
          console.log(`[API] Suggestions retry: ${retrySuggestions.length} from "${retryRaw.trim().slice(0, 120)}"`);
          const best = retrySuggestions.length >= suggestions.length ? retrySuggestions : suggestions;
          callback(best.length >= MIN_USABLE_SUGGESTIONS ? best : null);
        });
      })
      .catch(err => {
        if (err?.message === 'aborted') return;
        console.warn('[API] Suggestion generation failed:', err?.message);
        callback(null);
      });
  } else {
    const buildFetchOpts = (params, signal) => ({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        model: params.model,
        messages: [
          { role: 'system', content: params.systemPrompt },
          { role: 'user', content: params.messages[0].content }
        ],
        stream: false,
        options: {
          num_predict: params.maxTokens,
          temperature: params.temperature,
          num_ctx: params.num_ctx
        }
      })
    });

    const controller = new AbortController();
    suggestionAbortController = controller;

    fetch(`${ollamaUrl}/api/chat`, buildFetchOpts(chatParams, controller.signal))
      .then(res => res.json())
      .then(data => {
        if (currentRequestId !== suggestionRequestId) { suggestionAbortController = null; return; }
        const raw = data.message?.content || '';
        const suggestions = parseSuggestions(raw);
        console.log(`[API] Suggestions: ${suggestions.length} from "${raw.trim().slice(0, 120)}"`);
        if (suggestions.length >= MIN_USABLE_SUGGESTIONS) {
          suggestionAbortController = null;
          callback(suggestions);
          return;
        }
        console.log(`[API] Suggestions: retrying (got ${suggestions.length})`);
        return fetch(`${ollamaUrl}/api/chat`, buildFetchOpts(retryChatParams, controller.signal))
          .then(r => r.json())
          .then(d => {
            suggestionAbortController = null;
            if (currentRequestId !== suggestionRequestId) return;
            const retryRaw = d.message?.content || '';
            const retrySuggestions = parseSuggestions(retryRaw);
            console.log(`[API] Suggestions retry: ${retrySuggestions.length} from "${retryRaw.trim().slice(0, 120)}"`);
            const best = retrySuggestions.length >= suggestions.length ? retrySuggestions : suggestions;
            callback(best.length >= MIN_USABLE_SUGGESTIONS ? best : null);
          });
      })
      .catch(err => {
        suggestionAbortController = null;
        if (err?.name === 'AbortError') {
          console.log('[API] Suggestion call aborted');
          return;
        }
        console.warn('[API] Suggestion generation failed:', err?.message);
        callback(null);
      });
  }
}

/** @type {AbortController|null} */
let impersonateAbortController = null;

/**
 * Cancel any in-flight impersonation request.
 */
export function abortImpersonateCall() {
  if (impersonateAbortController) {
    impersonateAbortController.abort();
    impersonateAbortController = null;
  }
  if (isElectron() && window.electronAPI?.abortAiChat) {
    window.electronAPI.abortAiChat('impersonate');
  }
}

function escapeRegex(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function deconjugateSimplePresent(verb) {
  const normalized = String(verb || '').toLowerCase();
  if (!normalized) return '';

  const irregular = {
    is: 'am',
    are: 'am',
    has: 'have',
    does: 'do',
    goes: 'go'
  };

  if (irregular[normalized]) return irregular[normalized];
  if (normalized.endsWith('ies') && normalized.length > 3) return `${normalized.slice(0, -3)}y`;
  if (/(ches|shes|sses|xes|zes|oes)$/.test(normalized)) return normalized.slice(0, -2);
  if (normalized.endsWith('s') && normalized.length > 2 && !/(ss|us|is)$/.test(normalized)) return normalized.slice(0, -1);
  return normalized;
}

function isAdverbishToken(token) {
  const normalized = String(token || '').replace(/^[^A-Za-z']+|[^A-Za-z']+$/g, '').toLowerCase();
  if (!normalized) return false;
  return normalized.endsWith('ly')
    || ['then', 'still', 'just', 'again', 'almost', 'nearly', 'closer'].includes(normalized);
}

function repairLeadingNarrationSegment(segment, userName) {
  const trimmed = String(segment || '').trim();
  if (!trimmed || /^["“]/.test(trimmed)) return trimmed;
  if (/\b(?:I|me|my|mine|I'm|I've|I'll|I'd)\b/i.test(trimmed)) return trimmed;
  if (/^(?:She|He|Her|His)\b/i.test(trimmed)) return trimmed;

  const escapedUserName = escapeRegex(userName);
  const directReplacements = [
    [new RegExp(`^${escapedUserName}'s\\b`, 'i'), 'My'],
    [new RegExp(`^${escapedUserName}\\b`, 'i'), 'I'],
    [/^You're\b/i, "I'm"],
    [/^You've\b/i, "I've"],
    [/^You'll\b/i, "I'll"],
    [/^You'd\b/i, "I'd"],
    [/^Your\b/i, 'My'],
    [/^You\b/i, 'I']
  ];

  for (const [pattern, replacement] of directReplacements) {
    if (pattern.test(trimmed)) {
      return trimmed.replace(pattern, replacement);
    }
  }

  const tokens = trimmed.split(/\s+/);
  let verbIndex = 0;
  while (verbIndex < tokens.length && verbIndex < 3 && isAdverbishToken(tokens[verbIndex])) {
    verbIndex++;
  }

  if (verbIndex >= tokens.length) return trimmed;

  const originalVerbToken = tokens[verbIndex];
  const bareVerb = originalVerbToken.replace(/^[^A-Za-z']+|[^A-Za-z']+$/g, '');
  if (!bareVerb || bareVerb.length < 3) return trimmed;

  const invalidLeadWords = new Set([
    'well', 'oh', 'ah', 'yes', 'no', 'the', 'a', 'an', 'this', 'that', 'these', 'those',
    'her', 'his', 'their', 'its', 'our', 'my', 'your', 'me', 'mine', 'hers', 'herself', 'himself'
  ]);
  if (invalidLeadWords.has(bareVerb.toLowerCase())) return trimmed;

  const deconjugatedVerb = deconjugateSimplePresent(bareVerb);
  if (!deconjugatedVerb || deconjugatedVerb === bareVerb.toLowerCase()) {
    return `I ${trimmed}`;
  }

  tokens[verbIndex] = originalVerbToken.replace(bareVerb, deconjugatedVerb);
  return `I ${tokens.join(' ')}`
    .replace(/\b(and|then|while|before)\s+([A-Za-z']+)\b/g, (match, prefix, verb) => {
      const repairedVerb = deconjugateSimplePresent(verb);
      return repairedVerb !== verb.toLowerCase() ? `${prefix} ${repairedVerb}` : match;
    });
}

function repairLeadingActionBlock(text, userName) {
  return String(text || '').replace(/^\*([^*]+)\*/, (match, actionText) => {
    const repairedAction = repairLeadingNarrationSegment(actionText, userName);
    return repairedAction ? `*${repairedAction}*` : match;
  });
}

function hasInvalidImpersonateLead(text, userName, charName = '') {
  const trimmed = String(text || '').trim();
  if (!trimmed) return true;
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

function scoreWriteForMeDraft(text, history = []) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return -Infinity;

  let score = 100;
  const words = trimmed.split(/\s+/).filter(Boolean);
  const sentenceCount = trimmed.split(/(?<=[.!?])\s+/).filter(Boolean).length;
  const recentUserMessages = (history || [])
    .filter((message) => message.role === 'user')
    .slice(-3)
    .map((message) => String(message.content || '').trim().toLowerCase());

  if (trimmed.length < 24) score -= 50;
  if (!/[.!?*"”]$/.test(trimmed)) score -= 18;
  if (words.length < 4) score -= 20;
  if (words.length > 40) score -= 18 + Math.ceil((words.length - 40) / 4) * 5;
  if (sentenceCount > 2) score -= 14 + (sentenceCount - 2) * 6;
  if (WRITE_FOR_ME_GENERIC_PATTERN.test(trimmed)) score -= 24;
  if (!/\b(?:I|me|my|I'm|I’d|I'd|I’ll|I'll|I’ve|I've)\b/.test(trimmed)) score -= 30;
  if (!/[*"]/.test(trimmed)) score -= 8;
  if (!/\b(?:ask|tell|invite|offer|pull|touch|kiss|move|sit|stay|admit|answer|lean|take|guide|bring|hold|want|need|let)\b/i.test(trimmed)) {
    score -= 12;
  }

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

  if (trimmed.length > 280) {
    const clipped = trimmed.slice(0, 280);
    const sentenceEnd = Math.max(clipped.lastIndexOf('. '), clipped.lastIndexOf('! '), clipped.lastIndexOf('? '));
    trimmed = sentenceEnd > 120 ? clipped.slice(0, sentenceEnd + 1).trim() : clipped.trim();
  }

  return trimmed;
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
export async function impersonateUser(history, character, userName, passionLevel, settings, onToken, sceneMemory = null) {
  abortImpersonateCall();

  const ollamaUrl = settings.ollamaUrl || OLLAMA_DEFAULT_URL;
  const model = settings.ollamaModel || DEFAULT_MODEL_NAME;
  const numCtx = await getModelCtx(ollamaUrl, model, settings.contextSize || 4096);
  const impersonateNumCtx = Math.min(numCtx, 4096);
  const profile = getModelProfile(model);
  const charName = character?.name || 'Character';
  const runtimeState = buildRuntimeState({
    character,
    history,
    userName,
    runtimeSteering: {
      profile: 'impersonate',
      availableContextTokens: Math.max(320, impersonateNumCtx - 256),
      passionLevel,
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
      const requestId = `impersonate-${Date.now()}-${numPredict}`;
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
          tag: 'impersonate'
        });
        if (!result.success) {
          throw new Error(result.error || 'Chat failed');
        }
        return finalizeImpersonateDraft(result.content || '', { charName, userName });
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
        return finalizeImpersonateDraft(data.message?.content || '', { charName, userName });
      } finally {
        impersonateAbortController = null;
      }
    }
  };

  let finalized = await generateDraft({ numPredict: 96, temperature: Math.max(0.55, (settings.temperature ?? profile.temperature) - 0.08) });
  let finalizedScore = finalized.valid && finalized.text ? scoreWriteForMeDraft(finalized.text, history) : -Infinity;

  if (!finalized.valid || !finalized.text || finalizedScore < 66) {
    console.info('[API] Impersonate retry: first draft too weak or generic, retrying with stronger completion prompt');
    const retryDraft = await generateDraft({
      numPredict: 128,
      promptSuffix: '\n\nWrite one complete first-person reply that clearly moves the scene forward. Stay natural, specific, and grounded in the exact current beat. Avoid generic romance phrasing, atmospheric filler, and commentary about scent, tension, or what lingers in the air. End cleanly after one or two sentences.',
      temperature: Math.max(0.5, (settings.temperature ?? profile.temperature) - 0.1)
    });
    const retryScore = retryDraft.valid && retryDraft.text ? scoreWriteForMeDraft(retryDraft.text, history) : -Infinity;

    if (retryScore >= finalizedScore || !finalized.valid || !finalized.text) {
      finalized = retryDraft;
      finalizedScore = retryScore;
    }
  }

  if (!finalized.valid || !finalized.text || finalized.text.trim().length < 24 || finalizedScore < 36) {
    throw new Error('Failed to generate a usable draft');
  }

  const shortened = shortenWriteForMeDraft(finalized.text);
  onToken(null, shortened);
  return shortened;
}

/**
 * Build structured plain-text system prompt from character slots.
 */
export function buildSystemPrompt({ character, userName = 'User', passionLevel = 0, unchainedMode = false, responseMode = 'normal' }) {
  const runtimeState = buildRuntimeState({
    character,
    history: [],
    userName,
    runtimeSteering: {
      profile: 'reply',
      availableContextTokens: 2048,
      responseMode,
      passionLevel,
      unchainedMode
    }
  });

  return assembleRuntimeContext({ profile: 'reply', runtimeState }).systemPrompt;
}



// CORE API - MESSAGE SENDING (OLLAMA ONLY)
// ============================================================================

export const sendMessage = async (
  userMessage,
  character,
  conversationHistory = [],
  sessionId = null,
  unchainedMode = false,
  onApiStats = null,  // v0.2.5: NEW - Callback for API Monitor stats
  settingsOverride = null,  // v0.2.5: FIX - Accept settings directly to avoid race conditions
  onToken = null,  // Streaming callback — receives each token chunk as string
  streamAbortHandle = null,
  sceneMemory = null
) => {
  const startTime = Date.now();  // v0.2.5: Track response time
  
  // Safety checks
  if (!character || !character.name) {
    console.error('[v9.2 API] ❌ Invalid character data');
    return {
      success: false,
      error: 'Character data is missing or invalid'
    };
  }

  if (!userMessage || typeof userMessage !== 'string' || userMessage.trim().length === 0) {
    console.error('[v9.2 API] ❌ Empty or invalid message');
    return {
      success: false,
      error: 'Message cannot be empty'
    };
  }

  const MAX_INPUT_LENGTH = 4096;
  if (userMessage.length > MAX_INPUT_LENGTH) {
    console.warn(`[API] Input truncated: ${userMessage.length} → ${MAX_INPUT_LENGTH} chars`);
    userMessage = userMessage.slice(0, MAX_INPUT_LENGTH);
  }

  try {
    const settings = { ...(settingsOverride || await loadSettings()) };

    const ollamaUrl = settings.ollamaUrl || OLLAMA_DEFAULT_URL;
    const model = settings.ollamaModel || DEFAULT_MODEL_NAME;
    const modelCtx = await getModelCtx(ollamaUrl, model, settings.contextSize || 4096);
    const profile = getModelProfile(model);
    const historyToUse = (Array.isArray(conversationHistory) ? conversationHistory : []).filter(m => m.role !== 'system');

    console.log(`[API] Model: ${model} (${profile.family}), ctx: ${modelCtx}`);

    const currentPassionLevel = passionManager.getPassionLevel(sessionId || '');

    const userName = settings.userName || 'User';

    const responseMode = getEffectiveResponseMode(character, userMessage);
    const baseNumPredict = settings.maxResponseTokens ?? profile.maxResponseTokens ?? 512;
    const numPredict = getResponseModeTokenLimit(baseNumPredict, responseMode);
    const runtimeState = buildRuntimeState({
      character,
      history: historyToUse,
      userName,
      runtimeSteering: {
        profile: 'reply',
        availableContextTokens: Math.max(320, modelCtx - numPredict - 128),
        responseMode,
        passionLevel: currentPassionLevel,
        unchainedMode,
        persistedSceneMemory: sceneMemory
      }
    });
    const runtimeContext = assembleRuntimeContext({ profile: 'reply', runtimeState });
    const finalSystemPrompt = runtimeContext.systemPrompt;
    const trimmedHistory = runtimeContext.historyMessages;
    const promptTokens = estimateRuntimeTokens(finalSystemPrompt) + trimmedHistory.reduce((sum, message) => sum + estimateRuntimeTokens(message.content), 0);
    let retryTriggered = false;
    let repairApplied = false;

    console.log(`[API] Unchained: ${unchainedMode}, Passion: ${currentPassionLevel}, ResponseMode: ${responseMode}`);
    console.log('[API] Reply runtime:', runtimeContext.debug);
    console.log(`[API] Prompt ~${promptTokens}t, history: ${trimmedHistory.length}/${historyToUse.length} msgs, num_ctx: ${modelCtx}`);

    const messages = [
      { role: 'system', content: finalSystemPrompt },
      ...trimmedHistory.map(msg => ({ role: msg.role, content: msg.content }))
    ];

    const chatOptions = {
      temperature: settings.temperature ?? profile.temperature,
      num_predict: numPredict,
      num_ctx: modelCtx,
      top_k: settings.topK ?? profile.topK,
      top_p: settings.topP ?? profile.topP,
      min_p: settings.minP ?? profile.minP,
      repeat_penalty: settings.repeatPenalty ?? profile.repeatPenalty,
      repeat_last_n: settings.repeatLastN ?? profile.repeatLastN,
      penalize_newline: settings.penalizeNewline ?? profile.penalizeNewline
    };
    const stopSequences = ['\nUser:', '\nHuman:', `\n${userName}:`, `\n${character.name}:`, '\nAssistant:', '\nAI:', '<|endoftext|>', '<|im_start|>', '<|im_end|>', '<|eot_id|>', '<|start_header_id|>'];

    let data;
    let streamTerminationReason = 'natural';
    const wasUserAborted = () => streamAbortHandle?.aborted && streamAbortHandle.reason === 'user';

    const bindStreamAbort = (abortFn) => {
      if (streamAbortHandle && typeof streamAbortHandle.setAbortImpl === 'function') {
        streamAbortHandle.setAbortImpl(abortFn);
      }
    };

    if (isElectron() && onToken) {
      // STREAMING via IPC
      const requestId = `chat-${Date.now()}`;
      let abortIssued = false;
      let streamedContent = '';
      const abortStream = (reason = 'user') => {
        if (abortIssued) return;
        abortIssued = true;
        streamTerminationReason = reason;
        window.electronAPI.ollamaStreamAbort(requestId, reason).catch(() => {});
      };
      bindStreamAbort(abortStream);
      const cleanup = window.electronAPI.onOllamaStreamToken(({ requestId: rid, token }) => {
        if (rid !== requestId || typeof token !== 'string' || wasUserAborted()) return;
        streamedContent += token;
        onToken(token);
        if (!abortIssued && shouldAutoStopStreamingResponse(streamedContent, responseMode)) {
          abortStream('auto-length');
        }
      });
      const abortTimer = setTimeout(() => abortStream('timeout'), 120000);

      try {
        const result = await window.electronAPI.ollamaChatStream({
          requestId,
          ollamaUrl,
          model,
          messages,
          options: chatOptions,
          stop: stopSequences
        });

        if (wasUserAborted()) {
          return { success: false, error: 'The operation was aborted', aborted: true };
        }

        if (!result.success) {
          if (result.aborted) {
            const abortReason = result.abortedBy || streamTerminationReason;
            if (abortReason === 'user') {
              return { success: false, error: 'The operation was aborted', aborted: true };
            }
            if (abortReason === 'timeout') {
              throw new Error('The operation was aborted');
            }
          }
          throw new Error(result.error || 'Stream failed');
        }

        data = {
          message: { content: result.content || streamedContent },
          eval_count: result.evalCount,
          prompt_eval_count: result.promptEvalCount
        };
        streamTerminationReason = result.abortedBy || result.doneReason || streamTerminationReason;
      } finally {
        clearTimeout(abortTimer);
        bindStreamAbort(null);
        cleanup();
      }
    } else if (isElectron()) {
      // NON-STREAMING via IPC
      const result = await window.electronAPI.aiChat({
        messages: messages.slice(1).map(m => ({ role: m.role, content: m.content })),
        systemPrompt: finalSystemPrompt,
        model,
        isOllama: true,
        ollamaUrl,
        temperature: chatOptions.temperature,
        maxTokens: numPredict,
        num_ctx: modelCtx
      });

      if (!result.success) throw new Error(result.error || 'Chat failed');

      data = {
        message: { content: result.content },
        eval_count: result.usage?.total_tokens || 0,
        prompt_eval_count: 0
      };
    } else {
      // DIRECT FETCH fallback (non-Electron)
      const fetchController = new AbortController();
      const fetchTimer = setTimeout(() => fetchController.abort(), 120000);

      let response;
      try {
        response = await fetch(`${ollamaUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: fetchController.signal,
          body: JSON.stringify({
            model, messages, stream: !!onToken,
            options: chatOptions,
            stop: stopSequences
          })
        });
      } finally {
        clearTimeout(fetchTimer);
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama error: ${response.status} - ${errorText}`);
      }

      if (onToken && response.body) {
        const contentChunks = [];
        let finalChunk = null;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let abortIssued = false;
        const abortStream = (reason = 'user') => {
          if (abortIssued) return;
          abortIssued = true;
          streamTerminationReason = reason;
          fetchController.abort();
        };
        bindStreamAbort(abortStream);

        try {
          while (true) {
            let readResult;
            try {
              readResult = await reader.read();
            } catch (readErr) {
              if (streamTerminationReason === 'auto-length' || streamTerminationReason === 'user') {
                break;
              }
              console.warn('[API] Chat stream interrupted:', readErr.message);
              break;
            }
            const { done, value } = readResult;
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();
            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const chunk = JSON.parse(line);
                if (chunk.message?.content) {
                  if (wasUserAborted()) continue;
                  contentChunks.push(chunk.message.content);
                  onToken(chunk.message.content);
                  if (!abortIssued && shouldAutoStopStreamingResponse(contentChunks.join(''), responseMode)) {
                    abortStream('auto-length');
                  }
                }
                if (chunk.done) finalChunk = chunk;
              } catch { /* skip malformed lines */ }
            }
          }
          if (buffer.trim()) {
            try {
              const chunk = JSON.parse(buffer);
              if (chunk.message?.content) {
                if (wasUserAborted()) {
                  buffer = '';
                } else {
                  contentChunks.push(chunk.message.content);
                  onToken(chunk.message.content);
                }
              }
              if (chunk.done) finalChunk = chunk;
            } catch { /* skip */ }
          }
        } finally {
          bindStreamAbort(null);
          reader.cancel().catch(() => {});
        }
        if (streamTerminationReason === 'user' || (streamAbortHandle?.aborted && streamAbortHandle.reason === 'user')) {
          return {
            success: false,
            error: 'The operation was aborted',
            aborted: true
          };
        }
        const fullContent = contentChunks.join('');
        data = { message: { content: fullContent }, eval_count: finalChunk?.eval_count, prompt_eval_count: finalChunk?.prompt_eval_count };
      } else {
        try {
          data = await response.json();
        } catch (parseErr) {
          console.error('[API] Failed to parse non-streaming response:', parseErr.message);
          throw new Error('Invalid response from Ollama (JSON parse failed)');
        }
      }
	    }

    if (wasUserAborted()) {
      return {
        success: false,
        error: 'The operation was aborted',
        aborted: true
      };
    }

    // Check for empty response
    if (data.message?.content && typeof data.message.content === 'string') {
      const stripped = data.message.content.replace(/[*\s\n_~`]/g, '');
      if (stripped.length < 3) {
        console.warn('[API] Empty/broken response — scheduling retry');
        data.message.content = '';
      }
    }

    if (!data.message || !data.message.content) {
      retryTriggered = true;
      console.error(`[API] Empty response after all attempts (history: ${trimmedHistory.length} msgs)`);
      const retrySystemPrompt = finalSystemPrompt + '\nIMPORTANT: Respond directly as the character.';
      const retryMessages = [
        { role: 'system', content: retrySystemPrompt },
        ...trimmedHistory.slice(-2).map(m => ({ role: m.role, content: m.content }))
      ];

      if (isElectron()) {
        try {
          const retryResult = await Promise.race([
            window.electronAPI.aiChat({
              messages: retryMessages.slice(1).map(m => ({ role: m.role, content: m.content })),
              systemPrompt: retrySystemPrompt,
              model,
              isOllama: true,
              ollamaUrl,
              temperature: 0.5,
              maxTokens: numPredict,
              num_ctx: modelCtx
            }),
            new Promise((_, reject) => {
              const t = setTimeout(() => reject(new Error('timeout')), 120000);
              // Prevent timeout from keeping Node alive if main promise wins
              if (typeof t === 'object' && t.unref) t.unref();
            })
          ]);
          if (retryResult.success && retryResult.content) {
            if (retryResult.content.replace(/[*\s\n_~`]/g, '').length >= 3) {
              data = { message: { content: retryResult.content }, eval_count: retryResult.usage?.total_tokens || 0 };
            }
          }
        } catch (err) { console.warn('[API] Retry request failed:', err?.message); }
      } else {
        const retryCtrl = new AbortController();
        const retryTimer = setTimeout(() => retryCtrl.abort(), 120000);
        try {
          const retryRes = await fetch(`${ollamaUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: retryCtrl.signal,
            body: JSON.stringify({
              model, messages: retryMessages, stream: false,
              options: { ...chatOptions, temperature: 0.5, num_predict: numPredict, num_ctx: modelCtx },
              stop: stopSequences
            })
          });
          if (retryRes.ok) {
            const retryData = await retryRes.json();
            if (retryData.message?.content && retryData.message.content.replace(/[*\s\n_~`]/g, '').length >= 3) {
              data = retryData;
            }
          }
        } catch (err) { console.warn('[API] Retry request failed:', err?.message); }
        finally { clearTimeout(retryTimer); }
      }

      if (!data.message || !data.message.content) {
        throw new Error('No response from Ollama');
      }
    }

    const requestRevision = async (revisionPrompt, revisionTemperature, revisionMaxTokens) => {
      if (isElectron()) {
        const revisionResult = await window.electronAPI.aiChat({
          messages: messages.slice(1).map((msg) => ({ role: msg.role, content: msg.content })),
          systemPrompt: revisionPrompt,
          model,
          isOllama: true,
          ollamaUrl,
          temperature: revisionTemperature,
          maxTokens: revisionMaxTokens,
          num_ctx: modelCtx
        });

        if (revisionResult.success && revisionResult.content) {
          return {
            message: { content: revisionResult.content },
            eval_count: revisionResult.usage?.total_tokens || 0,
            prompt_eval_count: 0
          };
        }

        return null;
      }

      const revisionResponse = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: revisionPrompt },
            ...messages.slice(1)
          ],
          stream: false,
          options: {
            ...chatOptions,
            temperature: revisionTemperature,
            num_predict: revisionMaxTokens,
            num_ctx: modelCtx
          },
          stop: stopSequences
        })
      });

      if (!revisionResponse.ok) {
        return null;
      }

      return revisionResponse.json();
    };

    let aiMessage = data.message.content.trim();

    // Clean response — remove any transcript artifacts
    aiMessage = cleanTranscriptArtifacts(aiMessage, character.name);

    if (isUnderfilledShortReply(aiMessage, userMessage, responseMode)) {
      const repairPrompt = `${finalSystemPrompt}\n\nRESPONSE REPAIR:\n- Your last reply was too minimal and mirrored the user's brevity.\n- Reply again as ${character.name} with a complete, natural response.\n- Give 2-4 sentences in one short paragraph.\n- Include at least one concrete reaction, observation, or action.\n- Do not mention these instructions.`;

      try {
        const repairedData = await requestRevision(repairPrompt, 0.45, Math.min(numPredict, 192));
        if (repairedData?.message?.content) {
          const repairedMessage = cleanTranscriptArtifacts(repairedData.message.content.trim(), character.name);
          if (!isUnderfilledShortReply(repairedMessage, userMessage, responseMode)) {
            aiMessage = repairedMessage;
            data.eval_count = repairedData.eval_count || data.eval_count;
            data.prompt_eval_count = repairedData.prompt_eval_count || data.prompt_eval_count;
            repairApplied = true;
          }
        }
      } catch (repairError) {
        console.warn('[API] Short-reply repair failed:', repairError?.message);
      }
    }

    // Add assistant response to history
    const passionEnabled = character?.passionEnabled !== false && Boolean(sessionId);
    const nextPassionLevel = passionEnabled
      ? applyPassionHeuristic(userMessage, aiMessage, sessionId, character, currentPassionLevel)
      : currentPassionLevel;

    const assistantMsg = { role: 'assistant', content: aiMessage };
    const finalHistory = [...historyToUse, assistantMsg];

    // v0.2.5: CALCULATE API STATS FOR MONITOR
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    const wordCount = aiMessage ? aiMessage.split(/\s+/).filter(Boolean).length : 0;
    const wordsPerSecond = (wordCount / (responseTime / 1000)).toFixed(2);

    // Use Ollama's actual token counts when available, fallback to estimation
    const responseTokens = data.eval_count || Math.round(wordCount * 1.3);
    const promptTokens_actual = data.prompt_eval_count || promptTokens;
    const debugStats = {
      ...runtimeContext.debug,
      retryTriggered,
      repairApplied
    };

    console.log(`[API] Tokens — response: ${responseTokens}, prompt: ${promptTokens_actual}, total: ${responseTokens + promptTokens_actual}`);

    // v0.2.5: Send stats to callback if provided
    if (onApiStats && typeof onApiStats === 'function') {
      onApiStats({
        model: model,
        responseTime: responseTime,
        wordCount: wordCount,
        wordsPerSecond: parseFloat(wordsPerSecond),
        tokens: responseTokens,
        promptTokens: promptTokens_actual,
        passionLevel: nextPassionLevel,
        responseMode,
        debug: debugStats
      });
    }

    return {
      success: true,
      message: aiMessage,
      conversationHistory: finalHistory,
      passionLevel: nextPassionLevel,
      modelCtx,
      stats: {
        responseTime,
        wordCount,
        wordsPerSecond: parseFloat(wordsPerSecond),
        tokens: responseTokens,
        promptTokens: promptTokens_actual,
        model,
        responseMode,
        terminatedBy: streamTerminationReason,
        debug: debugStats
      }
    };

  } catch (error) {
    if (error?.message === 'The operation was aborted') {
      return {
        success: false,
        error: 'The operation was aborted',
        aborted: true
      };
    }
    console.error('[v8.1 API] ❌ Fatal error:', error);
    return {
      success: false,
      error: error.message || 'Connection to Ollama failed'
    };
  }
};

// ============================================================================
// SETTINGS MANAGEMENT
// ============================================================================

export const loadSettings = async () => {
  try {
    if (isElectron()) {
      const result = await window.electronAPI.loadSettings();

      if (result && result.success && result.settings) {
        const merged = {
          ...DEFAULT_SETTINGS,
          ...result.settings
        };
        return {
          ...merged,
          contextSize: normalizeContextSize(merged.contextSize, merged.ollamaModel),
          maxResponseTokens: Number.isFinite(Number(merged.maxResponseTokens))
            ? Math.max(96, Math.min(1024, Number(merged.maxResponseTokens)))
            : DEFAULT_SETTINGS.maxResponseTokens
        };
      }
    } else {
      const stored = localStorage.getItem('settings');

      if (stored) {
        const parsed = JSON.parse(stored);
        const merged = {
          ...DEFAULT_SETTINGS,
          ...parsed
        };
        return {
          ...merged,
          contextSize: normalizeContextSize(merged.contextSize, merged.ollamaModel),
          maxResponseTokens: Number.isFinite(Number(merged.maxResponseTokens))
            ? Math.max(96, Math.min(1024, Number(merged.maxResponseTokens)))
            : DEFAULT_SETTINGS.maxResponseTokens
        };
      }
    }

    return { ...DEFAULT_SETTINGS };

  } catch (error) {
    console.error('[v8.1 Settings] Load error:', error);
    return { ...DEFAULT_SETTINGS };
  }
};

// ============================================================================
// SESSION MANAGEMENT WITH HARD RESET
// ============================================================================

export const saveSession = async (sessionId, sessionData) => {
  try {
    if (!sessionId) throw new Error('Session ID required');
    if (!sessionData) throw new Error('Session data required');

    const completeSessionData = {
      ...sessionData,
      characterName: sessionData.characterName || 'Unknown',
      conversationHistory: sessionData.conversationHistory || [],
      sceneMemory: sessionData.sceneMemory ?? null,
      passionLevel: sessionData.passionLevel || 0,
      lastUpdated: sessionData.lastUpdated || new Date().toISOString(),
      createdAt: sessionData.createdAt || new Date().toISOString()
    };

    if (isElectron()) {
      const result = await window.electronAPI.saveSession(sessionId, completeSessionData);

      if (!result || !result.success) {
        throw new Error(result?.error || 'IPC save failed');
      }

      return { success: true };
    } else {
      const sessions = JSON.parse(localStorage.getItem('sessions') || '{}');
      const existingSession = sessions[sessionId];
      const incomingUpdated = Date.parse(completeSessionData.lastUpdated) || Date.now();
      const existingUpdated = Date.parse(existingSession?.lastUpdated || existingSession?.savedAt || 0) || 0;
      if (incomingUpdated >= existingUpdated) {
        sessions[sessionId] = completeSessionData;
      }
      localStorage.setItem('sessions', JSON.stringify(sessions));
      return { success: true };
    }
  } catch (error) {
    console.error('[v8.1 Session] ❌ Save error:', error);
    return { success: false, error: error.message };
  }
};

export const loadSession = async (sessionId) => {
  try {
    if (!sessionId) throw new Error('Session ID required');

    if (isElectron()) {
      const result = await window.electronAPI.loadSession(sessionId);

      if (result && result.success && (result.session || result.data)) {
        return { success: true, session: result.session || result.data };
      } else {
        throw new Error(result?.error || 'Session not found');
      }
    } else {
      const sessions = JSON.parse(localStorage.getItem('sessions') || '{}');
      const session = sessions[sessionId];

      if (!session) throw new Error('Session not found');

      return { success: true, session: session };
    }
  } catch (error) {
    console.error('[v8.1 Session] ❌ Load error:', error);
    return { success: false, error: error.message };
  }
};

export const deleteSession = async (sessionId) => {
  try {
    if (!sessionId) throw new Error('Session ID required');

    if (isElectron()) {
      const deleteResult = await window.electronAPI.deleteSession(sessionId);

      if (!deleteResult || !deleteResult.success) {
        throw new Error(deleteResult?.error || 'IPC delete failed');
      }

      return { success: true };
    } else {
      const sessions = JSON.parse(localStorage.getItem('sessions') || '{}');
      delete sessions[sessionId];
      localStorage.setItem('sessions', JSON.stringify(sessions));

      return { success: true };
    }
  } catch (error) {
    console.error('[v8.1 Session] ❌ Delete error:', error);
    return { success: false, error: error.message };
  }
};

export const listSessions = async () => {
  try {
    if (isElectron()) {
      const result = await window.electronAPI.listSessions();

      if (result && result.success) {
        return { success: true, sessions: result.sessions };
      } else {
        throw new Error(result?.error || 'Failed to list sessions');
      }
    } else {
      const sessions = JSON.parse(localStorage.getItem('sessions') || '{}');
      const sessionList = Object.keys(sessions).map(id => ({
        id: id,
        ...sessions[id]
      }));

      return { success: true, sessions: sessionList };
    }
  } catch (error) {
    console.error('[v8.1 Session] ❌ List error:', error);
    return { success: false, sessions: [], error: error.message };
  }
};

// ============================================================================
// v0.2.5 RESTORED: OLLAMA HELPER FUNCTIONS
// ============================================================================

/**
 * Test Ollama connection
 * v8.1: RE-EXPORTED for Settings auto-detect
 */
export const testOllamaConnection = async (url = OLLAMA_DEFAULT_URL) => {
  try {
    if (isElectron()) {
      const result = await window.electronAPI.ollamaModels({ ollamaUrl: url });
      if (result.success) {
        return { success: true, message: `✅ Connected! Found ${result.totalCount} models.` };
      }
      return { success: false, message: `❌ Connection failed: ${result.error}` };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${url}/api/tags`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      const modelCount = data.models ? data.models.length : 0;
      return {
        success: true,
        message: `✅ Connected! Found ${modelCount} models.`
      };
    } else {
      return { success: false, message: `❌ Connection failed: ${response.status}` };
    }
  } catch (error) {
    return { success: false, message: `❌ Connection failed: ${error.message}` };
  }
};

/**
 * Fetch available Ollama models
 * v8.1: RE-EXPORTED for Settings auto-detect dropdown
 * v1.1: STRICT FILTER - Blacklist embedding models (nomic-embed-text, BERT, etc.)
 */
export const fetchOllamaModels = async (ollamaUrl = OLLAMA_DEFAULT_URL) => {
  try {
    if (isElectron()) {
      const result = await window.electronAPI.ollamaModels({ ollamaUrl });
      return result.success ? result.models : [];
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    const response = await fetch(`${ollamaUrl}/api/tags`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`);
    }

    const data = await response.json();

    if (data.models && Array.isArray(data.models)) {
      const allModels = data.models.map(m => m.name);
      const chatModels = allModels.filter(name => {
        const lowerName = name.toLowerCase();
        if (lowerName.includes('embed')) return false;
        if (lowerName.includes('bert')) return false;
        return true;
      });
      return chatModels;
    }

    return [];
  } catch (error) {
    console.error('[v8.1 API] Error fetching Ollama models:', error);
    return [];
  }
};

/**
 * Auto-detect and set the first available Ollama model
 * This ensures the app always has a valid model configured
 */
export const autoDetectAndSetModel = async (ollamaUrl = OLLAMA_DEFAULT_URL) => {
  try {
    const models = await fetchOllamaModels(ollamaUrl);

    if (!models || models.length === 0) {
      console.error('[API] No Ollama models found — user needs to install a model');
      return { success: false, error: 'No models installed', models: [] };
    }

    // Get current settings (loadSettings returns the settings object directly)
    const settings = await loadSettings();

    // Check if current model exists in available models
    const currentModel = settings.ollamaModel;
    if (currentModel) {
      const exactMatch = models.includes(currentModel);
      // Fuzzy: only when no tag specified (e.g. 'dolphin3' matches 'dolphin3:latest')
      // Do NOT match across different tags ('gemma3:27b' vs 'gemma3:7b' are different models)
      const fuzzyMatch = !exactMatch && !currentModel.includes(':') &&
        models.find(m => m.split(':')[0] === currentModel);

      if (exactMatch || fuzzyMatch) {
        return { success: true, model: currentModel, models: models, changed: false };
      }
    }

    // Auto-select first available model
    const selectedModel = models[0];

    // Update settings properly (via Electron IPC if in Electron, otherwise localStorage)
    const updatedSettings = {
      ...settings,
      ollamaModel: selectedModel,
      ollamaUrl: ollamaUrl
    };

    // Save to both IPC AND localStorage to keep them in sync
    localStorage.setItem('settings', JSON.stringify(updatedSettings));
    if (isElectron()) {
      const saveResult = await window.electronAPI.saveSettings(updatedSettings);
      if (!saveResult || !saveResult.success) {
        console.error('[API] Failed to save auto-detected model via IPC');
      }
    }
    return {
      success: true,
      model: selectedModel,
      models: models,
      changed: true,
      message: `Auto-selected model: ${selectedModel}`
    };

  } catch (error) {
    console.error('[v8.2 Auto-Detect] ❌ Error:', error);
    return { success: false, error: error.message, models: [] };
  }
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export const generateSessionId = () => {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

export const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No file provided'));
      return;
    }
    
    if (!file.type.startsWith('image/')) {
      reject(new Error('File must be an image'));
      return;
    }
    
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Error reading file'));
    reader.readAsDataURL(file);
  });
};

// ============================================================================
// CHARACTER MANAGEMENT (PRESERVED)
// ============================================================================

export const saveCustomCharacter = (characterData) => {
  try {
    if (!characterData || !characterData.name) {
      throw new Error('Invalid character data');
    }

    const normalizedCharacterData = {
      ...characterData,
      responseMode: normalizeResponseMode(characterData.responseMode ?? characterData.responseStyle, 'normal')
    };

    const canonicalCharacters = JSON.parse(localStorage.getItem('custom_characters') || '[]');
    const legacyCharacters = JSON.parse(localStorage.getItem('customCharacters') || '[]');
    const characters = [...canonicalCharacters, ...legacyCharacters].filter((character, index, array) => (
      character?.id && array.findIndex((candidate) => candidate?.id === character.id) === index
    ));
    
    if (!normalizedCharacterData.id) {
      normalizedCharacterData.id = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    const existingIndex = characters.findIndex(c => c.id === normalizedCharacterData.id);
    
    if (existingIndex >= 0) {
      characters[existingIndex] = {
        ...normalizedCharacterData,
        updatedAt: new Date().toISOString()
      };
    } else {
      characters.push({
        ...normalizedCharacterData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
    
    try {
      localStorage.setItem('custom_characters', JSON.stringify(characters));
      localStorage.removeItem('customCharacters');
    } catch (storageError) {
      if (storageError.name === 'QuotaExceededError' || storageError.code === 22) {
        console.error('[CharacterSave] localStorage quota exceeded');
        window.dispatchEvent(new CustomEvent('show-toast', {
          detail: { message: 'Storage full — try removing some character avatars to free space', type: 'error' }
        }));
        return { success: false, error: 'Storage quota exceeded' };
      }
      throw storageError;
    }

    return { success: true, character: normalizedCharacterData };
  } catch (error) {
    console.error('[v8.1 Character] Error saving:', error);
    return { success: false, error: error.message };
  }
};
