import { useState, useEffect, useRef } from 'react';
import TitleBar from './components/TitleBar';
import MainMenu from './components/MainMenu';
import ModeSelection from './components/ModeSelection';
import CharacterSelect from './components/CharacterSelect';
import ChatInterface from './components/ChatInterface';
import CreativeWriting from './components/CreativeWriting';
import LoadGame from './components/LoadGame';
import Settings from './components/Settings';
import CharacterCreator from './components/CharacterCreator';
import AICharacterBuilder from './components/AICharacterBuilder';
import DebugConsole from './components/DebugConsole';
import OledToggleButton from './components/OledToggleButton';
import { testOllamaConnection, autoDetectAndSetModel, normalizeContextSize, loadSettings } from './lib/api';
import { OLLAMA_DEFAULT_URL, DEFAULT_MODEL_NAME, IMAGE_GEN_DEFAULT_URL, VOICE_DEFAULT_URL } from './lib/defaults';
import { useLanguage } from './context/LanguageContext';
import OllamaSetup from './components/tutorials/OllamaSetup';
import { normalizeResponseMode } from './lib/responseModes';
import { DEBUG_CONSOLE_EVENT_LIMIT } from './lib/debugConsole';
import { applyThemeMode, bootstrapThemeMode, normalizeThemeMode, withResolvedThemeSettings } from './lib/theme';

