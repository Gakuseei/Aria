// ============================================================================
// ARIA v1.0 RELEASE - ChatInterface
// ============================================================================

import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { Send, RotateCcw, Trash2, Download, Upload, Settings as SettingsIcon, Image as ImageIcon, Volume2, ZoomIn, ZoomOut, Info, Sparkles, ArrowLeft, PenLine, X } from 'lucide-react';
import remend from 'remend';
import toast from 'react-hot-toast';
import { autoDetectAndSetModel } from '../lib/ollama';
import { saveSession, generateSessionId, deleteSession } from '../lib/storage/sessions';
import { unloadOllamaModel } from '../lib/ollama';
import { resolveTemplates } from '../lib/chat/common';
import { sendMessage } from '../lib/chat/reply';
import { generateSuggestionsBackground, abortSuggestionCall, normalizeSuggestionDisplayValue } from '../lib/chat/suggestions';
import { impersonateUser, abortImpersonateCall } from '../lib/chat/impersonate';
import { passionManager, getTierKey, PASSION_TIERS } from '../lib/chat/passion';
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
import { resolveSessionSceneMemory } from '../lib/chatRuntime';
import CustomDropdown from './CustomDropdown';

// ============================================================================
// TEXT FORMATTING - BLOCK 4 FIX: Apostroph-Bug behoben
// ============================================================================

function closeUnterminatedDialogueQuote(text = '') {
  let quoteCount = 0;
  let lastQuoteIndex = -1;

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '"' && text[index - 1] !== '\\') {
      quoteCount += 1;
      lastQuoteIndex = index;
    }
  }

  if (quoteCount % 2 === 0 || lastQuoteIndex === -1) {
    return text;
  }

  const trailingDialogue = text.slice(lastQuoteIndex + 1);
  if (!/\S/.test(trailingDialogue)) {
    return text;
  }

  return `${text}"`;
}

function repairAssistantDisplayText(text = '', isGoldMode = false) {
  if (!text || typeof text !== 'string') return '';

  try {
    return remend(text, {
      links: false,
      images: false,
      bold: isGoldMode,
      italic: true,
      boldItalic: isGoldMode,
      inlineCode: false,
      strikethrough: false,
      katex: false,
      setextHeadings: false,
      comparisonOperators: false,
      htmlTags: false,
      handlers: [
        {
          name: 'dialogueQuotes',
          priority: 100,
          handle: closeUnterminatedDialogueQuote
        }
      ]
    });
  } catch (error) {
    console.warn('[ChatInterface] Failed to repair assistant display text:', error);
    return closeUnterminatedDialogueQuote(text);
  }
}

function getDisplayMessageText(text, isUser = false, isGoldMode = false) {
  if (isUser || typeof text !== 'string') {
    return typeof text === 'string' ? text : '';
  }

  return repairAssistantDisplayText(text, isGoldMode);
}

