/**
 * Post-LLM validation pipeline for Smart Suggestions:
 * - 3-gram Jaccard repetition (cross-pill + against previous-pill memory)
 * - POV-bleed regex (char-name anywhere, anchored char-pronoun + verb)
 * - First-person anchor (en-only)
 * - Echo defense vs. character's last message
 * - Wrong-language heuristic (delegates to language.js)
 */

import { CHAR_PRONOUNS_BY_LOCALE, looksLikeWrongLanguage } from './language.js';

const JACCARD_THRESHOLD = 0.4;
const ECHO_JACCARD_THRESHOLD = 0.4;
const PREVIOUS_PILLS_WINDOW = 6;
const FIRST_PERSON_EN_PATTERNS = [/\bI\b/, /\bI'm\b/, /\bI've\b/, /\bI'd\b/, /\bmy\b/, /\bme\b/];

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
  const lower = text.toLowerCase();

  if (characterName) {
    const stripped = text.replace(/^\s*\*[^*]+\*\s*/, '').trimStart();
    const charPattern = new RegExp(`^${escapeRegex(characterName)}\\b`, 'i');
    if (charPattern.test(stripped)) return true;
  }

  const pronouns = CHAR_PRONOUNS_BY_LOCALE[locale] || [];
  for (const p of pronouns) {
    const re = new RegExp(`^${escapeRegex(p)}\\s+\\S`, 'i');
    if (re.test(lower)) return true;
  }
  return false;
}

/**
 * @param {string} pill
 * @param {string} locale
 * @returns {boolean}
 */
export function hasFirstPersonAnchor(pill, locale) {
  if (String(locale || '').toLowerCase() !== 'en') return true;
  const text = String(pill || '');
  if (!text) return false;
  for (const re of FIRST_PERSON_EN_PATTERNS) {
    if (re.test(text)) return true;
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

/**
 * Applies all sanity filters. Returns the parsed payload on success, null on any reject.
 *
 * @param {{beat:string, pills:Array<{tone:string, text:string}>}|null} parsed
 * @param {{characterName:string, locale:string, previousPills:string[], lastAssistantMessage?:string}} ctx
 * @returns {{beat:string, pills:Array<{tone:string, text:string}>}|null}
 */
export function applySanityFilters(parsed, ctx) {
  if (!parsed || !Array.isArray(parsed.pills)) return null;
  const { characterName, locale, previousPills, lastAssistantMessage } = ctx;
  const texts = parsed.pills.map((p) => p.text);

  for (const pill of parsed.pills) {
    if (hasPovBleed(pill.text, { characterName, locale })) return null;
    if (!hasFirstPersonAnchor(pill.text, locale)) return null;
  }

  const echoTrigrams = lastAssistantMessage ? trigrams(lastAssistantMessage) : null;
  if (echoTrigrams && echoTrigrams.size > 0) {
    for (const text of texts) {
      if (jaccard(trigrams(text), echoTrigrams) >= ECHO_JACCARD_THRESHOLD) return null;
    }
  }

  for (let i = 0; i < texts.length; i += 1) {
    const others = texts.filter((_, idx) => idx !== i);
    const target = trigrams(texts[i]);
    for (const sib of others) {
      if (jaccard(target, trigrams(sib)) >= JACCARD_THRESHOLD) return null;
    }
    if (isRepetitive(texts[i], previousPills)) return null;
  }

  if (looksLikeWrongLanguage(texts, locale)) return null;

  return parsed;
}
