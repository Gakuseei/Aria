const ASTERISK_PATTERN = /\*[^*\n]+\*/;
const DIALOGUE_PATTERN = /"[^"\n]+"/;
const SENTENCE_SPLIT = /(?<=[.!?])\s+/;
const EXPRESSIVE_PUNCT = /[!?]{2,}|!\?|\?!/;

const GERMAN_TOKENS = /\b(?:ich|du|der|die|das|und|nicht|aber|mit|zu|auf|für|sehr|halt|einfach)\b/gi;
const ENGLISH_TOKENS = /\b(?:i|you|the|and|not|but|with|to|on|for|very|just)\b/gi;

const DEFAULT_FEATURES = Object.freeze({
  asterisksUsage: 'never',
  prose: 'mixed',
  avgWords: 0,
  avgSentences: 0,
  registerHints: [],
  language: 'en',
  punctuation: 'neutral',
  dialogueRatio: 0
});

/**
 * Pull the most recent user-authored messages from a chat history.
 *
 * @param {Array<{ role: string, content: string }>} history
 * @param {number} [limit=8]
 * @returns {Array<{ role: string, content: string }>}
 */
function recentUserMessages(history, limit = 8) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((message) => message?.role === 'user' && typeof message.content === 'string')
    .slice(-limit);
}

/**
 * Extract heuristic voice features from recent user turns.
 * Pure: no IO, no LLM calls.
 *
 * @param {Array<{ role: string, content: string }>} history
 * @param {string} _userName
 * @param {{ name?: string, pronouns?: string }} _userIdentity
 * @returns {{
 *   asterisksUsage: 'never'|'sometimes'|'often'|'always',
 *   prose: 'mixed'|'natural'|'stage_direction',
 *   avgWords: number,
 *   avgSentences: number,
 *   registerHints: string[],
 *   language: 'en'|'de',
 *   punctuation: 'neutral'|'expressive',
 *   dialogueRatio: number
 * }}
 */
export function extractVoiceFeatures(history, _userName, _userIdentity) {
  const samples = recentUserMessages(history, 8);
  if (samples.length === 0) return { ...DEFAULT_FEATURES };

  let asteriskCount = 0;
  let dialogueCount = 0;
  let totalWords = 0;
  let totalSentences = 0;
  let expressivePunct = 0;
  const allText = [];

  for (const message of samples) {
    const text = message.content.trim();
    allText.push(text);
    if (ASTERISK_PATTERN.test(text)) asteriskCount += 1;
    if (DIALOGUE_PATTERN.test(text)) dialogueCount += 1;
    if (EXPRESSIVE_PUNCT.test(text)) expressivePunct += 1;
    const words = text.split(/\s+/).filter(Boolean);
    const sentences = text.split(SENTENCE_SPLIT).filter(Boolean);
    totalWords += words.length;
    totalSentences += sentences.length;
  }

  const total = samples.length;
  const asteriskRatio = asteriskCount / total;
  const dialogueRatio = dialogueCount / total;

  let asterisksUsage = 'never';
  if (asteriskRatio >= 0.66) asterisksUsage = 'always';
  else if (asteriskRatio >= 0.33) asterisksUsage = 'often';
  else if (asteriskRatio >= 0.05) asterisksUsage = 'sometimes';

  let prose = 'mixed';
  if (dialogueRatio >= 0.5 && asteriskRatio < 0.2) prose = 'natural';
  else if (asteriskRatio >= 0.5 && dialogueRatio < 0.4) prose = 'stage_direction';

  const corpus = allText.join(' ').toLowerCase();
  const germanHits = (corpus.match(GERMAN_TOKENS) || []).length;
  const englishHits = (corpus.match(ENGLISH_TOKENS) || []).length;
  const language = germanHits > englishHits * 1.3 ? 'de' : 'en';

  const registerHints = [];
  if (totalWords / total < 12) registerHints.push('short_punchy');
  if (asteriskRatio >= 0.4) registerHints.push('first_person_action');
  if (dialogueRatio >= 0.6) registerHints.push('dialogue_forward');

  return {
    asterisksUsage,
    prose,
    avgWords: Math.round((totalWords / total) * 10) / 10,
    avgSentences: Math.round((totalSentences / total) * 10) / 10,
    registerHints,
    language,
    punctuation: expressivePunct >= total * 0.4 ? 'expressive' : 'neutral',
    dialogueRatio: Math.round(dialogueRatio * 100) / 100
  };
}

const STRIP_PATTERNS = [
  /<\|[^|]*\|>/g,
  /\[TOOL_CALLS\]/g,
  /<\/s>/g,
  /```[\s\S]*?```/g
];

/**
 * Strip chat-template artifacts and code fences from a raw user message
 * so it can be embedded as a clean voice example.
 *
 * @param {string} raw
 * @returns {string}
 */
function sanitizeForExample(raw) {
  let text = String(raw || '').trim();
  if (!text) return '';
  for (const pattern of STRIP_PATTERNS) text = text.replace(pattern, '');
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length > 220) text = text.slice(0, 220).trim();
  return text;
}

/**
 * Build a voice card from chat history: a short XML-tagged examples block,
 * the assistant prefix to seed continuation, and the underlying features.
 * Pure: no IO, no LLM calls.
 *
 * @param {Array<{ role: string, content: string }>} history
 * @param {string} userName
 * @param {{ name?: string, pronouns?: string }} userIdentity
 * @returns {{ examples: string, guidance: string, assistantPrefix: string, features: object }}
 */
export function buildVoiceCard(history, userName, userIdentity) {
  const features = extractVoiceFeatures(history, userName, userIdentity);
  const samples = recentUserMessages(history, 5)
    .map((message) => sanitizeForExample(message.content))
    .filter(Boolean);

  const pronouns = userIdentity?.pronouns || 'he/him';
  const escapedName = (userName || 'User').replace(/[<>"&]/g, '');
  const escapedPronouns = pronouns.replace(/[<>"&]/g, '');

  const examples = samples.length === 0
    ? ''
    : [
        `<user_voice_examples user="${escapedName}" pronouns="${escapedPronouns}">`,
        ...samples.map((sample) => `  <example>${sample}</example>`),
        `</user_voice_examples>`
      ].join('\n');

  const guidance = '';
  const assistantPrefix = `${userName || 'User'}: `;

  return { examples, guidance, assistantPrefix, features };
}
