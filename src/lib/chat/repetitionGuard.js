/**
 * Application-level repetition prevention.
 *
 * Catches 5-gram phrase reuse and identical-gesture spam across recent replies,
 * complementing Ollama sampler-level penalties (DRY, repeat_penalty) which lose
 * effectiveness once the offending phrase falls outside the token-window
 * lookback.
 *
 * @module repetitionGuard
 */

const DEFAULT_LOOKBACK = 5;
const NGRAM_SIZE = 5;
const GESTURE_REPEAT_THRESHOLD = 3;

const PET_NAMES = new Set([
  'love', 'dear', 'sweetheart', 'baby', 'honey', 'darling',
  'sweetie', 'beautiful', 'handsome', 'gorgeous', 'angel',
  'cutie', 'doll', 'babe', 'hun', 'sugar', 'pumpkin', 'stud'
]);

export const REPETITION_RETRY_HINT = 'Avoid recycling phrases or gestures from your last replies. Use fresh phrasing.';

function normalizeForPhrases(text) {
  const stripped = String(text || '').replace(/[*_~`"'‘’“”‹›«»]/g, ' ');
  return stripped
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractWords(text) {
  const normalized = normalizeForPhrases(text);
  return normalized ? normalized.split(' ').filter(Boolean) : [];
}

function extractNGrams(words, size = NGRAM_SIZE) {
  if (!Array.isArray(words) || words.length < size) return [];
  const grams = [];
  for (let i = 0; i <= words.length - size; i += 1) {
    grams.push(words.slice(i, i + size).join(' '));
  }
  return grams;
}

function isWhitelistedNGram(gram, charName, userName) {
  const tokens = gram.split(' ');
  const lowerChar = String(charName || '').toLowerCase();
  const lowerUser = String(userName || '').toLowerCase();
  let exempt = 0;
  for (const token of tokens) {
    if (token === lowerChar || token === lowerUser || PET_NAMES.has(token)) {
      exempt += 1;
    }
  }
  return exempt >= 2;
}

function buildHistoricalNGramSet(recentReplies, charName, userName) {
  const set = new Set();
  for (const reply of recentReplies || []) {
    const words = extractWords(reply);
    for (const gram of extractNGrams(words)) {
      if (!isWhitelistedNGram(gram, charName, userName)) {
        set.add(gram);
      }
    }
  }
  return set;
}

/**
 * Check whether `newReply` re-uses a 5-word phrase that already appeared in
 * recent replies.
 *
 * @param {string} newReply - Candidate reply text.
 * @param {Array<string>} recentReplies - Last N assistant replies (oldest first).
 * @param {object} [options]
 * @param {string} [options.charName] - Character name (whitelist anchor).
 * @param {string} [options.userName] - User name (whitelist anchor).
 * @returns {{banned: boolean, source?: 'history', phrase?: string}}
 */
export function checkPhraseRepetition(newReply, recentReplies, options = {}) {
  const {
    charName = '',
    userName = ''
  } = options;

  if (!newReply) return { banned: false };

  const newWords = extractWords(newReply);
  if (newWords.length < NGRAM_SIZE) return { banned: false };

  const newGrams = extractNGrams(newWords);

  const historicalGrams = buildHistoricalNGramSet(recentReplies, charName, userName);
  for (const gram of newGrams) {
    if (isWhitelistedNGram(gram, charName, userName)) continue;
    if (historicalGrams.has(gram)) {
      return { banned: true, source: 'history', phrase: gram };
    }
  }

  return { banned: false };
}

function extractGestures(text) {
  const matches = String(text || '').match(/\*([^*]+)\*/g) || [];
  return matches.map((segment) => segment
    .replace(/^\*|\*$/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  ).filter(Boolean);
}

/**
 * Check whether `newReply` repeats an action-asterisk gesture that already
 * appears in each of the prior `(threshold - 1)` replies.
 *
 * @param {string} newReply - Candidate reply text.
 * @param {Array<string>} recentReplies - Last N assistant replies (oldest first).
 * @param {object} [options]
 * @param {number} [options.threshold] - Required occurrence count incl. newReply.
 * @returns {{banned: boolean, gesture?: string}}
 */
export function checkGestureRepetition(newReply, recentReplies, options = {}) {
  const { threshold = GESTURE_REPEAT_THRESHOLD } = options;
  const newGestures = extractGestures(newReply);
  if (newGestures.length === 0) return { banned: false };

  const priorCount = threshold - 1;
  const prior = (recentReplies || []).slice(-priorCount);
  if (prior.length < priorCount) return { banned: false };

  const uniqueNew = new Set(newGestures);
  for (const gesture of uniqueNew) {
    const inAll = prior.every((reply) => extractGestures(reply).includes(gesture));
    if (inAll) return { banned: true, gesture };
  }
  return { banned: false };
}

/**
 * Pull the last `lookback` assistant replies from a conversation history.
 *
 * @param {Array<{role: string, content: string}>} history - Conversation history.
 * @param {number} [lookback] - How many assistant replies to keep (default 5).
 * @returns {Array<string>} Reply contents, oldest first.
 */
export function getRecentAssistantReplies(history, lookback = DEFAULT_LOOKBACK) {
  if (!Array.isArray(history)) return [];
  const assistantOnly = history.filter((message) => message && message.role === 'assistant' && typeof message.content === 'string');
  return assistantOnly.slice(-lookback).map((message) => message.content);
}

/**
 * Format a transient system-prompt suffix listing recently-used phrases the
 * model should avoid in the upcoming reply. Empty input returns empty string
 * so the caller can no-op without a conditional.
 *
 * @param {Array<string>} phrases - Phrases (5-word fragments) to avoid.
 * @returns {string} Hint string, or '' if no phrases.
 */
export function formatRecentBanHint(phrases) {
  if (!Array.isArray(phrases) || phrases.length === 0) return '';
  const cleaned = phrases
    .filter((p) => typeof p === 'string' && p.trim())
    .map((p) => `"${p.trim()}"`);
  if (cleaned.length === 0) return '';
  return `Avoid these recently-used phrases: ${cleaned.join(', ')}.`;
}
