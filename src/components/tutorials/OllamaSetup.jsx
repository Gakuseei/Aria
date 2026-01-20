// ARIA v1.0 - Ollama Setup Tutorial (Refactored Premium)
import React, { useState, useEffect } from 'react';
import { Download, Check, RefreshCw, Copy, ExternalLink, HardDrive, Cpu, Zap } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import TutorialLayout from './TutorialLayout';

/**
 * @description Premium Ollama Setup Tutorial
 * Features: 3-Tier Model Selection, One-Click Install, Auto-Backup
 */
export default function OllamaSetup({ onClose, isOnboarding = false, onComplete }) {
  const { t, language, setLanguage } = useLanguage();
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [testing, setTesting] = useState(false);
  const [selectedModel, setSelectedModel] = useState('midEnd');
  const [copied, setCopied] = useState(false);
  const [modelsInstalled, setModelsInstalled] = useState([]);

  // Determine current step based on status
  // 1: Install & Run, 2: Model, 3: Connect
  const [currentStep, setCurrentStep] = useState(1);

  useEffect(() => {
    testConnection();
  }, []);

  const testConnection = async () => {
    setTesting(true);
    try {
      // Use API lib if available, or fetch direct
      const response = await fetch('http://127.0.0.1:11434/api/tags');
      if (response.ok) {
        setConnectionStatus('connected');
        const data = await response.json();
        setModelsInstalled(data.models?.map(m => m.name) || []);
        
        // If connected and has models, we might be done
        if (isOnboarding && currentStep < 4) {
             // Let user manually proceed to see info, or auto-scan?
             // Better to let user click "Next"
        }
      } else {
        setConnectionStatus('error');
      }
    } catch (error) {
      setConnectionStatus('disconnected');
    } finally {
      setTesting(false);
    }
  };

  const copyCommand = (cmd) => {
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const modelTiers = ['lowEnd', 'midEnd', 'highEnd'];
  const tierConfig = {
    lowEnd: { 
      icon: '🥉', 
      color: 'green', 
      gradient: 'from-green-500/20 to-emerald-500/5',
      borderColor: 'border-green-500/30',
      ringColor: 'ring-green-500/30'
    },
    midEnd: { 
      icon: '🥈', 
      color: 'blue', 
      gradient: 'from-blue-500/20 to-cyan-500/5',
      borderColor: 'border-blue-500/30',
      ringColor: 'ring-blue-500/30'
    },
    highEnd: { 
      icon: '🥇', 
      color: 'amber', 
      gradient: 'from-amber-500/20 to-orange-500/5',
      borderColor: 'border-amber-500/30',
      ringColor: 'ring-amber-500/30'
    }
  };

  // Onboarding special: Complete handler
  const handleComplete = () => {
    if (onComplete) onComplete();
    else if (onClose) onClose();
  };

  return (
    <TutorialLayout
      title={isOnboarding ? t.tutorials?.setupGuide || "Welcome to Aria" : t.tutorials.ollama.title}
      subtitle={isOnboarding ? t.mainMenu?.footer || "Your Local AI Companion" : t.tutorials.ollama.subtitle}
      icon="🦙"
      iconColor="bg-rose-500/20"
      steps={4}
      currentStep={currentStep}
      connectionStatus={connectionStatus}
      connectionText={
        connectionStatus === 'connected' ? t.tutorials.ollamaConnected :
        connectionStatus === 'error' ? t.tutorials.ollamaError : t.tutorials.ollamaDisconnected
      }
      isTesting={testing}
      onClose={!isOnboarding ? onClose : null} // Hide close button in onboarding until done
      footerContent={
        isOnboarding ? (
            <div className="flex w-full justify-between items-center">
                 {/* Language Selector for Onboarding */}
                 <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500 uppercase font-bold tracking-wider">Language:</span>
                    <select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        className="bg-zinc-800 border border-white/10 rounded-lg px-2 py-1 text-sm text-zinc-300 focus:outline-none focus:border-rose-500"
                    >
                         <option value="en">🇺🇸 English</option>
                         <option value="de">🇩🇪 Deutsch</option>
                         <option value="es">🇪🇸 Español</option>
                         <option value="fr">🇫🇷 Français</option>
                         <option value="it">🇮🇹 Italiano</option>
                         <option value="pt">🇵🇹 Português</option>
                         <option value="ru">🇷🇺 Русский</option>
                         <option value="ja">🇯🇵 日本語</option>
                         <option value="ko">🇰🇷 한국어</option>
                         <option value="cn">🇨🇳 中文</option>
                         <option value="ar">🇸🇦 العربية</option>
                         <option value="hi">🇮🇳 हिंदी</option>
                         <option value="tr">🇹🇷 Türkçe</option>
                    </select>
                 </div>

                 {currentStep < 3 ? (
                     <button
                        onClick={() => setCurrentStep(prev => Math.min(prev + 1, 3))}
                        className="px-6 py-2.5 bg-zinc-100 hover:bg-white text-zinc-950 font-bold rounded-xl transition-all flex items-center gap-2"
                     >
                        Next Step
                     </button>
                 ) : (
                     <button
                        onClick={handleComplete}
                        disabled={connectionStatus !== 'connected'}
                        className={`px-8 py-2.5 font-bold rounded-xl transition-all shadow-lg flex items-center gap-2 ${
                            connectionStatus === 'connected'
                            ? 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/20'
                            : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
                        }`}
                     >
                        {t.common?.start || "Get Started"} 🚀
                     </button>
                 )}
            </div>
        ) : null
      }
    >
      {/* Step 1: Install & Run - MERGED */}
      <div className={`transition-all duration-500 ${currentStep === 1 ? 'opacity-100' : 'opacity-40 grayscale delay-0'}`}>
        <div className={`rocket-card glass p-1 border rounded-2xl overflow-hidden ${currentStep === 1 ? 'border-rose-500/50 shadow-[0_0_20px_-5px_rgba(244,63,94,0.3)]' : 'border-white/5'}`}>
           <div className="bg-zinc-900/50 p-5 rounded-xl">
              <div className="flex items-start gap-4">
                 <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg shrink-0 ${
                    currentStep > 1 ? 'bg-green-500/20 text-green-400' : 'bg-rose-500/20 text-rose-400'
                 }`}>
                    {currentStep > 1 ? <Check size={20} /> : '1'}
                 </div>
                 <div className="flex-1">
                    <h3 className="text-xl font-bold text-white mb-2">{t.tutorials.ollamaStep1Title}</h3>
                    <p className="text-sm text-zinc-300 mb-4 leading-relaxed max-w-[90%]">
                       {t.tutorials.ollamaStep1Desc}
                    </p>

                    <div className="flex flex-wrap gap-3">
                       <button
                          onClick={() => window.electronAPI?.runToolScript?.('install_ollama.bat')}
                          className="px-6 py-3 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 rounded-xl text-white font-bold shadow-lg shadow-rose-900/20 flex items-center gap-2 transition-all transform hover:scale-[1.02] active:scale-95"
                       >
                          <Download size={18} />
                          {t.tutorials.installScript || "Auto-Install Ollama"}
                       </button>
                       <button
                          onClick={() => window.electronAPI?.openToolsFolder?.()}
                          className="px-4 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-zinc-300 transition-all border border-white/5 hover:border-white/10"
                          title={t.tutorials.openFolder}
                       >
                          📂
                       </button>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </div>

      {/* Step 2: Model Selection (Renumbered from 3) */}
      <div className={`transition-all duration-500 ${currentStep === 2 ? 'opacity-100' : currentStep > 2 ? 'opacity-40 grayscale' : 'opacity-40'}`}>
         <div className={`rocket-card glass p-1 border rounded-2xl overflow-hidden ${currentStep === 2 ? 'border-rose-500/50 shadow-[0_0_20px_-5px_rgba(244,63,94,0.3)]' : 'border-white/5'}`}>
            <div className="bg-zinc-900/50 p-5 rounded-xl">
               <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg shrink-0 ${
                     currentStep > 2 ? 'bg-green-500/20 text-green-400' : 'bg-zinc-800 text-zinc-500'
                  }`}>
                     {currentStep > 2 ? <Check size={20} /> : '2'}
                  </div>
                  <div className="flex-1">
                     <h3 className="text-xl font-bold text-white mb-2">{t.tutorials.ollamaStep3Title}</h3>
                     <p className="text-sm text-zinc-300 mb-6">
                        {t.tutorials.ollama.models?.chooseModelDesc || "Select the best AI Brain for your PC power."}
                     </p>

                     {/* Model Grid */}
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
                        {modelTiers.map((tier) => {
                           const model = t.tutorials.ollama.models?.[tier];
                           const config = tierConfig[tier];
                           const isSelected = selectedModel === tier;
                           
                           return (
                              <button
                                 key={tier}
                                 onClick={() => setSelectedModel(tier)}
                                 className={`relative p-3 rounded-xl border-2 transition-all duration-300 text-left group overflow-hidden flex flex-col min-w-0 w-full ${
                                    isSelected 
                                    ? `${config.borderColor} bg-gradient-to-br ${config.gradient} ring-2 ${config.ringColor} scale-[1.02]` 
                                    : 'border-white/5 bg-zinc-900/50 hover:border-white/10 hover:bg-zinc-800'
                                 }`}
                              >
                                 <div className="flex items-center justify-between mb-3 w-full">
                                    <span className="text-2xl">{config.icon}</span>
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-black/30 border border-white/5 whitespace-nowrap ${isSelected ? `text-${config.color}-300` : 'text-zinc-500'}`}>
                                        {model?.vram || '? GB'}
                                    </span>
                                 </div>
                                 <h4 className={`font-bold mb-1 text-sm truncate ${isSelected ? 'text-white' : 'text-zinc-400 group-hover:text-zinc-200'}`}>
                                     {model?.name || tier}
                                 </h4>
                                 <p className="text-[11px] text-zinc-500 leading-tight line-clamp-2 break-words">
                                     {model?.desc?.split(' - ')[0] || ''}
                                 </p>
                              </button>
                           );
                        })}
                     </div>

                     {/* Command Box */}
                     <div className="bg-black/40 border border-white/10 rounded-xl p-4 flex items-center justify-between gap-4 group hover:border-rose-500/30 transition-colors">
                        <div className="flex-1 min-w-0">
                           <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Run in Terminal:</span>
                           </div>
                           <code className="text-rose-400 font-mono text-sm block truncate">
                              {t.tutorials.ollama.models?.[selectedModel]?.command || 'ollama pull hermes3'}
                           </code>
                        </div>
                        <button
                           onClick={() => copyCommand(t.tutorials.ollama.models?.[selectedModel]?.command || 'ollama pull hermes3')}
                           className={`px-4 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${
                              copied 
                              ? 'bg-green-500/20 text-green-300' 
                              : 'bg-white/5 hover:bg-white/10 text-white'
                           }`}
                        >
                           {copied ? <Check size={16} /> : <Copy size={16} />}
                           {copied ? 'Copied' : 'Copy'}
                        </button>
                     </div>
                  </div>
               </div>
            </div>
         </div>
      </div>

      {/* Step 3: Verification (Renumbered from 4) */}
      <div className={`transition-all duration-500 ${currentStep === 3 ? 'opacity-100' : 'opacity-40'}`}>
         <div className={`rocket-card glass p-1 border rounded-2xl overflow-hidden ${currentStep === 3 ? 'border-rose-500/50 shadow-[0_0_20px_-5px_rgba(244,63,94,0.3)]' : 'border-white/5'}`}>
            <div className="bg-zinc-900/50 p-5 rounded-xl">
               <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg shrink-0 ${
                     connectionStatus === 'connected' ? 'bg-green-500/20 text-green-400' : 'bg-zinc-800 text-zinc-500'
                  }`}>
                     {connectionStatus === 'connected' ? <Check size={20} /> : '3'}
                  </div>
                  <div className="flex-1">
                     <h3 className="text-xl font-bold text-white mb-2">{t.tutorials.ollamaStep4Title}</h3>
                     <p className="text-sm text-zinc-300 mb-4">
                        {t.tutorials.ollamaStep4Desc}
                     </p>
                     
                     <div className="flex flex-col gap-3">
                        <button
                           onClick={testConnection}
                           disabled={testing}
                           className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-all ${
                              connectionStatus === 'connected'
                              ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                              : 'bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-900/20'
                           }`}
                        >
                           {testing ? (
                              <>
                                 <RefreshCw size={20} className="animate-spin" />
                                 <span>{t.tutorials.ollamaTesting}...</span>
                              </>
                           ) : connectionStatus === 'connected' ? (
                              <>
                                 <Check size={20} />
                                 <span>{t.tutorials.ollamaConnected}!</span>
                              </>
                           ) : (
                              <>
                                 <Zap size={20} className="fill-current" />
                                 <span>{t.tutorials.testConnection || "Connect Core System"}</span>
                              </>
                           )}
                        </button>

                        {/* Help Text for Errors */}
                        {connectionStatus === 'error' && (
                           <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-200 text-sm flex items-center gap-2">
                              <span>⚠️ Connection failed. Make sure Ollama is running in the background tray!</span>
                           </div>
                        )}
                     </div>
                  </div>
               </div>
            </div>
         </div>
      </div>

    </TutorialLayout>
  );
}
