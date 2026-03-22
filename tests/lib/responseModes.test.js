import { describe, expect, it } from 'vitest';
import {
  didUserRequestShortReply,
  getBaseResponseMode,
  getEffectiveResponseMode,
  getResponseModeTokenLimit,
  getResponseQualityIssues,
  normalizeResponseMode
} from '../../src/lib/responseModes.js';

describe('responseModes', () => {
  it('normalizes legacy response styles into response modes', () => {
    expect(normalizeResponseMode('concise')).toBe('short');
    expect(normalizeResponseMode('default')).toBe('normal');
    expect(normalizeResponseMode('expansive')).toBe('long');
  });

  it('defaults both built-in and custom characters to normal when no explicit mode is set', () => {
    expect(getBaseResponseMode({ responseMode: '', isCustom: false })).toBe('normal');
    expect(getBaseResponseMode({ responseMode: '', isCustom: true })).toBe('normal');
  });

  it('lets explicit user intent temporarily override the base response mode', () => {
    expect(getEffectiveResponseMode({ responseMode: 'normal', isCustom: false }, 'Erzähl mir mehr davon.')).toBe('long');
    expect(getEffectiveResponseMode({ responseMode: 'normal', isCustom: true }, 'keep it short')).toBe('short');
    expect(getEffectiveResponseMode({ responseMode: 'normal', isCustom: true }, 'be more detailed')).toBe('long');
  });

  it('only treats explicit brevity instructions as a short-request override', () => {
    expect(didUserRequestShortReply('keep it short')).toBe(true);
    expect(didUserRequestShortReply('brief answer please')).toBe(true);
    expect(didUserRequestShortReply('Hi')).toBe(false);
    expect(didUserRequestShortReply('Okay')).toBe(false);
  });

  it('caps token budgets for short and normal mode', () => {
    expect(getResponseModeTokenLimit(512, 'short')).toBe(192);
    expect(getResponseModeTokenLimit(512, 'normal')).toBe(384);
    expect(getResponseModeTokenLimit(512, 'long')).toBe(512);
  });

  it('flags overlong replies for compact modes', () => {
    const issues = getResponseQualityIssues({
      responseMode: 'short',
      userMessage: 'Hi',
      aiMessage: 'One. Two. Three. Four. Five. Six. Seven. Eight. Nine.\n\nSecond paragraph with even more detail.'
    });

    expect(issues.shouldRetry).toBe(true);
    expect(issues.issues).toContain('Rewrite the reply as one short paragraph with no more than 4 sentences. Keep only the strongest details unless the user explicitly asked for detail.');
  });

  it('does not flag long mode just for being long', () => {
    const issues = getResponseQualityIssues({
      responseMode: 'long',
      userMessage: 'Tell me more.',
      aiMessage: 'Paragraph one.\n\nParagraph two.\n\nParagraph three.\n\nParagraph four.'
    });

    expect(issues.shouldRetry).toBe(false);
    expect(issues.issues).toEqual([]);
  });
});
