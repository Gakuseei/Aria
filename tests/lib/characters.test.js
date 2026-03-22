import { describe, it, expect } from 'vitest';
import characters from '../../src/config/characters.js';

const REQUIRED_FIELDS = ['id', 'name', 'subtitle', 'systemPrompt', 'startingMessage', 'greeting', 'passionSpeed', 'responseMode', 'gender', 'category', 'description', 'instructions', 'scenario'];
const VALID_PASSION_SPEEDS = ['slow', 'normal', 'fast', 'extreme'];
const VALID_RESPONSE_MODES = ['short', 'normal', 'long'];
const VALID_GENDERS = ['female', 'male', 'non-binary'];
const VALID_CATEGORIES = ['nsfw', 'sfw'];

describe('characters', () => {
  it('exports an array of 12 characters', () => {
    expect(Array.isArray(characters)).toBe(true);
    expect(characters).toHaveLength(12);
  });

  it('every character has all required fields', () => {
    for (const char of characters) {
      for (const field of REQUIRED_FIELDS) {
        expect(char, `${char.name || char.id} missing "${field}"`).toHaveProperty(field);
      }
    }
  });

  it('every character has a unique id', () => {
    const ids = characters.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every character has a valid passionSpeed', () => {
    for (const char of characters) {
      expect(VALID_PASSION_SPEEDS, `${char.name} has invalid passionSpeed: ${char.passionSpeed}`)
        .toContain(char.passionSpeed);
    }
  });

  it('every character has a valid responseMode', () => {
    for (const char of characters) {
      expect(VALID_RESPONSE_MODES, `${char.name} has invalid responseMode: ${char.responseMode}`)
        .toContain(char.responseMode);
    }
  });

  it('all built-in characters default to normal replies', () => {
    for (const char of characters) {
      expect(char.responseMode, `${char.name} should default to normal response mode`).toBe('normal');
    }
  });

  it('greeting matches startingMessage for all characters', () => {
    for (const char of characters) {
      expect(char.greeting, `${char.name}: greeting !== startingMessage`).toBe(char.startingMessage);
    }
  });

  it('systemPrompt uses plain text prose (no W++ brackets)', () => {
    for (const char of characters) {
      expect(char.systemPrompt.length, `${char.name}: systemPrompt too short`).toBeGreaterThan(200);
      expect(char.systemPrompt, `${char.name}: systemPrompt still contains W++ brackets`).not.toContain('[Character(');
      expect(char.systemPrompt.split('\n\n').length, `${char.name}: systemPrompt should have multiple paragraphs`).toBeGreaterThanOrEqual(4);
    }
  });

  it('built-in exampleDialogue fields do not contain bracketed meta instructions', () => {
    for (const char of characters) {
      if (!char.exampleDialogue) continue;
      expect(char.exampleDialogue, `${char.name}: exampleDialogue should be real example text, not prompt metadata`).not.toMatch(/^\[(?:instructions?|note|notes)\s*:/i);
    }
  });

  it('every character has a valid gender', () => {
    for (const char of characters) {
      expect(VALID_GENDERS, `${char.name} has invalid gender: ${char.gender}`)
        .toContain(char.gender);
    }
  });

  it('every character has a valid category', () => {
    for (const char of characters) {
      expect(VALID_CATEGORIES, `${char.name} has invalid category: ${char.category}`)
        .toContain(char.category);
    }
  });

  it('every character has passionEnabled boolean', () => {
    for (const char of characters) {
      expect(typeof char.passionEnabled, `${char.name}: passionEnabled must be boolean`).toBe('boolean');
    }
  });

  it('all standard characters have passion enabled', () => {
    for (const char of characters) {
      expect(char.passionEnabled, `${char.name} should have passionEnabled=true`).toBe(true);
    }
  });

  it('has correct gender distribution (7F, 4M, 1NB)', () => {
    const genders = characters.reduce((acc, c) => {
      acc[c.gender] = (acc[c.gender] || 0) + 1;
      return acc;
    }, {});
    expect(genders.female).toBe(7);
    expect(genders.male).toBe(4);
    expect(genders['non-binary']).toBe(1);
  });

  it('has correct category distribution (7 NSFW, 5 SFW)', () => {
    const cats = characters.reduce((acc, c) => {
      acc[c.category] = (acc[c.category] || 0) + 1;
      return acc;
    }, {});
    expect(cats.nsfw).toBe(7);
    expect(cats.sfw).toBe(5);
  });
});
