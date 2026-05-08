import { describe, it, expect } from 'vitest';
import { parseSuggestionJson } from '../../../../src/lib/chat/suggestions/parse.js';

const validRaw = JSON.stringify({
  beat: 'refusal',
  pills: [
    { tone: 'hold', text: 'I lower my hand.' },
    { tone: 'move', text: 'I step back, give space.' },
    { tone: 'press', text: 'I leave the room quietly.' }
  ]
});

describe('parseSuggestionJson', () => {
  it('parses a valid beat+pills JSON payload', () => {
    const out = parseSuggestionJson(validRaw);
    expect(out.beat).toBe('refusal');
    expect(out.pills).toHaveLength(3);
    expect(out.pills[0]).toEqual({ tone: 'hold', text: 'I lower my hand.' });
  });

  it('returns null on malformed JSON', () => {
    expect(parseSuggestionJson('not json')).toBeNull();
    expect(parseSuggestionJson('')).toBeNull();
    expect(parseSuggestionJson(null)).toBeNull();
  });

  it('returns null when beat enum is invalid', () => {
    const bad = JSON.stringify({ beat: 'nope', pills: JSON.parse(validRaw).pills });
    expect(parseSuggestionJson(bad)).toBeNull();
  });

  it('returns null when pills array length is wrong', () => {
    const bad = JSON.stringify({ beat: 'refusal', pills: JSON.parse(validRaw).pills.slice(0, 2) });
    expect(parseSuggestionJson(bad)).toBeNull();
  });

  it('returns null when a pill tone is invalid', () => {
    const obj = JSON.parse(validRaw);
    obj.pills[0].tone = 'shove';
    expect(parseSuggestionJson(JSON.stringify(obj))).toBeNull();
  });

  it('returns null when a pill text is missing or empty', () => {
    const obj = JSON.parse(validRaw);
    obj.pills[1].text = '';
    expect(parseSuggestionJson(JSON.stringify(obj))).toBeNull();
  });

  it('strips fenced code blocks if present', () => {
    const fenced = '```json\n' + validRaw + '\n```';
    const out = parseSuggestionJson(fenced);
    expect(out).not.toBeNull();
    expect(out.pills).toHaveLength(3);
  });
});