export function formatMessageText(text, isGoldMode = false) {
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
      if (plainText.length > 0) {
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
    if (remainingText.length > 0) {
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

function sameSceneMemory(left, right) {
  return JSON.stringify(left || null) === JSON.stringify(right || null);
}

function stripOllamaEnvelope(message = '') {
  return String(message)
    .replace(/^Ollama error:\s*\d+\s*-\s*/i, '')
    .trim();
}

export function buildChatFailureState(error, t = {}) {
  const rawMessage = typeof error?.message === 'string' ? error.message.trim() : '';
  const detail = stripOllamaEnvelope(rawMessage);
  const isTimeout = rawMessage === 'The operation was aborted';
  const needsSettings = /model\s+'[^']+'\s+not\s+found/i.test(detail) || /No models installed/i.test(rawMessage);
  const message = isTimeout
    ? (t.chat?.timeout || 'Request timed out')
    : (t.chat?.sendError || rawMessage || 'Failed to get response');

  return {
    title: t.common?.error || 'Error',
    message,
    detail: detail && detail !== message ? detail : '',
    action: needsSettings ? 'settings' : null,
    actionLabel: needsSettings ? (t.mainMenu?.settings || 'Settings') : null,
  };
}

export function getRestoredSuggestions(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return [];

  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== 'assistant' || !Array.isArray(lastMessage.suggestions)) {
    return [];
  }

  return normalizeSuggestionList(lastMessage.suggestions);
}

function normalizeSuggestionList(suggestions) {
  const seen = new Set();

  return (Array.isArray(suggestions) ? suggestions : [])
    .filter((suggestion) => typeof suggestion === 'string')
    .map((suggestion) => normalizeSuggestionDisplayValue(suggestion))
    .filter(Boolean)
    .filter((suggestion) => {
      const key = suggestion.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
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
    () => formatMessageText(getDisplayMessageText(message.content || '', isUser, isGoldMode && !isUser), isGoldMode && !isUser),
    [message.content, isGoldMode, isUser]
  );


  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} group mb-5 message-slide-in`}>
      <div
        className={`theme-message-column rounded-2xl px-5 py-4 relative transition-all duration-200 ${
          isUser
            ? (isGoldMode
                ? 'border border-amber-500/30 bg-gradient-to-br from-zinc-900 to-amber-950/40 text-white'
                : 'theme-chat-user-bubble')
            : 'theme-chat-assistant-bubble'
        }`}
      >
        {isUser && userName && (
          <div className="theme-message-meta theme-message-label text-xs mb-1.5 font-medium flex items-center gap-1.5">
            {userName}
            {isGoldMode && <span className="text-amber-300">✨</span>}
          </div>
        )}

        {!isUser && character?.name && (
          <div className="theme-message-meta theme-message-label mb-1.5 flex items-center gap-1.5 text-xs font-medium">
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
              return <span key={i} className="theme-message-meta italic">{part.text}</span>;
            } else if (part.type === 'dialogue') {
              return <span key={i} className="text-[color:var(--color-text)] font-normal">{part.text}</span>;
            } else if (part.type === 'bold' && isGoldMode && !isUser) {
              return <span key={i} className="text-amber-400 font-bold drop-shadow-sm">{part.text}</span>;
            } else {
              return <span key={i} className="theme-message-body">{part.text}</span>;
            }
          })}
        </div>

        {message.timestamp && (
          <div className="theme-message-meta theme-message-timestamp text-xs mt-3">
            {formatTimestamp(message.timestamp)}
          </div>
        )}

        {/* Action buttons - hover reveal */}
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
          {/* Volume2 Icon Button (AI messages only) */}
          {!isUser && voiceEnabled === true && onSpeak && (
            <button
              onClick={() => onSpeak(message.content || '')}
className="theme-message-action theme-message-action-info rounded-lg p-1.5 transition-all duration-200"
              title={t.chat?.playAudio || 'Play Audio'}
            >
              <Volume2 size={14} strokeWidth={1.5} />
            </button>
          )}
          {/* Copy button */}
          <button
            onClick={() => onCopy(message.content || '')}
className="theme-message-action rounded-lg p-1.5 transition-all duration-200"
            title={t.chat?.copy || 'Copy'}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
            </svg>
          </button>
        </div>
      </div>

    </div>
  );
});

// ============================================================================
// MAIN CHAT INTERFACE - v8.1 RESTORED
// ============================================================================

export default function ChatInterface({ character, loadedSession, onBack, onOpenSettings, settings: parentSettings }) {
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
  const [sceneMemory, setSceneMemory] = useState(null);

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
    themeMode: 'dark',
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
  const [sendFailure, setSendFailure] = useState(null);
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
  const messagesRef = useRef([]);
  const sceneMemoryRef = useRef(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    sceneMemoryRef.current = sceneMemory;
  }, [sceneMemory]);

  const buildSceneMemory = useCallback((history, previousSceneMemory = sceneMemoryRef.current) => (
    resolveSessionSceneMemory({
      character,
      history,
      userName,
      previousSceneMemory
    })
  ), [character, userName]);

  useEffect(() => {
    const nextSceneMemory = buildSceneMemory(messages);
    if (!sameSceneMemory(sceneMemoryRef.current, nextSceneMemory)) {
      sceneMemoryRef.current = nextSceneMemory;
      setSceneMemory(nextSceneMemory);
    }
  }, [buildSceneMemory, messages]);

  useEffect(() => {
    settingsRef.current = parentSettings;
  }, [parentSettings]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (passionTimerRef.current) {
        clearTimeout(passionTimerRef.current);
        passionTimerRef.current = null;
      }
      abortSuggestionCall();
      abortImpersonateCall();
      unloadOllamaModel(settingsRef.current);
    };
  }, []);

  const isForegroundRequestObsolete = useCallback((requestHandle) => (
    !mountedRef.current || !requestHandle || requestHandle.aborted || abortRef.current !== requestHandle
  ), []);

  const abortActiveChatWork = useCallback((reason = 'user') => {
    if (abortRef.current) {
      abortRef.current.abort(reason);
      abortRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (passionTimerRef.current) {
      clearTimeout(passionTimerRef.current);
      passionTimerRef.current = null;
    }

    streamBufferRef.current = '';
    abortSuggestionCall();
    abortImpersonateCall();
    suggestionsHistoryRef.current = [];

    if (!mountedRef.current) return;

    setSmartSuggestions([]);
    setIsGeneratingSuggestions(false);
    setIsImpersonating(false);
    setIsLoading(false);
    setIsStreaming(false);
    setStreamingContent('');
  }, []);

  const handleBackNavigation = useCallback(() => {
    abortActiveChatWork('user');
    onBack();
  }, [abortActiveChatWork, onBack]);

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
          themeMode: loadedSettings.themeMode || (loadedSettings.oledMode ? 'oled' : 'dark'),
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
        setSceneMemory(buildSceneMemory(loadedSession.messages, loadedSession.sceneMemory || null));
        const restoredLevel = loadedSession.passionLevel || 0;
        previousTierRef.current = getTierKey(restoredLevel);
        setPassionLevel(restoredLevel);
        if (restoredSessionId) {
          passionManager.setPassion(restoredSessionId, restoredLevel, true);
        }
        setSmartSuggestions(getRestoredSuggestions(loadedSession.messages));

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
  }, [buildSceneMemory, character, loadedSession]);

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
    const greetingSceneMemory = buildSceneMemory([greetingMsg], null);
    setSceneMemory(greetingSceneMemory);

    if (settings.smartSuggestionsEnabled) {
      const sourceAssistantTimestamp = greetingMsg.timestamp;
      setIsGeneratingSuggestions(true);
      generateSuggestionsBackground([greetingMsg], character, userName, settings, (suggestions) => {
        const result = normalizeSuggestionList((suggestions && suggestions.length > 0) ? suggestions : []);
        const latestAssistant = [...messagesRef.current].reverse().find((message) => message.role === 'assistant') || null;
        const latestAssistantTimestamp = latestAssistant?.timestamp ?? sourceAssistantTimestamp;
        const sameGreetingReplay = Boolean(latestAssistant)
          && latestAssistant.content === greetingMsg.content
          && !messagesRef.current.some((message) => message.role === 'user');
        if (latestAssistantTimestamp !== sourceAssistantTimestamp && !sameGreetingReplay) {
          console.log('[ChatInterface] Discarded stale greeting suggestions');
          setIsGeneratingSuggestions(false);
          return;
        }
        if (result.length === 0 && sameGreetingReplay && Array.isArray(latestAssistant?.suggestions) && latestAssistant.suggestions.length > 0) {
          setIsGeneratingSuggestions(false);
          return;
        }
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
      }, [], 0, greetingSceneMemory, isUnchainedMode);
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
      const nextSceneMemory = buildSceneMemory(messages);
      const sessionData = {
        characterName: character.name,
        character: character,
        conversationHistory: messages,
        sceneMemory: nextSceneMemory,
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
        character,
        userName,
        passionLevel,
        settings,
        (_token, display) => setInput(display),
        sceneMemoryRef.current,
        isUnchainedMode
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

  const triggerSuggestions = (updatedMessages, currentPassionLevel, currentSceneMemory = sceneMemoryRef.current) => {
    if (!settings.smartSuggestionsEnabled) return;
    const rollingAvoid = suggestionsHistoryRef.current.slice(-30);
    const sourceAssistantTimestamp = [...updatedMessages].reverse().find((message) => message.role === 'assistant')?.timestamp ?? null;
    const suggestStart = Date.now();
    setIsGeneratingSuggestions(true);
    generateSuggestionsBackground(updatedMessages, character, userName, settings, (suggestions) => {
      const suggestTime = ((Date.now() - suggestStart) / 1000).toFixed(1);
      if (!mountedRef.current) return;
      setIsGeneratingSuggestions(false);
      const result = normalizeSuggestionList((suggestions && suggestions.length > 0) ? suggestions : []);
      const latestAssistantTimestamp = [...messagesRef.current].reverse().find((message) => message.role === 'assistant')?.timestamp ?? sourceAssistantTimestamp;
      if (sourceAssistantTimestamp && latestAssistantTimestamp !== sourceAssistantTimestamp) {
        console.log('[ChatInterface] Discarded stale suggestions');
        return;
      }
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
    }, rollingAvoid, currentPassionLevel ?? passionLevel, currentSceneMemory, isUnchainedMode);
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
    setSendFailure(null);
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
    const runtimeSceneMemory = buildSceneMemory(newMessages);
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const handleApiStats = (stats) => {
        if (isForegroundRequestObsolete(activeAbortHandle)) return;
        window.dispatchEvent(new CustomEvent('aria-api-stats', { detail: stats }));
      };

      let firstToken = true;
      streamBufferRef.current = '';
      rafRef.current = null;
      const flushBuffer = () => {
        if (isForegroundRequestObsolete(activeAbortHandle)) return;
        setStreamingContent(streamBufferRef.current);
        rafRef.current = null;
      };
      const handleToken = (token) => {
        if (typeof token !== 'string' || isForegroundRequestObsolete(activeAbortHandle)) return;
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
        historyForApi,
        sessionId,
        isUnchainedMode,
        handleApiStats,
        settings,
        handleToken,
        activeAbortHandle,
        runtimeSceneMemory
      );

      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      if (isForegroundRequestObsolete(activeAbortHandle)) return;

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
      const nextSceneMemory = buildSceneMemory(updatedMessages, runtimeSceneMemory);

      // Set final message BEFORE clearing streaming → no flash
      setMessages(updatedMessages);
      setSceneMemory(nextSceneMemory);
      setIsStreaming(false);
      setStreamingContent('');

      if (isForegroundRequestObsolete(activeAbortHandle)) return;

      const newPassion = response.passionLevel ?? passionLevel;
      triggerSuggestions(updatedMessages, newPassion, nextSceneMemory);

      if (response.passionLevel !== undefined) {
        setPassionLevel(response.passionLevel);
      }

      const passionEnabled = character.passionEnabled !== false;
      if (passionEnabled && sessionId) {
        if (passionTimerRef.current) clearTimeout(passionTimerRef.current);
        passionTimerRef.current = setTimeout(() => {
          setPassionLevel(passionManager.getPassionLevel(sessionId));
        }, 300);
      }

      // Voice output (if enabled and auto-read enabled)
      if (voiceEnabled === true && autoReadEnabled) {
        handleSpeak(safeResponse);
      }
    } catch (error) {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      if (isForegroundRequestObsolete(activeAbortHandle)) return;
      console.error('[ChatInterface] Send error:', error);
      const failureState = error?.message === 'No response from Ollama'
        ? {
            title: t.common?.error || 'Error',
            message: t.chat?.noOllamaResponse || 'Model returned empty response — please send again.',
            detail: '',
            action: null,
            actionLabel: null,
          }
        : buildChatFailureState(error, t);
      setSendFailure(failureState);
      toast.error(failureState.message);
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
      setSceneMemory(null);
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
        sceneMemory: sceneMemoryRef.current,
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
      setSceneMemory(buildSceneMemory(importData.messages, importData.sceneMemory || null));
      setSmartSuggestions(getRestoredSuggestions(importData.messages));
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
    setSceneMemory(buildSceneMemory(messagesUpToLastUser));
    setIsLoading(true);
    if (abortRef.current) abortRef.current.abort();
    const activeAbortHandle = createStreamAbortHandle();
    abortRef.current = activeAbortHandle;

    try {
      let firstToken = true;
      streamBufferRef.current = '';
      rafRef.current = null;
      const flushBuffer = () => {
        if (isForegroundRequestObsolete(activeAbortHandle)) return;
        setStreamingContent(streamBufferRef.current);
        rafRef.current = null;
      };
      const handleToken = (token) => {
        if (typeof token !== 'string' || isForegroundRequestObsolete(activeAbortHandle)) return;
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
        regenHistoryForApi,
        sessionId,
        isUnchainedMode,
        null,
        settings,
        handleToken,
        activeAbortHandle,
        buildSceneMemory(regenHistoryForApi)
      );

      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      if (isForegroundRequestObsolete(activeAbortHandle)) return;

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
      const nextSceneMemory = buildSceneMemory(updatedMessages);

      // Set final message BEFORE clearing streaming → no flash
      setMessages(updatedMessages);
      setSceneMemory(nextSceneMemory);
      setIsStreaming(false);
      setStreamingContent('');

      if (isForegroundRequestObsolete(activeAbortHandle)) return;

      const newPassion = response.passionLevel ?? passionLevel;
      triggerSuggestions(updatedMessages, newPassion, nextSceneMemory);

      if (response.passionLevel !== undefined) {
        setPassionLevel(response.passionLevel);
      }

      const passionEnabled = character.passionEnabled !== false;
      if (passionEnabled && sessionId) {
        if (passionTimerRef.current) clearTimeout(passionTimerRef.current);
        passionTimerRef.current = setTimeout(() => {
          setPassionLevel(passionManager.getPassionLevel(sessionId));
        }, 300);
      }
    } catch (error) {
      if (isForegroundRequestObsolete(activeAbortHandle)) return;
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
    <div className="theme-screen-shell app-theme-shell relative flex h-screen flex-col overflow-hidden text-[var(--color-text)]">
      <div className="theme-chat-ambient pointer-events-none absolute inset-0 z-0" />
      <div className="theme-chat-scrim pointer-events-none absolute inset-0 z-0" />
      {passionLevel > 15 && (
        <div
          className="pointer-events-none fixed inset-0 z-10 transition-opacity duration-[2000ms]"
          style={{
            background: `radial-gradient(ellipse at center, transparent 48%, rgb(var(--color-primary-rgb) / ${Math.min((passionLevel - 15) * 0.0024, 0.16)}) 100%)`
          }}
        />
      )}
      {tierToast && (
        <div className="theme-chat-toast fixed left-1/2 top-6 z-[300] -translate-x-1/2 rounded-lg px-4 py-2 text-sm animate-pulse">
          {tierToast}
        </div>
      )}
      <input
        ref={importFileRef}
        type="file"
        accept=".json"
        onChange={handleImportChat}
        className="hidden"
        aria-label="Import chat file"
      />

      <div className={`theme-chat-header relative z-40 flex shrink-0 items-center justify-between px-6 py-4 transition-all duration-500 ${
        isVisible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
      }`}>
        <div className="theme-chat-identity flex min-w-0 items-center gap-4">
          <button
            onClick={handleBackNavigation}
            className="theme-chat-back-button theme-icon-button rounded-xl p-3 transition-all duration-200"
            title={t.chat.back}
            aria-label={t.chat.back}
          >
            <ArrowLeft size={22} strokeWidth={1.5} />
          </button>

          <div className="theme-chat-avatar-shell shrink-0">
            <div
              className="theme-chat-avatar-ring theme-chat-header-avatar-ring flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold text-white"
              style={{
                background: `linear-gradient(180deg, rgba(14, 15, 18, 0.24), rgba(14, 15, 18, 0.18)), linear-gradient(135deg, ${character.themeColor}, ${character.themeColor}88)`
              }}
            >
              {character.name.charAt(0)}
            </div>
            <div className="theme-success-dot absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-[color:var(--color-surface-elevated)]" />
          </div>

          <div className="theme-chat-titleblock relative min-w-0">
            <div className="theme-chat-name-row flex items-center gap-2.5">
              <h2 className="theme-chat-title truncate text-xl font-bold">
                {character.isCustom ? character.name : (t.characters?.[character.id]?.name || character.name)}
              </h2>
              <button
                onClick={() => setShowBioModal(true)}
                className="theme-chat-info-button theme-icon-button rounded-lg p-2 transition-all"
                title={t.chat.viewBio}
                aria-label={t.chat.viewBio}
              >
                <Info size={18} strokeWidth={1.5} />
              </button>
            </div>
            <div className="theme-chat-meta-row mt-2 flex flex-wrap items-center gap-2.5">
              <p className="theme-chat-subtitle flex-1 truncate text-sm">
                {character.isCustom ? character.subtitle || character.role : (t.characters?.[character.id]?.subtitle || character.subtitle || character.role)}
              </p>
              {passionLevel > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); setShowPassionPopover(prev => !prev); }}
                  className="theme-chat-passion-pill theme-passion-inline flex items-center gap-2 py-1 text-xs font-medium transition-colors cursor-pointer"
                  data-passion-popover
                >
                  <span className="theme-passion-inline-bar" aria-hidden="true" />
                  <span>{PASSION_TIERS[getTierKey(passionLevel)]?.label}</span>
                  <span className="theme-passion-inline-value">{passionLevel}%</span>
                </button>
              )}
            </div>
            {showPassionPopover && (
              <div
                className="theme-chat-flyout absolute left-0 top-full z-50 mt-2 min-w-[240px] rounded-lg p-4"
                data-passion-popover
              >
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div>
                    <div className="theme-popover-heading text-sm font-semibold">
                      {PASSION_TIERS[getTierKey(passionLevel)]?.label}
                    </div>
                    <div className="theme-popover-label mt-1 text-[11px] uppercase tracking-[0.18em]">
                      {t.settings?.passionSystem}
                    </div>
                  </div>
                  <div className="theme-status-chip-passion-value text-lg font-semibold leading-none">{passionLevel}%</div>
                </div>
                <div className="theme-progress-track mb-3 h-2 w-full overflow-hidden rounded-full">
                  <div
                    className="theme-progress-fill-passion h-full rounded-full transition-all duration-500"
                    style={{ width: `${passionLevel}%` }}
                  />
                </div>
                <div className="mb-3 grid gap-3 text-xs">
                  <div className="theme-soft-panel rounded-lg px-3 py-2">
                    <div className="theme-popover-label">{t.chat?.passionTooltip}</div>
                  </div>
                  <div className="theme-soft-panel rounded-lg px-3 py-2">
                    <div className="theme-popover-label">{t.chat?.voiceSettings?.speed}</div>
                    <div className="theme-popover-heading mt-1 font-medium">{(() => {
                      const sp = character?.passionSpeed || 'normal';
                      return t.characterCreator?.['passionSpeed_' + sp] || sp.charAt(0).toUpperCase() + sp.slice(1);
                    })()}</div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    passionManager.resetPassion(sessionId);
                    if (character?.id) passionManager.clearCharacterMemory(character.id);
                    setPassionLevel(0);
                    setShowPassionPopover(false);
                  }}
                  className="theme-danger-button w-full rounded-lg px-3 py-2 text-xs font-medium transition-colors"
                >
                  {t.chat?.resetPassion || 'Reset Passion'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Side - Icon Buttons with Rose Accents - BLOCK 6.9: Enhanced Clickability */}
        <div className="theme-chat-toolbar relative z-50 flex items-center gap-1.5 pointer-events-auto">
          <button
            onClick={() => setShowImageModal(true)}
            className={`theme-icon-button rounded-xl p-3 transition-all duration-200 active:scale-95 ${
              imageGenEnabled ? 'theme-icon-button-active' : ''
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
              className={`theme-icon-button rounded-xl p-3 transition-all duration-200 active:scale-95 ${
                voiceEnabled === true ? 'theme-icon-button-info' : ''
              }`}
              title={t.chat?.voiceSettings?.title || 'Voice Settings'}
              aria-label={t.chat?.voiceSettings?.title || 'Voice Settings'}
            >
              <Volume2 size={22} strokeWidth={1.5} />
            </button>

            {/* Voice Settings Popover */}
            {showVoiceSettings && (
              <div className="theme-chat-flyout absolute top-12 right-0 z-[200] flex w-64 flex-col rounded-lg p-4">
                <div className="space-y-4">
                  {/* Master Toggle: Enable Voice */}
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <span className="theme-popover-heading text-sm font-medium">{t.chat.voiceSettings.enableVoice}</span>
                      <p className="theme-popover-label mt-0.5 text-xs">{t.chat.voiceSettings.masterToggle}</p>
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
                      className={`theme-toggle-pill rounded-lg px-3 py-1 text-xs font-medium transition-all ${
                        voiceEnabled === true ? 'is-info-active' : ''
                      }`}
                    >
                      {voiceEnabled === true ? 'ON' : 'OFF'}
                    </button>
                  </div>

                  {/* Auto-Read Toggle */}
                  {voiceEnabled === true && (
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <span className="theme-popover-heading text-sm font-medium">{t.chat.voiceSettings.autoRead}</span>
                        <p className="theme-popover-label mt-0.5 text-xs">{t.chat.voiceSettings.autoReadDesc}</p>
                      </div>
                      <button
                        onClick={() => setAutoReadEnabled(!autoReadEnabled)}
                        className={`theme-toggle-pill rounded-lg px-3 py-1 text-xs font-medium transition-all ${
                          autoReadEnabled ? 'is-info-active' : ''
                        }`}
                      >
                        {autoReadEnabled ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  )}

                  {/* Voice Model Selection - FIX 3 */}
                  {voiceEnabled === true && (
                    <div>
                      <label className="theme-label mb-1 block text-xs">{t.chat.voiceSettings.voiceModel}</label>
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
                      <div className="mb-2 flex items-center justify-between">
                        <span className="theme-popover-heading text-sm font-medium">{t.chat.voiceSettings.volume}</span>
                        <span className="theme-info-badge rounded px-2 py-0.5 text-xs font-mono">{Math.round((settings.voiceVolume ?? 1.0) * 100)}%</span>
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
                        className="theme-slider-info w-full cursor-pointer appearance-none rounded-lg bg-[color:var(--color-surface-muted)]"
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
            className={`theme-icon-button rounded-xl p-3 transition-all duration-200 active:scale-95 ${
              isUnchainedMode
                ? 'theme-icon-button-active shadow-lg shadow-[0_18px_32px_-24px_rgb(var(--color-primary-rgb)/0.7)]'
                : 'theme-icon-button-info'
            }`}
            title={!isUnchainedMode ? t.chat.enableUnchained : t.chat.unchainedActive}
            aria-label={!isUnchainedMode ? t.chat.enableUnchained : t.chat.unchainedActive}
          >
            <Sparkles size={22} strokeWidth={1.5} />
          </button>

          <div className="theme-chat-toolbar-divider mx-1" />

          <button
            onClick={regenerateLastResponse}
            disabled={isLoading || isStreaming || messages.length < 2}
            className="theme-icon-button rounded-xl p-3 transition-all duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
            title={t.chat.regenerateResponse}
            aria-label={t.chat.regenerateResponse}
          >
            <RotateCcw size={22} strokeWidth={1.5} />
          </button>

          {/* Chat Options Button - BLOCK 6.9.2: Opens local menu, not global Settings */}
          <div className="relative z-[100] pointer-events-auto chat-options-container">
            <button
              onClick={() => setShowChatOptions(!showChatOptions)}
              className={`theme-icon-button rounded-xl p-3 transition-all duration-200 active:scale-95 ${
                showChatOptions ? 'theme-icon-button-active' : ''
              }`}
              title={t.chat.chatOptions}
              aria-label={t.chat.chatOptions}
            >
              <SettingsIcon size={22} strokeWidth={1.5} />
            </button>

            {/* BLOCK 6.9.2: Chat Options Popover */}
            {showChatOptions && (
              <div className="theme-chat-flyout absolute top-12 right-0 z-[200] flex w-56 flex-col rounded-lg p-1">
                {/* Text Zoom */}
                <div className="theme-popover-divider border-b px-3 py-2">
                  <span className="theme-popover-label text-xs font-medium uppercase tracking-wider">{t.chat.textSize}</span>
                  <div className="flex gap-1 mt-1">
                    <button
                      onClick={handleZoomOut}
                      disabled={fontSize === 'xs'}
                      className="theme-button-secondary flex-1 rounded-lg px-2 py-1 text-xs transition-all disabled:opacity-30"
                    >
                      <ZoomOut size={14} className="inline mr-1" />
                      {t.chat.smaller}
                    </button>
                    <button
                      onClick={handleZoomIn}
                      disabled={fontSize === '2xl'}
                      className="theme-button-secondary flex-1 rounded-lg px-2 py-1 text-xs transition-all disabled:opacity-30"
                    >
                      <ZoomIn size={14} className="inline mr-1" />
                      {t.chat.larger}
                    </button>
                  </div>
                </div>

                {/* Import/Export */}
                <button
                  onClick={() => { handleExportChat(); setShowChatOptions(false); }}
                  className="theme-button-secondary flex items-center gap-2 rounded-lg p-2.5 text-left text-sm transition-colors"
                >
                  <Download size={16} />
                  {t.chat.export}
                </button>
                <button
                  onClick={() => { importFileRef.current?.click(); setShowChatOptions(false); }}
                  className="theme-button-secondary flex items-center gap-2 rounded-lg p-2.5 text-left text-sm transition-colors"
                >
                  <Upload size={16} />
                  {t.chat.import}
                </button>

                {/* Danger Zone */}
                <div className="theme-popover-divider mt-1 border-t pt-1">
                  <button
                    onClick={() => { handleNewGame(); setShowChatOptions(false); }}
                    className="theme-danger-button flex w-full items-center gap-2 rounded-lg p-2.5 text-left text-sm transition-colors"
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

      {sendFailure && (
        <div className="px-4 pt-4">
          <div className="theme-danger-banner mx-auto max-w-5xl rounded-2xl px-4 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[var(--color-text)]">{sendFailure.title}</div>
                <p className="mt-1 text-sm text-[color:var(--color-text)]/90">{sendFailure.message}</p>
                {sendFailure.detail && (
                  <p className="theme-text-muted mt-2 break-words text-xs">{sendFailure.detail}</p>
                )}
              </div>
              {sendFailure.action === 'settings' && typeof onOpenSettings === 'function' && (
                <button
                  onClick={onOpenSettings}
                  className="theme-danger-button inline-flex shrink-0 items-center justify-center rounded-xl px-3 py-2 text-sm font-medium transition-colors"
                >
                  {sendFailure.actionLabel}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MESSAGES - BLOCK 6.7: Increased bottom padding for floating input */}
      <div
        ref={messagesContainerRef}
        onScroll={handleMessagesScroll}
        className={`flex-1 min-h-0 overflow-y-auto px-4 py-5 pb-64 ${
          isGoldMode ? 'scrollbar-gold' : ''
        }`}
      >
        <div className="max-w-5xl mx-auto">
          {messages.map((message, index) => (
            message.isTierEvent ? (
              <div key={message.timestamp} className="flex items-center justify-center gap-3 py-4 select-none">
                <div className="theme-separator-line h-px flex-1" />
                <span className="theme-tier-label text-[11px] font-medium tracking-[0.2em] uppercase">
                  ✦ {message.content} ✦
                </span>
                <div className="theme-separator-line h-px flex-1 scale-x-[-1]" />
              </div>
            ) : message.role === 'system' ? (
              <div key={`${message.timestamp || index}-system`} className="flex justify-center mb-4 message-slide-in">
                <div className={`max-w-[85%] rounded-xl px-5 py-3 text-sm whitespace-pre-wrap font-mono ${
                  isGoldMode
                    ? 'bg-amber-950/40 border border-amber-500/20 text-amber-200/90'
                    : 'theme-chat-assistant-bubble theme-message-body'
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
            <div className="flex justify-start mb-5">
              <div className="theme-chat-assistant-bubble theme-message-column relative rounded-2xl px-5 py-4 transition-all duration-200">
                {!streamingContent ? (
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1.5">
                      <div className="theme-typing-dot h-2 w-2 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="theme-typing-dot h-2 w-2 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="theme-typing-dot h-2 w-2 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="theme-text-muted text-sm">
                      {t.chat.isTyping.replace('{name}', character.isCustom ? character.name : (t.characters?.[character.id]?.name || character.name))}
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="theme-message-meta theme-message-label mb-1.5 flex items-center gap-1.5 text-xs font-medium"><span>{character.name}</span></div>
                    <div className={`whitespace-pre-wrap break-words leading-relaxed ${{ xs: 'text-xs', sm: 'text-sm', base: 'text-base', lg: 'text-lg', xl: 'text-xl', '2xl': 'text-2xl' }[fontSize] || 'text-base'}`}>
                      {(() => {
                        const formattedParts = formatMessageText(getDisplayMessageText(streamingContent || '', false, isGoldMode), isGoldMode);
                        return formattedParts.map((part, i) => {
                          if (part.type === 'action') {
                            return <span key={i} className="theme-message-meta italic">{part.text}</span>;
                          } else if (part.type === 'dialogue') {
                            return <span key={i} className="text-[color:var(--color-text)] font-normal">{part.text}</span>;
                          } else if (part.type === 'bold' && isGoldMode) {
                            return <span key={i} className="text-amber-400 font-bold drop-shadow-sm">{part.text}</span>;
                          } else {
                            return <span key={i} className="theme-message-body">{part.text}</span>;
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
      <div className="theme-composer-dock fixed bottom-8 left-1/2 z-50 w-[92%] max-w-[70rem] -translate-x-1/2">
        <div className={`theme-composer-dock-shell rounded-[2rem] px-3 py-2.5 transition-all duration-200 ${
          isGoldMode ? 'border-amber-500/30' : ''
        }`}>
          {settings.smartSuggestionsEnabled && isGeneratingSuggestions && smartSuggestions.length === 0 && !isStreaming && !isImpersonating && (
            <div className="theme-composer-suggestion-band mb-3 flex flex-wrap gap-2.5 px-2 pt-1">
              {[0, 1, 2].map(i => (
                <div
                  key={`skeleton-${i}`}
                  className={`theme-suggestion-skeleton suggestion-skeleton flex items-center gap-2 rounded-full px-4 py-2 ${
                    isGoldMode ? 'border-amber-500/20 bg-amber-500/5' : ''
                  }`}
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div className={`theme-suggestion-skeleton-dot h-3 w-3 rounded-full ${isGoldMode ? 'bg-amber-500/20' : ''}`} />
                  <div className={`theme-suggestion-skeleton-line h-3 rounded-full ${isGoldMode ? 'bg-amber-500/15' : ''}`} style={{ width: `${60 + i * 20}px` }} />
                </div>
              ))}
            </div>
          )}
          {settings.smartSuggestionsEnabled && smartSuggestions.length > 0 && !isStreaming && !isImpersonating && (
            <div className="theme-composer-suggestion-band mb-3 flex flex-wrap gap-2.5 px-2 pt-1" role="group" aria-label={t.settings?.smartSuggestions || 'Suggestions'}>
              {smartSuggestions.map((suggestion, i) => (
                <button
                  key={`suggestion-${suggestion.slice(0, 20)}-${i}`}
                  onClick={() => handleSuggestionClick(suggestion)}
                  disabled={isLoading}
                  className={`theme-suggestion-pill suggestion-pill flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-all duration-200 disabled:opacity-50 ${
                    isGoldMode
                      ? 'border-amber-500/40 text-amber-100 hover:bg-amber-500/10 hover:shadow-[0_0_15px_-3px_rgba(245,158,11,0.3)] hover:border-amber-400'
                      : ''
                  }`}
                  style={{ animationDelay: `${i * 75}ms` }}
                >
                  <Sparkles size={12} className={isGoldMode ? 'text-amber-400/70' : 'theme-suggestion-pill-icon'} />
                  <span className="truncate max-w-[280px] sm:max-w-[400px] md:max-w-[500px]">{suggestion}</span>
                </button>
              ))}
            </div>
          )}
          <div className={`theme-composer flex items-center gap-3 rounded-[1.5rem] px-4 py-3.5 transition-all duration-200 ${
            isGoldMode ? 'border-amber-500/30 focus-within:border-amber-400 focus-within:ring-1 focus-within:ring-amber-400/50' : ''
          }`}>
            <textarea
              ref={inputRef}
              value={input}
              rows={1}
              spellCheck={false}
              autoCorrect="off"
              onChange={(e) => {
                if (isImpersonating) {
                  abortImpersonateCall();
                  setIsImpersonating(false);
                }
                if (sendFailure) {
                  setSendFailure(null);
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
              className="chat-input theme-composer-input flex-1 min-w-0 resize-none overflow-y-auto border-none bg-transparent px-2 text-[15px] md:text-base outline-none ring-0 focus:outline-none focus:ring-0 disabled:opacity-50"
            />
            <button
              onClick={isImpersonating ? handleCancelImpersonate : handleImpersonate}
              disabled={isLoading || isStreaming}
              className={`theme-composer-secondary flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl transition-all duration-200 disabled:opacity-30 ${
                isImpersonating
                  ? `${!input.trim() ? (isGoldMode ? 'impersonate-pulse-gold' : 'impersonate-pulse') : ''} text-[var(--color-text)]`
                  : isGoldMode
                    ? 'text-amber-300'
                    : ''
              }`}
              title={isImpersonating ? (t.common?.cancel || 'Cancel') : (t.chat.impersonate || 'Write for me')}
              aria-label={isImpersonating ? (t.common?.cancel || 'Cancel') : (t.chat.impersonate || 'Write for me')}
            >
              {isImpersonating ? <X size={16} /> : <PenLine size={16} />}
            </button>
            <button
              onClick={() => handleSend()}
              disabled={isLoading || isStreaming || isImpersonating || !input.trim()}
              className="theme-composer-primary flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl transition-all duration-200 shadow-lg disabled:opacity-30"
              title={t.chat.send}
              aria-label={t.chat.send}
            >
              <Send size={18} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>

      {showImageModal && (
        <div
          className="theme-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setShowImageModal(false)}
        >
          <div
            className="theme-modal-shell max-w-md w-full rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="theme-modal-header theme-modal-divider border-b px-6 py-4">
              <h2 className="theme-modal-title text-xl font-bold">{t.chat.generateImage}</h2>
              <p className="theme-modal-subtitle mt-1 text-sm">{t.chat.customNsfwPrompt}</p>
            </div>

            <div className="p-6 space-y-4">
              {!imageGenEnabled ? (
                <div className="theme-modal-danger-panel space-y-4 rounded-lg p-4">
                  <p className="text-sm text-[var(--color-text)]">
                    {t.chat.imageGenDisabled}
                  </p>
                  <button
                    onClick={async () => {
                      setImageGenEnabled(true);
                      let currentSettings = {};
                      try { currentSettings = JSON.parse(localStorage.getItem('settings') || '{}'); } catch { /* corrupted */ }
                      currentSettings.imageGenEnabled = true;
                      localStorage.setItem('settings', JSON.stringify(currentSettings));
                      await window.electronAPI?.saveSettings?.(currentSettings);
                    }}
                    className="theme-modal-accent-button flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-medium transition-all"
                  >
                    <ImageIcon size={16} />
                    {t.settings.enableImageGen || 'Enable Image Generation'}
                  </button>

                  <button
                    onClick={() => setShowTutorial('imageGen')}
                    className="theme-button-secondary w-full rounded-lg px-4 py-2 text-sm transition-all"
                  >
                    {t.chat.showSetupTutorial}
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <label className="theme-label mb-2 block text-sm font-medium">{t.chat.imagePrompt}</label>
                    <textarea
                      value={imagePrompt}
                      spellCheck={false}
                      autoCorrect="off"
                      onChange={(e) => setImagePrompt(e.target.value)}
                      className="theme-control-lg resize-none"
                      rows={4}
                      placeholder={t.chat.nsfwIntimateScene}
                    />
                  </div>

                  <button
                    onClick={handleManualImageGen}
                    disabled={!imagePrompt.trim() || generatingImage}
                    className="theme-modal-accent-button w-full rounded-lg px-4 py-2 font-medium transition-all disabled:opacity-50"
                  >
                    {generatingImage ? t.common.loading : t.chat.generate}
                  </button>

                  <button
                    onClick={() => {
                      const cleanedContext = extractConversationContext(messages, character);
                      setImagePrompt(cleanedContext);
                    }}
                    className="theme-button-secondary w-full rounded-lg px-4 py-2 text-sm transition-all"
                  >
                    {t.chat.useConversationContext}
                  </button>
                </>
              )}
            </div>

            <div className="theme-modal-footer theme-modal-divider border-t px-6 py-4">
              <button
                onClick={() => setShowImageModal(false)}
                className="theme-modal-info-button w-full rounded-lg px-4 py-2 font-medium transition-all"
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

      {showBioModal && (
        <div
          className="theme-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setShowBioModal(false)}
        >
          <div
            className="theme-modal-shell max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="theme-modal-header theme-modal-divider sticky top-0 flex items-center justify-between border-b px-6 py-4">
              <div className="flex items-center gap-4">
                {character.avatarBase64 ? (
                  <img
                    src={character.avatarBase64}
                    alt={character.name}
                    className="theme-chat-avatar-ring h-16 w-16 rounded-full object-cover"
                  />
                ) : (
                  <div
                    className="theme-chat-avatar-ring flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold text-white"
                    style={{
                      background: `linear-gradient(135deg, ${character.themeColor}, ${character.themeColor}88)`
                    }}
                  >
                    {character.name.charAt(0)}
                  </div>
                )}

                <div>
                  <h2 className="theme-modal-title text-2xl font-bold">
                    {character.isCustom ? character.name : (t.characters?.[character.id]?.name || character.name)}
                  </h2>
                  <p className="theme-modal-subtitle text-sm">
                    {character.isCustom 
                      ? (character.subtitle || character.role)
                      : (t.characters?.[character.id]?.subtitle || character.subtitle || character.role)
                    }
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowBioModal(false)}
                className="theme-icon-button rounded-lg p-2 transition-all"
                title={t.common?.close || 'Close'}
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <h3 className="theme-modal-section-title mb-2 text-lg font-semibold">{t.chat.about}</h3>
                <p className="theme-modal-copy leading-relaxed">
                  {character.isCustom 
                    ? character.description
                    : (t.characters?.[character.id]?.description || character.description)
                  }
                </p>
              </div>

              {character.systemPrompt && (
                <div>
                  <h3 className="theme-modal-section-title mb-2 text-lg font-semibold">{t.chat.personalityProfile}</h3>
                  <div className="theme-modal-panel rounded-lg p-4">
                    <pre className="theme-modal-code whitespace-pre-wrap text-sm leading-relaxed font-mono">
                      {character.systemPrompt}
                    </pre>
                  </div>
                </div>
              )}

              {character.instructions && (
                <div>
                  <h3 className="theme-modal-section-title mb-2 text-lg font-semibold">{t.chat.criticalCharacterRules}</h3>
                  <div className="theme-modal-danger-panel rounded-lg p-4">
                    <pre className="theme-modal-code whitespace-pre-wrap text-sm leading-relaxed font-mono">
                      {character.instructions}
                    </pre>
                  </div>
                </div>
              )}

              <div>
                <h3 className="theme-modal-section-title mb-2 text-lg font-semibold">{t.settings.samplingParams || 'Sampling Parameters'}</h3>
                {(() => {
                  const mp = getModelProfile(settings?.ollamaModel);
                  return (
                    <div className="theme-modal-panel rounded-lg p-4">
                      <div className="theme-modal-copy grid grid-cols-2 gap-2 text-sm">
                        <div>Temperature: <span className="theme-modal-title">{mp.temperature}</span></div>
                        <div>Top P: <span className="theme-modal-title">{mp.topP}</span></div>
                        <div>Top K: <span className="theme-modal-title">{mp.topK}</span></div>
                        <div>Max Tokens: <span className="theme-modal-title">{mp.maxResponseTokens}</span></div>
                        <div>Min P: <span className="theme-modal-title">{mp.minP}</span></div>
                        <div>Repeat Penalty: <span className="theme-modal-title">{mp.repeatPenalty}</span></div>
                      </div>
                      {!character.isCustom && (
                        <p className="theme-modal-subtitle mt-2 text-xs italic">{t.settings.readOnly || 'Auto-configured for this model'}</p>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div>
                <h3 className="theme-modal-section-title mb-2 text-lg font-semibold">{t.chat.themeColor}</h3>
                <div className="flex items-center gap-3">
                  <div
                    className="h-12 w-12 rounded-lg border-2 border-[color:var(--color-border)]"
                    style={{ backgroundColor: character.themeColor }}
                  />
                  <span className="theme-modal-copy font-mono">{character.themeColor}</span>
                </div>
              </div>
            </div>

            <div className="theme-modal-footer theme-modal-divider sticky bottom-0 border-t px-6 py-4">
              <button
                onClick={() => setShowBioModal(false)}
                className="theme-modal-info-button w-full rounded-lg px-4 py-2 font-medium transition-all"
              >
                {t.common.back}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmModal && (
        <div className="theme-modal-backdrop fixed inset-0 z-[200] flex items-center justify-center">
          <div className="theme-modal-shell mx-4 max-w-sm rounded-2xl p-6">
            <p className="theme-modal-copy mb-4 text-sm">{confirmModal.message}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmModal(null)}
                className="theme-button-secondary flex-1 rounded-lg px-4 py-2 text-sm transition-colors"
              >
                {t.common.cancel || 'Cancel'}
              </button>
              <button
                onClick={() => { confirmModal.onConfirm(); setConfirmModal(null); }}
                className="theme-danger-button flex-1 rounded-lg px-4 py-2 text-sm transition-colors"
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
