import { useEffect, useState, useMemo, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';

/**
 * @typedef {Object} SamplingFieldDef
 * @property {string} key
 * @property {'slider'|'number'|'toggle'} type
 * @property {string} label
 * @property {string} helper
 * @property {number} [min]
 * @property {number} [max]
 * @property {number} [step]
 * @property {number} [decimals]
 * @property {'profile'|'flag'} scope
 * @property {string} field
 * @property {boolean} [defaultValue]
 */

/**
 * Resolve a t.settings string by key with a safe fallback.
 * @param {object} t
 * @param {string} key
 * @param {string} fallback
 * @returns {string}
 */
function tx(t, key, fallback) {
  return t?.settings?.[key] || fallback;
}

/**
 * Replace named tokens in a translation template.
 * @param {string} template
 * @param {Record<string, string|number>} vars
 * @returns {string}
 */
function fillTemplate(template, vars) {
  let out = String(template ?? '');
  for (const k of Object.keys(vars)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), String(vars[k]));
  }
  return out;
}

/**
 * Single editable field row with label + value + reset glyph + control + helper.
 * @param {object} props
 */
function FieldRow({
  label,
  helper,
  isOverridden,
  onReset,
  valueDisplay,
  control,
  showValue,
  isLast,
  resetLabel
}) {
  return (
    <div
      className="sm-field"
      style={{
        padding: '14px 0',
        borderBottom: isLast
          ? 'none'
          : '1px solid color-mix(in srgb, var(--color-border) 50%, transparent)'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12
        }}
      >
        <label
          style={{
            fontSize: 13,
            color: 'var(--color-text)',
            fontWeight: 500,
            letterSpacing: '-0.005em'
          }}
        >
          {label}
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {showValue && (
            <span
              style={{
                fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                fontSize: 13,
                fontVariantNumeric: 'tabular-nums',
                minWidth: 44,
                textAlign: 'right',
                color: isOverridden
                  ? 'var(--color-primary)'
                  : 'var(--color-text-soft)'
              }}
            >
              {valueDisplay}
            </span>
          )}
          <button
            type="button"
            onClick={onReset}
            disabled={!isOverridden}
            tabIndex={isOverridden ? 0 : -1}
            aria-label={resetLabel}
            title={resetLabel}
            className="sm-reset"
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              fontSize: 12,
              lineHeight: 1,
              cursor: isOverridden ? 'pointer' : 'default',
              color: 'var(--color-text-soft)',
              opacity: isOverridden ? 0.55 : 0,
              transition: 'opacity 120ms ease, color 120ms ease',
              width: 14,
              textAlign: 'center'
            }}
          >
            ⟲
          </button>
        </div>
      </div>
      {control && <div style={{ marginTop: 10 }}>{control}</div>}
      {helper && (
        <p
          style={{
            fontSize: 11,
            lineHeight: 1.45,
            color: 'var(--color-text-soft)',
            marginTop: 7
          }}
        >
          {helper}
        </p>
      )}
    </div>
  );
}

/**
 * Custom slider with track, fill and knob — knob clamped inside via wrapper margin.
 * @param {object} props
 */
function ModalSlider({ min, max, step, value, onChange, isOverridden }) {
  const safeValue = Number.isFinite(value) ? value : min;
  const range = max - min || 1;
  const pct = Math.max(0, Math.min(100, ((safeValue - min) / range) * 100));
  return (
    <div
      style={{
        position: 'relative',
        margin: '0 6px',
        height: 12,
        display: 'flex',
        alignItems: 'center'
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: 2,
          borderRadius: 2,
          background: 'var(--color-border)'
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            borderRadius: 2,
            background: 'var(--color-primary)',
            opacity: isOverridden ? 0.78 : 0.5,
            transition: 'opacity 120ms ease'
          }}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          left: `${pct}%`,
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: 'var(--color-text-muted)',
          pointerEvents: 'none',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.4)'
        }}
      />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={safeValue}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          cursor: 'pointer',
          margin: 0
        }}
      />
    </div>
  );
}

/**
 * Compact number input matching modal aesthetic.
 * @param {object} props
 */
function ModalNumber({ min, max, step, value, onChange }) {
  const safeValue = Number.isFinite(value) ? value : min;
  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={safeValue}
      onChange={(e) => {
        const parsed = step < 1 ? parseFloat(e.target.value) : parseInt(e.target.value, 10);
        if (Number.isFinite(parsed)) onChange(parsed);
      }}
      style={{
        width: 110,
        background: 'var(--input-bg)',
        border: '1px solid var(--input-border)',
        borderRadius: 6,
        padding: '6px 10px',
        fontSize: 13,
        fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
        color: 'var(--color-text)',
        outline: 'none'
      }}
    />
  );
}

