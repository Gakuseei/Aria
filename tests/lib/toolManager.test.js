import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('toolManager', () => {
  let toolManager;

  beforeEach(async () => {
    // Clear module cache for fresh state
    vi.resetModules();
    toolManager = await import('../../lib/toolManager.js');
  });

  describe('registerTool', () => {
    it('registers a tool definition', () => {
      const tool = { name: 'test-tool', displayName: 'Test', detect: () => null, install: async () => {} };
      toolManager.registerTool(tool);
      expect(toolManager.getTool('test-tool')).toBeTruthy();
    });
  });

  describe('getTool', () => {
    it('returns null for unknown tool', () => {
      expect(toolManager.getTool('nonexistent')).toBeNull();
    });
  });

  describe('getAllTools', () => {
    it('returns array of registered tools', () => {
      const tools = toolManager.getAllTools();
      expect(Array.isArray(tools)).toBe(true);
    });
  });

  describe('downloadFile', () => {
    it('is a function', () => {
      expect(typeof toolManager.downloadFile).toBe('function');
    });
  });
});
