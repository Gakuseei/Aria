import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import TitleBar from './components/TitleBar';
import MainMenu from './components/MainMenu';
import ModeSelection from './components/ModeSelection';
import OledToggleButton from './components/OledToggleButton';
import OllamaNotRunningModal from './components/OllamaNotRunningModal';
import { useLanguage } from './context/LanguageContext';
import { buildManualCharacterSelectionState, buildManualModeSelectionState } from './lib/chatViewState';
import { OLLAMA_DEFAULT_URL, DEFAULT_MODEL_NAME } from './lib/defaults';
import { DEBUG_CONSOLE_EVENT_LIMIT } from './lib/debugConsole';
import { GAME_MODES } from './lib/gameModes';
import { testOllamaConnection, autoDetectAndSetModel, normalizeContextSize } from './lib/ollama';
import { applyPerformanceProfile, getPerformanceProfile } from './lib/performance';
import { normalizeResponseMode } from './lib/responseModes';
import { saveCustomCharacter } from './lib/chat/characters';
import { loadSettings } from './lib/storage/settings';
import { applyThemeMode, bootstrapThemeMode, normalizeThemeMode, withResolvedThemeSettings } from './lib/theme';

const CharacterSelect = lazy(() => import('./components/CharacterSelect'));
const ChatInterface = lazy(() => import('./components/ChatInterface'));
const CreativeWriting = lazy(() => import('./components/CreativeWriting'));
const LoadGame = lazy(() => import('./components/LoadGame'));
const Settings = lazy(() => import('./components/Settings'));
const CharacterCreator = lazy(() => import('./components/CharacterCreator'));
const AICharacterBuilder = lazy(() => import('./components/AICharacterBuilder'));
const DebugConsole = lazy(() => import('./components/DebugConsole'));

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

/** RTL languages that require dir="rtl" on the root element */
const RTL_LANGUAGES = new Set(['ar']);
const INITIAL_THEME_MODE = bootstrapThemeMode();

function shouldUseSystemTitleBar() {
  return typeof window !== 'undefined' && Boolean(window.electronAPI?.windowChrome?.useSystemTitleBar);
}

