import { describe, it, expect, beforeAll } from 'vitest';

describe('zonos tool definition', () => {
  let zonos;

  beforeAll(async () => {
    zonos = await import('../../../lib/tools/zonos.js');
  });

  it('exports required fields', () => {
    expect(zonos.name).toBe('zonos');
    expect(zonos.displayName).toBe('Zonos TTS');
    expect(typeof zonos.downloads).toBe('object');
    expect(typeof zonos.detect).toBe('function');
    expect(typeof zonos.install).toBe('function');
  });

  it('has no direct downloads (requires git clone)', () => {
    expect(zonos.downloads.win32).toBeNull();
    expect(zonos.downloads.linux).toBeNull();
    expect(zonos.downloads.darwin).toBeNull();
  });

  it('exports server management functions', () => {
    expect(typeof zonos.startServer).toBe('function');
    expect(typeof zonos.stopServer).toBe('function');
    expect(typeof zonos.SERVER_PORT).toBe('number');
  });

  it('detect returns null (no PATH binary)', async () => {
    const result = await zonos.detect();
    expect(result).toBeNull();
  });
});
