/**
 * Thin post-LLM safety-net for Smart Suggestions. Primary POV defense lives in the prompt + schema.
 * Returns { kept, rejected } so the orchestrator can build reason-specific retry hints.
 * - 3-gram Jaccard repetition (cross-pill + against previous-pill memory)
 * - POV-bleed regex (char-name at start, anchored char-pronoun + verb)
 * - Echo defense vs. character's last message
 * - Wrong-language heuristic (delegates to language.js)
 */

import { CHAR_PRONOUNS_BY_LOCALE, looksLikeWrongLanguage } from './language.js';

const JACCARD_THRESHOLD = 0.4;
const ECHO_JACCARD_THRESHOLD = 0.4;
const PREVIOUS_PILLS_WINDOW = 6;

function normalize(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {string} s
 * @returns {Set<string>}
 */
export function trigrams(s) {
  const text = normalize(s);
  const out = new Set();
  if (text.length < 3) {
    if (text.length > 0) out.add(text);
    return out;
  }
  for (let i = 0; i <= text.length - 3; i += 1) out.add(text.slice(i, i + 3));
  return out;
}

/**
 * @param {Set<string>} a
 * @param {Set<string>} b
 * @returns {number}
 */
export function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * @param {string} pill
 * @param {{characterName:string, locale:string}} ctx
 * @returns {boolean}
 */
export function hasPovBleed(pill, { characterName, locale }) {
  const text = String(pill || '').trim();
  if (!text) return false;
  const stripped = text.replace(/^\s*\*[^*]+\*\s*/, '').trimStart();
  const strippedLower = stripped.toLowerCase();

  if (characterName) {
    const charPattern = new RegExp(`^${escapeRegex(characterName)}(\\s|$)`, 'i');
    if (charPattern.test(stripped)) return true;
  }

  const pronouns = CHAR_PRONOUNS_BY_LOCALE[locale] || [];
  for (const p of pronouns) {
    const re = new RegExp(`^${escapeRegex(p)}\\s+\\S`, 'i');
    if (re.test(strippedLower)) return true;
  }
  return false;
}

/**
 * @param {string} pill
 * @param {string[]} previousPills
 * @returns {boolean}
 */
export function isRepetitive(pill, previousPills) {
  const window = (previousPills || []).slice(-PREVIOUS_PILLS_WINDOW);
  const target = trigrams(pill);
  for (const old of window) {
    if (normalize(old) === normalize(pill)) return true;
    if (jaccard(target, trigrams(old)) >= JACCARD_THRESHOLD) return true;
  }
  return false;
}

const PILL_WORD_LIMIT = 18;

function countWords(s) {
  const stripped = String(s || '').replace(/\*[^*]*\*/g, ' ').trim();
  if (!stripped) return 0;
  return stripped.split(/\s+/).filter(Boolean).length;
}

/**
 * Applies sanity filters per pill and returns kept + rejected partitions.
 * Rejection reasons: 'pov_bleed' | 'echo' | 'repetition' | 'wrong_lang' | 'too_long'.
 *
 * @param {{beat:string, pills:Array<{tone:string, text:string}>}|null} parsed
 * @param {{characterName:string, locale:string, previousPills:string[], lastAssistantMessage?:string}} ctx
 * @returns {{kept:Array<{tone:string, text:string}>, rejected:Array<{index:number, text:string, reason:string}>}}
 */
export function applySanityFilters(parsed, ctx) {
  if (!parsed || !Array.isArray(parsed.pills)) return { kept: [], rejected: [] };
  const { characterName, locale, previousPills, lastAssistantMessage } = ctx;
  const pills = parsed.pills;
  const texts = pills.map((p) => p.text);

  const wrongLang = looksLikeWrongLanguage(texts, locale);
  const echoTrigrams = lastAssistantMessage ? trigrams(lastAssistantMessage) : null;
  const allTrigrams = texts.map((t) => trigrams(t));

  const reasons = new Array(pills.length).fill(null);

  for (let i = 0; i < pills.length; i += 1) {
    const text = pills[i].text;
    if (reasons[i]) continue;
    if (wrongLang) { reasons[i] = 'wrong_lang'; continue; }
    if (hasPovBleed(text, { characterName, locale })) { reasons[i] = 'pov_bleed'; continue; }
    if (countWords(text) > PILL_WORD_LIMIT) { reasons[i] = 'too_long'; continue; }
    if (echoTrigrams && echoTrigrams.size > 0 && jaccard(allTrigrams[i], echoTrigrams) >= ECHO_JACCARD_THRESHOLD) {
      reasons[i] = 'echo';
      continue;
    }
    if (isRepetitive(text, previousPills)) { reasons[i] = 'repetition'; continue; }
    for (let j = 0; j < pills.length; j += 1) {
      if (j === i) continue;
      if (jaccard(allTrigrams[i], allTrigrams[j]) >= JACCARD_THRESHOLD) {
        reasons[i] = 'repetition';
        break;
      }
    }
  }

  const kept = [];
  const rejected = [];
  for (let i = 0; i < pills.length; i += 1) {
    if (reasons[i]) rejected.push({ index: i, text: pills[i].text, reason: reasons[i] });
    else kept.push(pills[i]);
  }
  return { kept, rejected };
}
