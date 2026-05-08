import { describe, it, expect } from 'vitest';
import { buildSuggestionPrompt, deriveClosingLine } from '../../../../src/lib/chat/suggestions/prompt.js';

describe('deriveClosingLine', () => {
  it('returns last 3 sentences from a long char message', () => {
    const msg = 'First. Second. Third. Fourth. Fifth.';
    expect(deriveClosingLine(msg)).toBe('Third. Fourth. Fifth.');
  });

  it('returns whole message when fewer than 3 sentences', () => {
    expect(deriveClosingLine('Only one.')).toBe('Only one.');
    expect(deriveClosingLine('Two ones. Two twos.')).toBe('Two ones. Two twos.');
  });

  it('caps to 600 chars from the end', () => {
    const long = 'a'.repeat(800);
    const out = deriveClosingLine(`Sentence one. ${long}. Final.`);
    expect(out.length).toBeLessThanOrEqual(600);
    expect(out.endsWith('Final.')).toBe(true);
  });

  it('returns empty string for missing input', () => {
    expect(deriveClosingLine(undefined)).toBe('');
    expect(deriveClosingLine('')).toBe('');
  });
});

describe('buildSuggestionPrompt', () => {
  const baseArgs = {
    history: [
      { role: 'user', content: 'I sit down across from her.' },
      { role: 'assistant', content: 'Sarah glances over. She smiles slowly. "Hi."' }
    ],
    characterName: 'Sarah',
    userName: 'Erik',
    appLanguageName: 'German'
  };

  it('contains the single positive POV constraint', () => {
    const { systemPrompt } = buildSuggestionPrompt(baseArgs);
    expect(systemPrompt).toContain("Erik's speech and movement are ONLY defined by Erik input");
  });

  it('does not contain any negative late-steering rules', () => {
    const { systemPrompt } = buildSuggestionPrompt(baseArgs);
    expect(systemPrompt).not.toMatch(/\bdo not\b/i);
    expect(systemPrompt).not.toMatch(/\bnever\b/i);
    expect(systemPrompt).not.toMatch(/\bavoid\b/i);
  });

  it('includes closing-line block', () => {
    const { systemPrompt } = buildSuggestionPrompt(baseArgs);
    expect(systemPrompt).toContain('Sarah glances over. She smiles slowly. "Hi."');
  });

  it('includes few-shot mirror block with last user message', () => {
    const { systemPrompt } = buildSuggestionPrompt(baseArgs);
    expect(systemPrompt).toContain('I sit down across from her.');
  });

  it('mentions target language', () => {
    const { systemPrompt } = buildSuggestionPrompt(baseArgs);
    expect(systemPrompt).toContain('German');
  });

  it('asks for three pills mapped to beat tones', () => {
    const { systemPrompt } = buildSuggestionPrompt(baseArgs);
    expect(systemPrompt).toMatch(/three pills/i);
    expect(systemPrompt).toContain('hold');
    expect(systemPrompt).toContain('move');
    expect(systemPrompt).toContain('press');
  });

  it('returns empty placeholders when history empty', () => {
    const out = buildSuggestionPrompt({ ...baseArgs, history: [] });
    expect(out.systemPrompt).toContain('(scene just started)');
  });
});
