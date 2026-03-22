import { describe, it, expect } from 'vitest';
import { getTierKey, getDepthInstruction, getSpeedMultiplier, PASSION_TIERS } from '../../src/lib/PassionManager.js';

describe('getTierKey', () => {
  it('returns surface for 0-15', () => {
    expect(getTierKey(0)).toBe('surface');
    expect(getTierKey(15)).toBe('surface');
  });

  it('returns aware for 16-35', () => {
    expect(getTierKey(16)).toBe('aware');
    expect(getTierKey(35)).toBe('aware');
  });

  it('returns vivid for 36-55', () => {
    expect(getTierKey(36)).toBe('vivid');
    expect(getTierKey(55)).toBe('vivid');
  });

  it('returns immersive for 56-75', () => {
    expect(getTierKey(56)).toBe('immersive');
    expect(getTierKey(75)).toBe('immersive');
  });

  it('returns consuming for 76-90', () => {
    expect(getTierKey(76)).toBe('consuming');
    expect(getTierKey(90)).toBe('consuming');
  });

  it('returns transcendent for 91-100', () => {
    expect(getTierKey(91)).toBe('transcendent');
    expect(getTierKey(100)).toBe('transcendent');
  });

  it('handles boundary values correctly', () => {
    expect(getTierKey(15)).toBe('surface');
    expect(getTierKey(16)).toBe('aware');
    expect(getTierKey(35)).toBe('aware');
    expect(getTierKey(36)).toBe('vivid');
    expect(getTierKey(55)).toBe('vivid');
    expect(getTierKey(56)).toBe('immersive');
    expect(getTierKey(75)).toBe('immersive');
    expect(getTierKey(76)).toBe('consuming');
    expect(getTierKey(90)).toBe('consuming');
    expect(getTierKey(91)).toBe('transcendent');
  });
});

describe('getDepthInstruction', () => {
  it('returns empty string for surface tier (0-15)', () => {
    expect(getDepthInstruction(0)).toBe('');
    expect(getDepthInstruction(15)).toBe('');
  });

  it('returns non-empty string for aware tier', () => {
    const result = getDepthInstruction(25);
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('Aware');
  });

  it('returns non-empty string for vivid tier', () => {
    const result = getDepthInstruction(45);
    expect(result).toContain('Vivid');
  });

  it('returns non-empty string for immersive tier', () => {
    const result = getDepthInstruction(65);
    expect(result).toContain('Immersive');
  });

  it('returns non-empty string for consuming tier', () => {
    const result = getDepthInstruction(85);
    expect(result).toContain('Consuming');
  });

  it('returns non-empty string for transcendent tier', () => {
    const result = getDepthInstruction(95);
    expect(result).toContain('Transcendent');
  });

  it('instructions increase in intensity across tiers', () => {
    const aware = getDepthInstruction(25);
    const vivid = getDepthInstruction(45);
    const immersive = getDepthInstruction(65);
    const consuming = getDepthInstruction(85);
    const transcendent = getDepthInstruction(95);
    expect(vivid.length).toBeGreaterThan(aware.length);
    expect(consuming).toContain('intensity');
    expect(consuming).toContain('sensory detail');
    expect(transcendent.length).toBeGreaterThan(0);
    expect(immersive.length).toBeGreaterThan(0);
  });

  it('keeps short mode vivid without forcing multi-paragraph replies', () => {
    const vivid = getDepthInstruction(45, 'short');
    const immersive = getDepthInstruction(65, 'short');
    const transcendent = getDepthInstruction(95, 'short');

    expect(vivid).not.toContain('2-3 paragraphs minimum');
    expect(immersive).not.toContain('Rich multi-paragraph responses');
    expect(transcendent).not.toContain('Deep, layered responses');
    expect(vivid).toContain('stay compact');
  });

  it('keeps normal mode detailed without forcing longform minimums', () => {
    expect(getDepthInstruction(45, 'normal')).not.toContain('2-3 paragraphs minimum');
    expect(getDepthInstruction(65, 'normal')).not.toContain('Rich multi-paragraph responses');
  });

  it('preserves longform instructions when long mode is requested', () => {
    expect(getDepthInstruction(45, 'long')).toContain('2-3 paragraphs minimum');
    expect(getDepthInstruction(65, 'long')).toContain('Rich multi-paragraph responses');
  });
});

describe('getSpeedMultiplier', () => {
  it('returns 0.5 for slow', () => {
    expect(getSpeedMultiplier('slow')).toBe(0.5);
  });

  it('returns 1.0 for normal', () => {
    expect(getSpeedMultiplier('normal')).toBe(1.0);
  });

  it('returns 1.5 for fast', () => {
    expect(getSpeedMultiplier('fast')).toBe(1.5);
  });

  it('returns 1.8 for extreme', () => {
    expect(getSpeedMultiplier('extreme')).toBe(1.8);
  });

  it('returns 1.0 for undefined/null (default)', () => {
    expect(getSpeedMultiplier(undefined)).toBe(1.0);
    expect(getSpeedMultiplier(null)).toBe(1.0);
    expect(getSpeedMultiplier('unknown')).toBe(1.0);
  });
});

describe('PASSION_TIERS', () => {
  it('has 6 tiers', () => {
    expect(Object.keys(PASSION_TIERS)).toHaveLength(6);
  });

  it('covers full 0-100 range without gaps', () => {
    const tiers = Object.values(PASSION_TIERS).sort((a, b) => a.min - b.min);
    expect(tiers[0].min).toBe(0);
    expect(tiers[tiers.length - 1].max).toBe(100);
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i].min).toBe(tiers[i - 1].max + 1);
    }
  });
});
