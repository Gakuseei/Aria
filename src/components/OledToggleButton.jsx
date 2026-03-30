import { useEffect, useMemo, useState } from 'react';
import { Disc3, Moon, Sun } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { getNextThemeMode, THEME_MODES } from '../lib/theme';

const THEME_BUTTON_STYLES = {
  [THEME_MODES.DARK]: {
    icon: Moon,
    iconClassName: 'text-zinc-300',
    surfaceClassName: 'bg-zinc-900/75 border-zinc-700/70 hover:border-rose-400/60 hover:bg-zinc-800/85',
    accentClassName: 'from-rose-500/10 via-purple-500/10 to-transparent',
    labelKey: 'darkMode',
  },
  [THEME_MODES.LIGHT]: {
    icon: Sun,
    iconClassName: 'text-amber-300',
    surfaceClassName: 'bg-white/85 border-rose-200/80 hover:border-rose-400/70 hover:bg-white',
    accentClassName: 'from-amber-300/40 via-rose-200/20 to-transparent',
    labelKey: 'lightMode',
  },
  [THEME_MODES.OLED]: {
    icon: Disc3,
    iconClassName: 'text-fuchsia-300',
    surfaceClassName: 'bg-black/90 border-zinc-800/90 hover:border-fuchsia-500/60 hover:bg-black',
    accentClassName: 'from-fuchsia-500/15 via-rose-500/10 to-transparent',
    labelKey: 'oledMode',
  },
};

export default function OledToggleButton({ themeMode, onToggle, currentView }) {
  const { t } = useLanguage();
  const [isVisible, setIsVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const activeTheme = THEME_BUTTON_STYLES[themeMode] || THEME_BUTTON_STYLES[THEME_MODES.DARK];
  const nextThemeMode = getNextThemeMode(themeMode);
  const nextThemeLabel = t.settings?.[THEME_BUTTON_STYLES[nextThemeMode].labelKey] || nextThemeMode;

  useEffect(() => {
    setIsVisible(false);
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, [currentView]);

  const buttonTitle = useMemo(() => {
    const currentThemeLabel = t.settings?.[activeTheme.labelKey] || themeMode;
    return `${currentThemeLabel} → ${nextThemeLabel}`;
  }, [activeTheme.labelKey, nextThemeLabel, t.settings, themeMode]);

  const Icon = activeTheme.icon;

  const handleClick = () => {
    setIsAnimating(true);
    onToggle('themeMode', nextThemeMode);
    setTimeout(() => setIsAnimating(false), 600);
  };

  return (
    <button
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      className={
        `fixed bottom-4 right-4 z-50 flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border shadow-lg transition-all duration-300 ease-out ${activeTheme.surfaceClassName} ${
          isVisible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-4 scale-95 opacity-0'
        } ${isPressed ? 'scale-90' : ''}`
      }
      title={buttonTitle}
      aria-label={buttonTitle}
    >
      <div className={`absolute inset-0 bg-gradient-to-br transition-opacity duration-300 ${activeTheme.accentClassName}`} />
      <div className={`relative z-10 transition-all duration-500 ease-out ${isAnimating ? 'scale-0 rotate-180' : 'scale-100 rotate-0'}`}>
        <Icon
          size={20}
          strokeWidth={1.7}
          className={`transition-all duration-300 ${activeTheme.iconClassName} ${isHovered ? 'scale-110' : ''}`}
        />
      </div>
    </button>
  );
}
