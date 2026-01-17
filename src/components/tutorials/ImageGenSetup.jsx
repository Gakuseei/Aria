// ARIA v1.0 RELEASE - Image Generation Setup Tutorial (Rose Noir Theme)
import React, { useState, useEffect } from 'react';
import { Download, Check, X, RefreshCw, ExternalLink } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

export default function ImageGenSetup({ onClose, onTest }) {
  const { t } = useLanguage();
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [testing, setTesting] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);

  const fallbackTranslations = {
    title: "Image Generation Setup",
    subtitle: "Stability Matrix + AUTOMATIC1111",
    step1_title: "📦 Download Stability Matrix",
    step1_desc: "Download from lykos.ai",
    step1Next: "Next",
    step2_title: "💾 Install Stability Matrix",
    step2_desc: "Extract and run StabilityMatrix.exe",
    step2Important: "Wait for first load (2-3 minutes)",
    step3_title: "🤖 Install AUTOMATIC1111 WebUI",
    step3_desc: "Add Package → Stable Diffusion WebUI → Install",
    step3_warning: "Download takes 5-7 minutes (4 GB)",
    step4_title: "🚀 Start WebUI",
    step4_desc: "Launch Stable Diffusion WebUI → Wait for browser",
    api_warning_title: "ENABLE API ACCESS (CRITICAL):",
    api_warning_steps: "Add --api --cors-allow-origins=* to Launch Options",
    api_warning_note: "Required for Aria to communicate!",
    step5_title: "✅ Test Connection",
    step5_desc: "Ensure WebUI is running, then test.",
    step5Test: "Test Connection"
  };

  const imgGenT = t.tutorials?.imageGen || fallbackTranslations;

  // Auto-test on mount
  useEffect(() => {
    testConnection();
  }, []);

  const testConnection = async () => {
    setTesting(true);
    try {
      const result = await window.electronAPI?.testImageGen?.('http://127.0.0.1:7860');
      if (result?.success) {
        setConnectionStatus('connected');
      } else {
        setConnectionStatus('disconnected');
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

  const handleTest = async () => {
    setTesting(true);
    try {
      await testConnection();
      if (connectionStatus === 'connected') {
        onTest?.('http://127.0.0.1:7860');
      }
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <div className="bg-zinc-950 border border-rose-500/30 rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden glass">
        {/* Header */}
        <div className="p-6 border-b border-white/5 bg-gradient-to-r from-purple-950/30 to-pink-950/30">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <span className="text-3xl">🎨</span>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">{imgGenT.title}</h2>
                <p className="text-sm text-zinc-400">{imgGenT.subtitle}</p>
              </div>
            </div>

            {/* BLOCK 7.0: Traffic Light */}
            <div className={`px-4 py-2 rounded-xl border flex items-center gap-2 ${
              connectionStatus === 'connected'
                ? 'bg-green-500/10 border-green-500/30 text-green-300'
                : 'bg-red-500/10 border-red-500/30 text-red-300'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                connectionStatus === 'connected' ? 'bg-green-400' : 'bg-red-400'
              } ${testing ? 'animate-pulse' : ''}`} />
              <span className="text-sm font-medium">
                {connectionStatus === 'connected' ? t.tutorials.connected : t.tutorials.disconnected}
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-zinc-500 uppercase tracking-wider">{t.tutorials.setupGuide}</span>
              <span className="text-xs text-zinc-400">{currentStep} / 5</span>
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-600 to-pink-600 transition-all duration-500"
                style={{ width: `${(currentStep / 5) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh] space-y-6">
          {/* Step 1 */}
          <div className={`glass rounded-xl p-5 border transition-all ${
            currentStep === 1 ? 'border-purple-500/50' : 'border-white/5'
          }`}>
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                currentStep > 1 ? 'bg-green-500/20 text-green-300' : 'bg-purple-500/20 text-purple-300'
              }`}>
                {currentStep > 1 ? <Check size={20} /> : '1'}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white mb-2">{imgGenT.step1_title}</h3>
                <p className="text-sm text-zinc-300 mb-4">
                  {imgGenT.step1_desc}
                </p>
                <button
                  onClick={() => openLink('https://lykos.ai/')}
                  className="w-full py-3 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 rounded-xl text-purple-300 font-medium flex items-center justify-center gap-2 transition-all"
                >
                  <Download size={18} />
                  <span>Stability Matrix Download</span>
                </button>
                {currentStep === 1 && (
                  <button
                    onClick={() => setCurrentStep(2)}
                    className="w-full mt-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-white text-sm transition-all"
                  >
                    {imgGenT.step1Next} →
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className={`glass rounded-xl p-5 border transition-all ${
            currentStep === 2 ? 'border-purple-500/50' : 'border-white/5'
          }`}>
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                currentStep > 2 ? 'bg-green-500/20 text-green-300' : 'bg-purple-500/20 text-purple-300'
              }`}>
                {currentStep > 2 ? <Check size={20} /> : '2'}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white mb-2">{imgGenT.step2_title}</h3>
                <p className="text-sm text-zinc-300 mb-3">
                  {imgGenT.step2_desc}
                </p>
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                  <p className="text-xs text-amber-200">
                    {imgGenT.step2Important}
                  </p>
                </div>
                {currentStep === 2 && (
                  <button
                    onClick={() => setCurrentStep(3)}
                    className="w-full mt-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-white text-sm transition-all"
                  >
                    {imgGenT.step1Next} →
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className={`glass rounded-xl p-5 border transition-all ${
            currentStep === 3 ? 'border-purple-500/50' : 'border-white/5'
          }`}>
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                currentStep > 3 ? 'bg-green-500/20 text-green-300' : 'bg-purple-500/20 text-purple-300'
              }`}>
                {currentStep > 3 ? <Check size={20} /> : '3'}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white mb-2">{imgGenT.step3_title}</h3>
                <p className="text-sm text-zinc-300 mb-3 whitespace-pre-line">
                  {imgGenT.step3_desc}
                </p>
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                  <p className="text-xs text-amber-200">
                    {imgGenT.step3_warning}
                  </p>
                </div>
                {currentStep === 3 && (
                  <button
                    onClick={() => setCurrentStep(4)}
                    className="w-full mt-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-white text-sm transition-all"
                  >
                    {imgGenT.step1Next} →
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Step 4 */}
          <div className={`glass rounded-xl p-5 border transition-all ${
            currentStep === 4 ? 'border-purple-500/50' : 'border-white/5'
          }`}>
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                currentStep > 4 ? 'bg-green-500/20 text-green-300' : 'bg-purple-500/20 text-purple-300'
              }`}>
                {currentStep > 4 ? <Check size={20} /> : '4'}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white mb-2">{imgGenT.step4_title}</h3>
                <p className="text-sm text-zinc-300 mb-3 whitespace-pre-line">
                  {imgGenT.step4_desc}
                </p>

                {/* BLOCK 8.1: CRITICAL API FLAGS WARNING */}
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-3">
                  <div className="flex items-start gap-2">
                    <span className="text-red-400 text-lg flex-shrink-0">⚠️</span>
                    <div>
                      <p className="text-sm font-bold text-red-300 mb-2">{imgGenT.api_warning_title}</p>
                      <div className="text-xs text-red-200 space-y-1 whitespace-pre-line">
                        {imgGenT.api_warning_steps}
                      </div>
                      <p className="text-xs text-red-200 mt-2 font-medium">
                        {imgGenT.api_warning_note}
                      </p>
                    </div>
                  </div>
                </div>

                {currentStep === 4 && (
                  <button
                    onClick={() => setCurrentStep(5)}
                    className="w-full mt-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-white text-sm transition-all"
                  >
                    {imgGenT.step1Next} →
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Step 5 */}
          <div className={`glass rounded-xl p-5 border transition-all ${
            currentStep === 5 ? 'border-purple-500/50' : 'border-white/5'
          }`}>
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                connectionStatus === 'connected' ? 'bg-green-500/20 text-green-300' : 'bg-purple-500/20 text-purple-300'
              }`}>
                {connectionStatus === 'connected' ? <Check size={20} /> : '5'}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white mb-2">{imgGenT.step5_title}</h3>
                <p className="text-sm text-zinc-300 mb-4">
                  {imgGenT.step5_desc}
                </p>
                <button
                  onClick={handleTest}
                  disabled={testing}
                  className="w-full py-3 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-xl text-cyan-300 font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {testing ? (
                    <>
                      <RefreshCw size={18} className="animate-spin" />
                      <span>{t.tutorials.testConnection}...</span>
                    </>
                  ) : (
                    <>
                      <Check size={18} />
                      <span>{imgGenT.step5Test}</span>
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
            className="px-6 py-2.5 glass hover:bg-purple-500/10 border border-white/10 hover:border-purple-500/30 rounded-xl text-zinc-300 hover:text-purple-300 font-medium transition-all"
          >
            {t.common?.back || "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
