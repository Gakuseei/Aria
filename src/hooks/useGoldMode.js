import { useState, useEffect } from 'react';

/**
 * Gold mode hook — checks supporter + gold theme status.
 * Manages the `gold-mode` body class and listens for theme changes.
 * @returns {boolean} Whether gold mode is active
 */
export default function useGoldMode() {
  const [isGoldMode, setIsGoldMode] = useState(false);

  useEffect(() => {
    const checkGoldMode = () => {
      const isSupporter = localStorage.getItem('isSupporter') === 'true';
      const goldTheme = localStorage.getItem('goldThemeEnabled') === 'true';
      const isGold = isSupporter && goldTheme;
      setIsGoldMode(isGold);

      if (isGold) {
        document.body.classList.add('gold-mode');
      } else {
        document.body.classList.remove('gold-mode');
      }
    };

    checkGoldMode();
    window.addEventListener('gold-theme-changed', checkGoldMode);

    return () => {
      window.removeEventListener('gold-theme-changed', checkGoldMode);
    };
  }, []);

  return isGoldMode;
}
