import en from './translations/en.js';

export const FALLBACK_LANGUAGE = 'en';

const localeModules = import.meta.glob('./translations/locales/*.js');
const eagerLocaleModules = import.meta.env.MODE === 'test'
  ? import.meta.glob('./translations/locales/*.js', { eager: true })
  : {};

function normalizeLanguage(lang) {
  return typeof lang === 'string' && lang.trim() ? lang.trim().toLowerCase() : FALLBACK_LANGUAGE;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergeTranslationTree(baseValue, overrideValue) {
  if (overrideValue === undefined) {
    return baseValue;
  }

  if (!isPlainObject(baseValue) || !isPlainObject(overrideValue)) {
    return overrideValue;
  }

  const merged = { ...baseValue };
  for (const key of Object.keys(overrideValue)) {
    merged[key] = mergeTranslationTree(baseValue[key], overrideValue[key]);
  }
  return merged;
}

function buildLocaleValue(lang, locale) {
  return lang === FALLBACK_LANGUAGE ? locale : mergeTranslationTree(en, locale);
}

function getLocaleCodeFromPath(path) {
  const match = path.match(/\/([a-z]{2})\.js$/i);
  return match ? normalizeLanguage(match[1]) : null;
}

const translationCache = new Map([[FALLBACK_LANGUAGE, en]]);

for (const [path, module] of Object.entries(eagerLocaleModules)) {
  const lang = getLocaleCodeFromPath(path);
  if (!lang || lang === FALLBACK_LANGUAGE) continue;
  translationCache.set(lang, buildLocaleValue(lang, module?.default || en));
}

export const translations = Object.fromEntries(translationCache.entries());

async function importLocale(normalizedLanguage) {
  if (normalizedLanguage === FALLBACK_LANGUAGE) {
    return en;
  }

  const loader = localeModules[`./translations/locales/${normalizedLanguage}.js`];
  if (!loader) {
    return en;
  }

  const module = await loader();
  return module?.default || en;
}

export function getTranslations(lang = FALLBACK_LANGUAGE) {
  return translationCache.get(normalizeLanguage(lang)) || en;
}

export async function loadTranslations(lang = FALLBACK_LANGUAGE) {
  const normalizedLanguage = normalizeLanguage(lang);
  if (translationCache.has(normalizedLanguage)) {
    return translationCache.get(normalizedLanguage);
  }

  const locale = await importLocale(normalizedLanguage);
  const merged = buildLocaleValue(normalizedLanguage, locale);
  translationCache.set(normalizedLanguage, merged);
  return merged;
}
