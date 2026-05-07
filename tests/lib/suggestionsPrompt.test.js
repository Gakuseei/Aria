import { describe, it, expect } from 'vitest';
import { buildSuggestionPrompt, SUGGESTION_PROMPT_CONSTANTS } from '../../src/lib/chat/suggestions/prompt.js';

const fixtureCharacter = {
  name: 'Sarah',
  persona: 'Snarky bartender with a dry sardonic voice.'
};

const fixtureCompiledCard = {
  characterCore: 'Sarah: snarky bartender, dry sardonic voice.'
};
const fixtureOpenThread = 'Sarah is waiting for a reply about the back room.';

const fixtureHistory = [
  { role: 'user',      content: 'Hey what are you doing later?' },
  { role: 'assistant', content: 'Cleaning up. Why?' },
  { role: 'user',      content: 'Want to grab a drink?' },
  { role: 'assistant', content: 'Maybe. The back room is quieter. Coming?' }
];

describe('buildSuggestionPrompt', () => {
  it('produces system + user prompts with required sections', () => {
    const out = buildSuggestionPrompt({
      compiledCard: fixtureCompiledCard,
      history: fixtureHistory,
      characterName: 'Sarah',
      userName: 'Erik',
      openThread: fixtureOpenThread
    });

    expect(out.systemPrompt).toContain('Sarah');
    expect(out.systemPrompt).toContain('Erik');
    expect(out.systemPrompt).toContain('snarky bartender');
    expect(out.systemPrompt).toContain('back room');
    expect(out.systemPrompt).toContain('"role": "stay"');
    expect(out.systemPrompt).toContain('"role": "forward"');
    expect(out.systemPrompt).toContain('"role": "push"');

    expect(out.userPrompt).toContain('Hey what are you doing later?');
    expect(out.userPrompt).toContain('Cleaning up.');
    expect(out.userPrompt).toContain('Want to grab a drink?');
    expect(out.userPrompt).toContain('The back room is quieter.');
  });

  it('does not contain negative-framing strings (suppression-strip enforcement)', () => {
    const out = buildSuggestionPrompt({
      compiledCard: fixtureCompiledCard,
      history: fixtureHistory,
      characterName: 'Sarah',
      userName: 'Erik'
    });
    const combined = out.systemPrompt + '\n' + out.userPrompt;
    expect(combined).not.toMatch(/\bNEVER\b/);
    expect(combined).not.toMatch(/\bDo not\b/i);
    expect(combined).not.toMatch(/\bAvoid\b/i);
  });

  it('truncates very long character messages to charMsgTrimChars', () => {
    const longChar = 'x'.repeat(2000);
    const out = buildSuggestionPrompt({
      compiledCard: fixtureCompiledCard,
      history: [
        { role: 'user', content: 'go on' },
        { role: 'assistant', content: longChar }
      ],
      characterName: 'Sarah',
      userName: 'Erik'
    });
    expect(out.userPrompt.length).toBeLessThan(longChar.length + 1500);
  });

  it('exposes recentUserCount and recentCharCount constants', () => {
    expect(SUGGESTION_PROMPT_CONSTANTS.recentUserCount).toBe(3);
    expect(SUGGESTION_PROMPT_CONSTANTS.recentCharCount).toBe(2);
  });

  it('handles short history without crashing', () => {
    const out = buildSuggestionPrompt({
      compiledCard: fixtureCompiledCard,
      history: [{ role: 'user', content: 'hi' }],
      characterName: 'Sarah',
      userName: 'Erik'
    });
    expect(out.systemPrompt).toBeTruthy();
    expect(out.userPrompt).toBeTruthy();
  });
});
