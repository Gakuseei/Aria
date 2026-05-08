/**
 * Locale-aware tables for Smart Suggestions language locking and POV defense.
 */

export const APP_LANG_NAME_BY_LOCALE = Object.freeze({
  en: 'English',
  de: 'German',
  es: 'Spanish',
  fr: 'French',
  it: 'Italian',
  pt: 'Portuguese',
  nl: 'Dutch',
  pl: 'Polish',
  ru: 'Russian',
  tr: 'Turkish',
  ja: 'Japanese',
  zh: 'Chinese',
  ko: 'Korean'
});

export const STOPWORDS_BY_LOCALE = Object.freeze({
  en: ['the', 'and', 'i', 'you', 'is', 'a', 'to', 'of'],
  de: ['der', 'die', 'das', 'und', 'ich', 'du', 'ist', 'ein', 'eine', 'nicht', 'mit', 'auf'],
  es: ['el', 'la', 'que', 'y', 'no', 'de', 'es', 'un', 'una', 'con'],
  fr: ['le', 'la', 'et', 'que', 'je', 'tu', 'est', 'un', 'une', 'pas'],
  it: ['il', 'la', 'e', 'che', 'non', 'di', 'un', 'una', 'è', 'sono'],
  pt: ['o', 'a', 'e', 'que', 'não', 'de', 'um', 'uma', 'é', 'são'],
  nl: ['de', 'het', 'en', 'dat', 'is', 'een', 'niet', 'ik', 'je'],
  pl: ['i', 'nie', 'jest', 'to', 'że', 'na', 'się', 'co'],
  ru: ['и', 'не', 'на', 'я', 'что', 'это', 'но', 'а'],
  tr: ['ve', 'bir', 'bu', 'ben', 'sen', 'değil', 'ile'],
  ja: ['の', 'は', 'を', 'に', 'が', 'で', 'と', 'です'],
  zh: ['的', '是', '不', '我', '你', '了', '在'],
  ko: ['이', '가', '은', '는', '을', '를', '의', '에']
});

export const CHAR_PRONOUNS_BY_LOCALE = Object.freeze({
  en: ['she', 'he', 'they'],
  de: ['sie', 'er'],
  es: ['ella', 'él'],
  fr: ['elle', 'il'],
  it: ['lei', 'lui'],
  pt: ['ela', 'ele'],
  nl: ['zij', 'hij'],
  pl: ['ona', 'on'],
  ru: ['она', 'он'],
  tr: [],
  ja: ['彼女', '彼'],
  zh: ['她', '他'],
  ko: ['그녀', '그']
});

const ASCII_ONLY_RE = /^[\x00-\x7F]+$/;

/**
 * Conservative wrong-language heuristic for Smart Suggestion pills.
 * Returns true only when pills look unambiguously wrong-language.
 *
 * @param {string[]} pills - 3 pill texts.
 * @param {string} locale - ISO 639-1 short code.
 * @returns {boolean}
 */
export function looksLikeWrongLanguage(pills, locale) {
  if (locale === 'en') return false;
  const stopwords = STOPWORDS_BY_LOCALE[locale];
  if (!stopwords) return false;

  const allAscii = pills.every((p) => ASCII_ONLY_RE.test(String(p)));
  if (!allAscii) return false;

  const text = pills.join(' ').toLowerCase();
  const words = text.match(/\b[a-zà-ÿäöüß]+\b/g) || [];
  const hits = words.filter((w) => stopwords.includes(w)).length;
  return hits === 0;
}
