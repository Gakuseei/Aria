import { describe, it, expect } from 'vitest';
import { detectModelFamily, getModelProfile, resolveProfile, MODEL_PROFILES } from '../../src/lib/modelProfiles.js';

describe('detectModelFamily', () => {
  it('detects qwen family', () => {
    expect(detectModelFamily('qwen2.5:7b')).toBe('qwen');
    expect(detectModelFamily('Qwen/Qwen2-72B')).toBe('qwen');
  });

  it('detects mistral family (including mixtral)', () => {
    expect(detectModelFamily('mistral:7b')).toBe('mistral');
    expect(detectModelFamily('mixtral:8x7b')).toBe('mistral');
  });

  it('detects mag-mell family from HammerAI quantization name', () => {
    expect(detectModelFamily('HammerAI/mn-mag-mell-r1:12b-q4_K_M')).toBe('magmell');
    expect(detectModelFamily('mag-mell-12b')).toBe('magmell');
  });

  it('returns generic for unrelated custom-named models', () => {
    expect(detectModelFamily('HammerAI/l3.3-omega-directive-unslop-v2:70b')).toBe('generic');
  });

  it('detects llama family', () => {
    expect(detectModelFamily('llama3.2:3b')).toBe('llama');
    expect(detectModelFamily('meta-llama/Llama-3:8b')).toBe('llama');
  });

  it('detects gemma family', () => {
    expect(detectModelFamily('gemma3:1b')).toBe('gemma');
    expect(detectModelFamily('gemma:7b-instruct')).toBe('gemma');
  });

  it('detects deepseek family', () => {
    expect(detectModelFamily('deepseek-r1:7b')).toBe('deepseek');
    expect(detectModelFamily('deepseek-coder:6.7b')).toBe('deepseek');
  });

  it('detects phi family', () => {
    expect(detectModelFamily('phi3:mini')).toBe('phi');
    expect(detectModelFamily('phi:latest')).toBe('phi');
  });

  it('returns generic for unknown models', () => {
    expect(detectModelFamily('some-custom-model:latest')).toBe('generic');
    expect(detectModelFamily('my-finetune:7b')).toBe('generic');
  });

  it('is case insensitive', () => {
    expect(detectModelFamily('QWEN2:7B')).toBe('qwen');
    expect(detectModelFamily('LLAMA3:8B')).toBe('llama');
    expect(detectModelFamily('Gemma:2b')).toBe('gemma');
  });

  it('handles null/undefined/empty input', () => {
    expect(detectModelFamily(null)).toBe('generic');
    expect(detectModelFamily(undefined)).toBe('generic');
    expect(detectModelFamily('')).toBe('generic');
  });
});

describe('getModelProfile', () => {
  it('returns profile with family key included', () => {
    const profile = getModelProfile('llama3:8b');
    expect(profile.family).toBe('llama');
    expect(profile.label).toBe('Llama');
  });

  it('returns correct shape for all fields', () => {
    const profile = getModelProfile('mistral:7b');
    expect(profile).toHaveProperty('family');
    expect(profile).toHaveProperty('label');
    expect(profile).toHaveProperty('temperature');
    expect(profile).toHaveProperty('topP');
    expect(profile).toHaveProperty('topK');
    expect(profile).toHaveProperty('maxResponseTokens');
    expect(profile).toHaveProperty('minP');
    expect(profile).toHaveProperty('repeatPenalty');
    expect(profile).toHaveProperty('repeatLastN');
    expect(profile).toHaveProperty('penalizeNewline');
    expect(profile).toHaveProperty('flags');
  });

  it('returns generic profile for unknown models', () => {
    const profile = getModelProfile('unknown-model:latest');
    expect(profile.family).toBe('generic');
    expect(profile.label).toBe('Generic');
  });

  it('uses family-specific values', () => {
    const gemma = getModelProfile('gemma3:1b');
    const llama = getModelProfile('llama3:8b');
    expect(gemma.temperature).toBe(MODEL_PROFILES.gemma.temperature);
    expect(llama.topK).toBe(MODEL_PROFILES.llama.topK);
  });
});

describe('resolveProfile', () => {
  const magmellName = 'HammerAI/mn-mag-mell-r1:12b-q4_K_M';

  it('returns base profile when customProfiles is empty or missing', () => {
    const base = getModelProfile(magmellName);
    expect(resolveProfile(magmellName)).toEqual(base);
    expect(resolveProfile(magmellName, {})).toEqual(base);
    expect(resolveProfile(magmellName, null)).toEqual(base);
  });

  it('overrides scalar fields when set in customProfiles[modelName]', () => {
    const resolved = resolveProfile(magmellName, {
      [magmellName]: { temperature: 0.85, minP: 0.1 }
    });
    expect(resolved.temperature).toBe(0.85);
    expect(resolved.minP).toBe(0.1);
    expect(resolved.topP).toBe(MODEL_PROFILES.magmell.topP);
    expect(resolved.family).toBe('magmell');
  });

  it('deep-merges flags so DRY toggle off works', () => {
    const resolved = resolveProfile(magmellName, {
      [magmellName]: { flags: { dry: false } }
    });
    expect(resolved.flags.dry).toBe(false);
    expect(resolved.flags.dryMultiplier).toBe(MODEL_PROFILES.magmell.flags.dryMultiplier);
    expect(resolved.flags.dryBase).toBe(MODEL_PROFILES.magmell.flags.dryBase);
  });

  it('does not leak overrides between models', () => {
    const customs = {
      [magmellName]: { temperature: 0.5 }
    };
    const magmell = resolveProfile(magmellName, customs);
    const llama = resolveProfile('llama3:8b', customs);
    expect(magmell.temperature).toBe(0.5);
    expect(llama.temperature).toBe(MODEL_PROFILES.llama.temperature);
  });

  it('falls back to generic + override for unknown models', () => {
    const resolved = resolveProfile('some-custom:7b', {
      'some-custom:7b': { temperature: 1.0 }
    });
    expect(resolved.family).toBe('generic');
    expect(resolved.temperature).toBe(1.0);
    expect(resolved.minP).toBe(MODEL_PROFILES.generic.minP);
  });
});