function App() {
  const { language, t } = useLanguage();
  const useSystemTitleBar = shouldUseSystemTitleBar();
  const startupTimersRef = useRef(new Set());
  const performanceProfileRef = useRef(getPerformanceProfile());
  const [currentView, setCurrentView] = useState(VIEWS.MAIN_MENU);
  const [settingsReturnView, setSettingsReturnView] = useState(VIEWS.MAIN_MENU);
  const [, setSelectedMode] = useState(null);
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const [loadedSession, setLoadedSession] = useState(null);

  const [ollamaReady, setOllamaReady] = useState(false);
  const [modelsAvailable, setModelsAvailable] = useState(false);
  const [ollamaErrorCode, setOllamaErrorCode] = useState(null);
  const [ollamaErrorStatus, setOllamaErrorStatus] = useState(null);
  const [hasCheckedOllama, setHasCheckedOllama] = useState(false);

  const [themeModeActive, setThemeModeActive] = useState(INITIAL_THEME_MODE);
  const [oledModeActive, setOledModeActive] = useState(INITIAL_THEME_MODE === 'oled');

  const [animationsActive, setAnimationsActive] = useState(!performanceProfileRef.current.prefersReducedMotion);

  const [showDebugConsole, setShowDebugConsole] = useState(false);

  const [eventLog, setEventLog] = useState([]);
  const [lastApiResponseTime, setLastApiResponseTime] = useState(null);

  const [lastResponseWords, setLastResponseWords] = useState(null);
  const [lastResponseTokens, setLastResponseTokens] = useState(null);
  const [lastApiModel, setLastApiModel] = useState(null);
  const [lastApiWPS, setLastApiWPS] = useState(null);

  const [settings, setSettings] = useState({
    ollamaUrl: OLLAMA_DEFAULT_URL,
    ollamaModel: DEFAULT_MODEL_NAME,
    temperature: 0.85,
    userName: 'User',
    userGender: 'male',
    userPronouns: 'he/him',
    contextSize: 4096,
    maxResponseTokens: 256,
    fontSize: 'medium',
    autoSave: true,
    smartSuggestionsEnabled: false,
    write4meEnabled: false,
    animationsEnabled: !performanceProfileRef.current.prefersReducedMotion,
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

  const applyOllamaTestResult = (ollamaTest) => {
    if (ollamaTest?.success) {
      const count = Array.isArray(ollamaTest.models) ? ollamaTest.models.length : 0;
      setOllamaReady(true);
      setModelsAvailable(count > 0);
      setOllamaErrorCode(null);
      setOllamaErrorStatus(null);
      return { ready: true, hasModels: count > 0 };
    }
    setOllamaReady(false);
    setModelsAvailable(false);
    setOllamaErrorCode(ollamaTest?.errorCode ?? 'unknown');
    setOllamaErrorStatus(ollamaTest?.status ?? null);
    return { ready: false, hasModels: false };
  };

  useEffect(() => {
    async function initializeApp() {
      startDebugTimer('[Startup] Total init');
      startDebugTimer('[Startup] Settings load');
      let effectiveOllamaUrl = OLLAMA_DEFAULT_URL;
      try {
        const loadedSettings = await loadSettings();
        if (loadedSettings && typeof loadedSettings === 'object') {
          const mergedSettings = withResolvedThemeSettings({
            ollamaUrl: loadedSettings.ollamaUrl || OLLAMA_DEFAULT_URL,
            ollamaModel: loadedSettings.ollamaModel || DEFAULT_MODEL_NAME,
            customProfiles: loadedSettings.customProfiles && typeof loadedSettings.customProfiles === 'object'
              ? loadedSettings.customProfiles
              : {},
            userName: loadedSettings.userName || 'User',
            userGender: loadedSettings.userGender || 'male',
            userPronouns: loadedSettings.userPronouns || 'he/him',
            contextSize: normalizeContextSize(loadedSettings.contextSize, loadedSettings.ollamaModel || DEFAULT_MODEL_NAME),
            maxResponseTokens: Number.isFinite(Number(loadedSettings.maxResponseTokens))
              ? Math.max(96, Math.min(1024, Number(loadedSettings.maxResponseTokens)))
              : 256,
            fontSize: loadedSettings.fontSize || 'medium',
            autoSave: loadedSettings.autoSave ?? true,
            smartSuggestionsEnabled: loadedSettings.smartSuggestionsEnabled ?? false,
            write4meEnabled: loadedSettings.write4meEnabled ?? false,
            animationsEnabled: loadedSettings.animationsEnabled ?? !performanceProfileRef.current.prefersReducedMotion,
            themeMode: loadedSettings.themeMode,
            oledMode: loadedSettings.oledMode ?? false,
            preferredLanguage: loadedSettings.preferredLanguage || 'en'
          });

          localStorage.setItem('settings', JSON.stringify(mergedSettings));
          setSettings(mergedSettings);
          effectiveOllamaUrl = mergedSettings.ollamaUrl || OLLAMA_DEFAULT_URL;
          applyUIScale(mergedSettings.fontSize);
          setThemeModeActive(mergedSettings.themeMode);
          setOledModeActive(mergedSettings.oledMode);
          applyThemeMode(mergedSettings.themeMode);
          setAnimationsActive(mergedSettings.animationsEnabled);
          applyAnimations(mergedSettings.animationsEnabled);
          applyVisualPerformanceMode(mergedSettings.animationsEnabled);

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

      startDebugTimer('[Startup] Ollama check');
      try {
        const ollamaTest = await testOllamaConnection(effectiveOllamaUrl);
        const { ready } = applyOllamaTestResult(ollamaTest);

        if (ready) {
          const autoDetectResult = await autoDetectAndSetModel(effectiveOllamaUrl);
          if (autoDetectResult.success) {
            if (autoDetectResult.changed) {
              setSettings(prev => ({ ...prev, ollamaModel: autoDetectResult.model }));
            }
          } else {
            console.warn('[v8.2 Startup] ⚠️ No models found. User needs to install a model.');
          }
        }
      } catch (error) {
        console.error('[v8.1 Startup] Ollama check failed:', error);
        applyOllamaTestResult({ success: false, errorCode: 'unknown' });
      } finally {
        setHasCheckedOllama(true);
      }
      endDebugTimer('[Startup] Ollama check');
      endDebugTimer('[Startup] Total init');
    }

    initializeApp();
  }, []);

  useEffect(() => {
    const handleKeyPress = (e) => {
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

  useEffect(() => {
    const resolveKey = (obj, path) => path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);

    const handler = (event) => {
      const detail = event?.detail || {};
      const tone = detail.type === 'success' ? 'success' : 'error';
      let message = null;
      if (detail.messageKey) {
        const resolved = resolveKey(t, detail.messageKey);
        if (typeof resolved === 'string') message = resolved;
      }
      if (!message && typeof detail.message === 'string') message = detail.message;
      if (!message) return;
      if (tone === 'success') toast.success(message);
      else toast.error(message);
    };

    window.addEventListener('show-toast', handler);
    return () => window.removeEventListener('show-toast', handler);
  }, [t]);

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

    const genderToDefaultPronouns = {
      male: 'he/him',
      female: 'she/her',
      nonbinary: 'they/them',
      futa: 'she/her'
    };

    const patch = { [settingKey]: settingValue };

    if (settingKey === 'userGender') {
      const oldGender = settings.userGender || 'male';
      const oldDefault = genderToDefaultPronouns[oldGender] || 'he/him';
      const currentPronouns = String(settings.userPronouns || '').trim();
      const nextDefault = genderToDefaultPronouns[settingValue] || 'he/him';
      if (!currentPronouns || currentPronouns === oldDefault) {
        patch.userPronouns = nextDefault;
      }
    }

    const newSettings = withResolvedThemeSettings({
      ...settings,
      ...patch
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
      applyVisualPerformanceMode(settingValue);
    }
  };

  const applyUIScale = (scale) => {
    const root = document.documentElement;

    const scaleMap = {
      'small': '14px',
      'medium': '16px',
      'large': '20px'
    };

    const fontSize = scaleMap[scale] || '16px';
    root.style.fontSize = fontSize;

    const percentageMap = { 'small': '87.5%', 'medium': '100%', 'large': '125%' };
    root.style.setProperty('--app-scale', percentageMap[scale] || '100%');

  };

  const applyAnimations = (enabled) => {
    if (!document?.body) return;

    if (!enabled) {
      document.body.classList.add('no-animations');
    } else {
      document.body.classList.remove('no-animations');
    }
  };

  const applyVisualPerformanceMode = (animationsEnabled) => {
    applyPerformanceProfile({
      ...performanceProfileRef.current,
      reduceEffects: !animationsEnabled || performanceProfileRef.current.reduceEffects,
    });
  };

  useEffect(() => {
    applyAnimations(animationsActive);
    applyVisualPerformanceMode(animationsActive);
  }, [animationsActive]);

  const handleRetryOllama = async () => {
    try {
      const ollamaTest = await testOllamaConnection(settings.ollamaUrl);
      applyOllamaTestResult(ollamaTest);
    } catch (error) {
      console.error('[Retry] Ollama check failed:', error);
      applyOllamaTestResult({ success: false, errorCode: 'unknown' });
    }
  };

  const prevViewRef = useRef(currentView);
  useEffect(() => {
    if (prevViewRef.current === VIEWS.SETTINGS && currentView !== VIEWS.SETTINGS && !ollamaReady) {
      handleRetryOllama();
    }
    prevViewRef.current = currentView;
  }, [currentView, ollamaReady]);

  const navigate = (view) => {
    setCurrentView(view);
  };

  const handleNewGame = () => {
    setSelectedMode(null);
    setSelectedCharacter(null);
    setLoadedSession(null);
    navigate(VIEWS.MODE_SELECT);
  };

  const handleModeSelect = (mode) => {
    const nextState = buildManualModeSelectionState(mode);
    setSelectedMode(nextState.selectedMode);
    setLoadedSession(nextState.loadedSession);

    if (mode === GAME_MODES.CREATIVE_WRITING) {
      navigate(VIEWS.CREATIVE_WRITING);
    } else {
      navigate(VIEWS.CHARACTER_SELECT);
    }
  };

  const handleCharacterSelect = (character) => {
    const nextState = buildManualCharacterSelectionState(character);
    setSelectedCharacter(nextState.selectedCharacter);
    setLoadedSession(nextState.loadedSession);
    navigate(VIEWS.CHAT_INTERFACE);
  };

  const handleCreateCharacter = () => {
    navigate(VIEWS.CHARACTER_CREATOR);
  };

  const handleAICharacterBuilder = () => {
    navigate(VIEWS.AI_CHARACTER_BUILDER);
  };

  const handleSaveCharacter = (character) => {
    const result = saveCustomCharacter({
      ...character,
      responseMode: normalizeResponseMode(character?.responseMode ?? character?.responseStyle, character?.isCustom ? 'normal' : 'short')
    });
    if (result?.success) {
      navigate(VIEWS.CHARACTER_SELECT);
    } else {
      console.error('Error saving character:', result?.error);
    }
  };

  const handleLoadGame = () => {
    navigate(VIEWS.LOAD_GAME);
  };

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

  const openSettings = (returnView = VIEWS.MAIN_MENU) => {
    setSettingsReturnView(returnView);
    navigate(VIEWS.SETTINGS);
  };

  const handleSettings = () => {
    openSettings(VIEWS.MAIN_MENU);
  };

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
        setLoadedSession(null);
        navigate(VIEWS.CHARACTER_SELECT);
        break;
      case VIEWS.CREATIVE_WRITING:
        setLoadedSession(null);
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
            onStartNewGame={handleNewGame}
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
      {hasCheckedOllama && (!ollamaReady || !modelsAvailable) && currentView !== VIEWS.SETTINGS && (
        <OllamaNotRunningModal
          state={!ollamaReady ? 'unreachable' : 'no-model'}
          errorCode={ollamaErrorCode}
          errorStatus={ollamaErrorStatus}
          onRetry={handleRetryOllama}
          onOpenSettings={() => openSettings(VIEWS.MAIN_MENU)}
          t={t}
        />
      )}

      {!useSystemTitleBar && <TitleBar />}

      <main className={`${useSystemTitleBar ? 'h-screen' : 'h-[calc(100vh-32px)]'} w-full overflow-hidden`}>
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="theme-app-backdrop absolute inset-0" />
          <div className="cyber-grid absolute inset-0 theme-app-grid" />
          <div className="theme-app-glow theme-app-glow-primary absolute top-[-20%] left-[-10%] h-[500px] w-[500px] rounded-full blur-[120px]" />
          <div className="theme-app-glow theme-app-glow-secondary absolute bottom-[-20%] right-[-10%] h-[600px] w-[600px] rounded-full blur-[150px]" />
          <div className="theme-app-glow theme-app-glow-center absolute top-[50%] left-[50%] h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 transform rounded-full blur-[100px]" />
        </div>

        <div className="relative z-10 h-full w-full">
          <Suspense fallback={null}>
            {renderView()}
          </Suspense>
        </div>
      </main>

      <OledToggleButton
        themeMode={themeModeActive}
        onToggle={handleSettingChange}
        currentView={currentView}
      />

      <Toaster
        position={RTL_LANGUAGES.has(language) ? 'bottom-left' : 'bottom-right'}
        toastOptions={{ duration: 4000 }}
        containerStyle={{ zIndex: 10000 }}
      />

      {showDebugConsole && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}
    </div>
  );
}

export default App;
