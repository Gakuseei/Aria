// ARIA v1.0 - Voice Setup Tutorial (Refactored Premium)
import React, { useState, useEffect, useRef } from 'react';
import { Download, Check, RefreshCw, Play, Volume2, FolderOpen, Zap, Star, Loader2, AlertCircle, Power, XCircle, FileText } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import TutorialLayout from './TutorialLayout';

export default function VoiceSetup({ onClose, onVerified }) {
  const { t } = useLanguage();
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [testing, setTesting] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [tierMode, setTierMode] = useState('standard'); // 'standard' | 'premium'
  
  // Voice State
  const [selectedVoice, setSelectedVoice] = useState('en_US-amy-medium');
  const [playingVoice, setPlayingVoice] = useState(null);
  const [downloadingVoices, setDownloadingVoices] = useState({});
  const [downloadedVoices, setDownloadedVoices] = useState({});
  const [localModels, setLocalModels] = useState([]);
  
  // Settings State
  const [piperPath, setPiperPath] = useState('');
  const [modelPath, setModelPath] = useState('');
  
  // Zonos State
  const [zonosStatus, setZonosStatus] = useState('disconnected');
  const [zonosInstallStatus, setZonosInstallStatus] = useState('idle'); // idle, checking, installing, error, needs_restart
  const [zonosError, setZonosError] = useState(null);
  const [zonosInstalled, setZonosInstalled] = useState(false);
  const [installProgress, setInstallProgress] = useState(null); // { step, total, message, detail }
  const [showLog, setShowLog] = useState(false);
  const [installLog, setInstallLog] = useState('');
  const statusPollRef = useRef(null);

  // Test voice sample phrases per language
  const testPhrases = {
     'en_US': "Hello! I am your AI voice assistant.",
     'en_GB': "Hello! I am your AI voice assistant.",
     'de_DE': "Hallo! Ich bin dein KI-Sprachassistent.",
     'fr_FR': "Bonjour! Je suis votre assistant vocal IA.",
     'es_ES': "¡Hola! Soy tu asistente de voz IA.",
     'zh_CN': "你好！我是你的 AI 语音助手。"
  };

  // Hardcoded Voice List (Verified)
  const voiceOptions = [
    { id: 'en_US-amy-medium', name: 'Amy (US)', flag: '🇺🇸', gender: 'Female', quality: 'Medium', urlOnnx: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx', urlJson: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx.json' },
    { id: 'en_US-ryan-medium', name: 'Ryan (US)', flag: '🇺🇸', gender: 'Male', quality: 'Medium', urlOnnx: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/medium/en_US-ryan-medium.onnx', urlJson: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/medium/en_US-ryan-medium.onnx.json' },
    { id: 'en_GB-alba-medium', name: 'Alba (UK)', flag: '🇬🇧', gender: 'Female', quality: 'Medium', urlOnnx: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alba/medium/en_GB-alba-medium.onnx', urlJson: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alba/medium/en_GB-alba-medium.onnx.json' },
    { id: 'de_DE-thorsten-medium', name: 'Thorsten (DE)', flag: '🇩🇪', gender: 'Male', quality: 'Medium', urlOnnx: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx', urlJson: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx.json' },
    { id: 'fr_FR-siwis-medium', name: 'Siwis (FR)', flag: '🇫🇷', gender: 'Female', quality: 'Medium', urlOnnx: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/siwis/medium/fr_FR-siwis-medium.onnx', urlJson: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/siwis/medium/fr_FR-siwis-medium.onnx.json' },
    { id: 'es_ES-mls_10246-low', name: 'MLS (ES)', flag: '🇪🇸', gender: 'Female', quality: 'Low', urlOnnx: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/mls_10246/low/es_ES-mls_10246-low.onnx', urlJson: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/mls_10246/low/es_ES-mls_10246-low.onnx.json' },
    { id: 'zh_CN-huayan-medium', name: 'Huayan (CN)', flag: '🇨🇳', gender: 'Female', quality: 'Medium', urlOnnx: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/zh/zh_CN/huayan/medium/zh_CN-huayan-medium.onnx', urlJson: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/zh/zh_CN/huayan/medium/zh_CN-huayan-medium.onnx.json' }
  ];

  // Load Initial Data
  useEffect(() => {
    testConnection();
    loadSettings();
    checkZonosInstalled();
    
    return () => {
      if (statusPollRef.current) {
        clearInterval(statusPollRef.current);
      }
    };
  }, []);

  // Poll progress when installing
  useEffect(() => {
    if (zonosInstallStatus === 'installing') {
      statusPollRef.current = setInterval(async () => {
        const result = await window.electronAPI?.zonosGetProgress?.();
        if (result) {
          setInstallProgress(result);
          
          if (result.error) {
            setZonosInstallStatus('error');
            setZonosError({
              title: result.message,
              message: result.detail,
              needsRestart: result.needsRestart
            });
            if (result.log) setInstallLog(result.log);
          } else if (result.running) {
            setZonosStatus('connected');
            setZonosInstallStatus('completed');
            setConnectionStatus('connected');
            if (onVerified) onVerified();
          } else if (result.status === 'CANCELLED') {
            setZonosInstallStatus('idle');
            setInstallProgress(null);
          }
        }
      }, 1000);
    } else {
      if (statusPollRef.current) {
        clearInterval(statusPollRef.current);
      }
    }
  }, [zonosInstallStatus]);

  const loadSettings = async () => {
    const loaded = JSON.parse(localStorage.getItem('settings') || '{}');
    setPiperPath(loaded.piperPath || '');
    setModelPath(loaded.modelPath || '');

    const result = await window.electronAPI?.getLocalVoiceModels?.();
    if (result?.success) {
      setLocalModels(result.models);
    }
  };

  const checkZonosInstalled = async () => {
    const result = await window.electronAPI?.zonosIsInstalled?.();
    setZonosInstalled(result?.installed || false);
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      if (tierMode === 'premium') {
         await testZonosConnection();
      } else {
         const result = await window.electronAPI?.testVoice?.();
         setConnectionStatus(result?.success ? 'connected' : 'disconnected');
         if (result?.success) {
            if (result.detectedPiperPath && !piperPath) {
                setPiperPath(result.detectedPiperPath);
                saveSetting('piperPath', result.detectedPiperPath);
            }
            if (onVerified) onVerified();
         }
      }
    } finally {
      setTesting(false);
    }
  };

  const testZonosConnection = async () => {
      try {
        const response = await fetch('http://localhost:7860/api/health', {
            signal: AbortSignal.timeout(2000)
        });
        if(response.ok) {
            setZonosStatus('connected');
            setConnectionStatus('connected');
            setZonosInstallStatus('completed');
            if (onVerified) onVerified();
        } else {
            setZonosStatus('disconnected');
            setConnectionStatus('disconnected');
        }
      } catch {
         setZonosStatus('disconnected');
         setConnectionStatus('disconnected');
      }
  };

  const handleAutoInstallZonos = async () => {
    setZonosInstallStatus('installing');
    setZonosError(null);
    setInstallProgress({
      step: 1,
      total: 8,
      message: 'Starting installation...',
      detail: 'Initializing installer'
    });
    
    const result = await window.electronAPI?.zonosAutoInstall?.();
    
    if (!result?.success) {
      setZonosInstallStatus('error');
      setZonosError({
        title: 'Failed to Start Installer',
        message: result?.error || 'Could not start the installation process.',
        needsRestart: false
      });
    }
  };

  const handleCancelInstall = async () => {
    await window.electronAPI?.zonosCancelInstall?.();
    setZonosInstallStatus('idle');
    setInstallProgress(null);
  };

  // Switch Tier
  const handleTierChange = (mode) => {
    setTierMode(mode);
    setConnectionStatus('disconnected');
    setZonosError(null);
    setTimeout(() => testConnection(), 500);
  };

  // Download Handler
  const handleDownload = async (voice) => {
    setDownloadingVoices(p => ({...p, [voice.id]: true}));
    try {
       const res = await window.electronAPI?.downloadVoiceModel?.({
          name: voice.id,
          urlOnnx: voice.urlOnnx,
          urlJson: voice.urlJson
       });
       if (res?.success) {
          setDownloadedVoices(p => ({...p, [voice.id]: true}));
          loadSettings();
          setModelPath(res.path);
          saveSetting('modelPath', res.path);
       }
    } catch (e) {
       console.error("Download failed", e);
    } finally {
       setDownloadingVoices(p => ({...p, [voice.id]: false}));
    }
  };

  const saveSetting = (key, val) => {
     const current = JSON.parse(localStorage.getItem('settings') || '{}');
     const updated = { ...current, [key]: val };
     localStorage.setItem('settings', JSON.stringify(updated));
     window.electronAPI?.saveSettings?.(updated);
  };

  // Calculate progress percentage
  const progressPercent = installProgress 
    ? Math.round((installProgress.step / installProgress.total) * 100)
    : 0;

  return (
    <TutorialLayout
      title={t.tutorials.voice?.title || "Voice Setup"}
      subtitle={tierMode === 'premium' ? "Zonos (Premium AI Voice)" : "Piper TTS (Lightweight)"}
      icon={tierMode === 'premium' ? "✨" : "🗣️"}
      iconColor={tierMode === 'premium' ? "bg-amber-500/20" : "bg-cyan-500/20"}
      steps={tierMode === 'premium' ? 3 : 4}
      currentStep={currentStep}
      connectionStatus={connectionStatus}
      headerGradient={tierMode === 'premium' ? "from-amber-950/30 to-rose-950/30" : "from-cyan-950/30 to-blue-950/30"}
      onClose={onClose}
      footerContent={
        <div className="flex bg-zinc-900/50 p-1 rounded-xl border border-white/10 mr-auto">
            <button
               onClick={() => handleTierChange('standard')}
               className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  tierMode === 'standard' ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/20' : 'text-zinc-500 hover:text-zinc-300'
               }`}
            >
               Standard (Piper)
            </button>
            <button
               onClick={() => handleTierChange('premium')}
               className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  tierMode === 'premium' ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' : 'text-zinc-500 hover:text-zinc-300'
               }`}
            >
               Premium (Zonos)
            </button>
        </div>
      }
    >
       {/* STANDARD MODE STEPS */}
       {tierMode === 'standard' && (
          <div className="space-y-6">
             {/* Step 1: Install */}
             <div className={`rocket-card glass p-1 border rounded-2xl ${currentStep===1 ? 'border-cyan-500/50' : 'border-white/5 opacity-50'}`}>
                 <div className="bg-zinc-900/50 p-5 rounded-xl flex gap-4">
                     <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center font-bold text-cyan-300">1</div>
                     <div className="flex-1">
                        <h3 className="font-bold text-lg text-white mb-2">{t.tutorials.voice?.step1Title || "Run One-Click Installer"}</h3>
                        <p className="text-sm text-zinc-400 mb-4">Installs Piper TTS automatically. No manual setup needed.</p>
                        <div className="flex gap-3">
                           <button 
                              onClick={() => window.electronAPI?.runToolScript?.('install_piper.bat')}
                              className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-bold flex items-center gap-2"
                           >
                              Run Installer 🚀
                           </button>
                           {currentStep === 1 && <button onClick={()=>setCurrentStep(2)} className="text-sm underline text-zinc-500 hover:text-white">Next Step</button>}
                        </div>
                     </div>
                 </div>
             </div>

             {/* Step 2: Download Voices */}
             <div className={`rocket-card glass p-1 border rounded-2xl ${currentStep===2 ? 'border-cyan-500/50' : 'border-white/5 opacity-50'}`}>
                 <div className="bg-zinc-900/50 p-5 rounded-xl">
                     <div className="flex items-center gap-4 mb-4">
                        <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center font-bold text-cyan-300">2</div>
                        <h3 className="font-bold text-lg text-white">Select Voice Model</h3>
                     </div>
                     
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                        {voiceOptions.map(voice => {
                           const isDownloaded = localModels.some(m => m.name.includes(voice.id)) || downloadedVoices[voice.id];
                           return (
                              <div key={voice.id} className="p-3 bg-zinc-950/50 border border-white/5 rounded-lg flex items-center justify-between group hover:border-cyan-500/30 transition-all">
                                 <div>
                                    <h4 className="font-bold text-sm text-zinc-200 flex items-center gap-2">
                                       <span className="text-lg">{voice.flag}</span> {voice.name}
                                    </h4>
                                    <p className="text-xs text-zinc-500">{voice.gender} • {voice.quality}</p>
                                 </div>
                                 <button
                                    onClick={() => handleDownload(voice)}
                                    disabled={isDownloaded || downloadingVoices[voice.id]}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                                       isDownloaded 
                                       ? 'bg-green-500/20 text-green-300' 
                                       : 'bg-zinc-800 hover:bg-cyan-600 hover:text-white text-zinc-400'
                                    }`}
                                 >
                                    {isDownloaded ? <Check size={14}/> : <Download size={14}/>}
                                    {isDownloaded ? 'Ready' : downloadingVoices[voice.id] ? '...' : 'Get'}
                                 </button>
                              </div>
                           )
                        })}
                     </div>
                     {currentStep === 2 && <button onClick={()=>setCurrentStep(3)} className="mt-4 w-full py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm text-zinc-300">Finished Downloading? Next →</button>}
                 </div>
             </div>
             
             {/* Step 3: Configure */}
             {currentStep >= 3 && (
                 <div className="rocket-card glass p-5 border border-cyan-500/50 rounded-2xl">
                     <h3 className="font-bold text-white mb-4">Step 3: Configuration & Path</h3>
                     <div className="bg-black/40 p-4 rounded-xl border border-white/5 mb-4">
                        <label className="text-xs text-zinc-500 uppercase font-bold mb-2 block">Voice Model Path:</label>
                        <select 
                           value={modelPath}
                           onChange={(e) => {
                              setModelPath(e.target.value);
                              saveSetting('modelPath', e.target.value);
                           }}
                           className="w-full bg-zinc-900 border border-white/10 rounded-lg p-2 text-sm text-white focus:border-cyan-500 outline-none"
                        >
                           <option value="">Select a downloaded voice...</option>
                           {localModels.map(m => (
                              <option key={m.path} value={m.path}>{m.name.replace('.onnx','')}</option>
                           ))}
                        </select>
                     </div>
                     
                     <button
                        onClick={async () => {
                           const langCode = modelPath?.split('-')?.[0]?.replace('_','-') || 'en_US';
                           const phrase = testPhrases[langCode.replace('-','_')] || testPhrases['en_US'];
                           const result = await window.electronAPI?.generateSpeech?.({ 
                              text: phrase, 
                              piperPath: piperPath, 
                              modelPath: modelPath 
                           });
                           if (!result?.success) {
                              console.error('[TestVoice] Failed:', result?.error);
                           }
                        }}
                        disabled={connectionStatus !== 'connected' || !modelPath}
                        className={`w-full py-3 rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2 ${
                            connectionStatus === 'connected' && modelPath
                            ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:opacity-90' 
                            : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                        }`}
                     >
                        🔊 Test Selected Voice
                     </button>
                     {connectionStatus === 'connected' && (
                        <p className="text-xs text-green-400 mt-2 text-center">✅ Piper Ready</p>
                     )}
                 </div>
             )}
          </div>
       )}

       {/* PREMIUM MODE - TRUE ONE-CLICK INSTALLER */}
       {tierMode === 'premium' && (
          <div className="space-y-6">
             <div className="bg-gradient-to-br from-amber-500/10 to-transparent p-4 rounded-xl border border-amber-500/20 mb-6">
                <div className="flex items-start gap-3">
                   <Star className="text-amber-400 shrink-0" fill="currentColor" size={20} />
                   <div>
                      <h4 className="font-bold text-white">Zonos - The Future of AI Voice</h4>
                      <p className="text-sm text-amber-200/80 mt-1">
                         Ultra-realistic emotion support, cloning, and high-fidelity output. Requires ~4GB VRAM.
                      </p>
                   </div>
                </div>
             </div>
             
             {/* One-Click Zonos Setup */}
             <div className={`p-6 bg-zinc-900/50 rounded-xl border ${
                zonosStatus === 'connected' 
                  ? 'border-green-500/30 bg-green-500/5' 
                  : zonosInstallStatus === 'error'
                  ? 'border-red-500/30 bg-red-500/5'
                  : 'border-amber-500/30'
             }`}>
                <div className="flex items-center gap-4 mb-4">
                   <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      zonosStatus === 'connected' 
                        ? 'bg-green-500/20 text-green-400' 
                        : zonosInstallStatus === 'installing'
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-amber-500/20 text-amber-400'
                   }`}>
                      {zonosStatus === 'connected' ? (
                        <Check size={24} />
                      ) : zonosInstallStatus === 'installing' ? (
                        <Loader2 size={24} className="animate-spin" />
                      ) : (
                        <Power size={24} />
                      )}
                   </div>
                   <div className="flex-1">
                      <h4 className="font-bold text-white text-lg">
                        {zonosStatus === 'connected' 
                          ? 'Zonos is Running!' 
                          : zonosInstallStatus === 'installing'
                          ? (installProgress?.message || 'Installing...')
                          : 'Zonos Voice Engine'}
                      </h4>
                      <p className={`text-sm ${
                        zonosStatus === 'connected' 
                          ? 'text-green-400' 
                          : zonosInstallStatus === 'error'
                          ? 'text-red-400'
                          : 'text-zinc-400'
                      }`}>
                        {zonosStatus === 'connected' 
                          ? '✅ Server running on http://localhost:7860'
                          : zonosInstallStatus === 'installing'
                          ? (installProgress?.detail || 'Please wait...')
                          : zonosInstalled 
                            ? 'Installed but not running'
                            : 'Not installed'
                        }
                      </p>
                   </div>
                   {zonosInstallStatus === 'installing' && (
                      <button
                         onClick={handleCancelInstall}
                         className="px-3 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-all flex items-center gap-2"
                         title="Cancel Installation"
                      >
                         <XCircle size={18} />
                         <span className="text-sm font-medium">Cancel</span>
                      </button>
                   )}
                </div>

                {/* Progress bar for installation */}
                {zonosInstallStatus === 'installing' && installProgress && (
                   <div className="mb-4">
                      <div className="flex justify-between text-xs text-zinc-400 mb-2">
                         <span>Step {installProgress.step} of {installProgress.total}</span>
                         <span>{progressPercent}%</span>
                      </div>
                      <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
                         <div 
                            className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-500 ease-out"
                            style={{ width: `${progressPercent}%` }}
                         />
                      </div>
                      <div className="flex items-center justify-between mt-3">
                         <p className="text-xs text-zinc-500">
                            This may take 10-20 minutes on first run
                         </p>
                         <button
                            onClick={() => setShowLog(!showLog)}
                            className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1"
                         >
                            <FileText size={12} />
                            {showLog ? 'Hide Log' : 'Show Log'}
                         </button>
                      </div>
                      
                      {/* Log display */}
                      {showLog && (
                         <div className="mt-3 p-3 bg-black/50 rounded-lg border border-white/5">
                            <pre className="text-xs text-zinc-400 font-mono max-h-32 overflow-y-auto custom-scrollbar">
                               {installLog || 'Waiting for log output...'}
                            </pre>
                         </div>
                      )}
                   </div>
                )}

                {/* Error display */}
                {zonosError && (
                   <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                      <div className="flex items-start gap-3">
                         <AlertCircle className="text-red-400 shrink-0 mt-0.5" size={18} />
                         <div className="flex-1">
                            <h5 className="font-bold text-red-300">{zonosError.title}</h5>
                            <p className="text-sm text-red-200/80 mt-1">{zonosError.message}</p>
                            {zonosError.needsRestart && (
                               <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded">
                                  <p className="text-sm font-bold text-amber-300">⚠️ RESTART REQUIRED</p>
                                  <p className="text-xs text-amber-200/70 mt-1">
                                    Please restart your computer, then click "Install & Start" again.
                                  </p>
                               </div>
                            )}
                         </div>
                      </div>
                   </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-3">
                   {zonosStatus === 'connected' ? (
                      <button 
                         onClick={testZonosConnection}
                         className="flex-1 px-4 py-3 bg-green-500/20 text-green-300 rounded-lg font-bold border border-green-500/30 hover:bg-green-500/30 transition-all"
                      >
                         ✅ Refresh Connection
                      </button>
                   ) : (
                      <button 
                         onClick={handleAutoInstallZonos}
                         disabled={zonosInstallStatus === 'installing'}
                         className={`flex-1 px-4 py-3 rounded-lg font-bold transition-all ${
                            zonosInstallStatus === 'installing'
                            ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
                            : 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-lg shadow-amber-500/20'
                         }`}
                      >
                         {zonosInstallStatus === 'installing' ? (
                            <span className="flex items-center justify-center gap-2">
                               <Loader2 size={18} className="animate-spin" />
                               Installing... {progressPercent}%
                            </span>
                         ) : zonosError?.needsRestart ? (
                            '🔄 Retry After Restart'
                         ) : zonosInstalled ? (
                            '🚀 Start Zonos Server'
                         ) : (
                            '🚀 One-Click Install & Start'
                         )}
                      </button>
                   )}
                   
                   <button 
                      onClick={testZonosConnection}
                      disabled={zonosInstallStatus === 'installing'}
                      className="px-4 py-3 bg-zinc-800 text-zinc-300 rounded-lg font-medium border border-white/10 hover:bg-zinc-700 transition-all"
                      title="Check Connection"
                   >
                      <RefreshCw size={18} />
                   </button>
                </div>

                {/* Success state extras */}
                {zonosStatus === 'connected' && (
                   <div className="mt-4 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                      <p className="text-sm text-green-300">
                        🎉 <strong>Zonos is ready!</strong> You can now generate ultra-realistic AI voices.
                      </p>
                      <p className="text-xs text-green-200/70 mt-1">
                        The server is running at http://localhost:7860
                      </p>
                   </div>
                )}
             </div>

             {/* Manual fallback */}
             {zonosInstallStatus === 'error' && !zonosError?.needsRestart && (
                <div className="text-center">
                   <button 
                      onClick={() => window.electronAPI?.runToolScript?.('zonos_smart_installer.bat')}
                      className="text-sm text-zinc-500 hover:text-zinc-300 underline"
                   >
                      Open Manual Installer (with terminal)
                   </button>
                </div>
             )}
          </div>
       )}

    </TutorialLayout>
  );
}
