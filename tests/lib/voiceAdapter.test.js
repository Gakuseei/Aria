import { describe, expect, it } from 'vitest';
import { extractVoiceFeatures, buildVoiceCard } from '../../src/lib/chat/impersonate/voiceAdapter.js';

const USER_IDENTITY = { name: 'Erik', gender: 'male', label: 'male', pronouns: 'he/him' };

describe('extractVoiceFeatures', () => {
  it('returns sensible defaults when history is empty', () => {
    const features = extractVoiceFeatures([], 'Erik', USER_IDENTITY);
    expect(features.asterisksUsage).toBe('never');
    expect(features.prose).toBe('mixed');
    expect(features.avgWords).toBe(0);
    expect(features.avgSentences).toBe(0);
    expect(features.dialogueRatio).toBe(0);
    expect(features.language).toBe('en');
    expect(features.punctuation).toBe('neutral');
    expect(Array.isArray(features.registerHints)).toBe(true);
  });

  it('returns a fresh registerHints array per call (not the frozen default)', () => {
    const a = extractVoiceFeatures([], 'Erik', USER_IDENTITY);
    const b = extractVoiceFeatures([], 'Erik', USER_IDENTITY);
    expect(a.registerHints).not.toBe(b.registerHints);
    a.registerHints.push('mutated');
    expect(b.registerHints).toEqual([]);
  });
});

describe('extractVoiceFeatures — format detection', () => {
  it('detects asterisksUsage="always" when most user msgs use *action*', () => {
    const history = [
      { role: 'user', content: '*pulls her closer* "Stay."' },
      { role: 'user', content: '*meets her gaze* I want this.' },
      { role: 'user', content: '*runs a hand through her hair*' },
      { role: 'user', content: '*tilts head* What do you mean?' }
    ];
    const features = extractVoiceFeatures(history, 'Erik', USER_IDENTITY);
    expect(features.asterisksUsage).toBe('always');
    expect(features.prose).toBe('stage_direction');
  });

  it('detects asterisksUsage="never" with pure prose', () => {
    const history = [
      { role: 'user', content: 'I lean back and watch her for a moment, then smile.' },
      { role: 'user', content: 'She still owes me an answer to last night.' },
      { role: 'user', content: 'I would not let it slide that easily.' }
    ];
    const features = extractVoiceFeatures(history, 'Erik', USER_IDENTITY);
    expect(features.asterisksUsage).toBe('never');
    expect(features.prose).not.toBe('stage_direction');
  });

  it('detects German conversation', () => {
    const history = [
      { role: 'user', content: 'Ich gehe einfach kurz raus und hole uns etwas zu trinken.' },
      { role: 'user', content: 'Du bist heute sehr ruhig, ist alles okay?' },
      { role: 'user', content: 'Komm her, ich hab das nicht so gemeint.' }
    ];
    const features = extractVoiceFeatures(history, 'Erik', USER_IDENTITY);
    expect(features.language).toBe('de');
  });

  it('detects English conversation', () => {
    const history = [
      { role: 'user', content: 'I just want to know what you really think about this.' },
      { role: 'user', content: 'Tell me the truth, you owe me that.' }
    ];
    const features = extractVoiceFeatures(history, 'Erik', USER_IDENTITY);
    expect(features.language).toBe('en');
  });
});

describe('buildVoiceCard', () => {
  const HISTORY = [
    { role: 'assistant', content: 'She watches you, waiting.' },
    { role: 'user', content: 'I close the distance and meet her gaze.' },
    { role: 'assistant', content: 'Her breath catches.' },
    { role: 'user', content: '"You sure about this?" I ask quietly.' },
    { role: 'assistant', content: 'She nods once.' },
    { role: 'user', content: 'I lean in until our foreheads touch.' }
  ];

  it('returns assistantPrefix in the form `${userName}: `', () => {
    const card = buildVoiceCard(HISTORY, 'Erik', USER_IDENTITY);
    expect(card.assistantPrefix).toBe('Erik: ');
  });

  it('returns { examples, assistantPrefix, features } and nothing else', () => {
    const card = buildVoiceCard(HISTORY, 'Erik', USER_IDENTITY);
    expect(Object.keys(card).sort()).toEqual(['assistantPrefix', 'examples', 'features']);
  });

  it('builds an XML-tagged examples block with up to 5 sanitized user turns', () => {
    const card = buildVoiceCard(HISTORY, 'Erik', USER_IDENTITY);
    expect(card.examples).toMatch(/^<user_voice_examples user="Erik" pronouns="he\/him">/);
    expect(card.examples).toMatch(/<\/user_voice_examples>$/);
    expect(card.examples).toContain('<example>I close the distance and meet her gaze.</example>');
    expect(card.examples).toContain('<example>I lean in until our foreheads touch.</example>');
    const exampleCount = (card.examples.match(/<example>/g) || []).length;
    expect(exampleCount).toBeGreaterThanOrEqual(3);
    expect(exampleCount).toBeLessThanOrEqual(5);
  });

  it('returns empty examples when no user messages', () => {
    const card = buildVoiceCard([{ role: 'assistant', content: 'Hi' }], 'Erik', USER_IDENTITY);
    expect(card.examples).toBe('');
  });

  it('strips system tags and code blocks from examples', () => {
    const dirty = [
      { role: 'user', content: '<|im_end|>I look at her.' },
      { role: 'user', content: '```code```Just say it.' },
      { role: 'user', content: 'Tell me what you want.' }
    ];
    const card = buildVoiceCard(dirty, 'Erik', USER_IDENTITY);
    expect(card.examples).not.toContain('<|im_end|>');
    expect(card.examples).not.toContain('```');
  });
});
