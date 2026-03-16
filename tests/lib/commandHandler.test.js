import { describe, it, expect } from 'vitest';
import { isCommand, executeCommand } from '../../src/lib/commandHandler.js';

describe('isCommand', () => {
  it('detects slash commands', () => {
    expect(isCommand('/help')).toBe(true);
    expect(isCommand('/summary')).toBe(true);
    expect(isCommand('/unknown')).toBe(true);
  });

  it('detects commands with leading whitespace', () => {
    expect(isCommand('  /help')).toBe(true);
  });

  it('rejects normal text', () => {
    expect(isCommand('hello')).toBe(false);
    expect(isCommand('how are you?')).toBe(false);
    expect(isCommand('')).toBe(false);
  });
});

describe('executeCommand', () => {
  const baseCtx = {
    messages: [],
    t: { commands: {} },
    settings: { ollamaModel: 'test-model:7b' },
    character: { name: 'TestChar' },
    passionLevel: 42,
    sessionId: 'test-session'
  };

  describe('/help', () => {
    it('returns handled with help text', () => {
      const result = executeCommand('/help', baseCtx);
      expect(result.handled).toBe(true);
      expect(result.message.role).toBe('system');
      expect(result.message.content).toContain('/help');
      expect(result.message.content).toContain('/summary');
    });

    it('uses translation strings when available', () => {
      const ctx = {
        ...baseCtx,
        t: { commands: { helpTitle: 'Custom Help', helpDesc: 'Get help', summaryDesc: 'Get summary' } }
      };
      const result = executeCommand('/help', ctx);
      expect(result.message.content).toContain('Custom Help');
    });
  });

  describe('/summary', () => {
    it('returns handled with summary stats', () => {
      const now = Date.now();
      const ctx = {
        ...baseCtx,
        messages: [
          { role: 'user', content: 'hi', timestamp: now },
          { role: 'assistant', content: 'hello', timestamp: now, stats: { tokens: 10, promptTokens: 20, responseTime: 1000 } }
        ]
      };
      const result = executeCommand('/summary', ctx);
      expect(result.handled).toBe(true);
      expect(result.message.content).toContain('TestChar');
      expect(result.message.content).toContain('test-model:7b');
    });

    it('handles empty message list', () => {
      const result = executeCommand('/summary', baseCtx);
      expect(result.handled).toBe(true);
      expect(result.message.role).toBe('system');
    });
  });

  describe('unknown commands', () => {
    it('returns handled with error message', () => {
      const result = executeCommand('/foo', baseCtx);
      expect(result.handled).toBe(true);
      expect(result.message.content).toContain('/foo');
    });
  });

  it('is case insensitive for command names', () => {
    const result = executeCommand('/HELP', baseCtx);
    expect(result.handled).toBe(true);
    expect(result.message.content).toContain('/help');
  });
});
