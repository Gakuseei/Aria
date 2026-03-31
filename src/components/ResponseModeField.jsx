import { translations } from '../lib/translations';
import { useLanguage } from '../context/LanguageContext';
import { RESPONSE_MODE_ORDER, getResponseModeConfig, normalizeResponseMode } from '../lib/responseModes';

const ACCENT_STYLES = {
  amber: {
    sliderClassName: 'theme-slider',
    badgeClassName: 'theme-accent-badge',
    activeLabelClassName: 'text-[color:var(--theme-accent-strong)]'
  },
  rose: {
    sliderClassName: 'theme-slider',
    badgeClassName: 'theme-accent-badge',
    activeLabelClassName: 'text-[color:var(--theme-accent-strong)]'
  },
  violet: {
    sliderClassName: 'theme-slider-info',
    badgeClassName: 'theme-info-badge',
    activeLabelClassName: 'text-[color:var(--color-info)]'
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
      <div className="mb-2 flex items-center justify-between">
        <label htmlFor={idPrefix} className="theme-label text-sm font-medium">
          {text.responseModeLabel}
        </label>
        <span className={`${styles.badgeClassName} rounded px-2 py-0.5 text-sm font-medium`}>
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
        className={`theme-slider w-full cursor-pointer appearance-none rounded-lg bg-[color:var(--color-surface-muted)] ${styles.sliderClassName}`}
      />
      <div className="mt-2 flex items-center justify-between text-xs">
        {RESPONSE_MODE_ORDER.map((mode) => {
          const option = getResponseModeConfig(mode);
          const isActive = mode === normalizedValue;

          return (
            <span key={mode} className={isActive ? styles.activeLabelClassName : 'theme-text-soft'}>
              {text[option.labelKey]}
            </span>
          );
        })}
      </div>
      <p className="theme-text-soft mt-1.5 text-xs">
        {text.responseModeHint}
      </p>
    </div>
  );
}

export default ResponseModeField;
