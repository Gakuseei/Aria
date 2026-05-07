/**
 * Application-level repetition prevention.
 *
 * Catches 4-gram phrase reuse and identical-gesture spam across recent replies,
 * complementing Ollama sampler-level penalties (DRY, repeat_penalty) which lose
 * effectiveness once the offending phrase falls outside the token-window
 * lookback.
 *
 * @module repetitionGuard
 */

const DEFAULT_LOOKBACK = 5;
const NGRAM_SIZE = 4;
const GESTURE_REPEAT_THRESHOLD = 3;
const PIN_ECHO_MIN_WORDS = 4;

const PET_NAMES = new Set([
  'love', 'dear', 'sweetheart', 'baby', 'honey', 'darling',
  'sweetie', 'beautiful', 'handsome', 'gorgeous', 'angel',
  'cutie', 'doll', 'babe', 'hun', 'sugar', 'pumpkin', 'stud'
]);

export const REPETITION_RETRY_HINT = 'Avoid recycling phrases or gestures from your last replies. Use fresh phrasing.';

function normalizeForPhrases(text) {
  const noActions = String(text || '').replace(/\*[^*]*\*/g, ' ');
  const noFormatting = noActions.replace(/[*_~`"'‘’“”‹›«»]/g, ' ');
  return noFormatting
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
 * Check whether `newReply` re-uses a 4-word phrase that already appeared in
 * recent replies, or copies >= 4 words verbatim from a voice pin.
 *
 * @param {string} newReply - Candidate reply text.
 * @param {Array<string>} recentReplies - Last N assistant replies (oldest first).
 * @param {object} [options]
 * @param {string} [options.charName] - Character name (whitelist anchor).
 * @param {string} [options.userName] - User name (whitelist anchor).
 * @param {string} [options.voicePin] - SFW voice pin string.
 * @param {string} [options.voicePinNsfw] - NSFW voice pin string.
 * @returns {{banned: boolean, source?: 'history'|'pin-echo', phrase?: string}}
 */
export function checkPhraseRepetition(newReply, recentReplies, options = {}) {
  const {
    charName = '',
    userName = '',
    voicePin = '',
    voicePinNsfw = ''
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

  for (const pinSource of [voicePin, voicePinNsfw]) {
    if (!pinSource) continue;
    const pinWords = extractWords(pinSource);
    if (pinWords.length < PIN_ECHO_MIN_WORDS) continue;
    const pinGrams = new Set(extractNGrams(pinWords, PIN_ECHO_MIN_WORDS));
    const replyPinGrams = extractNGrams(newWords, PIN_ECHO_MIN_WORDS);
    for (const gram of replyPinGrams) {
      if (pinGrams.has(gram)) {
        return { banned: true, source: 'pin-echo', phrase: gram };
      }
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