/**
 * Toggle switch matching modal aesthetic.
 * @param {object} props
 */
function ModalToggle({ value, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      role="switch"
      aria-checked={value}
      style={{
        position: 'relative',
        width: 38,
        height: 20,
        borderRadius: 999,
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        background: value
          ? 'var(--color-primary)'
          : 'color-mix(in srgb, var(--color-border) 90%, transparent)',
        transition: 'background 140ms ease'
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: value ? 20 : 2,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 140ms ease',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.4)'
        }}
      />
    </button>
  );
}

/**
 * Per-model sampling editor modal.
 *
 * Reads resolved sampling values from `modelProfile` and writes overrides through
 * the parent's debounced `setProfileField` / `setFlagField`. The optimistic-write
 * machinery lives in Settings.jsx — this component is a pure UI shell.
 *
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {() => void} props.onClose
 * @param {object} props.settings
 * @param {object} props.baseProfile
 * @param {object} props.modelProfile
 * @param {object} props.currentCustom
 * @param {object} props.currentCustomFlags
 * @param {(field: string, value: unknown) => void} props.setProfileField
 * @param {(flag: string, value: unknown) => void} props.setFlagField
 * @param {() => void} props.clearAllProfileForModel
 * @param {(field: string) => boolean} props.isFieldOverridden
 * @param {(flag: string) => boolean} props.isFlagOverridden
 * @param {boolean} [props.isGoldMode]
 * @returns {JSX.Element|null}
 */
