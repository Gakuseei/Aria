import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

let security;
let mainSource;
let indexSource;

beforeAll(async () => {
  security = await import('../../lib/localServiceSecurity.js');
  mainSource = readFileSync(new URL('../../main.js', import.meta.url), 'utf8');
  indexSource = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
});

describe('localServiceSecurity', () => {
  describe('parseSafeHttpUrl', () => {
    it('rejects urls with embedded credentials', () => {
      expect(security.parseSafeHttpUrl('http://user:secret@127.0.0.1:11434')).toBeNull();
      expect(security.parseSafeHttpUrl('http://user@127.0.0.1:11434')).toBeNull();
    });

    it('rejects urls containing control characters', () => {
      expect(security.parseSafeHttpUrl('http://127.0.0.1:11434\u0000evil')).toBeNull();
      expect(security.parseSafeHttpUrl('http://127.0.0.1:11434\u001fevil')).toBeNull();
    });

    it('honors protocol allowlists', () => {
      expect(security.parseSafeHttpUrl('http://127.0.0.1:11434', { protocols: ['https:'] })).toBeNull();
      expect(security.parseSafeHttpUrl('https://127.0.0.1:11434', { protocols: ['https:'] })?.origin).toBe('https://127.0.0.1:11434');
    });

    it('accepts a single layer of outer quotes before parsing', () => {
      expect(security.parseSafeHttpUrl('"http://127.0.0.1:11434"')?.origin).toBe('http://127.0.0.1:11434');
    });
  });

  describe('parseLoopbackUrl', () => {
    it('accepts loopback http urls without extra path/query/hash', () => {
      const parsed = security.parseLoopbackUrl('http://127.0.0.1:11434');
      expect(parsed?.origin).toBe('http://127.0.0.1:11434');
    });

    it('accepts IPv6 loopback base urls', () => {
      const parsed = security.parseLoopbackUrl('http://[::1]:11434');
      expect(parsed?.origin).toBe('http://[::1]:11434');
    });

    it('rejects non-loopback hosts', () => {
      expect(security.parseLoopbackUrl('http://192.168.1.10:11434')).toBeNull();
      expect(security.parseLoopbackUrl('https://example.com')).toBeNull();
    });

    it('rejects paths, query strings, and hashes by default', () => {
      expect(security.parseLoopbackUrl('http://127.0.0.1:11434/api/tags')).toBeNull();
      expect(security.parseLoopbackUrl('http://127.0.0.1:11434?x=1')).toBeNull();
      expect(security.parseLoopbackUrl('http://127.0.0.1:11434#frag')).toBeNull();
    });

    it('allows paths only when explicitly enabled', () => {
      const parsed = security.parseLoopbackUrl('http://127.0.0.1:7860/file=test.wav?download=1', { allowPath: true });
      expect(parsed).toBeNull();

      const parsedPath = security.parseLoopbackUrl('http://127.0.0.1:7860/gradio_api/call/generate_audio', { allowPath: true });
      expect(parsedPath?.pathname).toBe('/gradio_api/call/generate_audio');
    });
  });

  describe('validateLocalServiceUrl', () => {
    it('accepts the default local Ollama port', () => {
      const parsed = security.validateLocalServiceUrl('ollama', 'http://127.0.0.1:11434', {});
      expect(parsed?.origin).toBe('http://127.0.0.1:11434');
    });

    it('accepts the default local Ollama port over IPv6 loopback', () => {
      const parsed = security.validateLocalServiceUrl('ollama', 'http://[::1]:11434', {});
      expect(parsed?.origin).toBe('http://[::1]:11434');
    });

    it('accepts configured loopback aliases for the same service port', () => {
      const settings = { ollamaUrl: 'http://localhost:22434' };
      const parsed = security.validateLocalServiceUrl('ollama', 'http://127.0.0.1:22434', settings);
      expect(parsed?.origin).toBe('http://127.0.0.1:22434');
    });

    it('rejects other loopback ports for the same service', () => {
      const settings = { ollamaUrl: 'http://localhost:22434' };
      expect(security.validateLocalServiceUrl('ollama', 'http://127.0.0.1:11434', settings)).toBeNull();
      expect(security.validateLocalServiceUrl('ollama', 'http://127.0.0.1:33445', settings)).toBeNull();
    });

    it('rejects urls with paths for base service validation', () => {
      const settings = { ollamaUrl: 'http://127.0.0.1:11434' };
      expect(security.validateLocalServiceUrl('ollama', 'http://127.0.0.1:11434/api/tags', settings)).toBeNull();
    });
  });

  describe('getTrustedLoopbackOriginsForService', () => {
    it('returns normalized origins for configured urls when present', () => {
      const settings = { ollamaUrl: 'http://localhost:22434' };
      expect(security.getTrustedLoopbackOriginsForService('ollama', settings)).toEqual([
        'http://localhost:22434',
      ]);
    });

    it('falls back to default origins when no configured url exists', () => {
      expect(security.getTrustedLoopbackOriginsForService('ollama', {})).toEqual([
        'http://127.0.0.1:11434',
      ]);
    });
  });

  describe('getTrustedLoopbackConnectSrcOriginsForService', () => {
    it('expands browser-valid loopback connect-src aliases for the same configured service port only', () => {
      const settings = { ollamaUrl: 'http://localhost:22434' };
      expect(security.getTrustedLoopbackConnectSrcOriginsForService('ollama', settings)).toEqual([
        'http://localhost:22434',
        'http://127.0.0.1:22434',
        'ws://localhost:22434',
        'ws://127.0.0.1:22434',
      ]);
    });

  });

  describe('getTrustedLoopbackHttpOrigins', () => {
    it('expands loopback http aliases without websocket protocols', () => {
      expect(security.getTrustedLoopbackHttpOrigins(['http://127.0.0.1:7860'])).toEqual([
        'http://localhost:7860',
        'http://127.0.0.1:7860',
        'http://[::1]:7860',
      ]);
    });

    it('preserves https while expanding aliases without websocket protocols', () => {
      expect(security.getTrustedLoopbackHttpOrigins(['https://localhost:3443'])).toEqual([
        'https://localhost:3443',
        'https://127.0.0.1:3443',
        'https://[::1]:3443',
      ]);
    });
  });

  describe('main-process regressions', () => {
    it('imports the shared loopback helpers into main.js', () => {
      expect(mainSource).toMatch(/const \{[\s\S]*?getTrustedLoopbackConnectSrcOriginsForService[\s\S]*?\} = require\('\.\/lib\/localServiceSecurity'\);/);
    });

    it('tracks the resolved dev server origin instead of trusting every loopback alias', () => {
      expect(mainSource).toContain('let activeDevServerOrigin = null;');
      expect(mainSource).toContain('activeDevServerOrigin = new URL(devServerUrl).origin;');
      expect(mainSource).toContain('return parsed.origin === activeDevServerOrigin;');
      expect(mainSource).toContain('getExactDevServerConnectSrcOrigins().forEach((origin) => {');
    });

    it('keeps renderer connect-src scoped to renderer-relevant services only', () => {
      expect(mainSource).toContain("const LOCAL_CONNECT_SRC_SERVICES = Object.freeze(['ollama']);");
    });

    it('keeps packaged file-build connect-src on explicit browser-valid default loopback ports', () => {
      [
        'http://localhost:*',
        'http://127.0.0.1:*',
        'http://[::1]:*',
        'ws://localhost:*',
        'ws://127.0.0.1:*',
        'ws://[::1]:*',
        'http://[::1]:11434',
        'ws://[::1]:11434',
      ].forEach((snippet) => {
        expect(indexSource).not.toContain(snippet);
      });
      expect(indexSource).toContain('http://127.0.0.1:11434');
    });

    it('does not leave generic loopback connect-src wildcards in main.js', () => {
      [
        'http://localhost:*',
        'http://127.0.0.1:*',
        'http://[::1]:*',
        'ws://localhost:*',
        'ws://127.0.0.1:*',
        'ws://[::1]:*',
      ].forEach((snippet) => {
        expect(mainSource).not.toContain(snippet);
      });
    });
  });
});
