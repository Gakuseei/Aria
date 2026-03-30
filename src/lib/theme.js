export const THEME_MODES = {
  DARK: 'dark',
  LIGHT: 'light',
  OLED: 'oled',
};

export const THEME_MODE_SEQUENCE = [
  THEME_MODES.DARK,
  THEME_MODES.LIGHT,
  THEME_MODES.OLED,
];

export const DEFAULT_THEME_MODE = THEME_MODES.DARK;

export function normalizeThemeMode(value) {
  if (value === THEME_MODES.LIGHT || value === THEME_MODES.OLED || value === THEME_MODES.DARK) {
    return value;
  }

  return DEFAULT_THEME_MODE;
}

export function resolveThemeMode(settings = {}) {
  if (settings.themeMode) {
    return normalizeThemeMode(settings.themeMode);
  }

  if (settings.oledMode === true) {
    return THEME_MODES.OLED;
  }

  return DEFAULT_THEME_MODE;
}

export function withResolvedThemeSettings(settings = {}) {
  const themeMode = resolveThemeMode(settings);
  return {
    ...settings,
    themeMode,
    oledMode: themeMode === THEME_MODES.OLED,
  };
}

export function getNextThemeMode(currentThemeMode) {
  const normalized = normalizeThemeMode(currentThemeMode);
  const currentIndex = THEME_MODE_SEQUENCE.indexOf(normalized);
  const nextIndex = (currentIndex + 1) % THEME_MODE_SEQUENCE.length;
  return THEME_MODE_SEQUENCE[nextIndex];
}

export function applyThemeMode(themeMode, targetDocument = document) {
  if (!targetDocument?.documentElement || !targetDocument?.body) {
    return normalizeThemeMode(themeMode);
  }

  const resolvedThemeMode = normalizeThemeMode(themeMode);
  const root = targetDocument.documentElement;
  const { body } = targetDocument;

  root.dataset.theme = resolvedThemeMode;
  body.dataset.theme = resolvedThemeMode;

  body.classList.remove('theme-dark', 'theme-light', 'theme-oled');
  body.classList.add(`theme-${resolvedThemeMode}`);
  body.classList.toggle('oled-mode', resolvedThemeMode === THEME_MODES.OLED);

  return resolvedThemeMode;
}

export function readStoredThemeMode(storage = globalThis?.localStorage) {
  if (!storage?.getItem) {
    return DEFAULT_THEME_MODE;
  }

  try {
    const rawSettings = storage.getItem('settings');
    if (!rawSettings) {
      return DEFAULT_THEME_MODE;
    }

    return resolveThemeMode(JSON.parse(rawSettings));
  } catch {
    return DEFAULT_THEME_MODE;
  }
}

export function bootstrapThemeMode(storage = globalThis?.localStorage, targetDocument = globalThis?.document) {
  const themeMode = readStoredThemeMode(storage);
  if (targetDocument) {
    applyThemeMode(themeMode, targetDocument);
  }
  return themeMode;
}