// App views
const VIEWS = {
  MAIN_MENU: 'main_menu',
  MODE_SELECT: 'mode_select',
  CHARACTER_SELECT: 'character_select',
  CHARACTER_CREATOR: 'character_creator',
  AI_CHARACTER_BUILDER: 'ai_character_builder',
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

// v0.2.5: Onboarding Modal removed - Replaced by OllamaSetup.jsx

/** RTL languages that require dir="rtl" on the root element */
const RTL_LANGUAGES = new Set(['ar']);
const INITIAL_THEME_MODE = bootstrapThemeMode();

function App() {
  const { language } = useLanguage();
  const startupTimersRef = useRef(new Set());
  const [currentView, setCurrentView] = useState(VIEWS.MAIN_MENU);
  const [settingsReturnView, setSettingsReturnView] = useState(VIEWS.MAIN_MENU);
  const [, setSelectedMode] = useState(null);
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const [loadedSession, setLoadedSession] = useState(null);

  // v0.2.5: Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [ollamaReady, setOllamaReady] = useState(false);

  const [themeModeActive, setThemeModeActive] = useState(INITIAL_THEME_MODE);
  const [oledModeActive, setOledModeActive] = useState(INITIAL_THEME_MODE === 'oled');

  // v0.2.5: Animations state
  const [animationsActive, setAnimationsActive] = useState(true);

  // v0.2.5: Debug Console state
  const [showDebugConsole, setShowDebugConsole] = useState(false);

  // v0.2.5: Event Log & API Monitor state
  const [eventLog, setEventLog] = useState([]);
  const [lastApiResponseTime, setLastApiResponseTime] = useState(null);

  // v0.2.5: AUFGABE 4 - Enhanced API Monitor state
  const [lastResponseWords, setLastResponseWords] = useState(null);
  const [lastResponseTokens, setLastResponseTokens] = useState(null);
  const [lastApiModel, setLastApiModel] = useState(null);
  const [lastApiWPS, setLastApiWPS] = useState(null);

  // v0.2.5: CRITICAL FIX - Lifted Settings State (AUFGABE 1)
  const [settings, setSettings] = useState({
    ollamaUrl: OLLAMA_DEFAULT_URL,
    ollamaModel: DEFAULT_MODEL_NAME,
    temperature: 0.85,
    userName: 'User',
    userGender: 'male',
    imageGenEnabled: false,
    imageGenUrl: IMAGE_GEN_DEFAULT_URL,
    imageGenTier: 'standard', // 'standard' (SDXL) or 'premium' (FLUX)
    voiceEnabled: false,
    voiceUrl: VOICE_DEFAULT_URL,
    voiceTier: 'standard', // 'standard' (Piper) or 'premium' (Zonos)
    contextSize: 4096,
    maxResponseTokens: 256,
    fontSize: 'medium',
    autoSave: true,
    smartSuggestionsEnabled: true,
    animationsEnabled: true,
    themeMode: INITIAL_THEME_MODE,
    oledMode: INITIAL_THEME_MODE === 'oled',
    preferredLanguage: 'en'
  });

  const startDebugTimer = (label) => {
    if (startupTimersRef.current.has(label)) return;
    startupTimersRef.current.add(label);
    console.time(label);
  };

  const endDebugTimer = (label) => {
    if (!startupTimersRef.current.has(label)) return;
    startupTimersRef.current.delete(label);
    console.timeEnd(label);
  };

  const addEventToLog = (eventType, message) => {
    const newEvent = {
      timestamp: new Date().toISOString(),
      type: eventType,
      message
    };
    setEventLog(prev => [newEvent, ...prev].slice(0, DEBUG_CONSOLE_EVENT_LIMIT));
  };

  // v0.2.5: CRITICAL FIX - Load settings from localStorage on startup
  useEffect(() => {
    async function initializeApp() {
      startDebugTimer('[Startup] Total init');
      startDebugTimer('[Startup] Settings load');
      try {
        const loadedSettings = await loadSettings();
        if (loadedSettings && typeof loadedSettings === 'object') {
          const mergedSettings = withResolvedThemeSettings({
            ollamaUrl: loadedSettings.ollamaUrl || OLLAMA_DEFAULT_URL,
            ollamaModel: loadedSettings.ollamaModel || DEFAULT_MODEL_NAME,
            temperature: loadedSettings.temperature ?? 0.85,
            userName: loadedSettings.userName || 'User',
            userGender: loadedSettings.userGender || 'male',
            imageGenEnabled: loadedSettings.imageGenEnabled ?? false,
            imageGenUrl: loadedSettings.imageGenUrl || IMAGE_GEN_DEFAULT_URL,
            imageGenTier: loadedSettings.imageGenTier || 'standard',
            voiceEnabled: loadedSettings.voiceEnabled ?? false,
            voiceUrl: loadedSettings.voiceUrl || VOICE_DEFAULT_URL,
            voiceTier: loadedSettings.voiceTier || 'standard',
            contextSize: normalizeContextSize(loadedSettings.contextSize, loadedSettings.ollamaModel || DEFAULT_MODEL_NAME),
            maxResponseTokens: Number.isFinite(Number(loadedSettings.maxResponseTokens))
              ? Math.max(96, Math.min(1024, Number(loadedSettings.maxResponseTokens)))
              : 256,
            fontSize: loadedSettings.fontSize || 'medium',
            autoSave: loadedSettings.autoSave ?? true,
            smartSuggestionsEnabled: loadedSettings.smartSuggestionsEnabled ?? true,
            animationsEnabled: loadedSettings.animationsEnabled ?? true,
            themeMode: loadedSettings.themeMode,
            oledMode: loadedSettings.oledMode ?? false,
            preferredLanguage: loadedSettings.preferredLanguage || 'en'
          });

          localStorage.setItem('settings', JSON.stringify(mergedSettings));
          setSettings(mergedSettings);
          applyUIScale(mergedSettings.fontSize);
          setThemeModeActive(mergedSettings.themeMode);
          setOledModeActive(mergedSettings.oledMode);
          applyThemeMode(mergedSettings.themeMode);
          setAnimationsActive(mergedSettings.animationsEnabled);
          applyAnimations(mergedSettings.animationsEnabled);

          if (mergedSettings.preferredLanguage) {
            const langContext = localStorage.getItem('language');
            if (langContext !== mergedSettings.preferredLanguage) {
              localStorage.setItem('language', mergedSettings.preferredLanguage);
            }
          }
        }
      } catch (error) {
        console.error('[v9.5 App Init] ❌ Error loading settings:', error);
      }
      endDebugTimer('[Startup] Settings load');

      // v0.2.5: Check Ollama connection (NO API KEY!)
      startDebugTimer('[Startup] Ollama check');
      try {
        const ollamaTest = await testOllamaConnection();

        if (ollamaTest.success) {
          setOllamaReady(true);
          setShowOnboarding(false);

          // v0.2.5: AUTO-DETECT AND SET MODEL
          const autoDetectResult = await autoDetectAndSetModel();

          if (autoDetectResult.success) {
            if (autoDetectResult.changed) {
              setSettings(prev => ({ ...prev, ollamaModel: autoDetectResult.model }));
            }
          } else {
            console.warn('[v8.2 Startup] ⚠️ No models found. User needs to install a model.');
          }
        } else {
          setOllamaReady(false);
          setShowOnboarding(true);
        }
      } catch (error) {
        console.error('[v8.1 Startup] Ollama check failed:', error);
        setOllamaReady(false);
        setShowOnboarding(true);
      }
      endDebugTimer('[Startup] Ollama check');
      endDebugTimer('[Startup] Total init');
    }

    initializeApp();
  }, []);

  // v0.2.5: Keyboard shortcut for Debug Console (Ctrl+D)
  useEffect(() => {
    const handleKeyPress = (e) => {
      // Ctrl+D (or Cmd+D on Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        setShowDebugConsole(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyPress);

    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, []);

  // v0.2.5: API MONITOR - Listen for API stats from ChatInterface
  useEffect(() => {
    const handleApiStats = (event) => {
      const stats = event.detail;

      if (stats.builderEvent) {
        addEventToLog('builder', stats.builderEvent);
        return;
      }

      setLastApiResponseTime(stats.responseTime);
      setLastResponseWords(stats.wordCount);
      setLastResponseTokens(stats.tokens);
      setLastApiModel(stats.model);
      setLastApiWPS(stats.wordsPerSecond);

      addEventToLog('api', `Response: ${stats.responseTime}ms, ${stats.wordCount} words, ${stats.wordsPerSecond} WPS`);
      if (stats.passionRaw !== null && stats.passionRaw !== undefined) {
        addEventToLog('passion', `Level: ${stats.passionLevel}% | raw=${stats.passionRaw} | adjusted=${stats.passionAdjusted !== null ? stats.passionAdjusted.toFixed(1) : '0'}`);
      }
    };

    window.addEventListener('aria-api-stats', handleApiStats);

    return () => {
      window.removeEventListener('aria-api-stats', handleApiStats);
    };
  }, []);

  const handleSettingChange = (key, value) => {
    let settingKey = key;
    let settingValue = value;

    if (settingKey === 'oledMode') {
      settingKey = 'themeMode';
      settingValue = value ? 'oled' : 'dark';
    }

    if (settingKey === 'themeMode') {
      settingValue = normalizeThemeMode(settingValue);
    }

    const newSettings = withResolvedThemeSettings({
      ...settings,
      [settingKey]: settingValue
    });

    setSettings(newSettings);
    localStorage.setItem('settings', JSON.stringify(newSettings));

    if (window.electronAPI && window.electronAPI.saveSettings) {
      window.electronAPI.saveSettings(newSettings);
    }

    addEventToLog('settings', `${settingKey} → ${typeof settingValue === 'boolean' ? (settingValue ? 'ON' : 'OFF') : settingValue}`);

    if (settingKey === 'fontSize') {
      applyUIScale(settingValue);
    }
    if (settingKey === 'themeMode') {
      setThemeModeActive(newSettings.themeMode);
      setOledModeActive(newSettings.oledMode);
      applyThemeMode(newSettings.themeMode);
    }
    if (settingKey === 'animationsEnabled') {
      setAnimationsActive(settingValue);
      applyAnimations(settingValue);
    }
  };

  // v0.2.5: Apply GLOBAL UI SCALING via REM-based font-size
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

  };

  // v0.2.5: Apply/remove animations globally
  const applyAnimations = (enabled) => {
    if (!enabled) {
      document.body.classList.add('no-animations');
    } else {
      document.body.classList.remove('no-animations');
    }
  };


  // v0.2.5: Retry Ollama connection
  const handleRetryOllama = async () => {
    const ollamaTest = await testOllamaConnection();

    if (ollamaTest.success) {
      setOllamaReady(true);
      setShowOnboarding(false);
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

  const handleAICharacterBuilder = () => {
    navigate(VIEWS.AI_CHARACTER_BUILDER);
  };

  // Handle saving new character
  const handleSaveCharacter = (character) => {
    try {
      const normalizedCharacter = {
        ...character,
        responseMode: normalizeResponseMode(character?.responseMode ?? character?.responseStyle, character?.isCustom ? 'normal' : 'short')
      };
      const canonical = localStorage.getItem('custom_characters');
      const legacy = localStorage.getItem('customCharacters');
      const existing = [...(canonical ? JSON.parse(canonical) : []), ...(legacy ? JSON.parse(legacy) : [])];
      const uniqueExisting = existing.filter((item, index, array) => item?.id && array.findIndex((candidate) => candidate?.id === item.id) === index);
      const existingIndex = uniqueExisting.findIndex((item) => item.id === normalizedCharacter.id);
      const updated = [...uniqueExisting];

      if (existingIndex >= 0) {
        updated[existingIndex] = normalizedCharacter;
      } else {
        updated.push(normalizedCharacter);
      }

      localStorage.setItem('custom_characters', JSON.stringify(updated));
      localStorage.removeItem('customCharacters');
      
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
  const openSettings = (returnView = VIEWS.MAIN_MENU) => {
    setSettingsReturnView(returnView);
    navigate(VIEWS.SETTINGS);
  };

  const handleSettings = () => {
    openSettings(VIEWS.MAIN_MENU);
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
      case VIEWS.AI_CHARACTER_BUILDER:
        navigate(VIEWS.CHARACTER_SELECT);
        break;
      case VIEWS.CHAT_INTERFACE:
        navigate(VIEWS.CHARACTER_SELECT);
        break;
      case VIEWS.CREATIVE_WRITING:
        navigate(VIEWS.MODE_SELECT);
        break;
      case VIEWS.LOAD_GAME:
        navigate(VIEWS.MAIN_MENU);
        break;
      case VIEWS.SETTINGS:
        navigate(settingsReturnView || VIEWS.MAIN_MENU);
        break;
      default:
        navigate(VIEWS.MAIN_MENU);
    }
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
            onAIBuilder={handleAICharacterBuilder}
          />
        );
      
      case VIEWS.CHARACTER_CREATOR:
        return (
          <CharacterCreator
            onSave={handleSaveCharacter}
            onBack={handleBack}
          />
        );

      case VIEWS.AI_CHARACTER_BUILDER:
        return (
          <AICharacterBuilder
            onSave={handleSaveCharacter}
            onBack={handleBack}
            settings={settings}
          />
        );

      case VIEWS.CHAT_INTERFACE:
        return (
          <ChatInterface
            character={selectedCharacter}
            loadedSession={loadedSession}
            onBack={handleBack}
            onOpenSettings={() => openSettings(VIEWS.CHAT_INTERFACE)}
            settings={settings}
          />
        );
      
      case VIEWS.CREATIVE_WRITING:
        return (
          <CreativeWriting
            loadedSession={loadedSession}
            onBack={handleBack}
            settings={settings}
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
    <div dir={RTL_LANGUAGES.has(language) ? 'rtl' : 'ltr'} className="app-container app-theme-shell h-screen w-screen overflow-hidden">
      {/* v0.2.5: Onboarding Modal - Replaced by Premium OllamaSetup */}
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
          <div className="fixed inset-0 pointer-events-none overflow-hidden">
            <div className="theme-app-backdrop absolute inset-0" />
            <div className="cyber-grid absolute inset-0 theme-app-grid" />
            <div className="theme-app-glow theme-app-glow-primary absolute top-[-20%] left-[-10%] h-[500px] w-[500px] rounded-full blur-[120px]" />
            <div className="theme-app-glow theme-app-glow-secondary absolute bottom-[-20%] right-[-10%] h-[600px] w-[600px] rounded-full blur-[150px]" />
            <div className="theme-app-glow theme-app-glow-center absolute top-[50%] left-[50%] h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 transform rounded-full blur-[100px]" />
          </div>

          <div className="relative z-10 h-full w-full">
            {renderView()}
          </div>
        </main>
      )}

      <OledToggleButton
        themeMode={themeModeActive}
        onToggle={handleSettingChange}
        currentView={currentView}
      />

      {/* v0.2.5: Debug Console PRO (Ctrl+D) - Enhanced API Monitor */}
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
