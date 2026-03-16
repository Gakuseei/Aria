import { describe, it, expect, beforeAll } from 'vitest';

describe('piper tool definition', () => {
  let piper;

  beforeAll(async () => {
    piper = await import('../../../lib/tools/piper.js');
  });

  it('exports required fields', () => {
    expect(piper.name).toBe('piper');
    expect(piper.displayName).toBe('Piper TTS');
    expect(typeof piper.downloads).toBe('object');
    expect(typeof piper.detect).toBe('function');
    expect(typeof piper.install).toBe('function');
  });

  it('has download URLs for win32 and linux', () => {
    expect(piper.downloads.win32).toContain('http');
    expect(piper.downloads.linux).toContain('http');
  });

  it('has no macOS download', () => {
    expect(piper.downloads.darwin).toBeNull();
  });

  it('detect returns string or null', async () => {
    const result = await piper.detect();
    expect(result === null || typeof result === 'string').toBe(true);
  });
});
