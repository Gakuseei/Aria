import { describe, it, expect } from 'vitest';
import { translations } from '../../src/lib/translations.js';

const EXPECTED_LANGUAGES = ['en', 'de', 'es', 'zh', 'fr', 'it', 'pt', 'ru', 'ja', 'ko', 'ar', 'hi', 'tr'];

/**
 * Recursively collect all leaf keys from a nested object as dot-paths.
 */
function collectKeys(obj, prefix = '') {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...collectKeys(v, path));
    } else {
      keys.push(path);
    }
  }
  return keys.sort();
}

describe('translations', () => {
  it('exports all 13 expected languages', () => {
    const langs = Object.keys(translations);
    for (const lang of EXPECTED_LANGUAGES) {
      expect(langs, `missing language: ${lang}`).toContain(lang);
    }
    expect(langs).toHaveLength(EXPECTED_LANGUAGES.length);
  });

  it('every language has a meta section with label and flag', () => {
    for (const lang of EXPECTED_LANGUAGES) {
      expect(translations[lang].meta, `${lang} missing meta`).toBeDefined();
      expect(translations[lang].meta.label, `${lang} missing meta.label`).toBeTruthy();
      expect(translations[lang].meta.flag, `${lang} missing meta.flag`).toBeTruthy();
    }
  });

  it('all languages have the same top-level sections as English', () => {
    const enSections = Object.keys(translations.en).sort();
    for (const lang of EXPECTED_LANGUAGES) {
      if (lang === 'en') continue;
      const langSections = Object.keys(translations[lang]).sort();
      expect(langSections, `${lang} missing sections`).toEqual(enSections);
    }
  });

  it('no language is missing more than 50 keys vs English (tracks translation debt)', () => {
    const enKeys = collectKeys(translations.en);
    for (const lang of EXPECTED_LANGUAGES) {
      if (lang === 'en') continue;
      const langKeys = collectKeys(translations[lang]);
      const missingInLang = enKeys.filter(k => !langKeys.includes(k));
      expect(missingInLang.length, `${lang} missing ${missingInLang.length} keys`).toBeLessThan(50);
    }
  });

  it('no translation value is an empty string', () => {
    for (const lang of EXPECTED_LANGUAGES) {
      const keys = collectKeys(translations[lang]);
      for (const key of keys) {
        const value = key.split('.').reduce((o, k) => o?.[k], translations[lang]);
        expect(value, `${lang}.${key} is empty`).not.toBe('');
      }
    }
  });
});
