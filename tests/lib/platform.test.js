import { describe, it, expect, beforeEach } from 'vitest';

function buildLookupInvocation(output) {
  const script = `process.stdout.write(${JSON.stringify(output)});`;
  return [process.execPath, ['-e', script]];
}

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

  describe('isWaylandSession', () => {
    it('detects Wayland markers only on Linux', () => {
      const env = {
        XDG_SESSION_TYPE: 'wayland',
        WAYLAND_DISPLAY: 'wayland-0',
      };
      expect(platform.isWaylandSession(env)).toBe(process.platform === 'linux');
    });

    it('detects Electron ozone Wayland hints only on Linux', () => {
      const env = {
        OZONE_PLATFORM: 'wayland',
        ELECTRON_OZONE_PLATFORM_HINT: 'wayland',
      };
      expect(platform.isWaylandSession(env)).toBe(process.platform === 'linux');
    });

    it('lets an explicit X11 ozone override win over Wayland session markers', () => {
      const env = {
        XDG_SESSION_TYPE: 'wayland',
        WAYLAND_DISPLAY: 'wayland-0',
        OZONE_PLATFORM: 'x11',
      };
      expect(platform.isWaylandSession(env)).toBe(false);
    });

    it('rejects non-Wayland markers', () => {
      const env = {
        XDG_SESSION_TYPE: 'x11',
        WAYLAND_DISPLAY: '',
        OZONE_PLATFORM: 'x11',
        ELECTRON_OZONE_PLATFORM_HINT: 'auto',
      };
      expect(platform.isWaylandSession(env)).toBe(false);
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

  describe('getFirstExecutablePath', () => {
    it('returns the first path from Windows CRLF output', () => {
      const output = 'C:\\Program Files\\Ollama\\ollama.exe\r\nC:\\Users\\test\\AppData\\Local\\Microsoft\\WindowsApps\\ollama.exe\r\n';
      expect(platform.getFirstExecutablePath(output)).toBe('C:\\Program Files\\Ollama\\ollama.exe');
    });

    it('returns the first path from POSIX LF output', () => {
      const output = '/usr/local/bin/ollama\n/usr/bin/ollama\n';
      expect(platform.getFirstExecutablePath(output)).toBe('/usr/local/bin/ollama');
    });

    it('returns null for blank or whitespace-only output', () => {
      expect(platform.getFirstExecutablePath('  \r\n\t  ')).toBeNull();
    });
  });

  describe('getExecutablePathFromCommand', () => {
    it('returns the first path from CRLF command output', async () => {
      const output = 'C:\\Program Files\\Ollama\\ollama.exe\r\nC:\\Users\\test\\AppData\\Local\\Microsoft\\WindowsApps\\ollama.exe\r\n';
      const [command, args] = buildLookupInvocation(output);
      await expect(platform.getExecutablePathFromCommand(command, args))
        .resolves.toBe('C:\\Program Files\\Ollama\\ollama.exe');
    });

    it('returns the first path from LF command output', async () => {
      const output = '/usr/local/bin/ollama\n/usr/bin/ollama\n';
      const [command, args] = buildLookupInvocation(output);
      await expect(platform.getExecutablePathFromCommand(command, args))
        .resolves.toBe('/usr/local/bin/ollama');
    });

    it('returns null for blank command output', async () => {
      const output = '  \r\n\t  ';
      const [command, args] = buildLookupInvocation(output);
      await expect(platform.getExecutablePathFromCommand(command, args)).resolves.toBeNull();
    });
  });

  describe('isPortInUse', () => {
    it('returns false for random high port', async () => {
      const result = await platform.isPortInUse(59999);
      expect(result).toBe(false);
    });
  });
});
