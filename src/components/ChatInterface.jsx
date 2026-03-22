// ============================================================================
// ARIA v1.0 RELEASE - ChatInterface
// ============================================================================

import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { Send, RotateCcw, Trash2, Download, Upload, Settings as SettingsIcon, Image as ImageIcon, Volume2, ZoomIn, ZoomOut, Info, Sparkles, ArrowLeft, PenLine, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { sendMessage, saveSession, generateSessionId, deleteSession, autoDetectAndSetModel, scorePassionBackground, generateSuggestionsBackground, abortSuggestionCall, impersonateUser, abortImpersonateCall, resolveTemplates, unloadOllamaModel } from '../lib/api';
import { passionManager, getTierKey, PASSION_TIERS } from '../lib/PassionManager';
import { isCommand, executeCommand } from '../lib/commandHandler';
import { getModelProfile } from '../lib/modelProfiles';
import { generateImage, extractConversationContext } from '../lib/imageGen';
import TutorialModal from './tutorials/TutorialModal';
import { version as appVersion } from '../../package.json';
import { useLanguage } from '../context/LanguageContext';
import useGoldMode from '../hooks/useGoldMode';
import useEntranceAnimation from '../hooks/useEntranceAnimation';
import downloadBlob from '../utils/downloadBlob';
import { OLLAMA_DEFAULT_URL, DEFAULT_MODEL_NAME, IMAGE_GEN_DEFAULT_URL, VOICE_DEFAULT_URL } from '../lib/defaults';
import CustomDropdown from './CustomDropdown';

// ============================================================================
// TEXT FORMATTING - BLOCK 4 FIX: Apostroph-Bug behoben
// ============================================================================

function formatMessageText(text, isGoldMode = false) {
  if (!text || typeof text !== 'string') return [];

  const parts = [];
  let currentIndex = 0;

  // BLOCK 4 FIX: Strict parsing - asterisks MUST be gray, quotes MUST be white
  // Match either *action* or "dialogue" or **bold** (for Gold Mode)
  const regex = isGoldMode
    ? /(\*[^*]+\*)|("([^"]+)")|(\*\*([^*]+)\*\*)/g
    : /(\*[^*]+\*)|("([^"]+)")/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > currentIndex) {
      const plainText = text.substring(currentIndex, match.index);
      if (plainText.trim()) {
        parts.push({ type: 'plain', text: plainText });
      }
    }

    if (match[1]) {
      // Asterisks = ACTION (MUST be gray italic)
      parts.push({ type: 'action', text: match[1] });
    } else if (match[2]) {
      // Quotes = DIALOGUE (MUST be white)
      parts.push({ type: 'dialogue', text: match[2] });
    } else if (match[4] && isGoldMode) {
      // Double asterisks = BOLD (Gold Mode only)
      parts.push({ type: 'bold', text: match[5] });
    }

    currentIndex = match.index + match[0].length;
  }

  if (currentIndex < text.length) {
    const remainingText = text.substring(currentIndex);
    if (remainingText.trim()) {
      parts.push({ type: 'plain', text: remainingText });
    }
  }

  return parts;
}

// ============================================================================
// MESSAGE BUBBLE COMPONENT
// ============================================================================

function formatTimestamp(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function createStreamAbortHandle() {
  return {
    aborted: false,
    reason: null,
    abortImpl: null,
    setAbortImpl(nextAbort) {
      this.abortImpl = typeof nextAbort === 'function' ? nextAbort : null;
    },
    abort(reason = 'user') {
      if (this.aborted) return;
      this.aborted = true;
      this.reason = reason;
      if (typeof this.abortImpl === 'function') {
        this.abortImpl(reason);
      }
    }
  };
}

const MessageBubble = memo(function MessageBubble({ message, isUser, character, userName, onCopy, onSpeak, voiceEnabled, fontSize = 'base', isGoldMode = false, t = {} }) {
  const formattedParts = useMemo(
    () => formatMessageText(message.content || '', isGoldMode && !isUser),
    [message.content, isGoldMode, isUser]
  );


  // v0.2.5 ROSE NOIR: Avatar styling
  const avatarLetter = isUser ? (userName?.[0] || 'U') : (character?.name?.[0] || 'A');

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} group mb-4 message-slide-in`}>
      {/* v1.0 ROSE NOIR: AI Avatar (left) with ring */}
      {!isUser && (
        <div className="relative mr-3 flex-shrink-0">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-lg ring-2 ring-white/10"
            style={{
              background: `linear-gradient(135deg, ${character?.themeColor || '#52525b'}, ${character?.themeColor || '#52525b'}88)`
            }}
          >
            {avatarLetter}
          </div>
        </div>
      )}

      <div
        className={`max-w-[75%] rounded-2xl px-5 py-3.5 relative transition-all duration-200 ${
          isUser
            ? (isGoldMode
                ? 'bg-gradient-to-br from-zinc-900 to-amber-950/40 border border-amber-500/30 shadow-[0_0_15px_-3px_rgba(245,158,11,0.1)] text-white'
                : 'bg-gradient-to-br from-rose-800/90 via-rose-700/80 to-rose-900 border border-rose-500/15 text-white shadow-lg')
            : 'glass hover:border-white/10'
        }`}
      >
        {/* BLOCK 7.0: User name label - GOLD MODE for supporters */}
        {isUser && userName && (
          <div className={`text-xs mb-1.5 font-medium flex items-center gap-1.5 ${
            isGoldMode ? 'text-amber-400' : 'text-rose-200/80'
          }`}>
            {userName}
            {isGoldMode && <span className="text-amber-300">✨</span>}
          </div>
        )}

        {!isUser && character?.name && (
          <div className="text-xs text-zinc-400 mb-1.5 font-medium flex items-center gap-1.5">
            <span>{character.name}</span>
          </div>
        )}

        {/* BLOCK 8.1: Image support */}
        {message.image && (
          <img
            src={message.image}
            alt="Generated"
            className="rounded-lg max-w-full mb-3 border border-white/10"
          />
        )}

        <div className={`whitespace-pre-wrap break-words leading-relaxed ${{ xs: 'text-xs', sm: 'text-sm', base: 'text-base', lg: 'text-lg', xl: 'text-xl', '2xl': 'text-2xl' }[fontSize] || 'text-base'}`}>
          {formattedParts.map((part, i) => {
            if (part.type === 'action') {
              return <span key={i} className="text-zinc-400 italic">{part.text}</span>;
            } else if (part.type === 'dialogue') {
              return <span key={i} className="text-white font-normal">{part.text}</span>;
            } else if (part.type === 'bold' && isGoldMode && !isUser) {
              return <span key={i} className="text-amber-400 font-bold drop-shadow-sm">{part.text}</span>;
            } else {
              return <span key={i} className="text-zinc-200">{part.text}</span>;
            }
          })}
        </div>

        {message.timestamp && (
          <div className={`text-xs mt-2 ${
            isUser ? 'text-rose-200/70' : 'text-zinc-500'
          }`}>
            {formatTimestamp(message.timestamp)}
          </div>
        )}

        {/* Action buttons - hover reveal */}
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
          {/* Volume2 Icon Button (AI messages only) */}
          {!isUser && voiceEnabled === true && onSpeak && (
            <button
              onClick={() => onSpeak(message.content || '')}
              className="p-1.5 rounded-lg bg-black/20 hover:bg-black/40 text-zinc-400 hover:text-cyan-400 transition-all duration-200"
              title={t.chat?.playAudio || 'Play Audio'}
            >
              <Volume2 size={14} strokeWidth={1.5} />
            </button>
          )}
          {/* Copy button */}
          <button
            onClick={() => onCopy(message.content || '')}
            className="p-1.5 rounded-lg bg-black/20 hover:bg-black/40 text-zinc-400 hover:text-white transition-all duration-200"
            title={t.chat?.copy || 'Copy'}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
            </svg>
          </button>
        </div>
      </div>

      {/* v1.0 ROSE NOIR: User Avatar (right) with rose ring / Gold Mode */}
      {isUser && (
        <div className="relative ml-3 flex-shrink-0">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shadow-lg ring-2 ${
            isGoldMode
              ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-black shadow-[0_0_10px_rgba(251,191,36,0.5)] ring-amber-500/30'
              : 'bg-gradient-to-br from-rose-800 to-rose-600 text-white ring-rose-400/30'
          }`}>
            {avatarLetter}
          </div>
        </div>
      )}
    </div>
  );
});

// ============================================================================
// MAIN CHAT INTERFACE - v8.1 RESTORED
// ============================================================================

