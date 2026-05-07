import { describe, it, expect } from 'vitest';
import { parseSuggestionJson } from '../../src/lib/chat/suggestions/parse.js';

describe('parseSuggestionJson', () => {
  it('parses valid 3-pill schema', () => {
    const raw = JSON.stringify({
      pills: [
        { role: 'stay',    text: 'Sure, why not?' },
        { role: 'forward', text: 'Lead the way.' },
        { role: 'push',    text: 'Already heading there.' }
      ]
    });
    expect(parseSuggestionJson(raw)).toEqual({
      stay: 'Sure, why not?',
      forward: 'Lead the way.',
      push: 'Already heading there.'
    });
  });

  it('returns null for malformed JSON', () => {
    expect(parseSuggestionJson('{ pills: [')).toBeNull();
    expect(parseSuggestionJson('not json at all')).toBeNull();
    expect(parseSuggestionJson('')).toBeNull();
    expect(parseSuggestionJson(null)).toBeNull();
    expect(parseSuggestionJson(undefined)).toBeNull();
  });

  it('returns null when pills array is missing', () => {
    expect(parseSuggestionJson('{}')).toBeNull();
    expect(parseSuggestionJson('{"foo":"bar"}')).toBeNull();
  });

  it('returns null when fewer than 3 pills', () => {
    const raw = JSON.stringify({ pills: [{ role: 'stay', text: 'hi' }] });
    expect(parseSuggestionJson(raw)).toBeNull();
  });

  it('returns null when role missing on any pill', () => {
    const raw = JSON.stringify({
      pills: [
        { role: 'stay', text: 'a' },
        { text: 'b' },
        { role: 'push', text: 'c' }
      ]
    });
    expect(parseSuggestionJson(raw)).toBeNull();
  });

  it('returns null when one of the three required roles is missing', () => {
    const raw = JSON.stringify({
      pills: [
        { role: 'stay',    text: 'a' },
        { role: 'forward', text: 'b' },
        { role: 'forward', text: 'c' }
      ]
    });
    expect(parseSuggestionJson(raw)).toBeNull();
  });

  it('strips surrounding markdown code fences', () => {
    const raw = '```json\n{"pills":[{"role":"stay","text":"a"},{"role":"forward","text":"b"},{"role":"push","text":"c"}]}\n```';
    expect(parseSuggestionJson(raw)).toEqual({ stay: 'a', forward: 'b', push: 'c' });
  });

  it('trims whitespace on text values', () => {
    const raw = JSON.stringify({
      pills: [
        { role: 'stay',    text: '  hi  ' },
        { role: 'forward', text: '\n there \n' },
        { role: 'push',    text: 'now' }
      ]
    });
    expect(parseSuggestionJson(raw)).toEqual({ stay: 'hi', forward: 'there', push: 'now' });
  });
});
