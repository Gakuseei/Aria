import { describe, it, expect, beforeAll } from 'vitest';

describe('stability tool definition', () => {
  let stability;

  beforeAll(async () => {
    stability = await import('../../../lib/tools/stability.js');
  });

  it('exports required fields', () => {
    expect(stability.name).toBe('stability');
    expect(stability.displayName).toBe('Stability Matrix');
    expect(typeof stability.downloads).toBe('object');
    expect(typeof stability.detect).toBe('function');
    expect(typeof stability.install).toBe('function');
  });

  it('has download URLs for all platforms', () => {
    expect(stability.downloads.win32).toContain('http');
    expect(stability.downloads.linux).toContain('http');
    expect(stability.downloads.darwin).toContain('http');
  });

  it('detect returns string or null', async () => {
    const result = await stability.detect();
    expect(result === null || typeof result === 'string').toBe(true);
  });
});
