import { describe, it, expect } from 'vitest';
import {
  STOPWORDS_BY_LOCALE,
  CHAR_PRONOUNS_BY_LOCALE,
  APP_LANG_NAME_BY_LOCALE,
  looksLikeWrongLanguage
} from '../../../../src/lib/chat/suggestions/language.js';

describe('language', () => {
  it('returns English name for known locales', () => {
    expect(APP_LANG_NAME_BY_LOCALE.de).toBe('German');
    expect(APP_LANG_NAME_BY_LOCALE.en).toBe('English');
    expect(APP_LANG_NAME_BY_LOCALE.es).toBe('Spanish');
    expect(APP_LANG_NAME_BY_LOCALE.ja).toBe('Japanese');
  });

  it('exposes stopwords per locale', () => {
    expect(STOPWORDS_BY_LOCALE.de).toContain('der');
    expect(STOPWORDS_BY_LOCALE.de).toContain('und');
    expect(STOPWORDS_BY_LOCALE.es).toContain('que');
  });

  it('exposes character-pronouns per locale', () => {
    expect(CHAR_PRONOUNS_BY_LOCALE.en).toEqual(expect.arrayContaining(['she', 'he', 'they']));
    expect(CHAR_PRONOUNS_BY_LOCALE.de).toEqual(expect.arrayContaining(['sie', 'er']));
  });

  it('looksLikeWrongLanguage returns false for English target locale', () => {
    expect(looksLikeWrongLanguage(['Take her hand.', 'Step closer.', 'Stay still.'], 'en')).toBe(false);
  });

  it('looksLikeWrongLanguage returns true when German pills are pure-ASCII English', () => {
    const pills = ['Take her hand.', 'Step closer.', 'Stay still.'];
    expect(looksLikeWrongLanguage(pills, 'de')).toBe(true);
  });

  it('looksLikeWrongLanguage returns false when pills contain German stopwords', () => {
    const pills = ['Halt ihre Hand.', 'Tritt näher.', 'Bleib bei der Tür.'];
    expect(looksLikeWrongLanguage(pills, 'de')).toBe(false);
  });

  it('looksLikeWrongLanguage returns false on unknown locale (conservative)', () => {
    expect(looksLikeWrongLanguage(['x', 'y', 'z'], 'xx')).toBe(false);
  });
});
