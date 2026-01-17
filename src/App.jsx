import React, { useState, useEffect } from 'react';
import TitleBar from './components/TitleBar';
import MainMenu from './components/MainMenu';
import ModeSelection from './components/ModeSelection';
import CharacterSelect from './components/CharacterSelect';
import ChatInterface from './components/ChatInterface';
import CreativeWriting from './components/CreativeWriting';
import LoadGame from './components/LoadGame';
import Settings from './components/Settings';
import CharacterCreator from './components/CharacterCreator';
import DebugConsole from './components/DebugConsole'; // VERSION 9.3
import CustomDropdown from './components/CustomDropdown';
import { useLanguage } from './context/LanguageContext';
import { loadSettings, testOllamaConnection, autoDetectAndSetModel, fetchOllamaModels } from './lib/api';

// App views
const VIEWS = {
  MAIN_MENU: 'main_menu',
  MODE_SELECT: 'mode_select',
  CHARACTER_SELECT: 'character_select',
  CHARACTER_CREATOR: 'character_creator',
  CHAT_INTERFACE: 'chat_interface',
  CREATIVE_WRITING: 'creative_writing',
  LOAD_GAME: 'load_game',
  SETTINGS: 'settings',
};

// Game modes
export const GAME_MODES = {
  CREATIVE_WRITING: 'creative_writing',
  CHARACTER_CHAT: 'character_chat',
};