export default function SamplingModal({
  isOpen,
  onClose,
  settings,
  baseProfile,
  modelProfile,
  currentCustom,
  currentCustomFlags,
  setProfileField,
  setFlagField,
  clearAllProfileForModel,
  isFieldOverridden,
  isFlagOverridden,
  isGoldMode
}) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('sampling');
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);
  const resetLabel = tx(t, 'samplingResetField', 'Revert to default');

  useEffect(() => {
    if (!isOpen) return undefined;
    previousFocusRef.current = document.activeElement;
    const node = dialogRef.current;
    if (node) {
      const firstFocusable = node.querySelector(
        'button:not([disabled]):not([tabindex="-1"]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (firstFocusable) firstFocusable.focus();
    }
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'Tab' && node) {
        const focusable = Array.from(
          node.querySelectorAll(
            'button:not([disabled]):not([tabindex="-1"]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetParent !== null || el.getClientRects().length);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      const prev = previousFocusRef.current;
      if (prev && typeof prev.focus === 'function') {
        try { prev.focus(); } catch (_) { /* element may have unmounted */ }
      }
    };
  }, [isOpen, onClose]);

  const overrideCount = useMemo(() => {
    const flagsCount = Object.keys(currentCustomFlags || {}).length;
    const fieldsCount = Object.keys(currentCustom || {}).filter((k) => k !== 'flags').length;
    return flagsCount + fieldsCount;
  }, [currentCustom, currentCustomFlags]);

  const samplingTabHasOverride = useMemo(() => {
    const samplingFields = ['temperature', 'topP', 'minP', 'repeatPenalty', 'topK', 'repeatLastN', 'penalizeNewline'];
    return samplingFields.some((f) => isFieldOverridden(f));
  }, [isFieldOverridden, currentCustom]);

  const dryTabHasOverride = useMemo(() => {
    const dryFlags = ['dry', 'dryMultiplier', 'dryBase', 'dryAllowedLength', 'dryPenaltyLastN'];
    return dryFlags.some((f) => isFlagOverridden(f));
  }, [isFlagOverridden, currentCustomFlags]);

  if (!isOpen) return null;

  const modelIdentifier = settings?.ollamaModel || baseProfile?.label || 'Model';
  const overrideText =
    overrideCount === 0
      ? tx(t, 'samplingModalNoOverrides', 'No overrides')
      : overrideCount === 1
        ? tx(t, 'samplingModalOverridesActive', '{count} override active')
        : tx(t, 'samplingModalOverridesActivePlural', '{count} overrides active');

  const samplingFields = [
    {
      key: 'temperature',
      type: 'slider',
      label: tx(t, 'temperature', 'Temperature'),
      helper: tx(t, 'samplingHelperTemperature', ''),
      min: 0,
      max: 2,
      step: 0.05,
      decimals: 2,
      value: modelProfile.temperature,
      isOverridden: isFieldOverridden('temperature'),
      onChange: (v) => setProfileField('temperature', v),
      onReset: () => setProfileField('temperature', undefined)
    },
    {
      key: 'topP',
      type: 'slider',
      label: tx(t, 'topP', 'Top-P'),
      helper: tx(t, 'samplingHelperTopP', ''),
      min: 0,
      max: 1,
      step: 0.05,
      decimals: 2,
      value: modelProfile.topP,
      isOverridden: isFieldOverridden('topP'),
      onChange: (v) => setProfileField('topP', v),
      onReset: () => setProfileField('topP', undefined)
    },
    {
      key: 'minP',
      type: 'slider',
      label: tx(t, 'minP', 'Min-P'),
      helper: tx(t, 'samplingHelperMinP', ''),
      min: 0,
      max: 1,
      step: 0.05,
      decimals: 2,
      value: modelProfile.minP,
      isOverridden: isFieldOverridden('minP'),
      onChange: (v) => setProfileField('minP', v),
      onReset: () => setProfileField('minP', undefined)
    },
    {
      key: 'repeatPenalty',
      type: 'slider',
      label: tx(t, 'repeatPenalty', 'Repeat Penalty'),
      helper: tx(t, 'samplingHelperRepeatPenalty', ''),
      min: 0.5,
      max: 2,
      step: 0.01,
      decimals: 2,
      value: modelProfile.repeatPenalty,
      isOverridden: isFieldOverridden('repeatPenalty'),
      onChange: (v) => setProfileField('repeatPenalty', v),
      onReset: () => setProfileField('repeatPenalty', undefined)
    },
    {
      key: 'topK',
      type: 'number',
      label: tx(t, 'topK', 'Top-K'),
      helper: tx(t, 'samplingHelperTopK', ''),
      min: 1,
      max: 200,
      step: 1,
      value: modelProfile.topK,
      isOverridden: isFieldOverridden('topK'),
      onChange: (v) => setProfileField('topK', v),
      onReset: () => setProfileField('topK', undefined)
    },
    {
      key: 'repeatLastN',
      type: 'number',
      label: tx(t, 'repeatLastN', 'Repeat Last N'),
      helper: tx(t, 'samplingHelperRepeatLastN', ''),
      min: 0,
      max: 4096,
      step: 1,
      value: modelProfile.repeatLastN,
      isOverridden: isFieldOverridden('repeatLastN'),
      onChange: (v) => setProfileField('repeatLastN', v),
      onReset: () => setProfileField('repeatLastN', undefined)
    },
    {
      key: 'penalizeNewline',
      type: 'toggle',
      label: tx(t, 'penalizeNewline', 'Penalize Newline'),
      helper: tx(t, 'samplingHelperPenalizeNewline', ''),
      value: Boolean(modelProfile.penalizeNewline),
      isOverridden: isFieldOverridden('penalizeNewline'),
      onChange: (v) => setProfileField('penalizeNewline', v),
      onReset: () => setProfileField('penalizeNewline', undefined)
    }
  ];

  const dryEnabled = Boolean(modelProfile.flags?.dry);
  const dryFields = [
    {
      key: 'dry',
      type: 'toggle',
      label: tx(t, 'dryEnabled', "DRY (Don't Repeat Yourself)"),
      helper: tx(t, 'samplingHelperDry', ''),
      value: dryEnabled,
      isOverridden: isFlagOverridden('dry'),
      onChange: (v) => setFlagField('dry', v),
      onReset: () => setFlagField('dry', undefined)
    }
  ];
  const dryParams = [
    {
      key: 'dryMultiplier',
      type: 'slider',
      label: tx(t, 'dryMultiplier', 'DRY Multiplier'),
      helper: tx(t, 'samplingHelperDryMultiplier', ''),
      min: 0,
      max: 2,
      step: 0.05,
      decimals: 2,
      value: modelProfile.flags?.dryMultiplier ?? 0.8,
      isOverridden: isFlagOverridden('dryMultiplier'),
      onChange: (v) => setFlagField('dryMultiplier', v),
      onReset: () => setFlagField('dryMultiplier', undefined)
    },
    {
      key: 'dryBase',
      type: 'number',
      label: tx(t, 'dryBase', 'DRY Base'),
      helper: tx(t, 'samplingHelperDryBase', ''),
      min: 0.5,
      max: 5,
      step: 0.05,
      value: modelProfile.flags?.dryBase ?? 1.75,
      isOverridden: isFlagOverridden('dryBase'),
      onChange: (v) => setFlagField('dryBase', v),
      onReset: () => setFlagField('dryBase', undefined)
    },
    {
      key: 'dryAllowedLength',
      type: 'number',
      label: tx(t, 'dryAllowedLength', 'DRY Allowed Length'),
      helper: tx(t, 'samplingHelperDryAllowedLength', ''),
      min: 1,
      max: 20,
      step: 1,
      value: modelProfile.flags?.dryAllowedLength ?? 2,
      isOverridden: isFlagOverridden('dryAllowedLength'),
      onChange: (v) => setFlagField('dryAllowedLength', v),
      onReset: () => setFlagField('dryAllowedLength', undefined)
    },
    {
      key: 'dryPenaltyLastN',
      type: 'number',
      label: tx(t, 'dryPenaltyLastN', 'DRY Penalty Last N'),
      helper: tx(t, 'samplingHelperDryPenaltyLastN', ''),
      min: 0,
      max: 4096,
      step: 1,
      value: modelProfile.flags?.dryPenaltyLastN ?? 512,
      isOverridden: isFlagOverridden('dryPenaltyLastN'),
      onChange: (v) => setFlagField('dryPenaltyLastN', v),
      onReset: () => setFlagField('dryPenaltyLastN', undefined)
    }
  ];

  const renderField = (f, isLast) => {
    let control = null;
    let valueDisplay = null;
    let showValue = false;

    if (f.type === 'slider') {
      const v = Number.isFinite(f.value) ? f.value : f.min;
      valueDisplay = v.toFixed(f.decimals ?? 2);
      showValue = true;
      control = (
        <ModalSlider
          min={f.min}
          max={f.max}
          step={f.step}
          value={f.value}
          onChange={f.onChange}
          isOverridden={f.isOverridden}
        />
      );
    } else if (f.type === 'number') {
      const v = Number.isFinite(f.value) ? f.value : f.min;
      valueDisplay = String(v);
      showValue = false;
      control = (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <ModalNumber
            min={f.min}
            max={f.max}
            step={f.step}
            value={f.value}
            onChange={f.onChange}
          />
        </div>
      );
    } else if (f.type === 'toggle') {
      control = (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <ModalToggle value={f.value} onChange={f.onChange} />
        </div>
      );
    }

    return (
      <FieldRow
        key={f.key}
        label={f.label}
        helper={f.helper}
        isOverridden={f.isOverridden}
        onReset={f.onReset}
        valueDisplay={valueDisplay}
        showValue={showValue}
        control={control}
        isLast={isLast}
        resetLabel={resetLabel}
      />
    );
  };

  const isSamplingTab = activeTab === 'sampling';
  const tabFieldCount = isSamplingTab
    ? samplingFields.length
    : dryEnabled ? 1 + dryParams.length : 1;
  const tabLabel = isSamplingTab
    ? tx(t, 'samplingTabSampling', 'Sampling')
    : tx(t, 'samplingTabDry', 'DRY');

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24
      }}
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sampling-modal-title"
        style={{
          width: '100%',
          maxWidth: 500,
          maxHeight: 580,
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(180deg, #1a1c20 0%, #15171b 100%)',
          border: '1px solid rgba(214, 199, 193, 0.12)',
          borderRadius: 12,
          boxShadow: '0 24px 64px -20px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            position: 'relative',
            padding: '22px 24px 16px',
            borderBottom: '1px solid var(--color-border)'
          }}
        >
          <div
            style={{
              fontSize: 9,
              textTransform: 'uppercase',
              letterSpacing: '0.24em',
              color: 'var(--color-text-soft)',
              fontWeight: 600,
              marginBottom: 6
            }}
          >
            {tx(t, 'samplingModalEyebrow', 'PER-MODEL')}
          </div>
          <h2
            id="sampling-modal-title"
            style={{
              fontSize: 17,
              fontWeight: 600,
              color: 'var(--color-text)',
              letterSpacing: '-0.01em',
              margin: 0
            }}
          >
            {tx(t, 'samplingModalTitle', 'Sampling Settings')}
          </h2>
          <p
            style={{
              fontSize: 11.5,
              fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
              color: 'var(--color-text-soft)',
              margin: '6px 0 0 0',
              maxWidth: 'calc(100% - 36px)',
              overflowWrap: 'anywhere',
              lineHeight: 1.45
            }}
          >
            {modelIdentifier} ·{' '}
            <span style={{ color: 'var(--color-primary)' }}>
              {overrideCount === 0
                ? overrideText
                : fillTemplate(overrideText, { count: overrideCount })}
            </span>
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label={tx(t, 'close', 'Close')}
            className="sm-close"
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              background: 'transparent',
              border: 'none',
              color: 'var(--color-text-soft)',
              cursor: 'pointer',
              fontSize: 20,
              lineHeight: 1,
              padding: 4,
              borderRadius: 6,
              transition: 'background 140ms ease, color 140ms ease'
            }}
          >
            ×
          </button>
        </div>

        <div
          role="tablist"
          style={{
            display: 'flex',
            gap: 24,
            padding: '0 24px',
            borderBottom: '1px solid var(--color-border)'
          }}
        >
          {[
            { id: 'sampling', label: tx(t, 'samplingTabSampling', 'Sampling'), hasOverride: samplingTabHasOverride },
            { id: 'dry', label: tx(t, 'samplingTabDry', 'DRY'), hasOverride: dryTabHasOverride }
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`sampling-tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls="sampling-tabpanel"
                tabIndex={isActive ? 0 : -1}
                className="sm-tab"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '12px 0',
                  fontSize: 12,
                  fontWeight: 500,
                  color: isActive ? 'var(--color-text)' : 'var(--color-text-muted)',
                  borderBottom: `1.5px solid ${isActive ? 'var(--color-primary)' : 'transparent'}`,
                  marginBottom: -1,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  transition: 'color 140ms ease'
                }}
              >
                <span>{tab.label}</span>
                <span
                  aria-hidden="true"
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: 'var(--color-primary)',
                    opacity: tab.hasOverride ? 1 : 0,
                    transition: 'opacity 140ms ease'
                  }}
                />
              </button>
            );
          })}
        </div>

        <div
          className="sm-body"
          role="tabpanel"
          id="sampling-tabpanel"
          aria-labelledby={`sampling-tab-${activeTab}`}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '4px 24px 8px'
          }}
        >
          {isSamplingTab ? (
            <>
              {samplingFields.map((f, i) =>
                renderField(f, i === samplingFields.length - 1)
              )}
            </>
          ) : (
            <>
              {renderField(dryFields[0], !dryEnabled)}
              {dryEnabled && (
                <>
                  <div
                    style={{
                      fontSize: 9,
                      textTransform: 'uppercase',
                      letterSpacing: '0.22em',
                      color: 'var(--color-text-soft)',
                      fontWeight: 600,
                      padding: '8px 0 0'
                    }}
                  >
                    {tx(t, 'samplingDrySectionCap', 'PARAMETERS')}
                  </div>
                  {dryParams.map((f, i) =>
                    renderField(f, i === dryParams.length - 1)
                  )}
                </>
              )}
            </>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 24px',
            borderTop: '1px solid var(--color-border)',
            background: 'rgba(0, 0, 0, 0.18)',
            gap: 12
          }}
        >
          <span
            style={{
              fontSize: 10.5,
              fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
              color: 'var(--color-text-soft)'
            }}
          >
            {fillTemplate(
              tabFieldCount === 1
                ? tx(t, 'samplingFooterControlsOne', '{count} control — {tab}')
                : tx(t, 'samplingFooterControls', '{count} controls — {tab}'),
              { count: tabFieldCount, tab: tabLabel }
            )}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={clearAllProfileForModel}
              disabled={overrideCount === 0}
              className="sm-btn-secondary"
              style={{
                background: 'transparent',
                border: '1px solid var(--color-border)',
                color: overrideCount === 0 ? 'var(--color-text-soft)' : 'var(--color-text-muted)',
                padding: '7px 14px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 500,
                cursor: overrideCount === 0 ? 'default' : 'pointer',
                opacity: overrideCount === 0 ? 0.5 : 1,
                transition: 'color 140ms ease, border-color 140ms ease, background 140ms ease'
              }}
            >
              {tx(t, 'samplingFooterReset', 'Reset all')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="sm-btn-primary"
              style={{
                background: 'var(--color-primary)',
                border: '1px solid var(--color-primary)',
                color: '#fff',
                padding: '7px 16px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                letterSpacing: '0.01em',
                transition: 'background 140ms ease, border-color 140ms ease'
              }}
            >
              {tx(t, 'samplingFooterDone', 'Done')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
