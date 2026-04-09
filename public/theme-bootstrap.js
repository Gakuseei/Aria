(() => {
  try {
    const rawSettings = window.localStorage.getItem('settings');
    const parsedSettings = rawSettings ? JSON.parse(rawSettings) : {};
    const themeMode = parsedSettings.themeMode || (parsedSettings.oledMode ? 'oled' : 'dark');
    document.documentElement.dataset.theme = themeMode;

    const applyBodyTheme = () => {
      document.body?.classList?.add(`theme-${themeMode}`);
      if (themeMode === 'oled') {
        document.body?.classList?.add('oled-mode');
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', applyBodyTheme, { once: true });
    } else {
      applyBodyTheme();
    }
  } catch {
    document.documentElement.dataset.theme = 'dark';
  }
})();
