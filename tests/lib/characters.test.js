import { describe, it, expect } from 'vitest';
import characters from '../../src/config/characters.js';

const REQUIRED_FIELDS = ['id', 'name', 'subtitle', 'systemPrompt', 'startingMessage', 'greeting', 'passionSpeed'];
const VALID_PASSION_SPEEDS = ['slow', 'normal', 'fast', 'extreme'];

describe('characters', () => {
  it('exports an array of 5 characters', () => {
    expect(Array.isArray(characters)).toBe(true);
    expect(characters).toHaveLength(5);
  });

  it('every character has all required fields', () => {
    for (const char of characters) {
      for (const field of REQUIRED_FIELDS) {
        expect(char, `${char.name || char.id} missing "${field}"`).toHaveProperty(field);
        expect(char[field], `${char.name}: "${field}" is empty`).toBeTruthy();
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

  it('greeting matches startingMessage for all characters', () => {
    for (const char of characters) {
      expect(char.greeting, `${char.name}: greeting !== startingMessage`).toBe(char.startingMessage);
    }
  });

  it('systemPrompt contains W++ Character definition', () => {
    for (const char of characters) {
      expect(char.systemPrompt, `${char.name}: systemPrompt missing W++ format`).toContain('[Character(');
    }
  });
});
