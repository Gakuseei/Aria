import React from 'react';
import { X } from 'lucide-react';

/**
 * Shared Layout for all Tutorials
 * Provides consistent Glassmorphism UI, Header, Progress Bar, and Footer
 */
export default function TutorialLayout({ 
  title, 
  subtitle, 
  icon, 
  iconColor = "bg-rose-500/20", 
  steps, 
  currentStep, 
  headerGradient = "from-rose-950/30 to-pink-950/30",
  connectionStatus,
  connectionText,
  isTesting,
  onClose,
  children,
  footerContent
}) {
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-zinc-950 border border-white/10 rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden glass relative flex flex-col">
        
        {/* Header */}
        <div className={`p-6 border-b border-white/5 bg-gradient-to-r ${headerGradient}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-2xl ${iconColor} flex items-center justify-center shadow-lg backdrop-blur-md border border-white/10`}>
                <span className="text-3xl drop-shadow-md">{icon}</span>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight">{title}</h2>
                <p className="text-sm text-zinc-400 font-medium">{subtitle}</p>
              </div>
            </div>

            {/* Status & Options */}
            <div className="flex items-center gap-3">
              {/* Traffic Light Status */}
              {connectionStatus && (
                <div className={`px-4 py-2 rounded-xl border backdrop-blur-md flex items-center gap-2 transition-all duration-300 ${
                  connectionStatus === 'connected'
                    ? 'bg-green-500/10 border-green-500/30 text-green-300 shadow-[0_0_15px_-3px_rgba(34,197,94,0.3)]'
                    : connectionStatus === 'error'
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                    : 'bg-red-500/10 border-red-500/30 text-red-300'
                }`}>
                  <div className={`w-2.5 h-2.5 rounded-full shadow-sm ${
                    connectionStatus === 'connected' ? 'bg-green-400' :
                    connectionStatus === 'error' ? 'bg-amber-400' : 'bg-red-400'
                  } ${isTesting ? 'animate-pulse' : ''}`} />
                  <span className="text-sm font-bold tracking-wide">
                    {connectionText || connectionStatus.toUpperCase()}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          {steps && currentStep && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Setup Progress</span>
                <span className="text-xs text-zinc-400 font-mono">{currentStep} / {steps}</span>
              </div>
              <div className="h-1.5 bg-zinc-900/50 rounded-full overflow-hidden border border-white/5">
                <div
                  className="h-full bg-gradient-to-r from-rose-500 to-amber-500 shadow-[0_0_10px_rgba(244,63,94,0.5)] transition-all duration-700 ease-out"
                  style={{ width: `${(currentStep / steps) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {children}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/5 bg-zinc-900/30 backdrop-blur-md flex items-center justify-end gap-3 z-10">
          {footerContent}
          {onClose && (
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl border-2 border-transparent text-zinc-400 hover:text-white hover:bg-white/5 font-semibold transition-all"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
