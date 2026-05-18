import { useEffect, useRef, useState } from 'react';
import ollamaLogo from '../lib/assets/ollama-logo.png';

/**
 * Non-closable modal shown when Ollama is unreachable at startup
 * or when Ollama is reachable but no model is installed.
 *
 * @param {object} props
 * @param {'unreachable' | 'no-model'} props.state
 * @param {string} [props.errorCode] - 'timeout' | 'refused' | 'dns' | 'http' | 'unknown'
 * @param {number} [props.errorStatus]
 * @param {() => Promise<void>} props.onRetry
 * @param {() => void} props.onOpenSettings
 * @param {() => void} props.onDownloadOllama
 * @param {object} props.t - Active translations object.
 */
export default function OllamaNotRunningModal({
  state,
  errorCode,
  errorStatus,
  onRetry,
  onOpenSettings,
  onDownloadOllama,
  t,
}) {
  const [isChecking, setIsChecking] = useState(false);
  const primaryRef = useRef(null);

  useEffect(() => {
    primaryRef.current?.focus();
  }, []);

  const handleRetry = async () => {
    if (isChecking) return;
    setIsChecking(true);
    try {
      await onRetry();
    } finally {
      setIsChecking(false);
    }
  };

  const title = state === 'no-model'
    ? t.ollamaModal.titleNoModel
    : t.ollamaModal.titleUnreachable;

  const subText = pickSubText(state, errorCode, errorStatus, t);

  const showDownloadCta = state === 'unreachable'
    && (errorCode === 'refused' || errorCode === null || errorCode === undefined || errorCode === 'unknown');

  return (
    <div className="ollama-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="ollama-modal-title">
      <div className="ollama-modal-card">
        <div className="ollama-modal-logo">
          {/* "Ollama" is a brand mark, intentionally untranslated. */}
          <img src={ollamaLogo} alt="Ollama" />
        </div>
        <h2 id="ollama-modal-title" className="ollama-modal-title">{title}</h2>
        <p className="ollama-modal-sub">{subText}</p>
        {showDownloadCta && (
          <button
            type="button"
            className="ollama-modal-secondary"
            onClick={onDownloadOllama}
          >
            {t.ollamaModal.downloadOllama}
          </button>
        )}
        <button
          ref={primaryRef}
          type="button"
          className="ollama-modal-primary"
          onClick={handleRetry}
          disabled={isChecking}
          aria-busy={isChecking}
          aria-label={t.ollamaModal.retry}
        >
          {isChecking ? <span className="ollama-modal-spinner" aria-hidden="true" /> : t.ollamaModal.retry}
        </button>
        <button
          type="button"
          className="ollama-modal-link"
          onClick={onOpenSettings}
        >
          {t.ollamaModal.settings}
        </button>
      </div>
    </div>
  );
}

function pickSubText(state, errorCode, errorStatus, t) {
  if (state === 'no-model') return t.ollamaModal.subNoModel;
  switch (errorCode) {
    case 'timeout': return t.ollamaModal.subTimeout;
    case 'refused': return t.ollamaModal.subRefused;
    case 'dns': return t.ollamaModal.subDns;
    case 'http': return t.ollamaModal.subHttp.replace('{status}', errorStatus ?? '?');
    default: return t.ollamaModal.subDefault;
  }
}
