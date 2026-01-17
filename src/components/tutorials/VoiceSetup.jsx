// ARIA v1.0 RELEASE - Voice/TTS Setup Tutorial (Rose Noir Theme + Multi-Voice Grid)
import React, { useState, useEffect } from 'react';
import { Download, Check, X, RefreshCw, Volume2, Play, FolderOpen, Loader } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

export default function VoiceSetup({ onClose, onTest }) {
  const { t } = useLanguage();
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [testing, setTesting] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedVoice, setSelectedVoice] = useState('en_US-amy-medium');
  const [playingVoice, setPlayingVoice] = useState(null);
  const [audioElement, setAudioElement] = useState(null);
  const [downloadingVoices, setDownloadingVoices] = useState({});
  const [downloadedVoices, setDownloadedVoices] = useState({});
  const [piperPath, setPiperPath] = useState('');
  const [modelPath, setModelPath] = useState('');
  const [lastDownloadedPath, setLastDownloadedPath] = useState('');
  const [installedModels, setInstalledModels] = useState([]);
  const [localModels, setLocalModels] = useState([]); // FIX 2: Local models for dropdown

  // PART 2 FIX: Verified voice list with correct IDs and qualities
  const voiceOptions = [
    {
      id: 'en_US-amy-medium',
      name: 'Amy (US)',
      lang: 'English',
      language: 'English',
      gender: 'Female',
      quality: 'medium',
      urlOnnx: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx',
      urlJson: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx.json'
    },
    {
      id: 'en_US-ryan-medium',
      name: 'Ryan (US)',
      lang: 'English',
      language: 'English',
      gender: 'Male',
      quality: 'medium',
      urlOnnx: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/medium/en_US-ryan-medium.onnx',
      urlJson: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/medium/en_US-ryan-medium.onnx.json'
    },
    {
      id: 'en_GB-alba-medium',
      name: 'Alba (UK)',
      lang: 'English',
      language: 'English',
      gender: 'Female',
      quality: 'medium',
      urlOnnx: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alba/medium/en_GB-alba-medium.onnx',
      urlJson: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alba/medium/en_GB-alba-medium.onnx.json'
    },
    {
      id: 'de_DE-thorsten-medium',
      name: 'Thorsten (DE)',
      lang: 'Deutsch',
      language: 'Deutsch',
      gender: 'Male',
      quality: 'medium',
      urlOnnx: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx',
      urlJson: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx.json'
    },
    {
      id: 'de_DE-eva_k-x_low',
      name: 'Eva (DE)',
      lang: 'Deutsch',
      language: 'Deutsch',
      gender: 'Female',
      quality: 'x_low',
      urlOnnx: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/eva_k/x_low/de_DE-eva_k-x_low.onnx',
      urlJson: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/eva_k/x_low/de_DE-eva_k-x_low.onnx.json'
    },
    {
      id: 'fr_FR-siwis-medium',
      name: 'Siwis (FR)',
      lang: 'Français',
      language: 'Français',
      gender: 'Female',
      quality: 'medium',
      urlOnnx: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/siwis/medium/fr_FR-siwis-medium.onnx',
      urlJson: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/siwis/medium/fr_FR-siwis-medium.onnx.json'
    },
    {
      id: 'es_ES-mls_10246-low',
      name: 'MLS (ES)',
      lang: 'Español',
      language: 'Español',
      gender: 'Female',
      quality: 'low',
      urlOnnx: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/mls_10246/low/es_ES-mls_10246-low.onnx',
      urlJson: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/mls_10246/low/es_ES-mls_10246-low.onnx.json'
    },
    {
      id: 'zh_CN-huayan-medium',
      name: 'Huayan (CN)',
      lang: '中文',
      language: 'Chinese',
      gender: 'Female',
      quality: 'medium',
      urlOnnx: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/zh/zh_CN/huayan/medium/zh_CN-huayan-medium.onnx',
      urlJson: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/zh/zh_CN/huayan/medium/zh_CN-huayan-medium.onnx.json'
    }
  ];

  // PART 2 FIX: Native language preview text function
  const getPreviewText = (voice) => {
    const langCode = voice.id.split('_')[0]; // Extract language code (de, es, fr, ja, zh)
    
    const previewTexts = {
      'de': 'Dies ist eine Vorschau der Stimme.',
      'es': 'Esta es una vista previa de la voz.',
      'fr': 'Ceci est un aperçu de la voix.',
      'ja': 'これは音声のプレビューです。',
      'zh': '这是语音预览。'
    };
    
    return previewTexts[langCode] || 'This is a preview of the voice.';
  };

  // PART 2 FIX: Beautify dropdown - map filename to clean name
  const getDisplayNameForModel = (modelPath) => {
    if (!modelPath) return 'Select a model...';
    
    // Extract model ID from path (e.g., "en_US-amy-medium.onnx" -> "en_US-amy-medium")
    const fileName = modelPath.split(/[/\\]/).pop() || '';
    const modelId = fileName.replace('.onnx', '');
    
    // Find matching voice in options
    const voice = voiceOptions.find(v => v.id === modelId);
    
    if (voice) {
      return `${voice.name} - ${voice.language} (${voice.quality})`;
    }
    
    // Fallback: return raw filename
    return fileName || modelPath;
  };

  // Load settings on mount
  useEffect(() => {
    testConnection();
    
    // Load paths from localStorage
    const loadedSettings = JSON.parse(localStorage.getItem('settings') || '{}');
    setPiperPath(loadedSettings.piperPath || '');
    setModelPath(loadedSettings.modelPath || '');
    
    // FIX 4: Load installed models for smart detection
    const loadInstalledModels = async () => {
      try {
        const result = await window.electronAPI?.getLocalVoiceModels?.();
        if (result?.success && result?.models) {
          setInstalledModels(result.models.map(m => m.name));
          // FIX 2: Also set localModels for dropdown
          setLocalModels(result.models);
        }
      } catch (error) {
        console.error('[VoiceSetup] Error loading installed models:', error);
      }
    };
    loadInstalledModels();
  }, []);

  // Auto-fill model path when download completes
  useEffect(() => {
    if (lastDownloadedPath && currentStep === 3) {
      setModelPath(lastDownloadedPath);
    }
  }, [lastDownloadedPath, currentStep]);

  // FIX 4: Sync path inputs with global settings changes
  useEffect(() => {
    const handleSettingsChange = () => {
      const loadedSettings = JSON.parse(localStorage.getItem('settings') || '{}');
      setPiperPath(loadedSettings.piperPath || '');
      setModelPath(loadedSettings.modelPath || '');
    };
    
    // Listen for storage events (cross-tab sync)
    window.addEventListener('storage', handleSettingsChange);
    // Poll for changes (in case same window)
    const interval = setInterval(handleSettingsChange, 1000);
    
    return () => {
      window.removeEventListener('storage', handleSettingsChange);
      clearInterval(interval);
    };
  }, []);

  const testConnection = async () => {
    setTesting(true);
    try {
      // FIX 4: Use CLI check instead of network fetch
      const result = await window.electronAPI?.testVoice?.();
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
        onTest?.('http://127.0.0.1:5000');
      }
    } finally {
      setTesting(false);
    }
  };

  const handleDownloadModel = async (voiceId) => {
    const voice = voiceOptions.find(v => v.id === voiceId);
    if (!voice || !voice.urlOnnx || !voice.urlJson) return;

    setDownloadingVoices(prev => ({ ...prev, [voiceId]: true }));

    try {
      const result = await window.electronAPI?.downloadVoiceModel?.({
        name: voiceId,
        urlOnnx: voice.urlOnnx,
        urlJson: voice.urlJson
      });

      if (result?.success && result?.path) {
        setDownloadedVoices(prev => ({ ...prev, [voiceId]: true }));
        setLastDownloadedPath(result.path);
        // FIX 4: Refresh installed models list after download
        const refreshResult = await window.electronAPI?.getLocalVoiceModels?.();
        if (refreshResult?.success && refreshResult?.models) {
          setInstalledModels(refreshResult.models.map(m => m.name));
        }
        // Auto-fill model path if we're on step 4 or will go there
        if (currentStep >= 3) {
          setModelPath(result.path);
          // Save to settings
          const loadedSettings = JSON.parse(localStorage.getItem('settings') || '{}');
          const updatedSettings = { ...loadedSettings, modelPath: result.path };
          localStorage.setItem('settings', JSON.stringify(updatedSettings));
          await window.electronAPI?.saveSettings?.(updatedSettings);
        }
        alert('✅ Model downloaded successfully!\n\nPath: ' + result.path);
      } else {
        alert('❌ Download failed.\n\nError: ' + (result?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error downloading model:', error);
      alert('❌ Error downloading model: ' + error.message);
    } finally {
      setDownloadingVoices(prev => {
        const updated = { ...prev };
        delete updated[voiceId];
        return updated;
      });
    }
  };

  const playVoicePreview = async (voiceId) => {
    const voice = voiceOptions.find(v => v.id === voiceId);
    if (!voice) return;

    // Stop current audio if playing
    if (audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
    }

    setPlayingVoice(voiceId);

    try {
      // Load settings to get paths
      const loadedSettings = JSON.parse(localStorage.getItem('settings') || '{}');
      const currentPiperPath = loadedSettings.piperPath || piperPath;

      if (!currentPiperPath) {
        alert('⚠️ Please configure Piper executable path first.');
        setPlayingVoice(null);
        return;
      }

      // Check downloaded model path first (from lastDownloadedPath or settings)
      let modelPathToUse = loadedSettings.modelPath || modelPath;

      // If model was just downloaded, check the download directory
      if (!modelPathToUse) {
        // Models are downloaded to userData/voice-models/ by IPC handler
        // We can construct the path if we know the model name
        const piperDir = currentPiperPath.substring(0, Math.max(currentPiperPath.lastIndexOf('\\'), currentPiperPath.lastIndexOf('/')));
        modelPathToUse = `${piperDir}/${voiceId}.onnx`;
      }

      // Check if model file exists locally
      const checkResult = await window.electronAPI?.checkFileExists?.(modelPathToUse);
      
      if (!checkResult?.exists) {
        alert('⚠️ Please download the model first to preview.\n\nModel path: ' + modelPathToUse);
        setPlayingVoice(null);
        return;
      }

      // PART 2 FIX: Use native language preview text
      const previewText = getPreviewText(voice);
      
      // Generate preview audio using local Piper
      const result = await window.electronAPI?.generateSpeech?.({
        text: previewText,
        piperPath: currentPiperPath,
        modelPath: modelPathToUse
      });

      if (result?.success && result?.audioData) {
        const audio = new Audio(result.audioData);
        setAudioElement(audio);

        audio.onended = () => {
          setPlayingVoice(null);
          setAudioElement(null);
        };

        audio.onerror = () => {
          console.error('Failed to play audio preview');
          setPlayingVoice(null);
          setAudioElement(null);
        };

        await audio.play();
      } else {
        alert('❌ Failed to generate preview.\n\nError: ' + (result?.error || 'Unknown error'));
        setPlayingVoice(null);
      }
    } catch (error) {
      console.error('Error playing voice preview:', error);
      alert('❌ Error playing preview: ' + error.message);
      setPlayingVoice(null);
      setAudioElement(null);
    }
  };

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioElement) {
        audioElement.pause();
        audioElement.currentTime = 0;
      }
    };
  }, [audioElement]);

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <div className="bg-zinc-950 border border-rose-500/30 rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden glass">
        {/* Header */}
        <div className="p-6 border-b border-white/5 bg-gradient-to-r from-cyan-950/30 to-blue-950/30">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                <Volume2 size={24} className="text-cyan-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">{t.tutorials?.voice?.title || 'Voice/TTS Setup'}</h2>
                <p className="text-sm text-zinc-400">{t.tutorials?.voice?.subtitle || 'Piper TTS - Local Voice Generation'}</p>
              </div>
            </div>

            {/* BLOCK 7.0: Traffic Light - FIX 4: CLI Status */}
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
              <span className="text-xs text-zinc-500 uppercase tracking-wider">{t.tutorials.progress}</span>
              <span className="text-xs text-zinc-400">{currentStep} / 5</span>
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-600 to-blue-600 transition-all duration-500"
                style={{ width: `${(currentStep / 5) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh] space-y-6">
          {/* Step 1 */}
          <div className={`glass rounded-xl p-5 border transition-all ${
            currentStep === 1 ? 'border-cyan-500/50' : 'border-white/5'
          }`}>
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                currentStep > 1 ? 'bg-green-500/20 text-green-300' : 'bg-cyan-500/20 text-cyan-300'
              }`}>
                {currentStep > 1 ? <Check size={20} /> : '1'}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white mb-2">{t.tutorials?.voice?.step1Title || '📥 Download Piper TTS'}</h3>
                <p className="text-sm text-zinc-300 mb-4">
                  {t.tutorials?.voice?.step1Desc || 'Visit github.com/rhasspy/piper/releases and download the latest version for your OS.'}
                </p>
                <button
                  onClick={() => openLink('https://github.com/rhasspy/piper/releases')}
                  className="w-full py-3 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-xl text-cyan-300 font-medium flex items-center justify-center gap-2 transition-all"
                >
                  <Download size={18} />
                  <span>{t.tutorials.download} Piper TTS</span>
                </button>
                {currentStep === 1 && (
                  <button
                    onClick={() => setCurrentStep(2)}
                    className="w-full mt-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-white text-sm transition-all"
                  >
                    {t.tutorials.next} →
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className={`glass rounded-xl p-5 border transition-all ${
            currentStep === 2 ? 'border-cyan-500/50' : 'border-white/5'
          }`}>
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                currentStep > 2 ? 'bg-green-500/20 text-green-300' : 'bg-cyan-500/20 text-cyan-300'
              }`}>
                {currentStep > 2 ? <Check size={20} /> : '2'}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white mb-2">{t.tutorials?.voice?.step2Title || '💾 Download Voice Model'}</h3>
                <p className="text-sm text-zinc-300 mb-3">
                  {t.tutorials?.voice?.step2Desc || 'Download both the .onnx model file and its .json config file from HuggingFace.'}
                </p>
                {t.tutorials?.voice?.step2Warning && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mt-3">
                    <p className="text-xs text-amber-200">
                      {t.tutorials?.voice?.step2Warning}
                    </p>
                  </div>
                )}
                {currentStep === 2 && (
                  <button
                    onClick={() => setCurrentStep(3)}
                    className="w-full mt-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-white text-sm transition-all"
                  >
                    {t.tutorials.next} →
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* PART 2 FIX: Step 3 - Configure Paths (moved from Step 4) */}
          <div className={`glass rounded-xl p-5 border transition-all ${
            currentStep === 3 ? 'border-cyan-500/50' : 'border-white/5'
          }`}>
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                currentStep > 3 ? 'bg-green-500/20 text-green-300' : 'bg-cyan-500/20 text-cyan-300'
              }`}>
                {currentStep > 3 ? <Check size={20} /> : '3'}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white mb-2">{t.tutorials?.voice?.step3Title || '🚀 Configure Paths'}</h3>
                <p className="text-sm text-zinc-300 mb-4">
                  {t.tutorials?.voice?.step3Desc || 'In Settings, set the path to piper.exe and select your .onnx model file.'}
                </p>

                <div className="space-y-4 mb-4">
                  {/* Piper Executable Path */}
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Piper Executable Path (.exe)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={piperPath}
                        onChange={async (e) => {
                          const newPath = e.target.value;
                          setPiperPath(newPath);
                          // Save immediately
                          const loadedSettings = JSON.parse(localStorage.getItem('settings') || '{}');
                          const updatedSettings = { ...loadedSettings, piperPath: newPath };
                          localStorage.setItem('settings', JSON.stringify(updatedSettings));
                          await window.electronAPI?.saveSettings?.(updatedSettings);
                        }}
                        placeholder="e.g. C:\\Piper\\piper.exe"
                        className="flex-1 bg-zinc-900/80 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                      />
                      <button
                        onClick={async () => {
                          const path = await window.electronAPI?.selectFile?.([
                            { name: 'Executables', extensions: ['exe'] }
                          ]);
                          if (path) {
                            setPiperPath(path);
                            const loadedSettings = JSON.parse(localStorage.getItem('settings') || '{}');
                            const updatedSettings = { ...loadedSettings, piperPath: path };
                            localStorage.setItem('settings', JSON.stringify(updatedSettings));
                            await window.electronAPI?.saveSettings?.(updatedSettings);
                          }
                        }}
                        className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/50 rounded-lg transition-all"
                        title="Browse for piper.exe"
                      >
                        <FolderOpen size={16} className="text-zinc-400" />
                      </button>
                    </div>
                  </div>

                  {/* Voice Model Path - FIX 2: Dropdown instead of text input */}
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Voice Model Path (.onnx)</label>
                    <div className="flex gap-2 items-center">
                      <select
                        value={modelPath}
                        onChange={async (e) => {
                          const selectedPath = e.target.value;
                          if (selectedPath === '__browse__') {
                            // Browse option
                            const path = await window.electronAPI?.selectFile?.([
                              { name: 'ONNX Model', extensions: ['onnx'] }
                            ]);
                            if (path) {
                              setModelPath(path);
                              const loadedSettings = JSON.parse(localStorage.getItem('settings') || '{}');
                              const updatedSettings = { ...loadedSettings, modelPath: path };
                              localStorage.setItem('settings', JSON.stringify(updatedSettings));
                              await window.electronAPI?.saveSettings?.(updatedSettings);
                            }
                            return;
                          }
                          setModelPath(selectedPath);
                          // Save immediately via IPC
                          const loadedSettings = JSON.parse(localStorage.getItem('settings') || '{}');
                          const updatedSettings = { ...loadedSettings, modelPath: selectedPath };
                          localStorage.setItem('settings', JSON.stringify(updatedSettings));
                          await window.electronAPI?.saveSettings?.(updatedSettings);
                        }}
                        className="flex-1 bg-zinc-800 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                      >
                        <option value="">Select a model...</option>
                        {localModels.map((model) => (
                          <option key={model.path} value={model.path}>
                            {getDisplayNameForModel(model.path)}
                          </option>
                        ))}
                        <option value="__browse__">Browse...</option>
                      </select>
                      {/* FIX 2: Show active badge if model matches global setting */}
                      {modelPath && (() => {
                        const loadedSettings = JSON.parse(localStorage.getItem('settings') || '{}');
                        const isActive = loadedSettings.modelPath === modelPath;
                        return isActive ? (
                          <span className="px-2 py-1 bg-green-500/20 border border-green-500/30 rounded text-xs text-green-300 flex items-center gap-1">
                            <Check size={12} />
                            Active
                          </span>
                        ) : null;
                      })()}
                    </div>
                    {lastDownloadedPath && (
                      <p className="text-xs text-green-400 mt-1">
                        💡 Last downloaded model: {lastDownloadedPath}
                      </p>
                    )}
                  </div>
                </div>

                {currentStep === 3 && (
                  <button
                    onClick={() => setCurrentStep(4)}
                    className="w-full mt-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-white text-sm transition-all"
                  >
                    {t.tutorials.next} →
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* PART 2 FIX: Step 4 - Select Voice Model */}
          <div className={`glass rounded-xl p-5 border transition-all ${
            currentStep === 4 ? 'border-cyan-500/50' : 'border-white/5'
          }`}>
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                currentStep > 4 ? 'bg-green-500/20 text-green-300' : 'bg-cyan-500/20 text-cyan-300'
              }`}>
                {currentStep > 4 ? <Check size={20} /> : '4'}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white mb-2">{t.tutorials?.voice?.downloadModel || 'Download Model'}</h3>
                <p className="text-sm text-zinc-300 mb-4">
                  {t.tutorials?.voice?.preview || 'Preview Voices'}
                </p>

                {/* BLOCK 7.0: Multi-Voice Selection Grid */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {voiceOptions.map((voice) => {
                    // FIX 4: Check if model is already installed
                    const isInstalled = installedModels.includes(voice.id);
                    
                    return (
                    <div
                      key={voice.id}
                      onClick={() => setSelectedVoice(voice.id)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        selectedVoice === voice.id
                          ? 'bg-cyan-500/20 border-cyan-500/50'
                          : 'bg-zinc-900/50 border-white/5 hover:border-cyan-500/30'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-white text-sm">{voice.name}</span>
                        <div className="flex gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              playVoicePreview(voice.id);
                            }}
                            disabled={playingVoice === voice.id}
                            className="p-1 rounded bg-cyan-500/20 hover:bg-cyan-500/30 transition-all disabled:opacity-50"
                            title="Preview"
                          >
                            <Play size={12} className="text-cyan-300" />
                          </button>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              await handleDownloadModel(voice.id);
                            }}
                            disabled={downloadingVoices[voice.id] || isInstalled || downloadedVoices[voice.id]}
                            className="p-1 rounded bg-green-500/20 hover:bg-green-500/30 transition-all disabled:opacity-50"
                            title={isInstalled || downloadedVoices[voice.id] ? "Downloaded ✅" : "Download Model"}
                          >
                            {downloadingVoices[voice.id] ? (
                              <Loader size={12} className="text-green-300 animate-spin" />
                            ) : (isInstalled || downloadedVoices[voice.id]) ? (
                              <Check size={12} className="text-green-300" />
                            ) : (
                              <Download size={12} className="text-green-300" />
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-zinc-400">
                        <span>{voice.lang}</span>
                        <span>•</span>
                        <span>{voice.gender}</span>
                        {/* FIX 4: Show "Downloaded ✅" badge if installed */}
                        {isInstalled && (
                          <>
                            <span>•</span>
                            <span className="text-green-400 font-medium">Downloaded ✅</span>
                          </>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>

                {currentStep === 4 && (
                  <button
                    onClick={() => setCurrentStep(5)}
                    className="w-full mt-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-white text-sm transition-all"
                  >
                    {t.tutorials.next} →
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Step 5: Test Configuration */}
          <div className={`glass rounded-xl p-5 border transition-all ${
            currentStep === 5 ? 'border-cyan-500/50' : 'border-white/5'
          }`}>
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                connectionStatus === 'connected' ? 'bg-green-500/20 text-green-300' : 'bg-cyan-500/20 text-cyan-300'
              }`}>
                {connectionStatus === 'connected' ? <Check size={20} /> : '5'}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white mb-2">{t.tutorials?.voice?.step4Title || '✅ Test Voice'}</h3>
                <p className="text-sm text-zinc-300 mb-4">
                  {t.tutorials?.voice?.step4Desc || "Click 'Test Piper Configuration' to verify everything works."}
                </p>
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                  <p className="text-xs text-green-200">
                    ✅ {t.tutorials?.voice?.step4Title || '✅ Test Voice'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/5 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 glass hover:bg-cyan-500/10 border border-white/10 hover:border-cyan-500/30 rounded-xl text-zinc-300 hover:text-cyan-300 font-medium transition-all"
          >
            {t.tutorials.close}
          </button>
        </div>
      </div>
    </div>
  );
}
