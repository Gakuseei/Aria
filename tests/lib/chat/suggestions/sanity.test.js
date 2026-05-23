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

  it('rejects char-pronoun bleed after an action-asterisk prefix', () => {
    expect(hasPovBleed('*leans in* She turns away.', { characterName: 'Sarah', locale: 'en' })).toBe(true);
  });

  it('rejects char-name bleed after an action-asterisk prefix', () => {
    expect(hasPovBleed('*leans in* Sarah turns away.', { characterName: 'Sarah', locale: 'en' })).toBe(true);
  });

  it('accepts first-person continuation after an action-asterisk prefix', () => {
    expect(hasPovBleed('*leans in* I turn away.', { characterName: 'Sarah', locale: 'en' })).toBe(false);
  });

  it('allows vocative use of character name (followed by comma)', () => {
    expect(hasPovBleed('Sarah, please come here.', { characterName: 'Sarah', locale: 'en' })).toBe(false);
  });

  it('allows vocative use of character name (followed by exclamation)', () => {
    expect(hasPovBleed('Sarah! Look at me.', { characterName: 'Sarah', locale: 'en' })).toBe(false);
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

  it('returns all pills kept and empty rejected when clean', () => {
    const parsed = {
      beat: 'invitation',
      pills: [
        { tone: 'hold', text: 'I smile back.' },
        { tone: 'move', text: 'I step closer.' },
        { tone: 'press', text: 'I take her hand.' }
      ]
    };
    const result = applySanityFilters(parsed, args);
    expect(result.kept).toEqual(parsed.pills);
    expect(result.rejected).toEqual([]);
  });

  it('rejects only the bleeding pill with reason pov_bleed', () => {
    const parsed = {
      beat: 'invitation',
      pills: [
        { tone: 'hold', text: 'Sarah leans in.' },
        { tone: 'move', text: 'I step closer.' },
        { tone: 'press', text: 'I take her hand.' }
      ]
    };
    const result = applySanityFilters(parsed, args);
    expect(result.kept).toHaveLength(2);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]).toMatchObject({ index: 0, text: 'Sarah leans in.', reason: 'pov_bleed' });
  });

  it('flags asterisk-prefixed char-pronoun bleed with reason pov_bleed', () => {
    const parsed = {
      beat: 'invitation',
      pills: [
        { tone: 'hold', text: '*leans in* She turns away.' },
        { tone: 'move', text: 'I step closer.' },
        { tone: 'press', text: 'I take her hand.' }
      ]
    };
    const result = applySanityFilters(parsed, args);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toBe('pov_bleed');
  });

  it('keeps asterisk-prefixed first-person pills', () => {
    const parsed = {
      beat: 'invitation',
      pills: [
        { tone: 'hold', text: '*leans in* I turn away.' },
        { tone: 'move', text: 'I step closer.' },
        { tone: 'press', text: 'I take her hand.' }
      ]
    };
    const result = applySanityFilters(parsed, args);
    expect(result.kept).toHaveLength(3);
    expect(result.rejected).toEqual([]);
  });

  it('keeps vocative use of character name (followed by first-person clause)', () => {
    const parsed = {
      beat: 'invitation',
      pills: [
        { tone: 'hold', text: 'Sarah, I need you to stay.' },
        { tone: 'move', text: 'I step closer.' },
        { tone: 'press', text: 'I take your hand.' }
      ]
    };
    const result = applySanityFilters(parsed, args);
    expect(result.kept).toHaveLength(3);
    expect(result.rejected).toEqual([]);
  });

  it('marks similar sibling pills with reason repetition', () => {
    const parsed = {
      beat: 'uncertain',
      pills: [
        { tone: 'hold', text: 'I take her hand.' },
        { tone: 'move', text: 'I take her hand gently.' },
        { tone: 'press', text: 'I leave the room.' }
      ]
    };
    const result = applySanityFilters(parsed, args);
    const reasons = result.rejected.map((r) => r.reason);
    expect(reasons).toContain('repetition');
    expect(result.rejected.length).toBeGreaterThanOrEqual(1);
  });

  it('marks pills repeating prior history with reason repetition', () => {
    const parsed = {
      beat: 'invitation',
      pills: [
        { tone: 'hold', text: 'I smile back.' },
        { tone: 'move', text: 'I step closer.' },
        { tone: 'press', text: 'I take her hand.' }
      ]
    };
    const result = applySanityFilters(parsed, { ...args, previousPills: ['I take her hand.'] });
    expect(result.rejected.some((r) => r.reason === 'repetition' && r.text === 'I take her hand.')).toBe(true);
  });

  it('marks pills with reason wrong_lang when locale mismatches', () => {
    const parsed = {
      beat: 'invitation',
      pills: [
        { tone: 'hold', text: 'I smile back.' },
        { tone: 'move', text: 'I step closer.' },
        { tone: 'press', text: 'I take her hand.' }
      ]
    };
    const result = applySanityFilters(parsed, { ...args, locale: 'de' });
    expect(result.kept).toEqual([]);
    expect(result.rejected.every((r) => r.reason === 'wrong_lang')).toBe(true);
  });

  it('marks over-long pills with reason too_long', () => {
    const longText = 'I ' + 'really '.repeat(20) + 'want to know what you meant by that earlier.';
    const parsed = {
      beat: 'invitation',
      pills: [
        { tone: 'hold', text: longText },
        { tone: 'move', text: 'I step closer.' },
        { tone: 'press', text: 'I take her hand.' }
      ]
    };
    const result = applySanityFilters(parsed, args);
    expect(result.rejected.some((r) => r.reason === 'too_long')).toBe(true);
  });

  it('preserves order of kept pills', () => {
    const parsed = {
      beat: 'invitation',
      pills: [
        { tone: 'hold', text: 'I smile back.' },
        { tone: 'move', text: 'Sarah leans in.' },
        { tone: 'press', text: 'I take her hand.' }
      ]
    };
    const result = applySanityFilters(parsed, args);
    expect(result.kept.map((p) => p.text)).toEqual(['I smile back.', 'I take her hand.']);
  });

  it('returns empty kept and empty rejected when payload is null', () => {
    const result = applySanityFilters(null, args);
    expect(result.kept).toEqual([]);
    expect(result.rejected).toEqual([]);
  });
});
