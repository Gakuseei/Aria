import { describe, it, expect } from 'vitest';
import { computeSentenceTarget, computeNumPredict } from '../../src/lib/chat/impersonate/index.js';

describe('computeSentenceTarget', () => {
  it('returns 1 for first reply regardless of voiceFeatures', () => {
    expect(computeSentenceTarget({ avgWords: 50, exampleCount: 5 }, true)).toBe(1);
  });

  it('returns 1 when voiceFeatures missing', () => {
    expect(computeSentenceTarget(null, false)).toBe(1);
    expect(computeSentenceTarget(undefined, false)).toBe(1);
  });

  it('returns 1 when fewer than 2 examples available', () => {
    expect(computeSentenceTarget({ avgWords: 30, exampleCount: 1 }, false)).toBe(1);
    expect(computeSentenceTarget({ avgWords: 30, exampleCount: 0 }, false)).toBe(1);
  });

  it('returns 1 for short user voice (avgWords <= 8)', () => {
    expect(computeSentenceTarget({ avgWords: 8, exampleCount: 3 }, false)).toBe(1);
    expect(computeSentenceTarget({ avgWords: 5, exampleCount: 5 }, false)).toBe(1);
  });

  it('returns 2 for medium user voice (avgWords 9..25)', () => {
    expect(computeSentenceTarget({ avgWords: 9, exampleCount: 3 }, false)).toBe(2);
    expect(computeSentenceTarget({ avgWords: 25, exampleCount: 5 }, false)).toBe(2);
    expect(computeSentenceTarget({ avgWords: 17, exampleCount: 4 }, false)).toBe(2);
  });

  it('returns 3 for long user voice (avgWords > 25)', () => {
    expect(computeSentenceTarget({ avgWords: 26, exampleCount: 3 }, false)).toBe(3);
    expect(computeSentenceTarget({ avgWords: 80, exampleCount: 5 }, false)).toBe(3);
  });
});

describe('computeNumPredict', () => {
  it('clamps to floor of 60', () => {
    expect(computeNumPredict(1, 50)).toBe(60);
  });

  it('uses formula sentenceTarget * 50 + 30 between bounds', () => {
    expect(computeNumPredict(1, 200)).toBe(80);
    expect(computeNumPredict(2, 200)).toBe(130);
    expect(computeNumPredict(3, 250)).toBe(180);
  });

  it('caps at profileCap', () => {
    expect(computeNumPredict(3, 150)).toBe(150);
    expect(computeNumPredict(2, 100)).toBe(100);
  });

  it('always returns at least 60 even if profileCap is below floor', () => {
    expect(computeNumPredict(1, 30)).toBe(60);
  });
});
