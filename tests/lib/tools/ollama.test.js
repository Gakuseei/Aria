import { describe, it, expect, beforeAll } from 'vitest';

describe('ollama tool definition', () => {
  let ollama;

  beforeAll(async () => {
    ollama = await import('../../../lib/tools/ollama.js');
  });

  it('exports required fields', () => {
    expect(ollama.name).toBe('ollama');
    expect(ollama.displayName).toBe('Ollama');
    expect(typeof ollama.downloads).toBe('object');
    expect(typeof ollama.detect).toBe('function');
    expect(typeof ollama.install).toBe('function');
  });

  it('has download URLs for all platforms', () => {
    expect(ollama.downloads.win32).toContain('http');
    expect(ollama.downloads.linux).toContain('http');
    expect(ollama.downloads.darwin).toContain('http');
  });

  it('detect returns string or null', async () => {
    const result = await ollama.detect();
    expect(result === null || typeof result === 'string').toBe(true);
  });
});
