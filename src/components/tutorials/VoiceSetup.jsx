// ARIA v1.0 - Voice Setup Tutorial (Refactored Premium)
import React, { useState, useEffect } from 'react';
import { Download, Check, RefreshCw, Play, Volume2, FolderOpen, Zap, Star } from 'lucide-react';
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
  }, []);

  const loadSettings = async () => {
    const loaded = JSON.parse(localStorage.getItem('settings') || '{}');
    setPiperPath(loaded.piperPath || '');
    setModelPath(loaded.modelPath || '');

    const result = await window.electronAPI?.getLocalVoiceModels?.();
    if (result?.success) {
      setLocalModels(result.models);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      if (tierMode === 'premium') {
         // Zonos connection check
         await testZonosConnection();
      } else {
         // Piper connection check
         const result = await window.electronAPI?.testVoice?.();
         setConnectionStatus(result?.success ? 'connected' : 'disconnected');
         if (result?.success) {
            // AUTO-FIX: Save detected path if returned
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
        const response = await fetch('http://localhost:7860/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: 'test' }),
            signal: AbortSignal.timeout(2000)
        });
        if(response.ok) {
            setZonosStatus('connected');
            setConnectionStatus('connected');
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

  // Switch Tier
  const handleTierChange = (mode) => {
    setTierMode(mode);
    setConnectionStatus('disconnected'); // Reset status until tested
    setTimeout(() => testConnection(), 500); // Auto-test after switch
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
          loadSettings(); // Refresh local models
          // Auto-set as active
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
                           // Pass all required params
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

       {/* PREMIUM MODE STEPS */}
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
             
             {/* Step 1 Premium */}
             <div className="flex items-center gap-4 p-4 bg-zinc-900/50 rounded-xl border border-white/5">
                <div className="w-10 h-10 bg-amber-500/20 text-amber-400 rounded-full flex items-center justify-center font-bold">1</div>
                <div className="flex-1">
                   <h4 className="font-bold text-white">Install Zonos</h4>
                   <button 
                      onClick={() => window.electronAPI?.runToolScript?.('install_zonos.bat')}
                      className="mt-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-bold"
                   >
                      Run Premium Installer
                   </button>
                </div>
             </div>
             
             {/* Step 2 Premium */}
             <div className="flex items-center gap-4 p-4 bg-zinc-900/50 rounded-xl border border-white/5">
                <div className="w-10 h-10 bg-amber-500/20 text-amber-400 rounded-full flex items-center justify-center font-bold">2</div>
                <div className="flex-1">
                   <h4 className="font-bold text-white">Start Authenticator</h4>
                   <p className="text-xs text-zinc-400 mb-2">Must be running in background ("start_zonos.bat")</p>
                   <div className="flex gap-2 mb-2">
                       <button 
                          onClick={() => window.electronAPI?.runToolScript?.('start_zonos.bat')}
                          className="px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-lg text-sm font-bold flex-1"
                       >
                          Start Zonos Engine 🚀
                       </button>
                       <button 
                          onClick={testZonosConnection}
                          className={`px-4 py-2 border rounded-lg text-sm font-medium transition-all ${
                             zonosStatus === 'connected' 
                             ? 'bg-green-500/10 border-green-500/30 text-green-300' 
                             : 'bg-zinc-800 border-amber-500/30 text-amber-300 hover:bg-zinc-700'
                          }`}
                       >
                           {zonosStatus === 'connected' ? 'Connected' : 'Check'} 🔄
                       </button>
                   </div>
                   {zonosStatus === 'connected' && (
                       <p className="text-xs text-green-400 mt-2">Ready to speak!</p>
                   )}
                </div>
             </div>
          </div>
       )}

    </TutorialLayout>
  );
}
