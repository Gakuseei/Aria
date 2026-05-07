import { describe, expect, it } from 'vitest';
import { trimToCompleteSentences } from '../../src/lib/chat/impersonate/index.js';

describe('trimToCompleteSentences', () => {
  it('returns empty for empty input', () => {
    expect(trimToCompleteSentences('', 2)).toBe('');
    expect(trimToCompleteSentences(null, 2)).toBe('');
  });

  it('keeps short drafts unchanged', () => {
    const text = '*I smile* "Hello there."';
    expect(trimToCompleteSentences(text, 2)).toBe(text);
  });

  it('caps to 2 dialogue-bearing sentences when the model overshoots with action+dialogue rhythm', () => {
    const sarah = `*I smile back at Sarah, meeting her gaze* "Well, Sarah, I must admit, your corner of the world is quite captivating." *gestures around the dimly lit bar* "The atmosphere, the music... it's all very inviting." *leans forward slightly, mirroring her posture* "And you're right, it's not just a drink I'm after tonight." *pauses briefly, letting the anticipation build* ""`;
    const result = trimToCompleteSentences(sarah, 2);
    expect(result).toContain('captivating."');
    expect(result).toContain('inviting."');
    expect(result).not.toContain('drink');
    expect(result).not.toContain('anticipation');
    expect(result.endsWith('"')).toBe(true);
  });

  it('does not split on stylistic mid-sentence ellipsis like "music..."', () => {
    const text = `*I pause* "The music... it's nice." *I sit down* "Tell me more about it."`;
    const result = trimToCompleteSentences(text, 2);
    expect(result).toContain('music...');
    expect(result).toContain('it\'s nice."');
  });

  it('drops trailing ellipsis-truncation tail like ..."', () => {
    const text = `*leans forward* "But I'm open to exploring what other..."`;
    const result = trimToCompleteSentences(text, 2);
    expect(result).not.toMatch(/\.{3}"\s*$/);
    expect(result).not.toContain('exploring what other');
  });

  it('trims orphan trailing asterisk from unclosed action segment', () => {
    const text = `*I smile* "Hello there." *I take a step`;
    const result = trimToCompleteSentences(text, 2);
    expect(result).not.toMatch(/\*\s*$/);
    expect(result.endsWith('"')).toBe(true);
  });

  it('handles the Lily mid-sentence chop case', () => {
    const lily = `*I smile warmly and walk over to the study table, taking the offered seat* "Thanks for setting all this up, Lily. It looks great!" *reaches for the trail mix, pouring some into a small bowl* "I love your study strategy - fuel first, knowledge second.`;
    const result = trimToCompleteSentences(lily, 2);
    expect(result).toContain('looks great!"');
    expect(result).not.toContain('fuel first');
  });

  it('respects custom maxSentences', () => {
    const text = `One. Two. Three. Four.`;
    expect(trimToCompleteSentences(text, 1)).toBe('One.');
    expect(trimToCompleteSentences(text, 3)).toBe('One. Two. Three.');
  });
});
