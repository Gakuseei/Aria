import { describe, expect, it } from 'vitest';
import {
  applyThemeMode,
  bootstrapThemeMode,
  DEFAULT_THEME_MODE,
  getNextThemeMode,
  normalizeThemeMode,
  readStoredThemeMode,
  resolveThemeMode,
  THEME_MODES,
  withResolvedThemeSettings,
} from '../../src/lib/theme.js';

describe('theme helpers', () => {
  it('normalizes invalid theme modes to dark', () => {
    expect(normalizeThemeMode('unknown')).toBe(DEFAULT_THEME_MODE);
    expect(normalizeThemeMode(THEME_MODES.LIGHT)).toBe(THEME_MODES.LIGHT);
  });

  it('resolves legacy oled settings into canonical theme modes', () => {
    expect(resolveThemeMode({ oledMode: true })).toBe(THEME_MODES.OLED);
    expect(resolveThemeMode({ themeMode: THEME_MODES.LIGHT, oledMode: true })).toBe(THEME_MODES.LIGHT);
  });

  it('keeps themeMode and oledMode in sync', () => {
    expect(withResolvedThemeSettings({ themeMode: THEME_MODES.OLED })).toEqual({
      themeMode: THEME_MODES.OLED,
      oledMode: true,
    });

    expect(withResolvedThemeSettings({ themeMode: THEME_MODES.LIGHT }).oledMode).toBe(false);
  });

  it('cycles through dark, light, and oled modes', () => {
    expect(getNextThemeMode(THEME_MODES.DARK)).toBe(THEME_MODES.LIGHT);
    expect(getNextThemeMode(THEME_MODES.LIGHT)).toBe(THEME_MODES.OLED);
    expect(getNextThemeMode(THEME_MODES.OLED)).toBe(THEME_MODES.DARK);
  });

  it('reads stored theme mode from settings payloads', () => {
    const storage = {
      getItem: () => JSON.stringify({ themeMode: THEME_MODES.LIGHT }),
    };

    expect(readStoredThemeMode(storage)).toBe(THEME_MODES.LIGHT);
  });

  it('applies theme mode classes and legacy oled compatibility classes', () => {
    const classSet = new Set();
    const body = {
      dataset: {},
      classList: {
        add: (...tokens) => tokens.forEach((token) => classSet.add(token)),
        remove: (...tokens) => tokens.forEach((token) => classSet.delete(token)),
        toggle: (token, force) => {
          if (force) {
            classSet.add(token);
          } else {
            classSet.delete(token);
          }
        },
      },
    };

    const doc = {
      documentElement: { dataset: {} },
      body,
    };

    applyThemeMode(THEME_MODES.OLED, doc);
    expect(doc.documentElement.dataset.theme).toBe(THEME_MODES.OLED);
    expect(body.dataset.theme).toBe(THEME_MODES.OLED);
    expect(classSet.has('theme-oled')).toBe(true);
    expect(classSet.has('oled-mode')).toBe(true);

    applyThemeMode(THEME_MODES.LIGHT, doc);
    expect(classSet.has('theme-light')).toBe(true);
    expect(classSet.has('oled-mode')).toBe(false);
  });

  it('bootstraps the stored theme and applies it to the document', () => {
    const storage = {
      getItem: () => JSON.stringify({ oledMode: true }),
    };
    const classSet = new Set();
    const doc = {
      documentElement: { dataset: {} },
      body: {
        dataset: {},
        classList: {
          add: (...tokens) => tokens.forEach((token) => classSet.add(token)),
          remove: (...tokens) => tokens.forEach((token) => classSet.delete(token)),
          toggle: (token, force) => {
            if (force) {
              classSet.add(token);
            } else {
              classSet.delete(token);
            }
          },
        },
      },
    };

    expect(bootstrapThemeMode(storage, doc)).toBe(THEME_MODES.OLED);
    expect(classSet.has('theme-oled')).toBe(true);
  });
});
