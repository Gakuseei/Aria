import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { testOllamaConnection } from '../../src/lib/ollama/index.js';

describe('testOllamaConnection error mapping', () => {
  let originalFetch;
  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns errorCode "timeout" on AbortError', async () => {
    global.fetch = vi.fn(() => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      return Promise.reject(err);
    });
    const res = await testOllamaConnection('http://127.0.0.1:11434');
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('timeout');
  });

  it('returns errorCode "refused" on ECONNREFUSED-like message', async () => {
    global.fetch = vi.fn(() => Promise.reject(new TypeError('fetch failed')));
    const res = await testOllamaConnection('http://127.0.0.1:11434');
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('refused');
  });

  it('returns errorCode "dns" on ENOTFOUND-like message', async () => {
    global.fetch = vi.fn(() => Promise.reject(new TypeError('getaddrinfo ENOTFOUND fakehost')));
    const res = await testOllamaConnection('http://fakehost:11434');
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('dns');
  });

  it('returns errorCode "http" with status on 4xx/5xx', async () => {
    global.fetch = vi.fn(() => Promise.resolve({
      ok: false,
      status: 503,
      json: () => Promise.resolve({}),
    }));
    const res = await testOllamaConnection('http://127.0.0.1:11434');
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('http');
    expect(res.status).toBe(503);
  });

  it('returns success with model count on 200', async () => {
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ models: [{ name: 'mag-mell' }] }),
    }));
    const res = await testOllamaConnection('http://127.0.0.1:11434');
    expect(res.success).toBe(true);
    expect(res.errorCode).toBeUndefined();
  });
});
