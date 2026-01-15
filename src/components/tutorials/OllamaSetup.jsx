// ARIA v1.0 BLOCK 7.0 - Ollama Setup Tutorial (Rose Noir Theme)
import React, { useState, useEffect } from 'react';
import { Download, Check, X, RefreshCw, ExternalLink } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

export default function OllamaSetup({ onClose }) {
  const { t } = useLanguage();
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // disconnected, connected, error
  const [testing, setTesting] = useState(false);

  // Auto-test connection on mount
  useEffect(() => {
    testConnection();
  }, []);

  const testConnection = async () => {
    setTesting(true);
    try {
      const response = await fetch('http://127.0.0.1:11434/api/tags');
      if (response.ok) {
        setConnectionStatus('connected');
      } else {
        setConnectionStatus('error');
      }
    } catch (error) {
      setConnectionStatus('disconnected');
    } finally {
      setTesting(false);
    }
  };

  const openLink = (url) => {
    if (window.electronAPI?.openExternal) {
      window.electronAPI.openExternal(url);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <div className="bg-zinc-950 border border-rose-500/30 rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden glass">
        {/* Header */}
        <div className="p-6 border-b border-white/5 bg-gradient-to-r from-rose-950/30 to-pink-950/30">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-rose-500/20 flex items-center justify-center">
                <span className="text-3xl">🦙</span>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">{t.tutorials.ollama.title}</h2>
                <p className="text-sm text-zinc-400">{t.tutorials.ollama.subtitle}</p>
              </div>
            </div>

            {/* BLOCK 7.0: Traffic Light Status */}
            <div className={`px-4 py-2 rounded-xl border flex items-center gap-2 ${
              connectionStatus === 'connected'
                ? 'bg-green-500/10 border-green-500/30 text-green-300'
                : connectionStatus === 'error'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                : 'bg-red-500/10 border-red-500/30 text-red-300'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                connectionStatus === 'connected' ? 'bg-green-400' :
                connectionStatus === 'error' ? 'bg-amber-400' : 'bg-red-400'
              } ${testing ? 'animate-pulse' : ''}`} />
              <span className="text-sm font-medium">
                {connectionStatus === 'connected' ? t.tutorials.ollamaConnected :
                 connectionStatus === 'error' ? t.tutorials.ollamaError : t.tutorials.ollamaDisconnected}
              </span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh] space-y-6">
          {/* Step 1: Download */}
          <div className="glass rounded-xl p-5 border border-white/5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-rose-500/20 flex items-center justify-center text-rose-300 font-bold">1</div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white mb-2">{t.tutorials.ollamaStep1Title}</h3>
                <p className="text-sm text-zinc-300 mb-4">
                  {t.tutorials.ollamaStep1Desc}
                </p>
                <button
                  onClick={() => openLink('https://ollama.com/download')}
                  className="w-full py-3 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-xl text-rose-300 font-medium flex items-center justify-center gap-2 transition-all"
                >
                  <Download size={18} />
                  <span>{t.tutorials.ollamaStep1Button}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Step 2: Install */}
          <div className="glass rounded-xl p-5 border border-white/5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-rose-500/20 flex items-center justify-center text-rose-300 font-bold">2</div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white mb-2">{t.tutorials.ollamaStep2Title}</h3>
                <p className="text-sm text-zinc-300">
                  {t.tutorials.ollamaStep2Desc}
                </p>
              </div>
            </div>
          </div>

          {/* Step 3: Install Model */}
          <div className="glass rounded-xl p-5 border border-white/5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-rose-500/20 flex items-center justify-center text-rose-300 font-bold">3</div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white mb-2">{t.tutorials.ollamaStep3Title}</h3>
                <p className="text-sm text-zinc-300 mb-3">
                  {t.tutorials.ollamaStep3Desc}
                </p>
                <div className="bg-black/50 border border-zinc-700/50 rounded-lg p-3">
                  <code className="text-green-400 font-mono text-sm">ollama pull hermes3</code>
                </div>
                <p className="text-xs text-zinc-500 mt-2">
                  {t.tutorials.ollamaStep3Note}
                </p>
              </div>
            </div>
          </div>

          {/* Step 4: Test Connection */}
          <div className="glass rounded-xl p-5 border border-white/5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-rose-500/20 flex items-center justify-center text-rose-300 font-bold">4</div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white mb-2">{t.tutorials.ollamaStep4Title}</h3>
                <p className="text-sm text-zinc-300 mb-4">
                  {t.tutorials.ollamaStep4Desc}
                </p>
                <button
                  onClick={testConnection}
                  disabled={testing}
                  className="w-full py-3 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-xl text-cyan-300 font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {testing ? (
                    <>
                      <RefreshCw size={18} className="animate-spin" />
                      <span>{t.tutorials.ollamaTesting}</span>
                    </>
                  ) : (
                    <>
                      <Check size={18} />
                      <span>{t.tutorials.ollamaStep4Button}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/5 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 glass hover:bg-rose-500/10 border border-white/10 hover:border-rose-500/30 rounded-xl text-zinc-300 hover:text-rose-300 font-medium transition-all"
          >
            {t.tutorials.close}
          </button>
        </div>
      </div>
    </div>
  );
}