export default function ChatInterface({ character, loadedSession, onBack, settings: parentSettings }) {
  const { t } = useLanguage();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [passionLevel, setPassionLevel] = useState(0);
  const previousTierRef = useRef('surface');
  const [, setTierTransitioning] = useState(false);
  const [tierToast, setTierToast] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [showPassionPopover, setShowPassionPopover] = useState(false);
  const [showChatOptions, setShowChatOptions] = useState(false);

  // BLOCK 6.9: Entrance Animation
  const isVisible = useEntranceAnimation(100);

  // v0.2.5: Gold Mode State
  const isGoldMode = useGoldMode();
  
  // v0.2.5 RESTORED: Feature states from localStorage
  const [userName, setUserName] = useState('User');
  const [imageGenEnabled, setImageGenEnabled] = useState(false);
  // STEP 2 FIX: Initialize voiceEnabled as null to distinguish "not loaded" from "false"
  const [voiceEnabled, setVoiceEnabled] = useState(null);

  // v0.2.5 FIX: Settings come from parent (App.jsx), merged with localStorage for backward compatibility
  const [localSettings, setLocalSettings] = useState({
    imageGenUrl: IMAGE_GEN_DEFAULT_URL,
    voiceUrl: VOICE_DEFAULT_URL,
    ollamaUrl: OLLAMA_DEFAULT_URL,
    piperPath: '',
    modelPath: '',
    voiceVolume: 1.0,
    oledMode: false
  });
  
  // Merge parent settings with local settings (memoized to prevent useEffect churn)
  const settings = useMemo(() => ({ ...localSettings, ...parentSettings }), [localSettings, parentSettings]);

  // Voice Settings Popover State
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [availableVoiceModels, setAvailableVoiceModels] = useState([]);
  const [autoReadEnabled, setAutoReadEnabled] = useState(() => {
    const saved = localStorage.getItem('autoReadEnabled');
    try { return saved !== null ? JSON.parse(saved) : true; } catch { return true; }
  });

  // Persist autoReadEnabled
  useEffect(() => {
    localStorage.setItem('autoReadEnabled', JSON.stringify(autoReadEnabled));
  }, [autoReadEnabled]);
  
  // Text Zoom State
  const [fontSize, setFontSize] = useState(() => localStorage.getItem('chatFontSize') || 'base');

  // v0.2.5: Character Bio Modal
  const [showBioModal, setShowBioModal] = useState(false);

  // v0.2.5: Passion System Toggle (OFF = Unchained Mode, ON = Gatekeeping)
  const [isUnchainedMode, setIsUnchainedMode] = useState(() => {
    const saved = localStorage.getItem('passionGatekeepingEnabled');
    try { return saved !== null ? !JSON.parse(saved) : false; } catch { return false; }
  });

  // v0.2.5: Smart Suggestions
  const [smartSuggestions, setSmartSuggestions] = useState([]);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  const suggestionsHistoryRef = useRef([]);
  const chatMessages = useMemo(() => messages.filter(m => !m.isTierEvent), [messages]);

  const clearSuggestionsState = useCallback(() => {
    abortSuggestionCall();
    setSmartSuggestions([]);
    setIsGeneratingSuggestions(false);
    suggestionsHistoryRef.current = [];
  }, []);


  // v0.2.6: Impersonate (Write for me)
  const [isImpersonating, setIsImpersonating] = useState(false);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  // v0.2.5: Image Generation Modal
  const [showImageModal, setShowImageModal] = useState(false);
  const [imagePrompt, setImagePrompt] = useState('');
  const [generatingImage, setGeneratingImage] = useState(false);

  // v0.2.5: Tutorial Modal
  const [showTutorial, setShowTutorial] = useState(null);

  const [confirmModal, setConfirmModal] = useState(null);

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const userScrolledUpRef = useRef(false);
  const inputRef = useRef(null);
  const importFileRef = useRef(null);
  const audioRef = useRef(null);
  const saveTimerRef = useRef(null);
  const passionTimerRef = useRef(null);
  const abortRef = useRef(null);
  const streamBufferRef = useRef('');
  const rafRef = useRef(null);
  const settingsRef = useRef(parentSettings);
  const mountedRef = useRef(true);

  useEffect(() => {
    settingsRef.current = parentSettings;
  }, [parentSettings]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      if (passionTimerRef.current) {
        clearTimeout(passionTimerRef.current);
        passionTimerRef.current = null;
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      abortSuggestionCall();
      abortImpersonateCall();
      unloadOllamaModel(settingsRef.current);
    };
  }, []);

  // BLOCK 6.9.2: Close Chat Options when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showChatOptions && !event.target.closest('.chat-options-container')) {
        setShowChatOptions(false);
      }
      if (showVoiceSettings && !event.target.closest('.voice-settings-container')) {
        setShowVoiceSettings(false);
      }
    };

    if (showChatOptions || showVoiceSettings) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showChatOptions, showVoiceSettings]);

  useEffect(() => {
    if (!showPassionPopover) return;
    const handler = (e) => {
      if (!e.target.closest('[data-passion-popover]')) {
        setShowPassionPopover(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [showPassionPopover]);

  // ============================================================================
  // v0.2.5 RESTORED: LOAD SETTINGS FROM LOCALSTORAGE + IPC
  // ============================================================================

  useEffect(() => {
    const loadLocalSettings = async () => {
      try {
        // FIX 3: Load settings from IPC (source of truth)
        const ipcSettings = await window.electronAPI?.loadSettings?.();
        const backendSettings = ipcSettings?.success ? ipcSettings.settings : {};
        
        // Fallback to localStorage if IPC fails
        let fallbackSettings = {};
        try { fallbackSettings = JSON.parse(localStorage.getItem('settings') || '{}'); } catch { /* corrupted */ }
        const loadedSettings = Object.keys(backendSettings).length > 0
          ? backendSettings
          : fallbackSettings;

        // BLOCK 8.2: Store full settings object (including ollamaModel)
        setLocalSettings({
          imageGenUrl: loadedSettings.imageGenUrl || IMAGE_GEN_DEFAULT_URL,
          voiceUrl: loadedSettings.voiceUrl || VOICE_DEFAULT_URL,
          ollamaUrl: loadedSettings.ollamaUrl || OLLAMA_DEFAULT_URL,
          ollamaModel: loadedSettings.ollamaModel || DEFAULT_MODEL_NAME,
          piperPath: loadedSettings.piperPath || '',
          modelPath: loadedSettings.modelPath || '',
          voiceVolume: loadedSettings.voiceVolume ?? 1.0,
          oledMode: loadedSettings.oledMode || false
        });

        setUserName(loadedSettings.userName || 'User');
        setImageGenEnabled(loadedSettings.imageGenEnabled || false);
        // STEP 2 FIX: Use voiceEnabled from IPC/backend settings (explicit boolean check)
        const savedVoiceEnabled = loadedSettings.voiceEnabled === true;
        setVoiceEnabled(savedVoiceEnabled);
        // Load font size preference
        const savedFontSize = localStorage.getItem('chatFontSize') || 'base';
        setFontSize(savedFontSize);

        // v0.2.5: AUTO-DETECT MODEL WHEN OPENING CHAT
        const autoDetectResult = await autoDetectAndSetModel();

        if (autoDetectResult.success) {
        } else {
          console.warn('[v8.2 ChatInterface] ⚠️ No models found. User needs to install a model.');
        }

      } catch (error) {
        console.error('[v8.1 ChatInterface] ❌ Error loading settings:', error);
      }
    };

    loadLocalSettings();
    
    // FIX 3: Load voice models on mount
    const loadVoiceModels = async () => {
      try {
        const result = await window.electronAPI?.getLocalVoiceModels?.();
        if (result?.success && result?.models) {
          setAvailableVoiceModels(result.models);
        }
      } catch (error) {
        console.error('[ChatInterface] Error loading voice models:', error);
      }
    };
    loadVoiceModels();
  }, []);

  // ============================================================================
  // FIX 3: IPC-BASED VOICE TOGGLE SYNCHRONISATION
  // ============================================================================

  useEffect(() => {
    const cleanup = window.electronAPI?.onVoiceStatusChanged?.((newValue) => {
      setVoiceEnabled(prev => {
        if (prev !== newValue) {
          setLocalSettings(prevSettings => {
            const updated = { ...prevSettings, voiceEnabled: newValue };
            localStorage.setItem('settings', JSON.stringify(updated));
            return updated;
          });
          return newValue;
        }
        return prev;
      });
    });
    return () => { if (typeof cleanup === 'function') cleanup(); };
  }, []);

  // FIX 3: Settings updated listener (sync from backend)
  useEffect(() => {
    const cleanup = window.electronAPI?.onSettingsUpdated?.((newSettings) => {
      if (newSettings.voiceEnabled !== undefined) {
        setVoiceEnabled(prev => newSettings.voiceEnabled !== prev ? newSettings.voiceEnabled : prev);
      }
      if (newSettings.imageGenEnabled !== undefined) {
        setImageGenEnabled(prev => newSettings.imageGenEnabled !== prev ? newSettings.imageGenEnabled : prev);
      }
      setLocalSettings(prev => {
        const patch = {};
        if (newSettings.imageGenUrl !== undefined) patch.imageGenUrl = newSettings.imageGenUrl;
        if (newSettings.modelPath !== undefined) patch.modelPath = newSettings.modelPath;
        if (newSettings.piperPath !== undefined) patch.piperPath = newSettings.piperPath;
        return Object.keys(patch).length > 0 ? { ...prev, ...patch } : prev;
      });
      localStorage.setItem('settings', JSON.stringify(newSettings));
    });
    return () => { if (typeof cleanup === 'function') cleanup(); };
  }, []);

  // ============================================================================
  // PERSIST FONT SIZE CHANGES
  // ============================================================================

  useEffect(() => {
    localStorage.setItem('chatFontSize', fontSize);
  }, [fontSize]);

  // ============================================================================
  // v0.2.5: PERSIST PASSION GATEKEEPING TOGGLE & APPLY LOGIC
  // ============================================================================

  useEffect(() => {
    localStorage.setItem('passionGatekeepingEnabled', JSON.stringify(!isUnchainedMode));
  }, [isUnchainedMode]);

  useEffect(() => {
    let timer;
    let toastTimer;
    const currentTier = getTierKey(passionLevel);
    if (currentTier !== previousTierRef.current && passionLevel > 0) {
      setTierTransitioning(true);
      timer = setTimeout(() => setTierTransitioning(false), 600);
      const tierOrder = ['surface', 'aware', 'vivid', 'immersive', 'consuming', 'transcendent'];
      const oldIdx = tierOrder.indexOf(previousTierRef.current);
      const newIdx = tierOrder.indexOf(currentTier);
      const fromLabel = t.chat[`passion${previousTierRef.current.charAt(0).toUpperCase() + previousTierRef.current.slice(1)}`] || previousTierRef.current;
      const toLabel = t.chat[`passion${currentTier.charAt(0).toUpperCase() + currentTier.slice(1)}`] || currentTier;
      const template = newIdx > oldIdx ? t.chat.tierUp : t.chat.tierDown;
      if (template) {
        setTierToast(template.replace('{from}', fromLabel).replace('{to}', toLabel));
        toastTimer = setTimeout(() => setTierToast(null), 3000);
      }

      if (newIdx > oldIdx) {
        const tierLabel = PASSION_TIERS[currentTier]?.label || currentTier;
        setMessages(prev => [...prev, {
          role: 'system',
          content: tierLabel,
          isTierEvent: true,
          timestamp: Date.now()
        }]);
      }

      previousTierRef.current = currentTier;
    }
    return () => { if (timer) clearTimeout(timer); if (toastTimer) clearTimeout(toastTimer); };
  }, [passionLevel, t]);

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  useEffect(() => {
    let cancelled = false;

    const initializeChat = async () => {
      // Check if we're restoring a saved session
      if (loadedSession && loadedSession.messages && loadedSession.messages.length > 0) {
        if (cancelled) return;
        const restoredSessionId = loadedSession.sessionId || generateSessionId();
        setSessionId(restoredSessionId);
        setMessages(loadedSession.messages);
        const restoredLevel = loadedSession.passionLevel || 0;
        previousTierRef.current = getTierKey(restoredLevel);
        setPassionLevel(restoredLevel);
        if (restoredSessionId) {
          passionManager.setPassion(restoredSessionId, restoredLevel, true);
        }

        // Restore suggestions from last assistant message
        for (let i = loadedSession.messages.length - 1; i >= 0; i--) {
          const msg = loadedSession.messages[i];
          if (msg.role === 'assistant' && msg.suggestions?.length > 0) {
            setSmartSuggestions(msg.suggestions);
            break;
          }
        }

        return;
      }

      if (cancelled) return;

      // Warn if custom character has excessively large systemPrompt
      if (character.isCustom && character.systemPrompt && character.systemPrompt.length > 8192) {
        console.warn(`[ChatInterface] Custom character "${character.name}" systemPrompt is ${character.systemPrompt.length} chars (>8KB) — may cause slow responses`);
        toast.error(t.chat?.promptTooLarge || `Character prompt is very large (${Math.round(character.systemPrompt.length / 1024)}KB) — this may cause slow responses`);
      }

      // New chat = fresh passion level. Always 0.
      const newSessionId = generateSessionId();
      setSessionId(newSessionId);
      setPassionLevel(0);
      previousTierRef.current = 'surface';

      initializeGreeting();
    };

    initializeChat();

    return () => { cancelled = true; };
  }, [character]);

  const initializeGreeting = () => {
    let greeting;

    if (character.id && t.characters && t.characters[character.id] && t.characters[character.id].greeting) {
      greeting = t.characters[character.id].greeting;
    } else {
      greeting = character.greeting || character.startingMessage || `*smiles warmly* Hey! I'm ${character.name}.`;
    }

    greeting = resolveTemplates(greeting, character.name, userName);
    const greetingMsg = { role: 'assistant', content: greeting.trim(), timestamp: Date.now() };
    setMessages([greetingMsg]);

    if (settings.smartSuggestionsEnabled) {
      setIsGeneratingSuggestions(true);
      generateSuggestionsBackground([greetingMsg], character.name, character.description || '', userName, settings, (suggestions) => {
        const result = (suggestions && suggestions.length > 0) ? suggestions : [];
        setSmartSuggestions(result);
        setIsGeneratingSuggestions(false);
        if (result.length > 0) {
          setMessages(prev => {
            const updated = [...prev];
            if (updated.length > 0 && updated[0].role === 'assistant') {
              updated[0] = { ...updated[0], suggestions: result };
            }
            return updated;
          });
        }
      });
    }
  };

  // ============================================================================
  // AUTO-SAVE & ENVIRONMENT TRACKING
  // ============================================================================

  useEffect(() => {
    const hasUserMessage = messages.some(m => m.role === 'user');
    if (hasUserMessage && sessionId) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveCurrentSession();
      }, 500);
    }
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [messages, passionLevel, sessionId]);

  const saveCurrentSession = async () => {
    try {
      const sessionData = {
        characterName: character.name,
        character: character,
        conversationHistory: messages,
        passionLevel: passionLevel,
        mode: 'character_chat',
        lastPrompt: messages.filter(m => m && m.role === 'user').slice(-1)[0]?.content || ''
      };
      
      await saveSession(sessionId, sessionData);

      if (character?.id && passionLevel > 0) {
        passionManager.saveCharacterMemory(character.id, passionLevel, passionManager.getHistory(sessionId));
      }
    } catch (error) {
      console.error('[v8.1 ChatInterface] Auto-save error:', error);
    }
  };

  // ============================================================================
  // SCROLLING - AUTO-SCROLL TO BOTTOM
  // ============================================================================

  useEffect(() => {
    // Scroll immediately when messages change (new message sent = reset scroll lock)
    userScrolledUpRef.current = false;
    scrollToBottom();

    // Additional delayed scroll to ensure DOM has fully rendered
    const timer = setTimeout(() => {
      scrollToBottom();
    }, 100);

    return () => clearTimeout(timer);
  }, [messages]);

  useEffect(() => {
    if (isStreaming && !userScrolledUpRef.current) scrollToBottom();
  }, [streamingContent, isStreaming]);

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  };

  const handleMessagesScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    // Consider "at bottom" if within 150px of the end
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    userScrolledUpRef.current = !atBottom;
  };


  const handleSuggestionClick = (suggestion) => {
    setSmartSuggestions([]);
    handleSend(suggestion);
  };

  const handleImpersonate = async () => {
    if (isLoading || isStreaming || isImpersonating) return;
    clearSuggestionsState();
    setIsImpersonating(true);
    setInput('');
    try {
      const cleaned = await impersonateUser(
        chatMessages,
        character.name,
        userName,
        passionLevel,
        settings,
        (_token, display) => setInput(display)
      );
      if (cleaned) {
        setInput(cleaned);
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.warn('[ChatInterface] Impersonate failed:', err?.message);
        toast.error(t.chat?.sendError || 'Failed to get a response');
      }
    } finally {
      setIsImpersonating(false);
      inputRef.current?.focus();
    }
  };

  const handleCancelImpersonate = () => {
    abortImpersonateCall();
    setIsImpersonating(false);
  };

  // ============================================================================
  // v0.2.5: IMAGE GENERATION (AUTO & MANUAL)
  // ============================================================================

  const handleManualImageGen = async () => {
    if (!imagePrompt.trim()) return;

    setGeneratingImage(true);
    try {

      // Generate image using AUTOMATIC1111 API
      const base64Image = await generateImage(imagePrompt, settings.imageGenUrl, settings.imageGenTier || 'standard');

      // Add image to chat history
      const imageMessage = {
        role: 'assistant',
        content: '[Image Generated]',
        image: `data:image/png;base64,${base64Image}`,
        timestamp: Date.now()
      };

      setMessages(prev => [...prev, imageMessage]);
      setImagePrompt('');
      setShowImageModal(false);

    } catch (error) {
      console.error('[BLOCK 8.1 Image Gen] ❌ Error:', error);
      toast.error((t.chat.imageGenFailed || '').replace('{error}', error.message));
    } finally {
      setGeneratingImage(false);
    }
  };

  // ============================================================================
  // MESSAGE SENDING
  // ============================================================================

  const triggerSuggestions = (updatedMessages, currentPassionLevel) => {
    if (!settings.smartSuggestionsEnabled) return;
    const rollingAvoid = suggestionsHistoryRef.current.slice(-30);
    const suggestStart = Date.now();
    setIsGeneratingSuggestions(true);
    generateSuggestionsBackground(updatedMessages, character.name, character.description || '', userName, settings, (suggestions) => {
      const suggestTime = ((Date.now() - suggestStart) / 1000).toFixed(1);
      setIsGeneratingSuggestions(false);
      const result = (suggestions && suggestions.length > 0) ? suggestions : [];
      console.log(`[API] Suggestions ready: ${result.length} in ${suggestTime}s`);
      setSmartSuggestions(result);
      if (result.length > 0) {
        suggestionsHistoryRef.current = [...suggestionsHistoryRef.current, ...result].slice(-50);
      }
      setMessages(prev => {
        let lastIdx = -1;
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].role === 'assistant') { lastIdx = i; break; }
        }
        if (lastIdx === -1) return prev;
        const updated = [...prev];
        updated[lastIdx] = { ...updated[lastIdx], suggestions: result.length > 0 ? result : undefined, suggestTime: parseFloat(suggestTime) };
        return updated;
      });
    }, rollingAvoid, currentPassionLevel ?? passionLevel);
  };

  const handleSend = async (messageText = input) => {
    const safeMessageText = (messageText || '').trim();
    if (!safeMessageText || isLoading || isStreaming) return;

    if (isCommand(safeMessageText)) {
      const result = executeCommand(safeMessageText, { messages, t, settings, character, passionLevel });
      if (result.handled && result.message) {
        setMessages(prev => [...prev, result.message]);
      }
      setInput('');
      return;
    }

    clearSuggestionsState();
    abortImpersonateCall();
    setIsImpersonating(false);

    if (abortRef.current) abortRef.current.abort();
    const activeAbortHandle = createStreamAbortHandle();
    abortRef.current = activeAbortHandle;

    const userMessage = {
      role: 'user',
      content: safeMessageText,
      timestamp: Date.now()
    };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const handleApiStats = (stats) => {
        window.dispatchEvent(new CustomEvent('aria-api-stats', { detail: stats }));
      };

      let firstToken = true;
      streamBufferRef.current = '';
      rafRef.current = null;
      const flushBuffer = () => {
        if (!mountedRef.current) return;
        setStreamingContent(streamBufferRef.current);
        rafRef.current = null;
      };
      const handleToken = (token) => {
        if (typeof token !== 'string') return;
        streamBufferRef.current += token;
        if (firstToken) {
          firstToken = false;
          setIsLoading(false);
          setIsStreaming(true);
          setStreamingContent(streamBufferRef.current);
          return;
        }
        if (!rafRef.current) {
          rafRef.current = requestAnimationFrame(flushBuffer);
        }
      };

      const historyForApi = [...chatMessages, userMessage];
      const response = await sendMessage(
        safeMessageText,
        character,
        '',
        historyForApi,
        sessionId,
        isUnchainedMode,
        handleApiStats,
        settings,
        handleToken,
        activeAbortHandle
      );

      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }

      if (!response.success) {
        setIsStreaming(false);
        setStreamingContent('');
        throw new Error(response.error || 'Failed to get response');
      }

      const safeResponse = (response.message || '').trim();


      const assistantMessage = {
        role: 'assistant',
        content: safeResponse,
        timestamp: Date.now(),
        ...(response.stats && { stats: response.stats })
      };
      const updatedMessages = [...newMessages, assistantMessage];

      // Set final message BEFORE clearing streaming → no flash
      setMessages(updatedMessages);
      setIsStreaming(false);
      setStreamingContent('');

      const newPassion = response.passionLevel ?? passionLevel;
      triggerSuggestions(updatedMessages, newPassion);

      if (response.passionLevel !== undefined) {
        setPassionLevel(response.passionLevel);
      }

      const passionEnabled = character.passionEnabled !== false;
      if (passionEnabled && sessionId) {
        scorePassionBackground(safeMessageText, safeResponse, settings, response.modelCtx || 4096, sessionId, character);
        if (passionTimerRef.current) clearTimeout(passionTimerRef.current);
        passionTimerRef.current = setTimeout(() => {
          setPassionLevel(passionManager.getPassionLevel(sessionId));
        }, 6000);
      }

      // Voice output (if enabled and auto-read enabled)
      if (voiceEnabled === true && autoReadEnabled) {
        handleSpeak(safeResponse);
      }
    } catch (error) {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      if (activeAbortHandle.aborted && activeAbortHandle.reason === 'user') return;
      console.error('[ChatInterface] Send error:', error);
      const errorMsg = error?.message === 'The operation was aborted'
        ? (t.chat?.timeout || 'Request timed out')
        : error?.message === 'No response from Ollama'
          ? (t.chat?.noOllamaResponse || 'Model returned empty response — please send again.')
          : (t.chat?.sendError || error?.message || 'Failed to get response');
      toast.error(errorMsg);
    } finally {
      if (abortRef.current === activeAbortHandle) {
        abortRef.current = null;
      }
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      setIsLoading(false);
      setIsStreaming(false);
      setStreamingContent('');
      inputRef.current?.focus();
    }
  };

  // ============================================================================
  // VOICE/TTS PLAYBACK - RENDERER PROCESS (Windows Volume Mixer Support)
  // ============================================================================

  const playAudio = async (audioData) => {
    try {
      // Stop current audio if playing
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }

      // Create new audio instance
      audioRef.current = new Audio(audioData);
      audioRef.current.volume = settings.voiceVolume ?? 1.0;
      await audioRef.current.play();
    } catch (err) {
      console.error("Audio Playback Error:", err);
    }
  };

  // Live volume update
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = settings.voiceVolume ?? 1.0;
    }
  }, [settings.voiceVolume]);

  // Immediate stop when voice is disabled
  useEffect(() => {
    if (voiceEnabled !== true && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [voiceEnabled]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    };
  }, []);

  const handleSpeak = async (text) => {
    if (!settings.piperPath || !settings.modelPath) return;

    try {
      const result = await window.electronAPI.generateSpeech({
        text: text.replace(/\*/g, '').replace(/"/g, ''),
        piperPath: settings.piperPath,
        modelPath: settings.modelPath,
        voiceTier: settings.voiceTier || 'standard'
      });

      if (result?.success && result?.audioData) {
        await playAudio(result.audioData);
      }
    } catch (err) {
      console.error("Audio Generation Error:", err);
    }
  };

  // ============================================================================
  // CHAT ACTIONS WITH HARD RESET
  // ============================================================================


  const handleClearChat = async (skipConfirmation = false) => {
    const doReset = async () => {
      try {
        await deleteSession(sessionId);
      } catch (error) {
        console.error('[v9.2 ChatInterface] Error during session delete:', error);
      }

      if (sessionId) {
        passionManager.resetPassion(sessionId);
      }
      if (character?.id) {
        passionManager.clearCharacterMemory(character.id);
      }

      const newSid = generateSessionId();
      setSessionId(newSid);
      setPassionLevel(0);
      clearSuggestionsState();
      previousTierRef.current = 'surface';
      initializeGreeting();
    };

    if (skipConfirmation) {
      await doReset();
    } else {
      setConfirmModal({
        message: t.chat.deleteConversationConfirm.replace('{name}', character.name),
        onConfirm: doReset
      });
    }
  };

  const handleNewGame = async () => {
    setConfirmModal({
      message: t.chat.startNewGameConfirm.replace('{name}', character.name),
      onConfirm: () => handleClearChat(true)
    });
  };

  const handleExportChat = () => {
    try {
      const exportData = {
        character: { name: character.name, description: character.description },
        model: settings.ollamaModel || 'unknown',
        messages: messages,
        passionLevel: passionManager.getPassionLevel(sessionId) || passionLevel,
        passionTier: getTierKey(passionManager.getPassionLevel(sessionId) || passionLevel),
        passionSpeed: character.passionSpeed || 'normal',
        passionEnabled: character.passionEnabled !== false,
        unchainedMode: isUnchainedMode,
        passionHistory: passionManager.getHistory(sessionId),
        sessionId: sessionId,
        exportedAt: new Date().toISOString(),
        version: appVersion
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      downloadBlob(blob, `chat-${character.name}-${Date.now()}.json`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error(t.chat.failedToExport);
    }
  };


  const handleImportChat = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const importData = JSON.parse(text);

      // Validate required fields
      if (!importData.messages || !Array.isArray(importData.messages)) {
        toast.error(t.chat.invalidChatFile);
        return;
      }

      // Import the chat
      setMessages(importData.messages);
      if (importData.passionLevel !== undefined) {
        previousTierRef.current = getTierKey(importData.passionLevel);
        setPassionLevel(importData.passionLevel);
      }
      if (importData.sessionId) {
        setSessionId(importData.sessionId);
        if (importData.passionLevel !== undefined) {
          passionManager.setPassion(importData.sessionId, importData.passionLevel);
        }
        if (importData.passionHistory) {
          passionManager.restoreHistory(importData.sessionId, importData.passionHistory);
        }
      }

      toast.success(t.chat.chatImported);
      // Restore focus to input after import
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (error) {
      console.error('Import error:', error);
      toast.error(t.chat.failedToImport);
    } finally {
      e.target.value = '';
    }
  };

  const handleZoomIn = () => {
    const sizes = ['xs', 'sm', 'base', 'lg', 'xl', '2xl'];
    const currentIndex = sizes.indexOf(fontSize);
    if (currentIndex < sizes.length - 1) {
      setFontSize(sizes[currentIndex + 1]);
    }
  };

  const handleZoomOut = () => {
    const sizes = ['xs', 'sm', 'base', 'lg', 'xl', '2xl'];
    const currentIndex = sizes.indexOf(fontSize);
    if (currentIndex > 0) {
      setFontSize(sizes[currentIndex - 1]);
    }
  };

  const regenerateLastResponse = async () => {
    if (messages.length < 2 || isLoading || isStreaming) return;

    let lastUserMessageIndex;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i] && messages[i].role === 'user') { lastUserMessageIndex = i; break; }
    }
    if (lastUserMessageIndex === undefined) return;

    const messagesUpToLastUser = messages.slice(0, lastUserMessageIndex + 1);
    const lastUserMessage = (messages[lastUserMessageIndex].content || '').trim();

    clearSuggestionsState();
    abortImpersonateCall();
    setIsImpersonating(false);

    setMessages(messagesUpToLastUser);
    setIsLoading(true);
    if (abortRef.current) abortRef.current.abort();
    const activeAbortHandle = createStreamAbortHandle();
    abortRef.current = activeAbortHandle;

    try {
      let firstToken = true;
      streamBufferRef.current = '';
      rafRef.current = null;
      const flushBuffer = () => {
        if (!mountedRef.current) return;
        setStreamingContent(streamBufferRef.current);
        rafRef.current = null;
      };
      const handleToken = (token) => {
        if (typeof token !== 'string') return;
        streamBufferRef.current += token;
        if (firstToken) {
          firstToken = false;
          setIsLoading(false);
          setIsStreaming(true);
          setStreamingContent(streamBufferRef.current);
          return;
        }
        if (!rafRef.current) {
          rafRef.current = requestAnimationFrame(flushBuffer);
        }
      };

      const regenHistoryForApi = messagesUpToLastUser.filter(m => !m.isTierEvent);
      const response = await sendMessage(
        lastUserMessage,
        character,
        '',
        regenHistoryForApi,
        sessionId,
        isUnchainedMode,
        null,
        settings,
        handleToken,
        activeAbortHandle
      );

      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }

      if (!response.success) {
        setIsStreaming(false);
        setStreamingContent('');
        throw new Error(response.error || 'Failed to regenerate');
      }

      const safeResponse = (response.message || '').trim();

      const assistantMessage = {
        role: 'assistant',
        content: safeResponse,
        timestamp: Date.now(),
        ...(response.stats && { stats: response.stats })
      };
      const updatedMessages = [...messagesUpToLastUser, assistantMessage];

      // Set final message BEFORE clearing streaming → no flash
      setMessages(updatedMessages);
      setIsStreaming(false);
      setStreamingContent('');

      const newPassion = response.passionLevel ?? passionLevel;
      triggerSuggestions(updatedMessages, newPassion);

      if (response.passionLevel !== undefined) {
        setPassionLevel(response.passionLevel);
      }

      const passionEnabled = character.passionEnabled !== false;
      if (passionEnabled && sessionId) {
        passionManager.revertLastScore(sessionId);
        scorePassionBackground(lastUserMessage, safeResponse, settings, response.modelCtx || 4096, sessionId, character);
        if (passionTimerRef.current) clearTimeout(passionTimerRef.current);
        passionTimerRef.current = setTimeout(() => {
          setPassionLevel(passionManager.getPassionLevel(sessionId));
        }, 6000);
      }
    } catch (error) {
      if (activeAbortHandle.aborted && activeAbortHandle.reason === 'user') return;
      console.error('[ChatInterface] Regeneration error:', error);
      const errorMsg = error?.message === 'The operation was aborted'
        ? (t.chat?.timeout || 'Request timed out')
        : (t.chat?.sendError || 'Failed to regenerate response');
      toast.error(errorMsg);
    } finally {
      if (abortRef.current === activeAbortHandle) {
        abortRef.current = null;
      }
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      setIsLoading(false);
      setIsStreaming(false);
      setStreamingContent('');
    }
  };

  const copyMessageToClipboard = (content) => {
    const safeContent = (content || '').trim();
    if (!safeContent) return;
    
    navigator.clipboard.writeText(safeContent)
      .then(() => toast.success(t.chat?.copied || 'Copied'))
      .catch(err => {
        console.error('Failed to copy:', err);
        toast.error(t.chat?.copyFailed || 'Copy failed');
      });
  };


  // Voice Settings Toggle Handler
  const handleVoiceSettingsClick = () => {
    setShowVoiceSettings(!showVoiceSettings);
  };

  // v0.2.5: Tutorial Test Handlers
  const handleTestImageGen = async (url) => {
    try {
      const result = await window.electronAPI?.testImageGen?.(url);
      if (result?.success) {
        toast.success(t.chat.imageGenTestSuccess);
      } else {
        toast.error(t.chat.imageGenTestFailed);
      }
    } catch (error) {
      console.error('[Chat] Image gen test error:', error);
      toast.error(t.chat.testError);
    }
  };

  const handleTestVoice = async (url) => {
    try {
      const result = await window.electronAPI?.testVoice?.(url);
      if (result?.success) {
        toast.success(t.chat.voiceTestSuccess);
      } else {
        toast.error(t.chat.voiceTestFailed);
      }
    } catch (error) {
      console.error('[Chat] Voice test error:', error);
      toast.error(t.chat.testError);
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="relative flex flex-col h-screen overflow-hidden bg-gradient-to-br from-zinc-900 via-zinc-900 to-black text-white">
      {passionLevel > 15 && (
        <div
          className="pointer-events-none fixed inset-0 z-10 transition-opacity duration-[2000ms]"
          style={{
            background: `radial-gradient(ellipse at center, transparent 50%, rgba(244, 63, 94, ${Math.min((passionLevel - 15) * 0.003, 0.25)}) 100%)`
          }}
        />
      )}
      {tierToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[300] px-4 py-2 bg-zinc-900/95 border border-zinc-700 rounded-full text-sm text-zinc-200 shadow-xl backdrop-blur-sm animate-pulse">
          {tierToast}
        </div>
      )}
      {/* Hidden file input for import */}
      <input
        ref={importFileRef}
        type="file"
        accept=".json"
        onChange={handleImportChat}
        className="hidden"
        aria-label="Import chat file"
      />

      {/* v1.0 ROSE NOIR: Premium Glass Header - BLOCK 6.9: Smooth Fade-In */}
      <div className={`glass-header flex items-center justify-between px-6 py-5 flex-shrink-0 relative z-40 transition-all duration-500 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
      }`}>
        <div className="flex items-center gap-5">
          {/* Back Button */}
          <button
            onClick={onBack}
            className="p-3 hover:bg-white/5 rounded-xl transition-all duration-200 text-zinc-500 hover:text-white"
            title={t.chat.back}
            aria-label={t.chat.back}
          >
            <ArrowLeft size={22} strokeWidth={1.5} />
          </button>

          {/* Character Avatar with Ring - Larger */}
          <div className="relative">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold text-white shadow-xl ring-2 ring-white/10"
              style={{
                background: `linear-gradient(135deg, ${character.themeColor}, ${character.themeColor}88)`
              }}
            >
              {character.name.charAt(0)}
            </div>
            {/* Online indicator */}
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-emerald-500 rounded-full border-2 border-black shadow-lg shadow-emerald-500/50" />
          </div>

          {/* Name & Passion Badge */}
          <div className="relative">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-white">
                {character.isCustom ? character.name : (t.characters?.[character.id]?.name || character.name)}
              </h2>
              <button
                onClick={() => setShowBioModal(true)}
                className="p-2 hover:bg-white/10 rounded-lg text-zinc-500 hover:text-zinc-300 transition-all"
                title={t.chat.viewBio}
                aria-label={t.chat.viewBio}
              >
                <Info size={18} strokeWidth={1.5} />
              </button>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-sm text-zinc-500">
                {character.isCustom ? character.subtitle || character.role : (t.characters?.[character.id]?.subtitle || character.subtitle || character.role)}
              </p>
              {passionLevel > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); setShowPassionPopover(prev => !prev); }}
                  className="text-xs px-2 py-0.5 rounded-full bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/60 transition-colors cursor-pointer"
                  data-passion-popover
                >
                  · {PASSION_TIERS[getTierKey(passionLevel)]?.label}
                </button>
              )}
            </div>
            {showPassionPopover && (
              <div
                className="absolute top-full left-0 mt-2 bg-zinc-900 border border-zinc-700/50 rounded-xl shadow-2xl z-50 p-4 min-w-[200px]"
                data-passion-popover
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-zinc-300">
                    {PASSION_TIERS[getTierKey(passionLevel)]?.label}
                  </span>
                  <span className="text-sm text-zinc-500">{passionLevel}/100</span>
                </div>
                <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${passionLevel}%`,
                      background: 'linear-gradient(90deg, #71717a, #f43f5e)'
                    }}
                  />
                </div>
                <div className="text-xs text-zinc-500 mb-3">
                  {t.chat?.voiceSettings?.speed || 'Speed'}: {(() => {
                    const sp = character?.passionSpeed || 'normal';
                    return t.characterCreator?.['passionSpeed_' + sp] || sp.charAt(0).toUpperCase() + sp.slice(1);
                  })()}
                </div>
                <button
                  onClick={() => {
                    passionManager.resetPassion(sessionId);
                    if (character?.id) passionManager.clearCharacterMemory(character.id);
                    setPassionLevel(0);
                    setShowPassionPopover(false);
                  }}
                  className="w-full text-xs text-zinc-500 hover:text-rose-400 py-1.5 transition-colors cursor-pointer"
                >
                  {t.chat?.resetPassion || 'Reset Passion'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Side - Icon Buttons with Rose Accents - BLOCK 6.9: Enhanced Clickability */}
        <div className="flex items-center gap-2 relative z-50 pointer-events-auto">
          <button
            onClick={() => setShowImageModal(true)}
            className={`p-3 hover:bg-white/10 active:scale-95 rounded-xl transition-all duration-200 ${
              imageGenEnabled ? 'text-purple-400 hover:text-purple-300' : 'text-zinc-600'
            }`}
            title={t.chat?.imageGeneration || 'Image Generation'}
            aria-label={t.chat?.imageGeneration || 'Image Generation'}
          >
            <ImageIcon size={22} strokeWidth={1.5} />
          </button>

          {/* Voice Settings Button with Popover */}
          <div className="relative z-[100] pointer-events-auto voice-settings-container">
            <button
              onClick={handleVoiceSettingsClick}
              className={`p-3 hover:bg-white/10 active:scale-95 rounded-xl transition-all duration-200 ${
                voiceEnabled === true ? 'text-cyan-400 hover:text-cyan-300' : 'text-zinc-600'
              }`}
              title={t.chat?.voiceSettings?.title || 'Voice Settings'}
              aria-label={t.chat?.voiceSettings?.title || 'Voice Settings'}
            >
              <Volume2 size={22} strokeWidth={1.5} />
            </button>

            {/* Voice Settings Popover */}
            {showVoiceSettings && (
              <div className={`absolute top-12 right-0 w-64 ${settings.oledMode ? 'bg-black' : 'bg-zinc-900'} border border-zinc-700 rounded-xl shadow-2xl z-[200] flex flex-col p-4 backdrop-blur-xl`}>
                <div className="space-y-4">
                  {/* Master Toggle: Enable Voice */}
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-zinc-100">{t.chat.voiceSettings.enableVoice}</span>
                      <p className="text-xs text-zinc-500 mt-0.5">{t.chat.voiceSettings.masterToggle}</p>
                    </div>
                    <button
                      onClick={async () => {
                        // STEP 2 FIX: Handle null state (not loaded yet)
                        const currentValue = voiceEnabled === null ? false : voiceEnabled;
                        const newValue = !currentValue;
                        // STEP 2 FIX: Save immediately via IPC (broadcasts automatically)
                        const updatedSettings = { ...settings, voiceEnabled: newValue };
                        localStorage.setItem('settings', JSON.stringify(updatedSettings));
                        await window.electronAPI.saveSettings(updatedSettings);
                        
                        // Optimistic update
                        setVoiceEnabled(newValue);
                        setLocalSettings(updatedSettings);
                      }}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                        voiceEnabled === true
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                          : 'bg-zinc-700/50 text-zinc-400 border border-zinc-600/30'
                      }`}
                    >
                      {voiceEnabled === true ? 'ON' : 'OFF'}
                    </button>
                  </div>

                  {/* Auto-Read Toggle */}
                  {voiceEnabled === true && (
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-zinc-100">{t.chat.voiceSettings.autoRead}</span>
                        <p className="text-xs text-zinc-500 mt-0.5">{t.chat.voiceSettings.autoReadDesc}</p>
                      </div>
                      <button
                        onClick={() => setAutoReadEnabled(!autoReadEnabled)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                          autoReadEnabled
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                            : 'bg-zinc-700/50 text-zinc-400 border border-zinc-600/30'
                        }`}
                      >
                        {autoReadEnabled ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  )}

                  {/* Voice Model Selection - FIX 3 */}
                  {voiceEnabled === true && (
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">{t.chat.voiceSettings.voiceModel}</label>
                      <CustomDropdown
                        value={settings.modelPath || ''}
                        onChange={async (e) => {
                          const selectedPath = e.target.value;
                          if (selectedPath === '__browse__') {
                            const path = await window.electronAPI.selectFile([
                              { name: 'ONNX Model', extensions: ['onnx'] }
                            ]);
                            if (path) {
                              const newSettings = { ...settings, modelPath: path };
                              setLocalSettings(newSettings);
                              await window.electronAPI.saveSettings(newSettings);
                            }
                          } else {
                            const newSettings = { ...settings, modelPath: selectedPath };
                            setLocalSettings(newSettings);
                            await window.electronAPI.saveSettings(newSettings);
                          }
                        }}
                        options={[
                          { value: '', label: t.chat.voiceSettings.selectModel },
                          ...availableVoiceModels.map(model => ({ value: model.path, label: model.name })),
                          { value: '__browse__', label: t.chat.voiceSettings.browse }
                        ]}
                      />
                    </div>
                  )}

                  {/* Volume Slider */}
                  {voiceEnabled === true && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-zinc-100">{t.chat.voiceSettings.volume}</span>
                        <span className="text-xs text-cyan-400 font-mono">{Math.round((settings.voiceVolume ?? 1.0) * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={settings.voiceVolume ?? 1.0}
                        onChange={async (e) => {
                          const newVol = parseFloat(e.target.value);
                          const newSettings = { ...settings, voiceVolume: newVol };
                          setLocalSettings(newSettings);
                          await window.electronAPI.saveSettings(newSettings);
                        }}
                        className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => {
              const msg = isUnchainedMode
                ? (t.chat.disableUnchainedConfirm || '').replace('{level}', passionLevel)
                : (t.chat.enableUnchainedConfirm || '');
              setConfirmModal({ message: msg, onConfirm: () => setIsUnchainedMode(!isUnchainedMode) });
            }}
            className={`p-3 rounded-xl transition-all duration-200 active:scale-95 ${
              isUnchainedMode
                ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 shadow-lg shadow-rose-500/20'
                : 'hover:bg-white/10 text-cyan-400 hover:text-cyan-300'
            }`}
            title={!isUnchainedMode ? t.chat.enableUnchained : t.chat.unchainedActive}
            aria-label={!isUnchainedMode ? t.chat.enableUnchained : t.chat.unchainedActive}
          >
            <Sparkles size={22} strokeWidth={1.5} />
          </button>

          {/* Regenerate Last Response */}
          <button
            onClick={regenerateLastResponse}
            disabled={isLoading || isStreaming || messages.length < 2}
            className="p-3 hover:bg-white/10 active:scale-95 rounded-xl transition-all duration-200 text-zinc-500 hover:text-rose-400 disabled:opacity-30 disabled:cursor-not-allowed"
            title={t.chat.regenerateResponse}
            aria-label={t.chat.regenerateResponse}
          >
            <RotateCcw size={22} strokeWidth={1.5} />
          </button>

          {/* Chat Options Button - BLOCK 6.9.2: Opens local menu, not global Settings */}
          <div className="relative z-[100] pointer-events-auto chat-options-container">
            <button
              onClick={() => setShowChatOptions(!showChatOptions)}
              className={`p-3 hover:bg-white/10 active:scale-95 rounded-xl transition-all duration-200 ${
                showChatOptions ? 'text-rose-400' : 'text-zinc-500 hover:text-white'
              }`}
              title={t.chat.chatOptions}
              aria-label={t.chat.chatOptions}
            >
              <SettingsIcon size={22} strokeWidth={1.5} />
            </button>

            {/* BLOCK 6.9.2: Chat Options Popover */}
            {showChatOptions && (
              <div className="absolute top-12 right-0 w-56 bg-zinc-950 border border-white/10 rounded-xl shadow-2xl z-[200] flex flex-col p-1 backdrop-blur-xl">
                {/* Text Zoom */}
                <div className="px-3 py-2 border-b border-white/5">
                  <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium">{t.chat.textSize}</span>
                  <div className="flex gap-1 mt-1">
                    <button
                      onClick={handleZoomOut}
                      disabled={fontSize === 'xs'}
                      className="flex-1 px-2 py-1 text-xs rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30 transition-all"
                    >
                      <ZoomOut size={14} className="inline mr-1" />
                      {t.chat.smaller}
                    </button>
                    <button
                      onClick={handleZoomIn}
                      disabled={fontSize === '2xl'}
                      className="flex-1 px-2 py-1 text-xs rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30 transition-all"
                    >
                      <ZoomIn size={14} className="inline mr-1" />
                      {t.chat.larger}
                    </button>
                  </div>
                </div>

                {/* Import/Export */}
                <button
                  onClick={() => { handleExportChat(); setShowChatOptions(false); }}
                  className="text-sm text-zinc-400 hover:text-white hover:bg-white/5 p-2.5 rounded-lg text-left transition-colors flex items-center gap-2"
                >
                  <Download size={16} />
                  {t.chat.export}
                </button>
                <button
                  onClick={() => { importFileRef.current?.click(); setShowChatOptions(false); }}
                  className="text-sm text-zinc-400 hover:text-white hover:bg-white/5 p-2.5 rounded-lg text-left transition-colors flex items-center gap-2"
                >
                  <Upload size={16} />
                  {t.chat.import}
                </button>

                {/* Danger Zone */}
                <div className="border-t border-white/5 mt-1 pt-1">
                  <button
                    onClick={() => { handleNewGame(); setShowChatOptions(false); }}
                    className="w-full text-sm text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 p-2.5 rounded-lg text-left transition-colors flex items-center gap-2"
                  >
                    <Trash2 size={16} />
                    {t.chat.clear}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MESSAGES - BLOCK 6.7: Increased bottom padding for floating input */}
      <div
        ref={messagesContainerRef}
        onScroll={handleMessagesScroll}
        className={`flex-1 min-h-0 overflow-y-auto px-4 py-6 pb-64 ${
          isGoldMode ? 'scrollbar-gold' : ''
        }`}
      >
        <div className="max-w-5xl mx-auto">
          {messages.map((message, index) => (
            message.isTierEvent ? (
              <div key={message.timestamp} className="flex items-center justify-center gap-3 py-4 select-none">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent to-rose-500/30" />
                <span className="text-[11px] font-medium text-rose-400/60 tracking-[0.2em] uppercase">
                  ✦ {message.content} ✦
                </span>
                <div className="h-px flex-1 bg-gradient-to-l from-transparent to-rose-500/30" />
              </div>
            ) : message.role === 'system' ? (
              <div key={`${message.timestamp || index}-system`} className="flex justify-center mb-4 message-slide-in">
                <div className={`max-w-[85%] rounded-xl px-5 py-3 text-sm whitespace-pre-wrap font-mono ${
                  isGoldMode
                    ? 'bg-amber-950/40 border border-amber-500/20 text-amber-200/90'
                    : 'bg-zinc-900/80 border border-rose-500/20 text-zinc-300'
                }`}>
                  {message.content}
                </div>
              </div>
            ) : (
              <MessageBubble
                key={`${message.timestamp || index}-${message.role}`}
                message={message}
                isUser={message.role === 'user'}
                character={character}
                userName={userName}
                onCopy={copyMessageToClipboard}
                onSpeak={handleSpeak}
                voiceEnabled={voiceEnabled}
                fontSize={fontSize}
                isGoldMode={isGoldMode}
                t={t}
              />
            )
          ))}

          {(isLoading || isStreaming) && (
            <div className="flex justify-start mb-4">
              <div className="relative mr-3 flex-shrink-0">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-lg ring-2 ring-white/10"
                  style={{
                    background: `linear-gradient(135deg, ${character?.themeColor || '#52525b'}, ${character?.themeColor || '#52525b'}88)`
                  }}
                >
                  {character.name.charAt(0)}
                </div>
              </div>
              <div className="max-w-[75%] rounded-2xl px-5 py-3.5 relative transition-all duration-200 glass hover:border-white/10">
                {!streamingContent ? (
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1.5">
                      <div className="w-2 h-2 bg-rose-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-rose-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-rose-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-zinc-500 text-sm">
                      {t.chat.isTyping.replace('{name}', character.isCustom ? character.name : (t.characters?.[character.id]?.name || character.name))}
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="text-xs text-zinc-400 mb-1.5 font-medium flex items-center gap-1.5"><span>{character.name}</span></div>
                    <div className={`whitespace-pre-wrap break-words leading-relaxed ${{ xs: 'text-xs', sm: 'text-sm', base: 'text-base', lg: 'text-lg', xl: 'text-xl', '2xl': 'text-2xl' }[fontSize] || 'text-base'}`}>
                      {(() => {
                        const formattedParts = formatMessageText(streamingContent || '', false);
                        return formattedParts.map((part, i) => {
                          if (part.type === 'action') {
                            return <span key={i} className="text-zinc-400 italic">{part.text}</span>;
                          } else if (part.type === 'dialogue') {
                            return <span key={i} className="text-white font-normal">{part.text}</span>;
                          } else {
                            return <span key={i} className="text-zinc-200">{part.text}</span>;
                          }
                        });
                      })()}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* v1.0 ROSE NOIR: Floating Input "Cockpit" - BLOCK 6.7: Detached, premium styling */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-5xl z-50">
        {/* Suggestion Skeleton Loading */}
        {settings.smartSuggestionsEnabled && isGeneratingSuggestions && smartSuggestions.length === 0 && !isStreaming && !isImpersonating && (
          <div className="flex gap-2.5 mb-4 flex-wrap justify-center">
            {[0, 1, 2].map(i => (
              <div
                key={`skeleton-${i}`}
                className={`suggestion-skeleton px-4 py-2 rounded-full flex items-center gap-2 ${
                  isGoldMode ? 'bg-amber-500/5 border border-amber-500/20' : 'bg-rose-500/5 border border-zinc-700/30'
                }`}
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className={`w-3 h-3 rounded-full ${isGoldMode ? 'bg-amber-500/20' : 'bg-rose-500/20'}`} />
                <div className={`h-3 rounded-full ${isGoldMode ? 'bg-amber-500/15' : 'bg-zinc-700/40'}`} style={{ width: `${60 + i * 20}px` }} />
              </div>
            ))}
          </div>
        )}
        {/* Smart Suggestions - Rose Noir Pills */}
        {settings.smartSuggestionsEnabled && smartSuggestions.length > 0 && !isStreaming && !isImpersonating && (
          <div className="flex gap-2.5 mb-4 flex-wrap justify-center" role="group" aria-label={t.settings?.smartSuggestions || 'Suggestions'}>
            {smartSuggestions.map((suggestion, i) => (
              <button
                key={`suggestion-${suggestion.slice(0, 20)}-${i}`}
                onClick={() => handleSuggestionClick(suggestion)}
                disabled={isLoading}
                className={`suggestion-pill px-4 py-2 bg-zinc-900/95 backdrop-blur-2xl border rounded-full text-sm transition-all duration-200 disabled:opacity-50 flex items-center gap-2 shadow-lg ${
                  isGoldMode
                    ? 'border-amber-500/40 text-amber-100 hover:bg-amber-500/10 hover:shadow-[0_0_15px_-3px_rgba(245,158,11,0.3)] hover:border-amber-400'
                    : 'border-zinc-700/50 hover:border-rose-500/30 text-zinc-400 hover:text-rose-300 hover:bg-rose-500/10'
                }`}
                style={{ animationDelay: `${i * 75}ms` }}
                title={suggestion}
              >
                <Sparkles size={12} className={isGoldMode ? 'text-amber-400/70' : 'text-rose-400/70'} />
                <span className="truncate max-w-[280px] sm:max-w-[400px] md:max-w-[500px]">{suggestion}</span>
              </button>
            ))}
          </div>
        )}
        {/* Floating Input Bar - Premium Glass Cockpit */}
        <div className={`bg-zinc-900/95 backdrop-blur-2xl rounded-3xl shadow-[0_20px_50px_-10px_rgba(0,0,0,0.8)] px-5 py-4 flex items-center gap-3 transition-all duration-200 ${
          isGoldMode ? 'border border-amber-500/30 focus-within:border-amber-400 focus-within:ring-1 focus-within:ring-amber-400/50' : 'border border-rose-500/30 focus-within:border-rose-500'
        }`}>
          <textarea
            ref={inputRef}
            value={input}
            rows={1}
            onChange={(e) => {
              if (isImpersonating) {
                abortImpersonateCall();
                setIsImpersonating(false);
              }
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !isStreaming) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={t.chat.messageCharacter.replace('{name}', character.isCustom ? character.name : (t.characters?.[character.id]?.name || character.name))}
            disabled={isLoading}
            className="chat-input flex-1 min-w-0 bg-transparent border-none outline-none ring-0 text-white text-lg placeholder-zinc-500 focus:outline-none focus:ring-0 disabled:opacity-50 px-2 resize-none overflow-y-auto"
          />
          <button
            onClick={isImpersonating ? handleCancelImpersonate : handleImpersonate}
            disabled={isLoading || isStreaming}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 disabled:opacity-30 flex-shrink-0 ${
              isImpersonating
                ? `text-zinc-300 ${!input.trim() ? (isGoldMode ? 'impersonate-pulse-gold' : 'impersonate-pulse') : 'bg-zinc-700 hover:bg-zinc-600'}`
                : isGoldMode
                  ? 'bg-zinc-800 hover:bg-amber-500/20 text-amber-400/70 hover:text-amber-300'
                  : 'bg-zinc-800 hover:bg-rose-500/20 text-rose-400/70 hover:text-rose-300'
            }`}
            title={isImpersonating ? (t.common?.cancel || 'Cancel') : (t.chat.impersonate || 'Write for me')}
            aria-label={isImpersonating ? (t.common?.cancel || 'Cancel') : (t.chat.impersonate || 'Write for me')}
          >
            {isImpersonating ? <X size={16} /> : <PenLine size={16} />}
          </button>
          <button
            onClick={() => handleSend()}
            disabled={isLoading || isStreaming || isImpersonating || !input.trim()}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 disabled:opacity-30 shadow-lg flex-shrink-0 ${
              isGoldMode
                ? 'bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-600 hover:to-yellow-500 text-black font-bold shadow-amber-900/20 disabled:from-zinc-600 disabled:to-zinc-700'
                : 'bg-gradient-to-br from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white shadow-rose-500/30 disabled:from-zinc-600 disabled:to-zinc-700'
            }`}
            title={t.chat.send}
            aria-label={t.chat.send}
          >
            <Send size={18} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* v1.0: IMAGE GENERATION MODAL (MANUAL) */}
      {showImageModal && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowImageModal(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-2xl max-w-md w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-zinc-700">
              <h2 className="text-xl font-bold text-white">{t.chat.generateImage}</h2>
              <p className="text-sm text-zinc-400 mt-1">{t.chat.customNsfwPrompt}</p>
            </div>

            <div className="p-6 space-y-4">
              {!imageGenEnabled ? (
                <div className="bg-rose-950/90 border border-rose-500/50 rounded-lg p-4 space-y-4">
                  <p className="text-sm text-rose-200">
                    {t.chat.imageGenDisabled}
                  </p>
                  
                  {/* Enable directly from here */}
                  <button
                    onClick={async () => {
                      setImageGenEnabled(true);
                      // Persist to localStorage and IPC
                      let currentSettings = {};
                      try { currentSettings = JSON.parse(localStorage.getItem('settings') || '{}'); } catch { /* corrupted */ }
                      currentSettings.imageGenEnabled = true;
                      localStorage.setItem('settings', JSON.stringify(currentSettings));
                      await window.electronAPI?.saveSettings?.(currentSettings);
                    }}
                    className="w-full px-4 py-2.5 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/50 rounded-lg text-purple-300 font-medium transition-all flex items-center justify-center gap-2"
                  >
                    <ImageIcon size={16} />
                    {t.settings.enableImageGen || 'Enable Image Generation'}
                  </button>
                  
                  <button
                    onClick={() => setShowTutorial('imageGen')}
                    className="w-full px-4 py-2 bg-zinc-700/30 hover:bg-zinc-700/50 rounded-lg text-zinc-300 text-sm transition-all"
                  >
                    {t.chat.showSetupTutorial}
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">{t.chat.imagePrompt}</label>
                    <textarea
                      value={imagePrompt}
                      onChange={(e) => setImagePrompt(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white resize-none"
                      rows={4}
                      placeholder={t.chat.nsfwIntimateScene}
                    />
                  </div>

                  <button
                    onClick={handleManualImageGen}
                    disabled={!imagePrompt.trim() || generatingImage}
                    className="w-full px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/50 rounded-lg text-purple-300 font-medium transition-all disabled:opacity-50"
                  >
                    {generatingImage ? t.common.loading : t.chat.generate}
                  </button>

                  <button
                    onClick={() => {
                      const cleanedContext = extractConversationContext(messages, character);
                      setImagePrompt(cleanedContext);
                    }}
                    className="w-full px-4 py-2 bg-zinc-700/30 hover:bg-zinc-700/50 rounded-lg text-zinc-300 text-sm transition-all"
                  >
                    {t.chat.useConversationContext}
                  </button>
                </>
              )}
            </div>

            <div className="px-6 py-4 border-t border-zinc-700">
              <button
                onClick={() => setShowImageModal(false)}
                className="w-full px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 rounded-lg text-cyan-300 font-medium transition-all"
              >
                {t.common.back}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* v1.0: TUTORIAL MODAL */}
      {showTutorial && (
        <TutorialModal
          type={showTutorial}
          onClose={() => setShowTutorial(null)}
          onTest={showTutorial === 'imageGen' ? handleTestImageGen : handleTestVoice}
        />
      )}

      {/* v1.0: CHARACTER BIO MODAL */}
      {showBioModal && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowBioModal(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 bg-zinc-900 border-b border-zinc-700 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                {/* Profile Image in Modal */}
                {character.avatarBase64 ? (
                  <img
                    src={character.avatarBase64}
                    alt={character.name}
                    className="w-16 h-16 rounded-full object-cover border-2 border-zinc-700 shadow-lg"
                  />
                ) : (
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white shadow-lg border-2 border-zinc-700"
                    style={{
                      background: `linear-gradient(135deg, ${character.themeColor}, ${character.themeColor}88)`
                    }}
                  >
                    {character.name.charAt(0)}
                  </div>
                )}

                <div>
                  <h2 className="text-2xl font-bold text-white">
                    {character.isCustom ? character.name : (t.characters?.[character.id]?.name || character.name)}
                  </h2>
                  <p className="text-sm text-zinc-400">
                    {character.isCustom 
                      ? (character.subtitle || character.role)
                      : (t.characters?.[character.id]?.subtitle || character.subtitle || character.role)
                    }
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowBioModal(false)}
                className="p-2 hover:bg-zinc-800 rounded-lg transition-all text-zinc-400 hover:text-white"
                title={t.common?.close || 'Close'}
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {/* Description */}
                <div>
                  <h3 className="text-lg font-semibold text-cyan-400 mb-2">{t.chat.about}</h3>
                  <p className="text-zinc-300 leading-relaxed">
                    {character.isCustom 
                      ? character.description
                      : (t.characters?.[character.id]?.description || character.description)
                    }
                  </p>
                </div>

                {/* System Prompt (Personality Details) */}
                {character.systemPrompt && (
                  <div>
                    <h3 className="text-lg font-semibold text-cyan-400 mb-2">{t.chat.personalityProfile}</h3>
                    <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-4">
                      <pre className="text-sm text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed">
                        {character.systemPrompt}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Instructions (Critical Rules) */}
                {character.instructions && (
                  <div>
                    <h3 className="text-lg font-semibold text-red-400 mb-2">{t.chat.criticalCharacterRules}</h3>
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                      <pre className="text-sm text-red-200 whitespace-pre-wrap font-mono leading-relaxed">
                        {character.instructions}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Model Sampling Params */}
                <div>
                  <h3 className="text-lg font-semibold text-cyan-400 mb-2">{t.settings.samplingParams || 'Sampling Parameters'}</h3>
                  {(() => {
                    const mp = getModelProfile(settings?.ollamaModel);
                    return (
                      <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-4">
                        <div className="grid grid-cols-2 gap-2 text-sm text-zinc-400">
                          <div>Temperature: <span className="text-zinc-200">{mp.temperature}</span></div>
                          <div>Top P: <span className="text-zinc-200">{mp.topP}</span></div>
                          <div>Top K: <span className="text-zinc-200">{mp.topK}</span></div>
                          <div>Max Tokens: <span className="text-zinc-200">{mp.maxResponseTokens}</span></div>
                          <div>Min P: <span className="text-zinc-200">{mp.minP}</span></div>
                          <div>Repeat Penalty: <span className="text-zinc-200">{mp.repeatPenalty}</span></div>
                        </div>
                        {!character.isCustom && (
                          <p className="text-xs text-zinc-600 mt-2 italic">{t.settings.readOnly || 'Auto-configured for this model'}</p>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Theme Color */}
                <div>
                  <h3 className="text-lg font-semibold text-cyan-400 mb-2">{t.chat.themeColor}</h3>
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-lg border-2 border-zinc-700"
                    style={{ backgroundColor: character.themeColor }}
                  />
                  <span className="text-zinc-400 font-mono">{character.themeColor}</span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-zinc-900 border-t border-zinc-700 px-6 py-4">
              <button
                onClick={() => setShowBioModal(false)}
                className="w-full px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 rounded-lg transition-all text-cyan-300 font-medium"
              >
                {t.common.back}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[200]">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-sm mx-4 shadow-2xl">
            <p className="text-sm text-zinc-300 mb-4">{confirmModal.message}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmModal(null)}
                className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors"
              >
                {t.common.cancel || 'Cancel'}
              </button>
              <button
                onClick={() => { confirmModal.onConfirm(); setConfirmModal(null); }}
                className="flex-1 px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 rounded-lg text-sm transition-colors"
              >
                {t.common.confirm || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
