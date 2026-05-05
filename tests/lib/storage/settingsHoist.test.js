import { describe, it, expect } from 'vitest';
import { hoistLegacySamplingToCustomProfiles } from '../../../src/lib/storage/settings.js';

describe('hoistLegacySamplingToCustomProfiles', () => {
  const magmellName = 'HammerAI/mn-mag-mell-r1:12b-q4_K_M';

  it('moves legacy top-level sampling fields into customProfiles[ollamaModel]', () => {
    const input = {
      ollamaModel: magmellName,
      temperature: 0.85,
      minP: 0.15,
      topK: null,
      topP: null,
      repeatPenalty: null,
      repeatLastN: null,
      penalizeNewline: null,
      contextSize: 4096
    };
    const result = hoistLegacySamplingToCustomProfiles(input);
    expect(result.temperature).toBeUndefined();
    expect(result.minP).toBeUndefined();
    expect(result.customProfiles[magmellName]).toEqual({ temperature: 0.85, minP: 0.15 });
  });

  it('strips top-level sampling keys even when no values are set', () => {
    const input = {
      ollamaModel: magmellName,
      temperature: null,
      minP: null,
      contextSize: 4096
    };
    const result = hoistLegacySamplingToCustomProfiles(input);
    expect(result).not.toHaveProperty('temperature');
    expect(result).not.toHaveProperty('minP');
    expect(result.customProfiles).toEqual({});
  });

  it('is idempotent — running twice produces the same shape', () => {
    const input = {
      ollamaModel: magmellName,
      temperature: 0.85,
      contextSize: 4096
    };
    const first = hoistLegacySamplingToCustomProfiles({ ...input });
    const second = hoistLegacySamplingToCustomProfiles({ ...first });
    expect(second.customProfiles[magmellName]).toEqual({ temperature: 0.85 });
    expect(second).not.toHaveProperty('temperature');
  });

  it('preserves existing customProfiles entries (existing wins on conflict)', () => {
    const input = {
      ollamaModel: magmellName,
      temperature: 0.85,
      customProfiles: { [magmellName]: { temperature: 1.0, minP: 0.3 } }
    };
    const result = hoistLegacySamplingToCustomProfiles(input);
    expect(result.customProfiles[magmellName]).toEqual({ temperature: 1.0, minP: 0.3 });
  });

  it('does not hoist when ollamaModel is missing', () => {
    const input = {
      temperature: 0.85,
      minP: 0.15
    };
    const result = hoistLegacySamplingToCustomProfiles(input);
    expect(result.customProfiles).toEqual({});
    expect(result).not.toHaveProperty('temperature');
  });

  it('initializes customProfiles to empty object when missing and nothing to hoist', () => {
    const input = { ollamaModel: magmellName, contextSize: 4096 };
    const result = hoistLegacySamplingToCustomProfiles(input);
    expect(result.customProfiles).toEqual({});
  });

  it('returns input unchanged when not an object', () => {
    expect(hoistLegacySamplingToCustomProfiles(null)).toBe(null);
    expect(hoistLegacySamplingToCustomProfiles(undefined)).toBe(undefined);
  });
});
