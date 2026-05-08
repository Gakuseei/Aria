import { describe, it, expect } from 'vitest';
import {
  trigrams,
  jaccard,
  hasPovBleed,
  isRepetitive,
  applySanityFilters
} from '../../../../src/lib/chat/suggestions/sanity.js';

describe('trigrams + jaccard', () => {
  it('produces deterministic trigram set for short strings', () => {
    const t = trigrams('abcd');
    expect(t.size).toBe(2);
  });

  it('jaccard returns 1 for identical strings', () => {
    expect(jaccard(trigrams('hello world'), trigrams('hello world'))).toBe(1);
  });

  it('jaccard is 0 for fully disjoint strings', () => {
    expect(jaccard(trigrams('abcdef'), trigrams('xyzwvu'))).toBe(0);
  });

  it('jaccard is between 0 and 1 for partial overlap', () => {
    const j = jaccard(trigrams('take her hand'), trigrams('take his hand'));
    expect(j).toBeGreaterThan(0);
    expect(j).toBeLessThan(1);
  });
});

describe('hasPovBleed', () => {
  it('rejects pill that leads with character name', () => {
    expect(hasPovBleed('Sarah leans in.', { characterName: 'Sarah', locale: 'en' })).toBe(true);
  });

  it('rejects pill that leads with female pronoun in English locale', () => {
    expect(hasPovBleed('She leans in.', { characterName: 'Sarah', locale: 'en' })).toBe(true);
  });

  it('accepts pill with object-position pronoun', () => {
    expect(hasPovBleed('I take her hand.', { characterName: 'Sarah', locale: 'en' })).toBe(false);
  });

  it('rejects German leading pronoun "Sie"', () => {
    expect(hasPovBleed('Sie schaut weg.', { characterName: 'Kira', locale: 'de' })).toBe(true);
  });

  it('accepts when locale has no pronoun list (e.g. Turkish)', () => {
    expect(hasPovBleed('Sen yaklaş.', { characterName: 'Kira', locale: 'tr' })).toBe(false);
  });
});

describe('isRepetitive', () => {
  it('rejects pill that matches a previous pill exactly', () => {
    expect(isRepetitive('Take her hand.', ['take her hand.'])).toBe(true);
  });

  it('rejects pill with high jaccard against previous pill', () => {
    expect(isRepetitive('I take her hand.', ['I take her hand gently.'])).toBe(true);
  });

  it('accepts pill with low jaccard', () => {
    expect(isRepetitive('I leave the room.', ['I take her hand.'])).toBe(false);
  });

  it('only checks last 6 of previous pills', () => {
    const old = ['x'.repeat(20), 'y'.repeat(20), 'z'.repeat(20), 'a'.repeat(20), 'b'.repeat(20), 'c'.repeat(20), 'I take her hand.'];
    expect(isRepetitive('I take her hand.', old.slice(0, 6))).toBe(false);
  });
});

describe('applySanityFilters', () => {
  const args = {
    characterName: 'Sarah',
    locale: 'en',
    previousPills: []
  };

  it('returns parsed payload when all pills clean', () => {
    const parsed = {
      beat: 'invitation',
      pills: [
        { tone: 'hold', text: 'I smile back.' },
        { tone: 'move', text: 'I step closer.' },
        { tone: 'press', text: 'I take her hand.' }
      ]
    };
    expect(applySanityFilters(parsed, args)).toEqual(parsed);
  });

  it('returns null when any pill has POV bleed', () => {
    const parsed = {
      beat: 'invitation',
      pills: [
        { tone: 'hold', text: 'Sarah leans in.' },
        { tone: 'move', text: 'I step closer.' },
        { tone: 'press', text: 'I take her hand.' }
      ]
    };
    expect(applySanityFilters(parsed, args)).toBeNull();
  });

  it('returns null when two pills are too similar', () => {
    const parsed = {
      beat: 'uncertain',
      pills: [
        { tone: 'hold', text: 'I take her hand.' },
        { tone: 'move', text: 'I take her hand gently.' },
        { tone: 'press', text: 'I leave the room.' }
      ]
    };
    expect(applySanityFilters(parsed, args)).toBeNull();
  });

  it('returns null when pill repeats a previous pill', () => {
    const parsed = {
      beat: 'invitation',
      pills: [
        { tone: 'hold', text: 'I smile back.' },
        { tone: 'move', text: 'I step closer.' },
        { tone: 'press', text: 'I take her hand.' }
      ]
    };
    expect(applySanityFilters(parsed, { ...args, previousPills: ['I take her hand.'] })).toBeNull();
  });

  it('returns null when pills are wrong language for non-English locale', () => {
    const parsed = {
      beat: 'invitation',
      pills: [
        { tone: 'hold', text: 'I smile back.' },
        { tone: 'move', text: 'I step closer.' },
        { tone: 'press', text: 'I take her hand.' }
      ]
    };
    expect(applySanityFilters(parsed, { ...args, locale: 'de' })).toBeNull();
  });
});