// VERSION 8.1: IDIOT-PROOF ONBOARDING MODAL
function OnboardingModal({ isOpen, onRetry }) {
  const { language, setLanguage, t } = useLanguage();
  const [currentStep, setCurrentStep] = useState(1);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const steps = [
    {
      number: 1,
      title: t.tutorials.ollamaStep1Title,
      description: t.tutorials.ollamaStep1Desc,
      action: t.tutorials.ollamaStep1Button,
      link: "https://ollama.com/download"
    },
    {
      number: 2,
      title: t.tutorials.ollamaStep2Title,
      description: t.tutorials.ollamaStep2Desc,
      action: null
    },
    {
      number: 3,
      title: t.tutorials.ollamaStep3Title,
      description: t.tutorials.ollamaStep3Desc,
      action: null
    },
    {
      number: 4,
      title: t.tutorials.ollamaStep4Title,
      description: t.tutorials.ollamaStep4Desc,
      command: "ollama pull hermes3",
      action: null,
      warning: t.tutorials.ollamaStep3Note
    },
    {
      number: 5,
      title: t.tutorials.ollamaStep4Title,
      description: t.tutorials.ollamaStep4Desc,
      action: "test"
    }
  ];

  const handleOpenLink = () => {
    if (window.electronAPI?.openExternal) {
      window.electronAPI.openExternal('https://ollama.com/download');
    }
  };

  const handleCopyCommand = () => {
    navigator.clipboard.writeText('ollama pull hermes3');
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const result = await testOllamaConnection();

      if (result.success) {
        // HERMES 3 VERIFICATION: Check if hermes3 is installed
        const models = await fetchOllamaModels();
        const hasHermes3 = models.some(model =>
          model.includes('hermes3') || model.includes('hermes-3')
        );

        if (hasHermes3) {
          setTestResult({ success: true, message: t.tutorials.ollamaConnected });
          setTimeout(() => {
            onRetry();
          }, 2000);
        } else {
          setTestResult({
            success: false,
            message: `${t.tutorials.ollamaError}\n\n${t.tutorials.ollamaStep3Desc}\n\n${t.common.loading}: ${models.length > 0 ? models.join(', ') : t.common.error}`
          });
        }
      } else {
        setTestResult({
          success: false,
          message: `${t.tutorials.ollamaDisconnected}\n\n${result.error}\n\n${t.tutorials.ollamaStep2Desc}`
        });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: `❌ ${t.common.error}: ${error.message}\n\n${t.tutorials.ollamaError}`
      });
    } finally {
      setTesting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <div className="bg-zinc-900 border-2 border-red-500/50 rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-zinc-800 bg-gradient-to-r from-red-950/50 to-rose-950/50">
          <div className="flex items-center justify-between mb-2">
            {/* Left: Icon + Title */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-red-600/20 flex items-center justify-center">
                <span className="text-3xl">🚀</span>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">{t.tutorials.setupGuide}</h2>
                <p className="text-sm text-zinc-400">{t.mainMenu.footer}</p>
              </div>
            </div>
            
            {/* Right: Language Switcher */}
            <div className="w-48">
              <CustomDropdown
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                options={[
                  { value: 'en', label: '🇺🇸 English' },
                  { value: 'de', label: '🇩🇪 Deutsch' },
                  { value: 'es', label: '🇪🇸 Español' },
                  { value: 'cn', label: '🇨🇳 中文' },
                  { value: 'fr', label: '🇫🇷 Français' },
                  { value: 'it', label: '🇮🇹 Italiano' },
                  { value: 'pt', label: '🇵🇹 Português' },
                  { value: 'ru', label: '🇷🇺 Русский' },
                  { value: 'ja', label: '🇯🇵 日本語' },
                  { value: 'ko', label: '🇰🇷 한국어' },
                  { value: 'ar', label: '🇸🇦 العربية' },
                  { value: 'hi', label: '🇮🇳 हिंदी' },
                  { value: 'tr', label: '🇹🇷 Türkçe' }
                ]}
                className="border-2 border-transparent hover:border-rose-500/50 focus:border-rose-500"
              />
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="px-6 pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">{t.tutorials.progress}</span>
            <span className="text-xs text-zinc-400">{currentStep} / {steps.length}</span>
          </div>
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-red-600 to-rose-600 transition-all duration-500"
              style={{ width: `${(currentStep / steps.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          <div className="space-y-6">
            {steps.map((step, index) => (
              <div 
                key={step.number}
                className={`transition-all duration-300 ${
                  currentStep === step.number 
                    ? 'opacity-100 scale-100' 
                    : currentStep > step.number
                    ? 'opacity-50 scale-95'
                    : 'opacity-30 scale-95'
                }`}
              >
                <div className={`p-5 rounded-xl border-2 ${
                  currentStep === step.number
                    ? 'bg-red-900/20 border-red-500/50'
                    : currentStep > step.number
                    ? 'bg-green-900/20 border-green-500/30'
                    : 'bg-zinc-800/30 border-zinc-700/30'
                }`}>
                  <div className="flex items-start gap-4">
                    <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                      currentStep === step.number
                        ? 'bg-red-600 text-white'
                        : currentStep > step.number
                        ? 'bg-green-600 text-white'
                        : 'bg-zinc-700 text-zinc-400'
                    }`}>
                      {currentStep > step.number ? '✓' : step.number}
                    </div>

                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-white mb-2">{step.title}</h3>
                      <p className="text-sm text-zinc-300 leading-relaxed mb-3 whitespace-pre-line">
                        {step.description}
                      </p>

                      {step.command && (
                        <div className="bg-zinc-950/50 border border-zinc-700/50 rounded-lg p-3 mb-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-zinc-500 uppercase tracking-wider">{t.tutorials.download}:</span>
                            <button
                              onClick={handleCopyCommand}
                              className="px-3 py-1 rounded bg-zinc-700 text-white text-xs hover:bg-zinc-600 transition-colors"
                            >
                              📋 {t.chat.copy}
                            </button>
                          </div>
                          <code className="text-green-400 font-mono text-sm block">
                            {step.command}
                          </code>
                        </div>
                      )}

                      {step.warning && (
                        <div className="bg-amber-900/20 border border-amber-700/30 rounded-lg p-3 mb-3">
                          <p className="text-xs text-amber-200">
                            {step.warning}
                          </p>
                        </div>
                      )}

                      {step.action && step.action === 'test' && (
                        <button
                          onClick={handleTest}
                          disabled={testing}
                          className="w-full py-3 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 text-white font-semibold hover:from-red-500 hover:to-rose-500 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {testing ? (
                            <>
                              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              <span>{t.tutorials.ollamaTesting}</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                              </svg>
                              <span>{t.tutorials.testConnection}</span>
                            </>
                          )}
                        </button>
                      )}

                      {step.action && step.link && (
                        <button
                          onClick={handleOpenLink}
                          className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-500 transition-all flex items-center justify-center gap-2"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                          <span>{step.action}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {currentStep === step.number && index < steps.length - 1 && (
                  <div className="flex justify-end mt-4">
                    <button
                      onClick={() => setCurrentStep(currentStep + 1)}
                      className="px-6 py-2 rounded-lg bg-zinc-700 text-white hover:bg-zinc-600 transition-all flex items-center gap-2"
                    >
                      <span>{t.tutorials.next}</span>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Test Result */}
          {testResult && (
            <div className={`mt-6 p-4 rounded-xl border-2 ${
              testResult.success
                ? 'bg-green-900/20 border-green-500/50'
                : 'bg-red-900/20 border-red-500/50'
            }`}>
              <p className={`text-sm whitespace-pre-line ${
                testResult.success ? 'text-green-200' : 'text-red-200'
              }`}>
                {testResult.message}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p>
              {t.tutorials.helpFooter || 'Problems? Make sure to follow each step exactly. For questions: github.com/ollama/ollama'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [currentView, setCurrentView] = useState(VIEWS.MAIN_MENU);
  const [selectedMode, setSelectedMode] = useState(null);
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const [loadedSession, setLoadedSession] = useState(null);

  // VERSION 8.1: Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [ollamaReady, setOllamaReady] = useState(false);

  // VERSION 8.1: OLED Mode state
  const [oledModeActive, setOledModeActive] = useState(false);

  // VERSION 9.3: Animations state
  const [animationsActive, setAnimationsActive] = useState(true);

  // VERSION 9.3: Debug Console state
  const [showDebugConsole, setShowDebugConsole] = useState(false);

  // VERSION 9.4: Event Log & API Monitor state
  const [eventLog, setEventLog] = useState([]);
  const [lastApiResponseTime, setLastApiResponseTime] = useState(null);

  // VERSION 9.5: AUFGABE 4 - Enhanced API Monitor state
  const [lastResponseWords, setLastResponseWords] = useState(null);
  const [lastResponseTokens, setLastResponseTokens] = useState(null);
  const [lastApiModel, setLastApiModel] = useState(null);
  const [lastApiWPS, setLastApiWPS] = useState(null);

  // VERSION 9.5: CRITICAL FIX - Lifted Settings State (AUFGABE 1)
  const [settings, setSettings] = useState({
    ollamaUrl: 'http://127.0.0.1:11434',
    ollamaModel: 'hermes3',
    temperature: 0.85,
    userName: 'User',
    userGender: 'male',
    imageGenEnabled: false,
    imageGenUrl: 'http://127.0.0.1:7860',
    voiceEnabled: false,
    voiceUrl: 'http://127.0.0.1:5000',
    passionSystemEnabled: true,
    fontSize: 'medium',
    autoSave: true,
    smartSuggestionsEnabled: false, // AUFGABE 2: Replaced soundEnabled
    animationsEnabled: true,
    oledMode: false,
    preferredLanguage: 'en'
  });

  // Helper function to add events to log (max 10 entries)
  const addEventToLog = (eventType, message) => {
    const newEvent = {
      timestamp: new Date().toISOString(),
      type: eventType,
      message: message
    };
    setEventLog(prev => [newEvent, ...prev].slice(0, 10));
  };

  // VERSION 9.5: CRITICAL FIX - Load settings from localStorage on startup
  useEffect(() => {
    async function initializeApp() {
      // VERSION 9.5: Load settings from localStorage FIRST
      try {
        const stored = localStorage.getItem('settings');
        if (stored) {
          const loadedSettings = JSON.parse(stored);

          // Merge loaded settings with defaults to ensure all keys exist
          const mergedSettings = {
            ollamaUrl: loadedSettings.ollamaUrl || 'http://127.0.0.1:11434',
            ollamaModel: loadedSettings.ollamaModel || 'hermes3',
            temperature: loadedSettings.temperature || 0.85,
            userName: loadedSettings.userName || 'User',
            userGender: loadedSettings.userGender || 'male',
            imageGenEnabled: loadedSettings.imageGenEnabled || false,
            imageGenUrl: loadedSettings.imageGenUrl || 'http://127.0.0.1:7860',
            voiceEnabled: loadedSettings.voiceEnabled || false,
            voiceUrl: loadedSettings.voiceUrl || 'http://127.0.0.1:5000',
            passionSystemEnabled: loadedSettings.passionSystemEnabled !== false,
            fontSize: loadedSettings.fontSize || 'medium',
            autoSave: loadedSettings.autoSave !== false,
            // AUFGABE 2: Migrate soundEnabled to smartSuggestionsEnabled
            smartSuggestionsEnabled: loadedSettings.smartSuggestionsEnabled || false,
            animationsEnabled: loadedSettings.animationsEnabled !== false,
            oledMode: loadedSettings.oledMode || false,
            preferredLanguage: loadedSettings.preferredLanguage || 'en'
          };

          setSettings(mergedSettings);

          // Apply UI effects immediately
          applyUIScale(mergedSettings.fontSize);
          setOledModeActive(mergedSettings.oledMode);
          applyOledMode(mergedSettings.oledMode);
          setAnimationsActive(mergedSettings.animationsEnabled);
          applyAnimations(mergedSettings.animationsEnabled);

          if (mergedSettings.preferredLanguage) {
            const langContext = localStorage.getItem('language');
            if (langContext !== mergedSettings.preferredLanguage) {
              localStorage.setItem('language', mergedSettings.preferredLanguage);
              console.log('[v1.0 App Init] Synced LanguageContext:', langContext, '→', mergedSettings.preferredLanguage);
            }
          }

          console.log('[v9.5 App Init] ✅ Settings loaded from localStorage:', mergedSettings);
        } else {
          console.log('[v9.5 App Init] No stored settings, using defaults');
        }
      } catch (error) {
        console.error('[v9.5 App Init] ❌ Error loading settings:', error);
      }

      // VERSION 8.1: Check Ollama connection (NO API KEY!)
      console.log('[v8.1 Startup] Checking Ollama connection...');
      try {
        const ollamaTest = await testOllamaConnection();

        if (ollamaTest.success) {
          console.log('[v8.1 Startup] ✅ Ollama is ready!');
          setOllamaReady(true);
          setShowOnboarding(false);

          // VERSION 8.2: AUTO-DETECT AND SET MODEL
          console.log('[v8.2 Startup] 🔍 Auto-detecting Ollama model...');
          const autoDetectResult = await autoDetectAndSetModel();

          if (autoDetectResult.success) {
            if (autoDetectResult.changed) {
              console.log(`[v8.2 Startup] 🎯 Model auto-configured: ${autoDetectResult.model}`);
              // Reload settings to get the updated model
              const updatedSettings = await loadSettings();
              if (updatedSettings.success) {
                setSettings(updatedSettings.settings);
              }
            } else {
              console.log(`[v8.2 Startup] ✅ Model already configured: ${autoDetectResult.model}`);
            }
          } else {
            console.warn('[v8.2 Startup] ⚠️ No models found. User needs to install a model.');
          }
        } else {
          console.log('[v8.1 Startup] ❌ Ollama not detected, showing onboarding');
          setOllamaReady(false);
          setShowOnboarding(true);
        }
      } catch (error) {
        console.error('[v8.1 Startup] Ollama check failed:', error);
        setOllamaReady(false);
        setShowOnboarding(true);
      }
    }

    initializeApp();
  }, []);

  // VERSION 9.3: Keyboard shortcut for Debug Console (Ctrl+D)
  useEffect(() => {
    const handleKeyPress = (e) => {
      // Ctrl+D (or Cmd+D on Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        setShowDebugConsole(prev => !prev);
        console.log('[v9.3 Debug] Console toggled');
      }
    };

    window.addEventListener('keydown', handleKeyPress);

    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, []);

  // v1.0: API MONITOR - Listen for API stats from ChatInterface
  useEffect(() => {
    const handleApiStats = (event) => {
      const stats = event.detail;
      console.log('[v1.0 App] API Stats received:', stats);
      
      setLastApiResponseTime(stats.responseTime);
      setLastResponseWords(stats.wordCount);
      setLastResponseTokens(stats.tokens);
      setLastApiModel(stats.model);
      setLastApiWPS(stats.wordsPerSecond);
      
      addEventToLog('api', `Response: ${stats.responseTime}ms, ${stats.wordCount} words, ${stats.wordsPerSecond} WPS`);
    };

    window.addEventListener('aria-api-stats', handleApiStats);

    return () => {
      window.removeEventListener('aria-api-stats', handleApiStats);
    };
  }, []);

  // VERSION 9.5: CRITICAL FIX - Settings update handler (replaces event listener)
  const handleSettingChange = (key, value) => {
    const newSettings = {
      ...settings,
      [key]: value
    };

    // Update state IMMEDIATELY
    setSettings(newSettings);

    // Save to localStorage IMMEDIATELY
    localStorage.setItem('settings', JSON.stringify(newSettings));

    // Save to Electron API
    if (window.electronAPI && window.electronAPI.saveSettings) {
      window.electronAPI.saveSettings(newSettings);
    }

    // v1.0 FIX: LOG EVERY SETTING CHANGE to Event Log
    addEventToLog('settings', `${key} → ${typeof value === 'boolean' ? (value ? 'ON' : 'OFF') : value}`);

    // Apply UI effects IMMEDIATELY
    if (key === 'fontSize') {
      applyUIScale(value);
    }
    if (key === 'oledMode') {
      setOledModeActive(value);
      applyOledMode(value);
    }
    if (key === 'animationsEnabled') {
      setAnimationsActive(value);
      applyAnimations(value);
    }

    console.log(`[v9.5 App] ✅ Setting "${key}" updated to:`, value);
  };

  // VERSION 9.4: Apply GLOBAL UI SCALING via REM-based font-size
  const applyUIScale = (scale) => {
    const root = document.documentElement;

    // Map scale names to font-size values (REM-based)
    const scaleMap = {
      'small': '14px',   // 87.5% of default 16px
      'medium': '16px',  // 100% default
      'large': '20px'    // 125% of default 16px
    };

    const fontSize = scaleMap[scale] || '16px';
    root.style.fontSize = fontSize;

    // Also keep --app-scale for Debug Console display
    const percentageMap = { 'small': '87.5%', 'medium': '100%', 'large': '125%' };
    root.style.setProperty('--app-scale', percentageMap[scale] || '100%');

    console.log(`[v9.4 UI Scale] Applied REM-based scale: ${scale} (${fontSize})`);
  };

  // VERSION 8.1: Apply OLED mode to body element
  const applyOledMode = (enabled) => {
    console.log('[v8.1 App] Applying OLED mode:', enabled);

    if (enabled) {
      document.body.classList.add('oled-mode');
      console.log('[v8.1 App] ✅ OLED mode class ADDED to body');
    } else {
      document.body.classList.remove('oled-mode');
      console.log('[v8.1 App] ❌ OLED mode class REMOVED from body');
    }
  };

  // VERSION 9.3: Apply/remove animations globally
  const applyAnimations = (enabled) => {
    console.log('[v9.3 App] Applying animations:', enabled);

    if (!enabled) {
      document.body.classList.add('no-animations');
      console.log('[v9.3 App] ❌ Animations DISABLED');
    } else {
      document.body.classList.remove('no-animations');
      console.log('[v9.3 App] ✅ Animations ENABLED');
    }
  };


  // VERSION 8.1: Retry Ollama connection
  const handleRetryOllama = async () => {
    console.log('[v8.1 Onboarding] Retrying Ollama connection...');
    const ollamaTest = await testOllamaConnection();
    
    if (ollamaTest.success) {
      console.log('[v8.1 Onboarding] ✅ Connection successful!');
      setOllamaReady(true);
      setShowOnboarding(false);
    } else {
      console.log('[v8.1 Onboarding] ❌ Still not connected');
    }
  };

  // Handle navigation
  const navigate = (view) => {
    setCurrentView(view);
  };

  // Start new game flow
  const handleNewGame = () => {
    setSelectedMode(null);
    setSelectedCharacter(null);
    setLoadedSession(null);
    navigate(VIEWS.MODE_SELECT);
  };

  // Handle mode selection
  const handleModeSelect = (mode) => {
    setSelectedMode(mode);
    
    if (mode === GAME_MODES.CREATIVE_WRITING) {
      navigate(VIEWS.CREATIVE_WRITING);
    } else {
      navigate(VIEWS.CHARACTER_SELECT);
    }
  };

  // Handle character selection
  const handleCharacterSelect = (character) => {
    setSelectedCharacter(character);
    navigate(VIEWS.CHAT_INTERFACE);
  };

  // Handle character creator
  const handleCreateCharacter = () => {
    navigate(VIEWS.CHARACTER_CREATOR);
  };

  // Handle saving new character
  const handleSaveCharacter = (character) => {
    try {
      // Get existing custom characters
      const stored = localStorage.getItem('custom_characters');
      const existing = stored ? JSON.parse(stored) : [];
      
      // Add new character
      const updated = [...existing, character];
      localStorage.setItem('custom_characters', JSON.stringify(updated));
      
      // Navigate back to character select
      navigate(VIEWS.CHARACTER_SELECT);
    } catch (error) {
      console.error('Error saving character:', error);
    }
  };

  // Handle load game
  const handleLoadGame = () => {
    navigate(VIEWS.LOAD_GAME);
  };

  // Handle loading a session
  const handleSessionLoad = (session) => {
    setLoadedSession(session);
    setSelectedMode(session.mode);
    
    if (session.mode === GAME_MODES.CREATIVE_WRITING) {
      navigate(VIEWS.CREATIVE_WRITING);
    } else {
      setSelectedCharacter(session.character);
      navigate(VIEWS.CHAT_INTERFACE);
    }
  };

  // Handle settings
  const handleSettings = () => {
    navigate(VIEWS.SETTINGS);
  };

  // Handle back navigation
  const handleBack = () => {
    switch (currentView) {
      case VIEWS.MODE_SELECT:
        navigate(VIEWS.MAIN_MENU);
        break;
      case VIEWS.CHARACTER_SELECT:
        navigate(VIEWS.MODE_SELECT);
        break;
      case VIEWS.CHARACTER_CREATOR:
        navigate(VIEWS.CHARACTER_SELECT);
        break;
      case VIEWS.CHAT_INTERFACE:
      case VIEWS.CREATIVE_WRITING:
        navigate(VIEWS.MAIN_MENU);
        break;
      case VIEWS.LOAD_GAME:
      case VIEWS.SETTINGS:
        navigate(VIEWS.MAIN_MENU);
        break;
      default:
        navigate(VIEWS.MAIN_MENU);
    }
  };

  // Handle returning to main menu
  const handleMainMenu = () => {
    setSelectedMode(null);
    setSelectedCharacter(null);
    setLoadedSession(null);
    navigate(VIEWS.MAIN_MENU);
  };

  // Render current view
  const renderView = () => {
    switch (currentView) {
      case VIEWS.MAIN_MENU:
        return (
          <MainMenu
            onNewGame={handleNewGame}
            onLoadGame={handleLoadGame}
            onSettings={handleSettings}
            hasApiKey={true}
          />
        );
      
      case VIEWS.MODE_SELECT:
        return (
          <ModeSelection
            onSelect={handleModeSelect}
            onBack={handleBack}
          />
        );
      
      case VIEWS.CHARACTER_SELECT:
        return (
          <CharacterSelect
            onSelect={handleCharacterSelect}
            onBack={handleBack}
            onCreateCharacter={handleCreateCharacter}
          />
        );
      
      case VIEWS.CHARACTER_CREATOR:
        return (
          <CharacterCreator
            onSave={handleSaveCharacter}
            onBack={handleBack}
          />
        );
      
      case VIEWS.CHAT_INTERFACE:
        return (
          <ChatInterface
            character={selectedCharacter}
            loadedSession={loadedSession}
            onBack={handleMainMenu}
          />
        );
      
      case VIEWS.CREATIVE_WRITING:
        return (
          <CreativeWriting
            loadedSession={loadedSession}
            onBack={handleMainMenu}
          />
        );
      
      case VIEWS.LOAD_GAME:
        return (
          <LoadGame
            onLoad={handleSessionLoad}
            onBack={handleBack}
          />
        );
      
      case VIEWS.SETTINGS:
        return (
          <Settings
            settings={settings}
            onSettingChange={handleSettingChange}
            onClose={handleBack}
          />
        );
      
      default:
        return (
          <MainMenu
            onNewGame={handleNewGame}
            onLoadGame={handleLoadGame}
            onSettings={handleSettings}
          />
        );
    }
  };

  return (
    <div className="app-container h-screen w-screen overflow-hidden bg-zinc-950 text-white">
      {/* VERSION 8.1: Onboarding Modal (blocks app until Ollama is ready) */}
      <OnboardingModal 
        isOpen={showOnboarding} 
        onRetry={handleRetryOllama}
      />

      {/* Custom Title Bar */}
      <TitleBar />
      
      {/* Main Content Area - Only render if Ollama is ready */}
      {ollamaReady && (
        <main className="h-[calc(100vh-32px)] w-full overflow-hidden">
          {/* Animated Background */}
          <div className="fixed inset-0 pointer-events-none overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950" />
            
            {/* Cyberpunk Grid */}
            <div 
              className="absolute inset-0 opacity-[0.03]"
              style={{
                backgroundImage: `
                  linear-gradient(rgba(255, 0, 60, 0.3) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(255, 0, 60, 0.3) 1px, transparent 1px)
                `,
                backgroundSize: '50px 50px',
              }}
            />
            
            {/* Glow Effects */}
            <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-red-500/5 rounded-full blur-[120px]" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-red-600/5 rounded-full blur-[150px]" />
            <div className="absolute top-[50%] left-[50%] w-[400px] h-[400px] bg-rose-500/3 rounded-full blur-[100px] transform -translate-x-1/2 -translate-y-1/2" />
          </div>
          
          {/* View Content */}
          <div className="relative z-10 h-full w-full">
            {renderView()}
          </div>
        </main>
      )}
      
      {/* VERSION 8.1: OLED Mode Indicator (Debug - can be removed) */}
      {oledModeActive && (
        <div className="fixed bottom-4 right-4 px-3 py-1.5 rounded-lg bg-black border border-white/20 text-white text-xs font-mono z-50 pointer-events-none">
          OLED Mode Active
        </div>
      )}

      {/* VERSION 9.5: Debug Console PRO (Ctrl+D) - Enhanced API Monitor */}
      <DebugConsole
        isVisible={showDebugConsole}
        onClose={() => setShowDebugConsole(false)}
        scaleFactor={settings.fontSize || 'medium'}
        oledMode={oledModeActive}
        animationsEnabled={animationsActive}
        currentView={currentView}
        lastApiResponseTime={lastApiResponseTime}
        lastResponseWords={lastResponseWords}
        lastResponseTokens={lastResponseTokens}
        lastApiModel={lastApiModel}
        lastApiWPS={lastApiWPS}
        eventLog={eventLog}
        settings={settings}
      />
    </div>
  );
}

export default App;