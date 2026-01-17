// ARIA v1.0 RELEASE - TitleBar (Rose Noir Theme)
import React from 'react';

function TitleBar() {
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
    <div
      className="h-8 w-full bg-gradient-to-b from-black/70 to-transparent backdrop-blur-xl flex items-center justify-between px-4 select-none fixed top-0 left-0 right-0 z-[9999]"
      style={{ WebkitAppRegion: 'drag' }}
    >
      {/* App Title - Rose Noir Branding */}
      <div className="flex items-center gap-2.5">
        <div className="w-3 h-3 rounded-full bg-gradient-to-br from-rose-500 to-pink-600 shadow-lg shadow-rose-500/40 animate-pulse" />
        <span className="text-xs font-semibold text-zinc-300 tracking-widest uppercase">
          Aria
        </span>
        <span className="text-[10px] font-medium text-rose-400/80 tracking-wide">
          v1.0
        </span>
      </div>

      {/* Window Controls - Sleek Minimal Design */}
      <div
        className="flex items-center gap-0.5 relative z-[10000]"
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        {/* Minimize */}
        <button
          onClick={handleMinimize}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-all duration-200 group"
          title="Minimize"
        >
          <svg
            className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-200 transition-colors"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
          </svg>
        </button>

        {/* Maximize */}
        <button
          onClick={handleMaximize}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-all duration-200 group"
          title="Maximize"
        >
          <svg
            className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-200 transition-colors"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
          </svg>
        </button>

        {/* Close - Rose Glow on Hover */}
        <button
          onClick={handleClose}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-rose-500/20 transition-all duration-200 group"
          title="Close"
        >
          <svg
            className="w-3.5 h-3.5 text-zinc-500 group-hover:text-rose-400 transition-colors"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default TitleBar;
