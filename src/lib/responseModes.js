export const RESPONSE_MODE_ORDER = ['short', 'normal', 'long'];

const RESPONSE_MODE_CONFIG = {
  short: {
    labelKey: 'responseModeShort',
    tokenCap: 160,
    sentenceMax: 4,
    paragraphMax: 1,
    charMax: 360,
    promptInstruction: 'Default to 2-3 sentences and one short paragraph at most. Keep replies complete and characterful, but avoid extra narration, filler, or scene padding unless the user explicitly asks for more detail.',
    rewriteInstruction: 'Rewrite the reply as one short paragraph with no more than 4 sentences. Keep only the strongest details unless the user explicitly asked for detail.'
  },
  normal: {
    labelKey: 'responseModeNormal',
    tokenCap: 224,
    sentenceMax: 7,
    paragraphMax: 2,
    charMax: 520,
    promptInstruction: 'Keep replies focused and natural. Usually stay within 1-2 short paragraphs, carry only one strong beat forward, and avoid sprawling narration unless the user explicitly asks for more detail.',
    rewriteInstruction: 'Tighten the reply to a focused length. Avoid sprawling narration and keep only the strongest details.'
  },
  long: {
    labelKey: 'responseModeLong',
    tokenCap: 384,
    sentenceMax: null,
    paragraphMax: null,
    charMax: null,
    promptInstruction: 'Longer, richer replies are allowed when they fit the scene. Do not pad with empty narration.',
    rewriteInstruction: ''
  }
};

const LEGACY_RESPONSE_MODE_MAP = {
  concise: 'short',
  default: 'normal',
  detailed: 'long',
  expansive: 'long'
};

const MORE_DETAIL_PATTERNS = [
  /\bmore detail(?:s)?\b/i,
  /\blonger\b/i,
  /\belaborate\b/i,
  /\bin depth\b/i,
  /\bdetailed\b/i,
  /\bdetaill/i,
  /\bgenauer\b/i,
  /\bausf[uü]hr/i,
  /\berz[aä]hl.*mehr/i
];

const SHORTER_REPLY_PATTERNS = [
  /\bshort answer\b/i,
  /\bshorter\b/i,
  /\bbrief\b/i,
  /\bconcise\b/i,
  /\bkeep it short\b/i,
  /\bkurz\b/i,
  /\bk[uü]rzer\b/i,
  /\bknapp\b/i
];

function countParagraphs(text) {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .length;
}

function countSentences(text) {
  const normalized = String(text || '')
    .replace(/\*[^*]*\*/g, ' ')
    .replace(/"[^"]*"/g, ' ');

  return (normalized.match(/[.!?]+/g) || []).length;
}

function requestedMoreDetail(userMessage) {
  return MORE_DETAIL_PATTERNS.some((pattern) => pattern.test(userMessage || ''));
}

export function didUserRequestShortReply(userMessage) {
  return SHORTER_REPLY_PATTERNS.some((pattern) => pattern.test(userMessage || ''));
}

export function normalizeResponseMode(mode, fallback = 'normal') {
  if (typeof mode !== 'string' || !mode.trim()) return fallback;

  const normalizedMode = mode.trim().toLowerCase();
  if (RESPONSE_MODE_CONFIG[normalizedMode]) return normalizedMode;
  if (LEGACY_RESPONSE_MODE_MAP[normalizedMode]) return LEGACY_RESPONSE_MODE_MAP[normalizedMode];
  return fallback;
}

export function getResponseModeConfig(mode) {
  return RESPONSE_MODE_CONFIG[normalizeResponseMode(mode)];
}

export function getBaseResponseMode(character) {
  const fallback = 'normal';
  return normalizeResponseMode(character?.responseMode ?? character?.responseStyle, fallback);
}

export function getEffectiveResponseMode(character, userMessage = '') {
  const baseMode = getBaseResponseMode(character);

  if (didUserRequestShortReply(userMessage)) return 'short';
  if (requestedMoreDetail(userMessage)) {
    if (baseMode === 'short') return 'normal';
    return 'long';
  }

  return baseMode;
}

export function getResponseModeTokenLimit(baseTokens, mode) {
  const { tokenCap } = getResponseModeConfig(mode);
  if (!tokenCap) return baseTokens;
  return Math.min(baseTokens, tokenCap);
}

export function getResponseQualityIssues({ responseMode, userMessage = '', aiMessage = '' }) {
  const mode = normalizeResponseMode(responseMode);
  const config = getResponseModeConfig(mode);
  const issues = [];

  if (mode !== 'long' && !requestedMoreDetail(userMessage)) {
    const sentenceCount = countSentences(aiMessage);
    const paragraphCount = countParagraphs(aiMessage);
    const charCount = String(aiMessage || '').trim().length;

    if (
      (config.sentenceMax && sentenceCount > config.sentenceMax) ||
      (config.paragraphMax && paragraphCount > config.paragraphMax) ||
      (config.charMax && charCount > config.charMax)
    ) {
      issues.push(config.rewriteInstruction);
    }
  }

  return {
    issues,
    shouldRetry: issues.length > 0
  };
}
