import { Minus, Square, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

function TitleBar() {
  const { t } = useLanguage();

  const handleMinimize = () => {
    if (window.electronAPI?.minimize) {
      window.electronAPI.minimize();
    }
  };

  const handleMaximize = () => {
    if (window.electronAPI?.maximize) {
      window.electronAPI.maximize();
    }
  };

  const handleClose = () => {
    if (window.electronAPI?.close) {
      window.electronAPI.close();
    }
  };

  return (
    <div className="theme-titlebar fixed left-0 right-0 top-0 z-[9999] flex h-8 items-center justify-between px-3 select-none" style={{ WebkitAppRegion: 'drag' }}>
      <div className="theme-titlebar-brand flex min-w-0 items-center gap-2">
        <span className="theme-titlebar-wordmark truncate text-[11px] font-semibold uppercase tracking-[0.28em]">
          Aria
        </span>
        <span className="theme-titlebar-version text-[10px] font-medium uppercase tracking-[0.18em]">
          v1.0
        </span>
      </div>

      <div className="relative z-[10000] flex items-center gap-0.5" style={{ WebkitAppRegion: 'no-drag' }}>
        <button
          onClick={handleMinimize}
          className="theme-titlebar-control"
          title={t.common?.minimize || 'Minimize'}
          aria-label={t.common?.minimize || 'Minimize'}
        >
          <Minus size={14} strokeWidth={1.75} />
        </button>
        <button
          onClick={handleMaximize}
          className="theme-titlebar-control"
          title={t.common?.maximize || 'Maximize'}
          aria-label={t.common?.maximize || 'Maximize'}
        >
          <Square size={12} strokeWidth={1.75} />
        </button>
        <button
          onClick={handleClose}
          className="theme-titlebar-control theme-titlebar-control-close"
          title={t.common?.close || 'Close'}
          aria-label={t.common?.close || 'Close'}
        >
          <X size={14} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}

export default TitleBar;
