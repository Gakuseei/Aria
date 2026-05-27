import { describe, it, expect } from 'vitest';
import characters from '../../src/config/characters.js';

const REQUIRED_FIELDS = ['id', 'name', 'subtitle', 'startingMessage', 'passionSpeed', 'responseMode', 'category', 'description'];
const NON_NARRATOR_REQUIRED = ['systemPrompt', 'instructions', 'scenario'];
const VALID_PASSION_SPEEDS = ['slow', 'normal', 'fast', 'extreme'];
const VALID_RESPONSE_MODES = ['short', 'normal', 'long'];
const VALID_CATEGORIES = ['nsfw', 'sfw'];

const isNarrator = (c) => c.personaType === 'narrator';
const nonNarrators = (chars) => chars.filter(c => !isNarrator(c));

describe('characters', () => {
  it('exports an array of 14 characters (12 personas + 2 narrators)', () => {
    expect(Array.isArray(characters)).toBe(true);
    expect(characters).toHaveLength(14);
  });

  it('every character has all required fields', () => {
    for (const char of characters) {
      for (const field of REQUIRED_FIELDS) {
        expect(char, `${char.name || char.id} missing "${field}"`).toHaveProperty(field);
      }
    }
  });

  it('non-narrator characters have systemPrompt / instructions / scenario', () => {
    for (const char of nonNarrators(characters)) {
      for (const field of NON_NARRATOR_REQUIRED) {
        expect(char, `${char.name || char.id} missing "${field}"`).toHaveProperty(field);
      }
    }
  });

  it('narrator characters have styleBrief instead of systemPrompt', () => {
    const narrators = characters.filter(isNarrator);
    expect(narrators.length).toBe(2);
    for (const char of narrators) {
      expect(char.styleBrief, `${char.name}: narrator missing styleBrief`).toBeTruthy();
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

  it('non-narrator systemPrompt is non-empty plain text (no W++ brackets)', () => {
    for (const char of nonNarrators(characters)) {
      expect(char.systemPrompt.length, `${char.name}: systemPrompt empty`).toBeGreaterThan(0);
      expect(char.systemPrompt, `${char.name}: systemPrompt still contains W++ brackets`).not.toContain('[Character(');
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

  it('has correct category distribution (7 NSFW, 7 SFW including narrators)', () => {
    const cats = characters.reduce((acc, c) => {
      acc[c.category] = (acc[c.category] || 0) + 1;
      return acc;
    }, {});
    expect(cats.nsfw).toBe(7);
    expect(cats.sfw).toBe(7);
  });
});

describe('built-in characters voice pins', () => {
  it('has voicePin defined for Alice, Sarah, Adrian, and Lily', () => {
    const targetIds = ['alice_maid', 'sarah_bartender', 'adrian_dark', 'lily_student'];
    const targets = targetIds.map(id => characters.find(c => c.id === id));
    for (const character of targets) {
      expect(character).toBeDefined();
      expect(character.voicePin).toBeTruthy();
      expect(character.voicePin.length).toBeGreaterThan(40);
    }
  });

  it('has voicePinNsfw set for Alice and Sarah where intimate-scene voice differs', () => {
    const alice = characters.find(c => c.id === 'alice_maid');
    const sarah = characters.find(c => c.id === 'sarah_bartender');
    expect(alice.voicePinNsfw).toBeTruthy();
    expect(sarah.voicePinNsfw).toBeTruthy();
  });
});
