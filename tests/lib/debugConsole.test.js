import { describe, expect, it } from 'vitest';
import {
  appendCapturedError,
  buildErrorExportPayload,
  collectStorageSnapshot,
  createCapturedError,
  DEBUG_CONSOLE_ERROR_LIMIT,
  extractSourceFromStack,
  formatConsoleArgs,
  safeSerialize,
  summarizeDebugHealth,
} from '../../src/lib/debugConsole.js';

describe('debugConsole helpers', () => {
  it('serializes circular values safely', () => {
    const payload = { label: 'root' };
    payload.self = payload;

    expect(safeSerialize(payload)).toContain('[Circular]');
  });

  it('formats console args without throwing on mixed values', () => {
    const error = new Error('boom');
    const result = formatConsoleArgs(['plain', { ok: true }, error, undefined]);

    expect(result).toContain('plain');
    expect(result).toContain('"ok": true');
    expect(result).toContain('boom');
    expect(result).toContain('undefined');
  });

  it('extracts a readable source from stack traces', () => {
    const stack = 'Error: boom\n    at example (http://localhost/src/App.jsx:42:7)';
    expect(extractSourceFromStack(stack)).toBe('App.jsx:42');
  });

  it('deduplicates repeated errors inside the dedupe window', () => {
    const first = createCapturedError({
      id: 1,
      severity: 'error',
      message: 'Network failed',
      source: 'api.js:91',
      timestamp: 1000,
    });

    const second = createCapturedError({
      id: 2,
      severity: 'error',
      message: 'Network failed',
      source: 'api.js:91',
      timestamp: 1800,
    });

    const combined = appendCapturedError([], first);
    const deduped = appendCapturedError(combined, second);

    expect(deduped).toHaveLength(1);
    expect(deduped[0].occurrences).toBe(2);
    expect(deduped[0].timestamp).toBe(1800);
  });

  it('keeps new errors and respects the hard error limit', () => {
    const errors = Array.from({ length: DEBUG_CONSOLE_ERROR_LIMIT }, (_, index) => createCapturedError({
      id: index,
      message: `Error ${index}`,
      source: `source-${index}`,
      timestamp: index,
    }));

    const appended = appendCapturedError(errors, createCapturedError({
      id: 999,
      message: 'Newest error',
      source: 'latest',
      timestamp: 9999,
    }));

    expect(appended).toHaveLength(DEBUG_CONSOLE_ERROR_LIMIT);
    expect(appended[0].message).toBe('Newest error');
    expect(appended.at(-1).message).toBe('Error 73');
  });

  it('collects a redacted, sorted storage snapshot', () => {
    const storage = {
      values: new Map([
        ['zeta', 'last'],
        ['settings', JSON.stringify({ shouldHide: true })],
        ['alpha', JSON.stringify({ enabled: true })],
      ]),
      get length() {
        return this.values.size;
      },
      key(index) {
        return Array.from(this.values.keys())[index] ?? null;
      },
      getItem(key) {
        return this.values.get(key) ?? null;
      },
    };

    const snapshot = collectStorageSnapshot(storage);

    expect(snapshot.map((entry) => entry.key)).toEqual(['alpha', 'zeta']);
    expect(snapshot[0].preview).toContain('"enabled": true');
  });

  it('summarizes health from errors and API timing', () => {
    const summary = summarizeDebugHealth({
      errors: [
        createCapturedError({ id: 1, severity: 'warning', message: 'warn', timestamp: 10 }),
        createCapturedError({ id: 2, severity: 'error', message: 'bad', timestamp: 20 }),
      ],
      eventLog: [{ type: 'api' }, { type: 'settings' }],
      lastApiResponseTime: 2200,
      lastApiWps: 18,
    });

    expect(summary.overallStatus).toBe('attention');
    expect(summary.recentWarnings).toBe(1);
    expect(summary.recentErrors).toBe(1);
    expect(summary.apiStatus).toBe('degraded');
  });

  it('builds structured export payloads without view-layer ids', () => {
    const payload = buildErrorExportPayload({
      appVersion: '0.2.5',
      currentView: 'settings',
      platform: 'Linux',
      healthSummary: { overallStatus: 'warning' },
      errors: [createCapturedError({ id: 12, message: 'boom', source: 'App.jsx:11', timestamp: 100 })],
      eventLog: [{ type: 'api', message: 'ok' }],
      settings: { preferredLanguage: 'en' },
    });

    expect(payload.appVersion).toBe('0.2.5');
    expect(payload.errors[0].id).toBeUndefined();
    expect(payload.currentView).toBe('settings');
    expect(payload.eventLog).toHaveLength(1);
  });
});
