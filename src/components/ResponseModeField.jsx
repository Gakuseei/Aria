import { translations } from '../lib/translations';
import { useLanguage } from '../context/LanguageContext';
import { RESPONSE_MODE_ORDER, getResponseModeConfig, normalizeResponseMode } from '../lib/responseModes';

const ACCENT_STYLES = {
  amber: {
    accent: 'accent-amber-500',
    badge: 'text-amber-300 bg-amber-500/10',
    activeLabel: 'text-amber-300'
  },
  rose: {
    accent: 'accent-rose-500',
    badge: 'text-rose-300 bg-rose-500/10',
    activeLabel: 'text-rose-300'
  },
  violet: {
    accent: 'accent-violet-500',
    badge: 'text-violet-300 bg-violet-500/10',
    activeLabel: 'text-violet-300'
  }
};

function ResponseModeField({ value = 'normal', onChange, accent = 'rose', idPrefix = 'response-mode' }) {
  const { t } = useLanguage();
  const text = {
    ...translations.en.characterCreator,
    ...(t.characterCreator || {})
  };
  const styles = ACCENT_STYLES[accent] || ACCENT_STYLES.rose;
  const normalizedValue = normalizeResponseMode(value, 'normal');
  const currentIndex = RESPONSE_MODE_ORDER.indexOf(normalizedValue);
  const currentMode = getResponseModeConfig(normalizedValue);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label htmlFor={idPrefix} className="text-sm font-medium text-zinc-300">
          {text.responseModeLabel}
        </label>
        <span className={`text-sm font-medium px-2 py-0.5 rounded ${styles.badge}`}>
          {text[currentMode.labelKey]}
        </span>
      </div>
      <input
        id={idPrefix}
        type="range"
        min="0"
        max={String(RESPONSE_MODE_ORDER.length - 1)}
        step="1"
        value={currentIndex}
        onChange={(event) => onChange(RESPONSE_MODE_ORDER[Number(event.target.value)])}
        className={`w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer ${styles.accent}`}
      />
      <div className="mt-2 flex items-center justify-between text-xs">
        {RESPONSE_MODE_ORDER.map((mode) => {
          const option = getResponseModeConfig(mode);
          const isActive = mode === normalizedValue;

          return (
            <span key={mode} className={isActive ? styles.activeLabel : 'text-zinc-500'}>
              {text[option.labelKey]}
            </span>
          );
        })}
      </div>
      <p className="text-xs text-zinc-600 mt-1.5">
        {text.responseModeHint}
      </p>
    </div>
  );
}

export default ResponseModeField;
