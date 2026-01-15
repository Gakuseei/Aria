// ARIA v1.0 RELEASE - Settings (Rose Noir Theme)

import React, { useState, useEffect } from 'react';
import { fetchOllamaModels, testOllamaConnection } from '../lib/api';
import { Globe, Zap, Moon, RefreshCw, Check, X, User, Image, Volume2, HelpCircle, FolderOpen } from 'lucide-react';
import CustomDropdown from './CustomDropdown';
import ImageGenSetup from './tutorials/ImageGenSetup';
import VoiceSetup from './tutorials/VoiceSetup';
import { useLanguage } from '../context/LanguageContext';

export default function Settings({ settings, onSettingChange, onClose }) {
  const { t, language, setLanguage } = useLanguage();

  // VERSION 9.5: All settings now come from props, no local state

  // UI State
  const [availableModels, setAvailableModels] = useState([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showTutorial, setShowTutorial] = useState(null);
  const [availableVoiceModels, setAvailableVoiceModels] = useState([]);
  const [isGoldMode, setIsGoldMode] = useState(false);

  // v1.0 FIX: Feature activation states (only activate after successful test)
  const [imageGenVerified, setImageGenVerified] = useState(false);
  const [voiceVerified, setVoiceVerified] = useState(false);

  // v1.0: HARD SYNC FIX - Force localStorage update on EVERY setting change
  useEffect(() => {
    console.log('[v1.0 Settings Hard Sync] Writing ALL settings to localStorage:', settings);
    localStorage.setItem('settings', JSON.stringify(settings));
  }, [settings]);

  // v1.0: Check Gold Mode on mount and when theme changes
  useEffect(() => {
    const checkGoldMode = () => {
      const isSupporter = localStorage.getItem('isSupporter') === 'true';
      const goldTheme = localStorage.getItem('goldThemeEnabled') === 'true';
      setIsGoldMode(isSupporter && goldTheme);
    };
    
    // Initial check
    checkGoldMode();
    
    // Listen for gold-theme-changed event
    window.addEventListener('gold-theme-changed', checkGoldMode);
    
    return () => {
      window.removeEventListener('gold-theme-changed', checkGoldMode);
    };
  }, []);

  // FIX 3: IPC-based voice status listener
  useEffect(() => {
    const cleanup = window.electronAPI?.onVoiceStatusChanged?.((newValue) => {
      // Update settings when voice status changes via IPC
      if (settings.voiceEnabled !== newValue) {
        const updatedSettings = { ...settings, voiceEnabled: newValue };
        localStorage.setItem('settings', JSON.stringify(updatedSettings));
        onSettingChange('voiceEnabled', newValue);
      }
    });
    return cleanup;
  }, [settings, onSettingChange]);

  // FIX 2: Settings updated listener (sync from backend)
  useEffect(() => {
    const cleanup = window.electronAPI?.onSettingsUpdated?.((newSettings) => {
      // Update local state when settings change via IPC
      Object.keys(newSettings).forEach(key => {
        if (settings[key] !== newSettings[key]) {
          onSettingChange(key, newSettings[key]);
        }
      });
      localStorage.setItem('settings', JSON.stringify(newSettings));
    });
    return cleanup;
  }, [settings, onSettingChange]);

  // Language options
  const availableLanguages = [
    { code: 'en', name: 'English' },
    { code: 'de', name: 'Deutsch' },
    { code: 'es', name: 'Español' },
    { code: 'fr', name: 'Français' },
    { code: 'it', name: 'Italiano' },
    { code: 'pt', name: 'Português' },
    { code: 'ru', name: 'Русский' },
    { code: 'ja', name: '日本語' },
    { code: 'zh', name: '中文' },
    { code: 'ko', name: '한국어' },
    { code: 'ar', name: 'العربية' }
  ];

  // FIX 2: Load local voice models on mount
  useEffect(() => {
    const loadVoiceModels = async () => {
      try {
        const result = await window.electronAPI?.getLocalVoiceModels?.();
        if (result?.success && result?.models) {
          setAvailableVoiceModels(result.models);
        }
      } catch (error) {
        console.error('[Settings] Error loading voice models:', error);
      }
    };
    loadVoiceModels();
  }, []);

  // VERSION 9.5: Auto-detect Ollama models on mount
  useEffect(() => {
    handleLoadModels();
  }, []);

  // ============================================================================
  // LOAD OLLAMA MODELS (v8.1 FIX: Called on mount)
  // ============================================================================

  const handleLoadModels = async () => {
    setLoadingModels(true);
    try {
      const models = await fetchOllamaModels(settings.ollamaUrl);
      if (models && models.length > 0) {
        setAvailableModels(models);
        console.log('[v9.5 Settings] ✅ Found', models.length, 'models');

        // v9.2 FIX: Auto-select hermes3 if available, otherwise first model
        const hasHermes3 = models.some(m => m.includes('hermes3') || m.includes('hermes-3'));
        if (hasHermes3 && (!settings.ollamaModel || settings.ollamaModel === 'llama3')) {
          const hermes3Model = models.find(m => m.includes('hermes3') || m.includes('hermes-3'));
          onSettingChange('ollamaModel', hermes3Model);
          console.log('[v9.5 Settings] 🎯 Auto-selected Hermes 3:', hermes3Model);
        } else if (!settings.ollamaModel || settings.ollamaModel === 'llama3') {
          onSettingChange('ollamaModel', models[0]);
          console.log('[v9.5 Settings] 🎯 Auto-selected model:', models[0]);
        }
      } else {
        setAvailableModels([]);
        console.warn('[v9.5 Settings] ⚠️ No models found');
      }
    } catch (error) {
      console.error('[v9.5 Settings] ❌ Error loading models:', error);
      setAvailableModels([]);
    } finally {
      setLoadingModels(false);
    }
  };

  // ============================================================================
  // TEST CONNECTION
  // ============================================================================

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);

    try {
      const result = await testOllamaConnection(settings.ollamaUrl);
      setTestResult(result);
    } catch (error) {
      setTestResult({ success: false, message: `❌ Error: ${error.message}` });
    } finally {
      setTestingConnection(false);
    }
  };

  // ============================================================================
  // v8.1 FIX: CLOSE BUTTON HANDLER
  // ============================================================================

  const handleClose = () => {
    console.log('[v8.1 Settings] 🚪 Closing settings...');
    if (onClose && typeof onClose === 'function') {
      onClose();
    } else {
      console.error('[v8.1 Settings] ❌ onClose prop not provided or not a function');
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div
      className="h-full bg-gradient-to-br from-zinc-900 via-zinc-900 to-black text-white p-6"
      style={{ overflowY: 'auto' }}
    >
      <div className="max-w-4xl mx-auto">
        {/* v1.0 ROSE NOIR: Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-lg shadow-rose-500/30">
              <Zap size={22} className="text-white" />
            </div>
            <div>
              <h1 className={`text-2xl font-bold ${
                isGoldMode 
                  ? 'bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_0_25px_rgba(251,191,36,0.4)]'
                  : 'text-white'
              }`}>
                {t.settings.title}
              </h1>
              <p className="text-sm text-zinc-500 mt-0.5">v1.0 Release • Local Only</p>
            </div>
          </div>

          {/* Close button with Rose accent */}
          <button
            onClick={handleClose}
            className="px-5 py-2.5 glass hover:bg-rose-500/10 hover:border-rose-500/30 border border-white/10 rounded-xl transition-all duration-200 text-zinc-300 hover:text-rose-300 font-medium flex items-center gap-2"
          >
            <X size={16} strokeWidth={1.5} />
            <span>{t.settings.close}</span>
          </button>
        </div>

        {/* Settings Sections */}
        <div className="space-y-6">
          {/* v1.0 ROSE NOIR: USER SETTINGS */}
          <section className="glass rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                isGoldMode ? 'bg-amber-500/20' : 'bg-emerald-500/20'
              }`}>
                <User size={18} className={isGoldMode ? 'text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.3)]' : 'text-emerald-400'} />
              </div>
              <h2 className="text-lg font-semibold text-white">{t.settings.userSettings}</h2>
            </div>

            <div className="space-y-4">
              {/* User Name */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">{t.settings.userName}</label>
                <input
                  type="text"
                  value={settings.userName}
                  onChange={(e) => onSettingChange('userName', e.target.value)}
                  className={`w-full bg-zinc-900/80 border border-zinc-700/50 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 transition-all ${
                    isGoldMode ? 'focus:ring-amber-500/50 focus:border-amber-500/50' : 'focus:ring-rose-500/50 focus:border-rose-500/50'
                  }`}
                  placeholder={t.settings.userName}
                />
                <p className="text-xs text-zinc-500 mt-1.5">
                  {t.settings.yourNameDisplayed}
                </p>
              </div>

              {/* User Gender & Anatomy - BLOCK 7.2: No z-index needed with Portal */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">{t.settings.userGender}</label>
                <CustomDropdown
                  value={settings.userGender}
                  onChange={(e) => onSettingChange('userGender', e.target.value)}
                  options={[
                    { value: 'male', label: t.gender?.male || 'Male' },
                    { value: 'female', label: t.gender?.female || 'Female' },
                    { value: 'nonbinary', label: t.gender?.nonbinary || 'Non-Binary' },
                    { value: 'futa', label: t.gender?.futa || 'Futa/Trans' }
                  ]}
                />
                <p className="text-xs text-zinc-500 mt-1.5">
                  {t.settings.definesAnatomy}
                </p>
              </div>
            </div>
          </section>

          {/* v1.0 ROSE NOIR: OLLAMA SETTINGS */}
          <section className="glass rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                isGoldMode ? 'bg-amber-500/20' : 'bg-amber-500/20'
              }`}>
                <Zap size={18} className={isGoldMode ? 'text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.3)]' : 'text-amber-400'} />
              </div>
              <h2 className="text-lg font-semibold text-white">{t.settings.ollamaConfig}</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">{t.settings.ollamaUrl}</label>
                <input
                  type="text"
                  value={settings.ollamaUrl}
                  onChange={(e) => onSettingChange('ollamaUrl', e.target.value)}
                  className={`w-full bg-zinc-900/80 border border-zinc-700/50 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 transition-all ${
                    isGoldMode ? 'focus:ring-amber-500/50 focus:border-amber-500/50' : 'focus:ring-rose-500/50 focus:border-rose-500/50'
                  }`}
                  placeholder="http://127.0.0.1:11434"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-zinc-400">{t.settings.model}</label>
                  <button
                    onClick={handleLoadModels}
                    disabled={loadingModels}
                    className={`text-xs flex items-center gap-1.5 disabled:opacity-50 transition-colors ${
                      isGoldMode ? 'text-amber-400 hover:text-amber-300' : 'text-rose-400 hover:text-rose-300'
                    }`}
                  >
                    <RefreshCw size={12} className={loadingModels ? 'animate-spin' : ''} />
                    {loadingModels ? t.settings.loadingModels : t.settings.refreshModels}
                  </button>
                </div>

                {availableModels.length > 0 ? (
                  <CustomDropdown
                    value={settings.ollamaModel}
                    onChange={(e) => onSettingChange('ollamaModel', e.target.value)}
                    options={availableModels.map(model => ({
                      value: model,
                      label: model
                    }))}
                  />
                ) : (
                  <input
                    type="text"
                    value={settings.ollamaModel}
                    onChange={(e) => onSettingChange('ollamaModel', e.target.value)}
                    className={`w-full bg-zinc-900/80 border border-zinc-700/50 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 transition-all ${
                    isGoldMode ? 'focus:ring-amber-500/50 focus:border-amber-500/50' : 'focus:ring-rose-500/50 focus:border-rose-500/50'
                  }`}
                    placeholder="hermes3"
                  />
                )}
                <p className="text-xs text-zinc-500 mt-1.5">
                  {loadingModels 
                    ? (t.settings.detectingModels || 'Detecting models...')
                    : availableModels.length > 0 
                      ? (t.settings.foundModels ? t.settings.foundModels.replace('{count}', availableModels.length) : `Found ${availableModels.length} models`)
                      : (t.settings.modelsAutoDetected || 'Models auto-detected on startup')}
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-zinc-400">{t.settings.temperature}</label>
                  <span className={`text-sm font-mono px-2 py-0.5 rounded ${
                    isGoldMode ? 'text-amber-300 bg-amber-500/10' : 'text-rose-300 bg-rose-500/10'
                  }`}>{settings.temperature.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.05"
                  value={settings.temperature}
                  onChange={(e) => onSettingChange('temperature', parseFloat(e.target.value))}
                  className={`w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer ${
                    isGoldMode ? 'accent-amber-500' : 'accent-rose-500'
                  }`}
                />
                <p className="text-xs text-zinc-500 mt-1.5">
                  {t.settings.lowerMoreFocused}
                </p>
              </div>

              {/* Test Connection */}
              <div className="pt-4 border-t border-white/5">
                <button
                  onClick={handleTestConnection}
                  disabled={testingConnection}
                  className="w-full py-3 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-xl transition-all duration-200 text-cyan-300 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {testingConnection ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      <span>{t.common.loading}</span>
                    </>
                  ) : (
                    <>
                      <Check size={16} />
                      <span>{t.settings.testConnection}</span>
                    </>
                  )}
                </button>

                {testResult && (
                  <div className={`mt-3 p-3 rounded-lg border ${
                    testResult.success
                      ? 'bg-green-500/10 border-green-500/30 text-green-300'
                      : 'bg-red-500/10 border-red-500/30 text-red-300'
                  }`}>
                    <div className="flex items-center gap-2">
                      {testResult.success ? (
                        <Check size={16} />
                      ) : (
                        <X size={16} />
                      )}
                      <span className="text-sm">{testResult.message}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* v1.0 ROSE NOIR: IMAGE GENERATION SETTINGS */}
          <section className="glass rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                isGoldMode ? 'bg-amber-500/20' : 'bg-purple-500/20'
              }`}>
                <Image size={18} className={isGoldMode ? 'text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.3)]' : 'text-purple-400'} />
              </div>
              <h2 className="text-lg font-semibold text-white">{t.settings.imageGen}</h2>
            </div>

            <div className="space-y-4">
              {/* v1.0 UX FIX: Click OFF → Opens Tutorial directly */}
              <div className="flex items-center justify-between p-3 bg-zinc-700/20 rounded-lg">
                <div>
                  <span className="text-sm text-zinc-300">{t.settings.enableImageGen}</span>
                  {!settings.imageGenEnabled && (
                    <p className="text-xs text-rose-400 mt-0.5">{t.settings.clickOffForTutorial}</p>
                  )}
                </div>
                <button
                  onClick={() => {
                    if (settings.imageGenEnabled) {
                      // Deactivate (simple toggle off)
                      onSettingChange('imageGenEnabled', false);
                      setImageGenVerified(false);
                    } else {
                      // Activate → Open Tutorial first
                      setShowTutorial('imageGen');
                    }
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    settings.imageGenEnabled
                      ? (isGoldMode ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-purple-500/20 text-purple-300 border border-purple-500/30')
                      : 'bg-zinc-700/50 text-zinc-400 border border-zinc-600/30 hover:border-purple-500/50'
                  }`}
                >
                  {settings.imageGenEnabled ? 'ON' : 'OFF'}
                </button>
              </div>

              {settings.imageGenEnabled && (
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    {t.settings.imageGenApiUrl}
                  </label>
                  <input
                    type="text"
                    value={settings.imageGenUrl}
                    onChange={(e) => onSettingChange('imageGenUrl', e.target.value)}
                    className="w-full bg-black border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                    placeholder="http://127.0.0.1:7860"
                  />
                  <p className="text-xs text-zinc-500 mt-1">
                    {t.settings.automatic1111Endpoint}
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* v1.0 ROSE NOIR: VOICE/TTS SETTINGS */}
          <section className="glass rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                isGoldMode ? 'bg-amber-500/20' : 'bg-cyan-500/20'
              }`}>
                <Volume2 size={18} className={isGoldMode ? 'text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.3)]' : 'text-cyan-400'} />
              </div>
              <h2 className="text-lg font-semibold text-white">{t.settings.voice}</h2>
            </div>

            <div className="space-y-4">
              {/* v1.0 UX FIX: Click OFF → Opens Tutorial directly */}
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-zinc-700/20 rounded-lg">
                  <div>
                    <span className="text-sm text-zinc-300">{t.settings.enableVoice}</span>
                    {!settings.voiceEnabled && (
                      <p className="text-xs text-zinc-400 mt-0.5">{t.settings.clickOnToConfigure}</p>
                    )}
                  </div>
                  <button
                    onClick={async () => {
                      const newValue = !settings.voiceEnabled;
                      // FIX 3: Save via IPC (broadcasts automatically)
                      const updatedSettings = { ...settings, voiceEnabled: newValue };
                      localStorage.setItem('settings', JSON.stringify(updatedSettings));
                      await window.electronAPI?.saveSettings?.(updatedSettings);
                      // Optimistic update
                      onSettingChange('voiceEnabled', newValue);
                      if (settings.voiceEnabled) {
                        setVoiceVerified(false);
                      }
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                      settings.voiceEnabled
                        ? (isGoldMode ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30')
                        : 'bg-zinc-700/50 text-zinc-400 border border-zinc-600/30 hover:border-blue-500/50'
                    }`}
                  >
                    {settings.voiceEnabled ? 'ON' : 'OFF'}
                  </button>
                </div>

                {/* Tutorial Link - Always visible */}
                <button
                  onClick={() => setShowTutorial('voice')}
                  className="w-full px-4 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-sm text-cyan-300 transition-all flex items-center justify-center gap-2"
                >
                  <HelpCircle size={16} />
                  <span>{t.settings.openSetupTutorial}</span>
                </button>
              </div>

              {settings.voiceEnabled && (
                <div className="mt-4 space-y-4 p-4 bg-zinc-900/50 rounded-lg border border-white/5">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">
                      {t.settings.piperExePath}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={settings.piperPath || ''}
                        onChange={(e) => {
                          onSettingChange('piperPath', e.target.value);
                          // Save immediately to preserve path
                          const updatedSettings = { ...settings, piperPath: e.target.value };
                          window.electronAPI.saveSettings(updatedSettings);
                        }}
                        placeholder="e.g. C:\Piper\piper.exe"
                        className="flex-1 bg-black border border-white/10 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                      <button
                        onClick={async () => {
                          const path = await window.electronAPI.selectFile([
                            { name: 'Executables', extensions: ['exe'] }
                          ]);
                          if (path) {
                            onSettingChange('piperPath', path);
                            // Immediate disk save
                            const updatedSettings = { ...settings, piperPath: path };
                            await window.electronAPI.saveSettings(updatedSettings);
                          }
                        }}
                        className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-white/10 rounded transition-all"
                        title={t.settings.browseForPiper}
                      >
                        <FolderOpen size={16} className="text-zinc-400" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">
                      {t.settings.voiceModelPath}
                    </label>
                    <CustomDropdown
                      value={settings.modelPath || ''}
                      onChange={(e) => {
                        const selectedPath = e.target.value;
                        onSettingChange('modelPath', selectedPath);
                        const updatedSettings = { ...settings, modelPath: selectedPath };
                        window.electronAPI.saveSettings(updatedSettings);
                      }}
                      options={[
                        ...availableVoiceModels.map(model => ({
                          value: model.path,
                          label: model.name
                        })),
                        { value: '__browse__', label: 'Browse...' }
                      ]}
                      className="w-full"
                    />
                        {settings.modelPath === '__browse__' && (
                      <button
                        onClick={async () => {
                          const path = await window.electronAPI.selectFile([
                            { name: 'ONNX Model', extensions: ['onnx'] }
                          ]);
                          if (path) {
                            onSettingChange('modelPath', path);
                            const updatedSettings = { ...settings, modelPath: path };
                            await window.electronAPI.saveSettings(updatedSettings);
                          }
                        }}
                        className="mt-2 w-full px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-white/10 rounded transition-all text-sm text-zinc-300"
                      >
                        <FolderOpen size={16} className="inline mr-2" />
                        {t.settings.selectModelFile}
                      </button>
                    )}
                  </div>

                  <div className="text-xs text-rose-400/80">
                    {t.settings.requiredPaths}
                  </div>
                  <button
                    onClick={async () => {
                      if (!settings.piperPath || !settings.modelPath) {
                        alert('❌ ' + t.settings.requiredPaths);
                        return;
                      }

                      try {
                        const result = await window.electronAPI.generateSpeech({
                          text: 'Piper configuration successful',
                          piperPath: settings.piperPath,
                          modelPath: settings.modelPath
                        });

                        if (result?.success && result?.audioData) {
                          setVoiceVerified(true);
                          // Play audio in renderer process
                          const audio = new Audio(result.audioData);
                          audio.volume = settings.voiceVolume ?? 1.0;
                          await audio.play();
                          alert('✅ Voice test successful! Audio playback started.');
                        } else {
                          alert('❌ Voice test failed.\n\nError: ' + (result?.error || 'Unknown error'));
                        }
                      } catch (error) {
                        alert('❌ Voice test failed.\n\nError: ' + error.message);
                      }
                    }}
                    className="w-full px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg text-sm text-blue-300 transition-all"
                  >
                    {t.settings.testPiperConfig}
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* BLOCK 8.0: LANGUAGE SETTINGS - Global i18n */}
          <section className="glass rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                isGoldMode ? 'bg-amber-500/20' : 'bg-blue-500/20'
              }`}>
                <Globe size={18} className={isGoldMode ? 'text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.3)]' : 'text-blue-400'} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">{t.settings.language}</h2>
                <p className="text-xs text-zinc-500 mt-0.5">{t.settings.changesUiText}</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">{t.settings.uiLanguage}</label>
              <CustomDropdown
                value={language}
                onChange={(e) => {
                  const newLang = e.target.value;
                  setLanguage(newLang);
                  onSettingChange('preferredLanguage', newLang);
                  console.log('[v1.0 Settings] Language synced:', newLang);
                }}
                options={[
                  { value: 'en', label: 'English 🇺🇸' },
                  { value: 'de', label: 'Deutsch 🇩🇪' },
                  { value: 'es', label: 'Español 🇪🇸' },
                  { value: 'cn', label: '中文 🇨🇳' },
                  { value: 'fr', label: 'Français 🇫🇷' },
                  { value: 'it', label: 'Italiano 🇮🇹' },
                  { value: 'pt', label: 'Português 🇵🇹' },
                  { value: 'ru', label: 'Русский 🇷🇺' },
                  { value: 'ja', label: '日本語 🇯🇵' },
                  { value: 'ko', label: '한국어 🇰🇷' }
                ]}
              />
              <p className="text-xs text-zinc-500 mt-2">
                {t.settings.changesUiText}
              </p>
            </div>
          </section>

          {/* v1.0 ROSE NOIR: APPEARANCE */}
          <section className="glass rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                isGoldMode ? 'bg-amber-500/20' : 'bg-rose-500/20'
              }`}>
                <Moon size={18} className={isGoldMode ? 'text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.3)]' : 'text-rose-400'} />
              </div>
              <h2 className="text-lg font-semibold text-white">{t.settings.appearance}</h2>
            </div>

            <div className="space-y-4">
              {/* v1.0 ROSE NOIR: Global UI Scale */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">{t.settings.globalUIScale}</label>
                <div className="grid grid-cols-3 gap-3">
                  {['small', 'medium', 'large'].map((size) => (
                    <button
                      key={size}
                      onClick={() => onSettingChange('fontSize', size)}
                      className={`p-3 rounded-xl border transition-all duration-200 ${
                        settings.fontSize === size
                          ? (isGoldMode 
                              ? 'bg-amber-500/20 border-amber-500/50 text-white shadow-lg shadow-amber-500/10'
                              : 'bg-rose-500/20 border-rose-500/50 text-white shadow-lg shadow-rose-500/10')
                          : (isGoldMode
                              ? 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:border-amber-500/30 hover:text-zinc-200'
                              : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:border-rose-500/30 hover:text-zinc-200')
                      }`}
                    >
                      <div className="font-semibold">
                        {size === 'small' ? t.settings.small : size === 'medium' ? t.settings.medium : t.settings.large}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggle Settings */}
              <div className="space-y-3">
                {/* v1.0: Passion System Toggle REMOVED - Now in ChatInterface Header */}

                <div className="flex items-center justify-between p-3 bg-zinc-700/20 rounded-lg">
                  <span className="text-sm text-zinc-300">{t.settings.autoSave}</span>
                  <button
                    onClick={() => onSettingChange('autoSave', !settings.autoSave)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                      settings.autoSave
                        ? (isGoldMode ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-green-500/20 text-green-300 border border-green-500/30')
                        : 'bg-zinc-700/50 text-zinc-400 border border-zinc-600/30'
                    }`}
                  >
                    {settings.autoSave ? 'ON' : 'OFF'}
                  </button>
                </div>

                {/* VERSION 9.5: AUFGABE 2 - Replaced "Sound Effects" with "Smart Suggestions" */}
                <div className="flex items-center justify-between p-3 bg-zinc-700/20 rounded-lg">
                  <div className="flex flex-col">
                    <span className="text-sm text-zinc-300">{t.settings.smartSuggestions}</span>
                    <span className="text-xs text-zinc-500 mt-0.5">{t.settings.aiGeneratedQuickReplies}</span>
                  </div>
                  <button
                    onClick={() => onSettingChange('smartSuggestionsEnabled', !settings.smartSuggestionsEnabled)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                      settings.smartSuggestionsEnabled
                        ? (isGoldMode ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30')
                        : 'bg-zinc-700/50 text-zinc-400 border border-zinc-600/30'
                    }`}
                  >
                    {settings.smartSuggestionsEnabled ? 'ON' : 'OFF'}
                  </button>
                </div>

                <div className="flex items-center justify-between p-3 bg-zinc-700/20 rounded-lg">
                  <span className="text-sm text-zinc-300">{t.settings.animations}</span>
                  <button
                    onClick={() => onSettingChange('animationsEnabled', !settings.animationsEnabled)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                      settings.animationsEnabled
                        ? (isGoldMode ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-green-500/20 text-green-300 border border-green-500/30')
                        : 'bg-zinc-700/50 text-zinc-400 border border-zinc-600/30'
                    }`}
                  >
                    {settings.animationsEnabled ? 'ON' : 'OFF'}
                  </button>
                </div>

                <div className="flex items-center justify-between p-3 bg-zinc-700/20 rounded-lg">
                  <span className="text-sm text-zinc-300">{t.settings.oledMode}</span>
                  <button
                    onClick={() => onSettingChange('oledMode', !settings.oledMode)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                      settings.oledMode
                        ? (isGoldMode ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-purple-500/20 text-purple-300 border border-purple-500/30')
                        : 'bg-zinc-700/50 text-zinc-400 border border-zinc-600/30'
                    }`}
                  >
                    {settings.oledMode ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* v1.0 ROSE NOIR: Auto-save notice */}
          <div className="glass rounded-2xl p-4 border border-emerald-500/20">
            <div className="flex items-center gap-3 text-emerald-300">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <Check size={16} />
              </div>
              <span className="text-sm font-medium">
                {t.settings.allChangesAutoSaved}
              </span>
            </div>
          </div>
        </div>

        {/* BLOCK 7.0: New Tutorial Components */}
        {showTutorial === 'imageGen' && (
          <ImageGenSetup
            onClose={() => setShowTutorial(null)}
            onTest={async (url) => {
              try {
                const result = await window.electronAPI?.testImageGen?.(url);
                if (result?.success) {
                  setImageGenVerified(true);
                  onSettingChange('imageGenEnabled', true);
                  setShowTutorial(null);
                  alert('✅ Verbindung erfolgreich! Image Generation wurde aktiviert.');
                } else {
                  alert('❌ Verbindung fehlgeschlagen. Stelle sicher, dass die WebUI läuft!\n\nFehler: ' + (result?.error || 'Unbekannt'));
                }
              } catch (error) {
                alert('❌ Fehler beim Testen der Verbindung: ' + error.message);
              }
            }}
          />
        )}

        {showTutorial === 'voice' && (
          <VoiceSetup
            onClose={() => setShowTutorial(null)}
            onTest={async (url) => {
              try {
                const result = await window.electronAPI?.testVoice?.(url);
                if (result?.success) {
                  setVoiceVerified(true);
                  onSettingChange('voiceEnabled', true);
                  setShowTutorial(null);
                  alert('✅ Verbindung erfolgreich! Voice wurde aktiviert.');
                } else {
                  alert('❌ Verbindung fehlgeschlagen. Stelle sicher, dass Piper läuft!\n\nFehler: ' + (result?.error || 'Unbekannt'));
                }
              } catch (error) {
                alert('❌ Fehler beim Testen der Verbindung: ' + error.message);
              }
            }}
          />
        )}
      </div>
    </div>
  );
}