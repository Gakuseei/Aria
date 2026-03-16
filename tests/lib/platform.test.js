import { describe, it, expect, beforeEach } from 'vitest';

describe('platform', () => {
  let platform;

  beforeEach(async () => {
    platform = await import('../../lib/platform.js');
  });

  describe('isWindows / isLinux / isMac', () => {
    it('exactly one returns true', () => {
      const results = [platform.isWindows(), platform.isLinux(), platform.isMac()];
      expect(results.filter(Boolean).length).toBe(1);
    });
  });

  describe('getPythonCommand', () => {
    it('returns python or python3', () => {
      const cmd = platform.getPythonCommand();
      expect(['python', 'python3']).toContain(cmd);
    });
  });

  describe('getVenvBinDir', () => {
    it('returns Scripts on Windows, bin otherwise', () => {
      const dir = platform.getVenvBinDir();
      if (process.platform === 'win32') {
        expect(dir).toBe('Scripts');
      } else {
        expect(dir).toBe('bin');
      }
    });
  });

  describe('getBinaryName', () => {
    it('appends .exe on Windows only', () => {
      const name = platform.getBinaryName('piper');
      if (process.platform === 'win32') {
        expect(name).toBe('piper.exe');
      } else {
        expect(name).toBe('piper');
      }
    });
  });

  describe('isPortInUse', () => {
    it('returns false for random high port', async () => {
      const result = await platform.isPortInUse(59999);
      expect(result).toBe(false);
    });
  });
});
