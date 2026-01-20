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
import OllamaSetup from './components/tutorials/OllamaSetup';

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

// VERSION 8.1: Onboarding Modal removed - Replaced by OllamaSetup.jsx

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
    imageGenTier: 'standard', // 'standard' (SDXL) or 'premium' (FLUX)
    voiceEnabled: false,
    voiceUrl: 'http://127.0.0.1:5000',
    voiceTier: 'standard', // 'standard' (Piper) or 'premium' (Zonos)
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
            imageGenTier: loadedSettings.imageGenTier || 'standard',
            voiceEnabled: loadedSettings.voiceEnabled || false,
            voiceUrl: loadedSettings.voiceUrl || 'http://127.0.0.1:5000',
            voiceTier: loadedSettings.voiceTier || 'standard',
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
      {/* VERSION 8.1: Onboarding Modal - Replaced by Premium OllamaSetup */}
      {showOnboarding && (
         <OllamaSetup 
            isOnboarding={true}
            onComplete={handleRetryOllama}
         />
      )}

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