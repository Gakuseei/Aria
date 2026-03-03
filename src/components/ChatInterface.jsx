// ============================================================================
// ARIA v1.0 RELEASE - ChatInterface
// ============================================================================

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Send, RotateCcw, Trash2, Download, Upload, RefreshCw, MapPin, Shirt, Settings as SettingsIcon, Image as ImageIcon, Volume2, VolumeX, ZoomIn, ZoomOut, Info, Sparkles, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { sendMessage, saveSession, loadSession, generateSessionId, deleteSession, autoDetectAndSetModel, generateSmartSuggestions } from '../lib/api';
import { passionManager, getTierKey } from '../lib/PassionManager';
import { generateImage, cleanContextForImage, extractConversationContext } from '../lib/imageGen';
import TutorialModal from './tutorials/TutorialModal';
import { useLanguage } from '../context/LanguageContext';

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
    // Add plain text before this match (if any)
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

  // Add remaining text (if any)
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

function MessageBubble({ message, isUser, character, userName, onCopy, onSpeak, voiceEnabled, fontSize = 'base', isGoldMode = false }) {
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  // BLOCK 7.0: Gold Mode - Check supporter status for amber name
  const isSupporter = localStorage.getItem('isSupporter') === 'true';

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
                : 'bg-gradient-to-br from-rose-700 via-rose-600 to-rose-800 border border-rose-500/20 text-white shadow-lg')
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

        <div className={`whitespace-pre-wrap break-words leading-relaxed text-${fontSize}`}>
          {(() => {
            const formattedParts = formatMessageText(message.content || '', isGoldMode && !isUser);
            return formattedParts.map((part, i) => {
              if (part.type === 'action') {
                return <span key={i} className="text-zinc-400 italic">{part.text}</span>;
              } else if (part.type === 'dialogue') {
                return <span key={i} className="text-white font-normal">{part.text}</span>;
              } else if (part.type === 'bold' && isGoldMode && !isUser) {
                return <span key={i} className="text-amber-400 font-bold drop-shadow-sm">{part.text}</span>;
              } else {
                return <span key={i} className="text-zinc-200">{part.text}</span>;
              }
            });
          })()}
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
              title="Play Audio"
            >
              <Volume2 size={14} strokeWidth={1.5} />
            </button>
          )}
          {/* Copy button */}
          <button
            onClick={() => onCopy(message.content || '')}
            className="p-1.5 rounded-lg bg-black/20 hover:bg-black/40 text-zinc-400 hover:text-white transition-all duration-200"
            title="Copy"
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
}

// ============================================================================
// ENVIRONMENT & STATE DETECTOR
// ============================================================================

function detectEnvironmentFromMessages(messages) {
  if (!messages || messages.length === 0) return null;
  
  const recentMessages = messages.slice(-10);
  const combinedText = recentMessages
    .map(m => (m.content || '').toLowerCase())
    .join(' ');
  
  const environments = {
    shower: ['shower', 'dusche', 'water', 'wasser'],
    bed: ['bed', 'bett', 'sheets', 'laken'],
    couch: ['couch', 'sofa'],
    kitchen: ['kitchen', 'küche'],
    car: ['car', 'auto'],
    outdoors: ['park', 'forest', 'beach']
  };
  
  for (const [env, keywords] of Object.entries(environments)) {
    for (const keyword of keywords) {
      if (combinedText.includes(keyword)) return env;
    }
  }
  
  return null;
}

function detectStateFromMessages(messages) {
  if (!messages || messages.length === 0) return null;
  
  const recentMessages = messages.slice(-10);
  const combinedText = recentMessages
    .map(m => (m.content || '').toLowerCase())
    .join(' ');
  
  const states = {
    undressed: ['naked', 'nackt', 'undressed', 'bare', 'nude'],
    partially_undressed: ['shirt off', 'pants down', 'topless'],
    clothed: ['dressed', 'angezogen', 'wearing']
  };
  
  for (const [state, keywords] of Object.entries(states)) {
    for (const keyword of keywords) {
      if (combinedText.includes(keyword)) return state;
    }
  }
  
  return null;
}

// ============================================================================
// PASSION SPARKLINE
// ============================================================================

const PassionSparkline = React.memo(function PassionSparkline({ history, color }) {
  if (!history || history.length < 5) return null;

  const points = history.slice(-25);
  const width = 40;
  const height = 16;

  const pathData = points
    .map((val, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - (val / 100) * height;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} className="opacity-60">
      <path d={pathData} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
  const [passionLevel, setPassionLevel] = useState(0);
  const previousTierRef = useRef('innocent');
  const [tierTransitioning, setTierTransitioning] = useState(false);
  const [tierToast, setTierToast] = useState(null);
  const [showPassionPresets, setShowPassionPresets] = useState(false);
  const passionRingRef = useRef(null);
  const [currentEnvironment, setCurrentEnvironment] = useState(null);
  const [currentState, setCurrentState] = useState(null);
  const [sessionId, setSessionId] = useState(null);

  const passionHistory = useMemo(() => {
    if (!sessionId) return [];
    return passionManager.getHistory(sessionId);
  }, [sessionId, passionLevel]);

  const passionMomentum = useMemo(() => {
    if (!sessionId) return 0;
    return passionManager.getMomentum(sessionId);
  }, [sessionId, passionLevel]);

  const currentStreak = useMemo(() => {
    if (!sessionId) return 0;
    return passionManager.getStreak(sessionId);
  }, [sessionId, passionLevel]);
  const [showChatOptions, setShowChatOptions] = useState(false);

  // BLOCK 6.9: Entrance Animation
  const [isVisible, setIsVisible] = useState(false);
  
  // v0.2.5: Gold Mode State
  const [isGoldMode, setIsGoldMode] = useState(false);
  
  // v0.2.5 RESTORED: Feature states from localStorage
  const [userName, setUserName] = useState('User');
  const [imageGenEnabled, setImageGenEnabled] = useState(false);
  // STEP 2 FIX: Initialize voiceEnabled as null to distinguish "not loaded" from "false"
  const [voiceEnabled, setVoiceEnabled] = useState(null);

  // v0.2.5 FIX: Settings come from parent (App.jsx), merged with localStorage for backward compatibility
  const [localSettings, setLocalSettings] = useState({
    imageGenUrl: 'http://127.0.0.1:7860',
    voiceUrl: 'http://127.0.0.1:5000',
    ollamaUrl: 'http://127.0.0.1:11434',
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
    return saved !== null ? JSON.parse(saved) : true;  // Default: ON
  });

  // Persist autoReadEnabled
  useEffect(() => {
    localStorage.setItem('autoReadEnabled', JSON.stringify(autoReadEnabled));
  }, [autoReadEnabled]);
  
  // v0.2.5 RESTORED: UI panels
  const [showImagePanel, setShowImagePanel] = useState(false);

  // Text Zoom State
  const [fontSize, setFontSize] = useState('base');

  // v0.2.5: Character Bio Modal
  const [showBioModal, setShowBioModal] = useState(false);

  // v0.2.5: Passion System Toggle (OFF = Unchained Mode, ON = Gatekeeping)
  const [isUnchainedMode, setIsUnchainedMode] = useState(() => {
    const saved = localStorage.getItem('passionGatekeepingEnabled');
    return saved !== null ? !JSON.parse(saved) : false;
  });

  // v0.2.5: Smart Suggestions
  const [smartSuggestions, setSmartSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [smartSuggestionsEnabled, setSmartSuggestionsEnabled] = useState(true);

  // v0.2.5: Image Generation Modal
  const [showImageModal, setShowImageModal] = useState(false);
  const [imagePrompt, setImagePrompt] = useState('');
  const [generatingImage, setGeneratingImage] = useState(false);
  const [lastImageGenMessage, setLastImageGenMessage] = useState(0);

  // v0.2.5: Tutorial Modal
  const [showTutorial, setShowTutorial] = useState(null);

  const [showPassionResumeModal, setShowPassionResumeModal] = useState(false);
  const [passionResumeData, setPassionResumeData] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);
  const importFileRef = useRef(null);
  const audioRef = useRef(null);

  // BLOCK 6.9: Trigger entrance animation
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // v0.2.5: Check Gold Mode on mount and when localStorage changes
  useEffect(() => {
    const checkGoldMode = () => {
      const isSupporter = localStorage.getItem('isSupporter') === 'true';
      const goldTheme = localStorage.getItem('goldThemeEnabled') === 'true';
      const isGold = isSupporter && goldTheme;
      setIsGoldMode(isGold);
      
      // Apply gold-mode class to body for global styles
      if (isGold) {
        document.body.classList.add('gold-mode');
      } else {
        document.body.classList.remove('gold-mode');
      }
    };
    
    // Initial check
    checkGoldMode();
    
    // Listen for gold-theme-changed event
    window.addEventListener('gold-theme-changed', checkGoldMode);
    
    return () => {
      window.removeEventListener('gold-theme-changed', checkGoldMode);
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
        const loadedSettings = Object.keys(backendSettings).length > 0 
          ? backendSettings 
          : JSON.parse(localStorage.getItem('settings') || '{}');

        // BLOCK 8.2: Store full settings object (including ollamaModel)
        setLocalSettings({
          imageGenUrl: loadedSettings.imageGenUrl || 'http://127.0.0.1:7860',
          voiceUrl: loadedSettings.voiceUrl || 'http://127.0.0.1:5000',
          ollamaUrl: loadedSettings.ollamaUrl || 'http://127.0.0.1:11434',
          ollamaModel: loadedSettings.ollamaModel || 'hermes3',
          piperPath: loadedSettings.piperPath || '',
          modelPath: loadedSettings.modelPath || '',
          voiceVolume: loadedSettings.voiceVolume ?? 1.0,
          oledMode: loadedSettings.oledMode || false
        });

        setUserName(loadedSettings.userName || 'User');
        setImageGenEnabled(loadedSettings.imageGenEnabled || false);
        // STEP 2 FIX: Use voiceEnabled from IPC/backend settings (explicit boolean check)
        const savedVoiceEnabled = loadedSettings.voiceEnabled === true;
        console.log('[ChatInterface] Loaded voiceEnabled from settings:', savedVoiceEnabled);
        setVoiceEnabled(savedVoiceEnabled);
        setSmartSuggestionsEnabled(loadedSettings.smartSuggestionsEnabled !== false);  // Default ON

        // Load font size preference
        const savedFontSize = localStorage.getItem('chatFontSize') || 'base';
        setFontSize(savedFontSize);

        console.log('[v8.1 ChatInterface] ✅ Settings loaded:', { userName, imageGenEnabled, voiceEnabled, fontSize: savedFontSize });

        // v0.2.5: AUTO-DETECT MODEL WHEN OPENING CHAT
        console.log('[v8.2 ChatInterface] 🔍 Auto-detecting Ollama model...');
        const autoDetectResult = await autoDetectAndSetModel();

        if (autoDetectResult.success) {
          if (autoDetectResult.changed) {
            console.log(`[v8.2 ChatInterface] 🎯 Model auto-configured: ${autoDetectResult.model}`);
          } else {
            console.log(`[v8.2 ChatInterface] ✅ Model already configured: ${autoDetectResult.model}`);
          }
        } else {
          console.warn('[v8.2 ChatInterface] ⚠️ No models found. User needs to install a model.');
        }

        // v0.2.5: Generate initial suggestions (chat starters)
        if (settings.smartSuggestionsEnabled !== false) {
          generateSuggestions([]);
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
      // Update state when voice status changes via IPC
      if (voiceEnabled !== newValue) {
        setVoiceEnabled(newValue);
        const updatedSettings = { ...settings, voiceEnabled: newValue };
        setLocalSettings(updatedSettings);
        localStorage.setItem('settings', JSON.stringify(updatedSettings));
      }
    });
    return cleanup;
  }, [voiceEnabled, settings]);

  // FIX 3: Settings updated listener (sync from backend)
  useEffect(() => {
    const cleanup = window.electronAPI?.onSettingsUpdated?.((newSettings) => {
      // Update local state when settings change via IPC
      if (newSettings.voiceEnabled !== undefined && newSettings.voiceEnabled !== voiceEnabled) {
        setVoiceEnabled(newSettings.voiceEnabled);
      }
      // Image Generation sync
      if (newSettings.imageGenEnabled !== undefined && newSettings.imageGenEnabled !== imageGenEnabled) {
        setImageGenEnabled(newSettings.imageGenEnabled);
        console.log('[ChatInterface] Image Generation synced:', newSettings.imageGenEnabled);
      }
      if (newSettings.imageGenUrl !== undefined) {
        setLocalSettings(prev => ({ ...prev, imageGenUrl: newSettings.imageGenUrl }));
      }
      if (newSettings.modelPath !== undefined && newSettings.modelPath !== settings.modelPath) {
        setLocalSettings(prev => ({ ...prev, modelPath: newSettings.modelPath }));
      }
      if (newSettings.piperPath !== undefined && newSettings.piperPath !== settings.piperPath) {
        setLocalSettings(prev => ({ ...prev, piperPath: newSettings.piperPath }));
      }
      localStorage.setItem('settings', JSON.stringify(newSettings));
    });
    return cleanup;
  }, [voiceEnabled, imageGenEnabled, settings]);

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
    const stored = JSON.parse(localStorage.getItem('settings') || '{}');
    stored.passionSystemEnabled = !isUnchainedMode;
    localStorage.setItem('settings', JSON.stringify(stored));
    setLocalSettings(prev => ({ ...prev, passionSystemEnabled: !isUnchainedMode }));
  }, [isUnchainedMode]);

  useEffect(() => {
    const currentTier = getTierKey(passionLevel);
    if (currentTier !== previousTierRef.current) {
      setTierTransitioning(true);
      const timer = setTimeout(() => setTierTransitioning(false), 600);
      const tierOrder = ['innocent', 'warm', 'passionate', 'primal'];
      const oldIdx = tierOrder.indexOf(previousTierRef.current);
      const newIdx = tierOrder.indexOf(currentTier);
      const fromLabel = t.chat[`passion${previousTierRef.current.charAt(0).toUpperCase() + previousTierRef.current.slice(1)}`] || previousTierRef.current;
      const toLabel = t.chat[`passion${currentTier.charAt(0).toUpperCase() + currentTier.slice(1)}`] || currentTier;
      const template = newIdx > oldIdx ? t.chat.tierUp : t.chat.tierDown;
      let toastTimer;
      if (template) {
        setTierToast(template.replace('{from}', fromLabel).replace('{to}', toLabel));
        toastTimer = setTimeout(() => setTierToast(null), 3000);
      }
      previousTierRef.current = currentTier;
      return () => { clearTimeout(timer); if (toastTimer) clearTimeout(toastTimer); };
    }
  }, [passionLevel]);

  useEffect(() => {
    if (!showPassionPresets) return;
    const handleClickOutside = (e) => {
      if (passionRingRef.current && !passionRingRef.current.contains(e.target)) {
        setShowPassionPresets(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPassionPresets]);

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  useEffect(() => {
    initializeChat();
  }, [character]);

  const initializeChat = async () => {
    // Check if we're restoring a saved session
    if (loadedSession && loadedSession.messages && loadedSession.messages.length > 0) {
      const restoredSessionId = loadedSession.sessionId || generateSessionId();
      setSessionId(restoredSessionId);
      setMessages(loadedSession.messages);
      setPassionLevel(loadedSession.passionLevel || 0);
      if (restoredSessionId) {
        passionManager.setPassion(restoredSessionId, loadedSession.passionLevel || 0);
      }

      console.log('[v1.0 ChatInterface] 📂 Restored saved session:', restoredSessionId);
      console.log('[v1.0 ChatInterface] 💬 Messages:', loadedSession.messages.length);
      console.log('[v1.0 ChatInterface] 🔥 Passion Level:', loadedSession.passionLevel || 0);
      return;
    }

    // v0.2.5 FIX: Generate UNIQUE session ID for each new chat (not per character)
    // This ensures Passion Level resets to 0 for new chats
    const newSessionId = generateSessionId();
    setSessionId(newSessionId);

    // ALWAYS start with Passion Level 0 for new chats
    setPassionLevel(0);

    console.log('[v9.2 ChatInterface] 🆕 Starting NEW chat session:', newSessionId);
    console.log('[v9.2 ChatInterface] 🔥 Passion Level: 0 (fresh start)');

    if (character?.id) {
      const memory = passionManager.getCharacterMemory(character.id);
      if (memory && memory.lastLevel > 0) {
        setPassionResumeData(memory);
        setShowPassionResumeModal(true);
      }
    }

    initializeGreeting();
  };

  const initializeGreeting = () => {
    let greeting;

    if (character.id && t.characters && t.characters[character.id] && t.characters[character.id].greeting) {
      greeting = t.characters[character.id].greeting;
      console.log('[v1.0 ChatInterface] Using translated greeting for', character.id);
    } else {
      greeting = character.greeting || character.startingMessage || `*smiles warmly* Hey! I'm ${character.name}.`;
      console.log('[v1.0 ChatInterface] Using original greeting (custom character or fallback)');
    }

    setMessages([{ role: 'assistant', content: greeting.trim(), timestamp: Date.now() }]);
  };

  // ============================================================================
  // AUTO-SAVE & ENVIRONMENT TRACKING
  // ============================================================================

  useEffect(() => {
    if (messages.length > 0 && sessionId) {
      saveCurrentSession();
      
      const env = detectEnvironmentFromMessages(messages);
      const state = detectStateFromMessages(messages);
      
      if (env !== currentEnvironment) setCurrentEnvironment(env);
      if (state !== currentState) setCurrentState(state);
    }
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
    // Scroll immediately when messages change
    scrollToBottom();
    
    // Additional delayed scroll to ensure DOM has fully rendered
    const timer = setTimeout(() => {
      scrollToBottom();
    }, 100);
    
    return () => clearTimeout(timer);
  }, [messages]);

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      // Force scroll to absolute bottom of container
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  };

  const scrollToBottomInstant = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  };

  // ============================================================================
  // v0.2.5: SMART SUGGESTIONS GENERATOR
  // ============================================================================

  const generateSuggestions = async (currentMessages, currentPassion) => {
    if (!smartSuggestionsEnabled) return;

    setLoadingSuggestions(true);
    try {
      const currentLanguage = settings.preferredLanguage || localStorage.getItem('language') || 'en';
      const level = currentPassion !== undefined ? currentPassion : passionLevel;
      const suggestions = await generateSmartSuggestions(currentMessages, character, currentLanguage, level, sessionId);
      setSmartSuggestions(suggestions);
    } catch (error) {
      console.error('[v1.0 Suggestions] Error:', error);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    setInput(suggestion);
    handleSend(suggestion);
  };

  // ============================================================================
  // v0.2.5: IMAGE GENERATION (AUTO & MANUAL)
  // ============================================================================

  const handleAutoImageGen = async () => {
    if (!imageGenEnabled || passionLevel <= 60) return;
    
    const messagesSinceLastImage = messages.length - lastImageGenMessage;
    if (messagesSinceLastImage < 5) return;  // Wait at least 5 messages

    setLastImageGenMessage(messages.length);
    
    // Extract visual context from last 3 messages
    const recentContext = messages.slice(-3).map(m => m.content).join(' ');
    const visualPrompt = `NSFW, intimate scene, ${character.name}, ${recentContext.substring(0, 200)}`;
    
    console.log('[v1.0 Image Gen AUTO] Generating:', visualPrompt);
    // TODO: Call IPC handler for image generation
  };

  const handleManualImageGen = async () => {
    if (!imagePrompt.trim()) return;

    setGeneratingImage(true);
    try {
      console.log('[BLOCK 8.1 Image Gen] Generating:', imagePrompt);

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

      console.log('[BLOCK 8.1 Image Gen] ✅ Image generated successfully');
    } catch (error) {
      console.error('[BLOCK 8.1 Image Gen] ❌ Error:', error);
      alert(`Image generation failed: ${error.message}`);
    } finally {
      setGeneratingImage(false);
    }
  };

  // ============================================================================
  // MESSAGE SENDING
  // ============================================================================

  const handleSend = async (messageText = input) => {
    const safeMessageText = (messageText || '').trim();
    if (!safeMessageText || isLoading) return;

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

      const response = await sendMessage(
        safeMessageText,
        character,
        '',
        newMessages,
        sessionId,
        isUnchainedMode,
        handleApiStats,
        settings,
        false
      );

      if (!response.success) {
        throw new Error(response.error || 'Failed to get response');
      }

      const safeResponse = (response.message || '').trim();

      const assistantMessage = { 
        role: 'assistant', 
        content: safeResponse,
        timestamp: Date.now()
      };
      const updatedMessages = [...newMessages, assistantMessage];
      setMessages(updatedMessages);

      const freshPassion = response.passionLevel !== undefined ? response.passionLevel : passionLevel;
      if (response.passionLevel !== undefined) {
        setPassionLevel(response.passionLevel);
      }

      if (smartSuggestionsEnabled) {
        generateSuggestions(updatedMessages, freshPassion);
      }

      if (imageGenEnabled && freshPassion > 60) {
        handleAutoImageGen();
      }
      
      // Voice output (if enabled and auto-read enabled)
      if (voiceEnabled === true && autoReadEnabled) {
        handleSpeak(safeResponse);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
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

  const handleResetPassion = () => {
    setConfirmModal({
      message: t.chat.resetPassionConfirm,
      onConfirm: () => {
        if (sessionId) {
          passionManager.resetPassion(sessionId);
        }
        if (character?.id) {
          passionManager.clearCharacterMemory(character.id);
        }
        setPassionLevel(0);
      }
    });
  };

  const handleClearChat = async (skipConfirmation = false) => {
    const doReset = async () => {
      console.log('[v9.2 ChatInterface] 🗑️ HARD RESET: Deleting chat...');

      initializeGreeting();
      setCurrentEnvironment(null);
      setCurrentState(null);

      try {
        await deleteSession(sessionId);
        console.log('[v9.2 ChatInterface] ✅ Session HARD RESET complete');
      } catch (error) {
        console.error('[v9.2 ChatInterface] ❌ Error during hard reset:', error);
      }

      if (sessionId) {
        passionManager.resetPassion(sessionId);
      }
      if (character?.id) {
        passionManager.clearCharacterMemory(character.id);
      }
      setPassionLevel(0);
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
        character: character,
        messages: messages,
        passionLevel: passionLevel,
        passionHistory: passionManager.getHistory(sessionId),
        sessionId: sessionId,
        exportedAt: new Date().toISOString(),
        version: '0.2.5'
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chat-${character.name}-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export error:', error);
      toast.error(t.chat.failedToExport);
    }
  };

  const handleImportClick = () => {
    importFileRef.current?.click();
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
    if (messages.length < 2 || isLoading) return;

    const lastUserMessageIndex = messages.map((msg, idx) => ({ msg, idx }))
      .reverse()
      .find(({ msg }) => msg && msg.role === 'user')?.idx;

    if (lastUserMessageIndex === undefined) return;

    const messagesUpToLastUser = messages.slice(0, lastUserMessageIndex + 1);
    const lastUserMessage = (messages[lastUserMessageIndex].content || '').trim();

    setMessages(messagesUpToLastUser);
    setIsLoading(true);

    try {
      const response = await sendMessage(
        lastUserMessage,
        character,
        '',
        messagesUpToLastUser,
        sessionId,
        isUnchainedMode,
        null,
        settings,
        true
      );

      if (!response.success) {
        throw new Error(response.error || 'Failed to regenerate');
      }

      const safeResponse = (response.message || '').trim();

      const assistantMessage = { 
        role: 'assistant', 
        content: safeResponse,
        timestamp: Date.now()
      };
      const updatedMessages = [...messagesUpToLastUser, assistantMessage];
      setMessages(updatedMessages);

      if (response.passionLevel !== undefined) {
        setPassionLevel(response.passionLevel);
      }
    } catch (error) {
      console.error('Error regenerating:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const copyMessageToClipboard = (content) => {
    const safeContent = (content || '').trim();
    if (!safeContent) return;
    
    navigator.clipboard.writeText(safeContent).catch(err => {
      console.error('Failed to copy:', err);
    });
  };

  // v0.2.5 RESTORED: Image Generation Handler
  const handleImageGen = () => {
    if (!imageGenEnabled) {
      alert('Image Generation is disabled. Enable it in Settings.');
      return;
    }
    setShowImagePanel(!showImagePanel);
    console.log('[v8.1 ChatInterface] 🎨 Image panel toggled');
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
        alert('✅ Image Generation connection successful!');
      } else {
        alert('❌ Connection failed. Make sure AUTOMATIC1111 is running.');
      }
    } catch (error) {
      alert('❌ Error testing connection');
    }
  };

  const handleTestVoice = async (url) => {
    try {
      const result = await window.electronAPI?.testVoice?.(url);
      if (result?.success) {
        alert('✅ Voice/TTS connection successful!');
      } else {
        alert('❌ Connection failed. Make sure your TTS server is running.');
      }
    } catch (error) {
      alert('❌ Error testing connection');
    }
  };

  // ============================================================================
  // PASSION HELPERS
  // ============================================================================

  const getTierColor = (level) => {
    const tier = getTierKey(level);
    switch (tier) {
      case 'innocent': return '#06b6d4';
      case 'warm': return '#f472b6';
      case 'passionate': return '#f43f5e';
      case 'primal': return '#dc2626';
      default: return '#06b6d4';
    }
  };

  const handleTogglePresets = () => {
    setShowPassionPresets(prev => !prev);
  };

  const handlePresetSelect = (level) => {
    if (sessionId) {
      passionManager.setPassion(sessionId, level);
    }
    setPassionLevel(level);
    setShowPassionPresets(false);
  };


  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="relative flex flex-col h-screen overflow-hidden bg-gradient-to-br from-zinc-900 via-zinc-900 to-black text-white">
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
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-white">
                {character.isCustom ? character.name : (t.characters?.[character.id]?.name || character.name)}
              </h2>
              <button
                onClick={() => setShowBioModal(true)}
                className="p-2 hover:bg-white/10 rounded-lg text-zinc-500 hover:text-zinc-300 transition-all"
                title={t.chat.viewBio}
              >
                <Info size={18} strokeWidth={1.5} />
              </button>
            </div>
            <div
              ref={passionRingRef}
              className="flex items-center gap-2 mt-1.5 relative cursor-pointer select-none"
              onClick={!isUnchainedMode ? handleTogglePresets : undefined}
            >
              <div className={`text-xs font-medium px-3 py-1.5 rounded-full inline-flex items-center gap-2 ${
                isUnchainedMode
                  ? 'bg-rose-500/20 text-rose-300 animate-pulse'
                  : 'bg-zinc-800/80 text-zinc-400'
              }`}>
                {isUnchainedMode ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-rose-400" />
                    {t.chat.unchained}
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 20 20">
                      <circle
                        cx="10" cy="10" r="8"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        opacity="0.2"
                      />
                      <circle
                        cx="10" cy="10" r="8"
                        fill="none"
                        stroke={getTierColor(passionLevel)}
                        strokeWidth="2"
                        strokeDasharray={`${passionLevel * 0.5027} 50.27`}
                        strokeLinecap="round"
                        transform="rotate(-90 10 10)"
                        style={{ transition: 'stroke 300ms ease, stroke-dasharray 300ms ease' }}
                      />
                    </svg>
                    <span
                      style={{ transition: 'opacity 200ms ease' }}
                      className={tierTransitioning ? 'opacity-50' : 'opacity-100'}
                      title={t.chat.passionTooltip}
                    >
                      {passionLevel}% {t.chat[`passion${getTierKey(passionLevel).charAt(0).toUpperCase() + getTierKey(passionLevel).slice(1)}`]}
                    </span>
                    <PassionSparkline history={passionHistory} color={getTierColor(passionLevel)} />
                    {passionMomentum > 1 && (
                      <span className="text-[10px] text-emerald-400 font-bold" title={t.chat.passionRising}>↑</span>
                    )}
                    {passionMomentum < -1 && (
                      <span className="text-[10px] text-red-400 font-bold" title={t.chat.passionFalling}>↓</span>
                    )}
                    {passionMomentum >= -1 && passionMomentum <= 1 && passionHistory.length >= 5 && (
                      <span className="text-[10px] text-orange-400 font-bold" title={t.chat.passionStable}>→</span>
                    )}
                    {currentStreak >= 3 && !isUnchainedMode && (
                      <span className="text-[10px] text-orange-400 font-bold animate-pulse" title={(t.chat.passionStreak || '').replace('{count}', currentStreak)}>
                        x{currentStreak}
                      </span>
                    )}
                    {getTierKey(passionLevel) === 'primal' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    )}
                    <span className="text-[10px] text-zinc-600 ml-0.5">▾</span>
                  </>
                )}
              </div>
              {showPassionPresets && !isUnchainedMode && (
                <div className="absolute top-full left-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50 min-w-[160px] py-1">
                  {[
                    { label: t.chat.presetFresh, level: 0 },
                    { label: t.chat.presetWarm, level: 30 },
                    { label: t.chat.presetPassionate, level: 65 },
                    { label: t.chat.presetMax, level: 100 },
                  ].map(({ label, level }) => (
                    <button
                      key={level}
                      onClick={() => handlePresetSelect(level)}
                      className="w-full px-3 py-2 text-left text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors flex items-center gap-2"
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getTierColor(level) }} />
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Side - Icon Buttons with Rose Accents - BLOCK 6.9: Enhanced Clickability */}
        <div className="flex items-center gap-2 relative z-50 pointer-events-auto">
          <button
            onClick={() => setShowImageModal(true)}
            className={`p-3 hover:bg-white/10 active:scale-95 rounded-xl transition-all duration-200 ${
              imageGenEnabled ? 'text-purple-400 hover:text-purple-300' : 'text-zinc-600'
            }`}
            title="Image Generation"
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
              title="Voice Settings"
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
                        console.log('[ChatInterface] Toggling voice:', currentValue, '->', newValue);
                        
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
                      <select
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
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                      >
                        <option value="">{t.chat.voiceSettings.selectModel}</option>
                        {availableVoiceModels.map(model => (
                          <option key={model.path} value={model.path}>
                            {model.name}
                          </option>
                        ))}
                        <option value="__browse__">{t.chat.voiceSettings.browse}</option>
                      </select>
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
                : t.chat.enableUnchainedConfirm;
              setConfirmModal({ message: msg, onConfirm: () => setIsUnchainedMode(!isUnchainedMode) });
            }}
            className={`p-3 rounded-xl transition-all duration-200 active:scale-95 ${
              isUnchainedMode
                ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 shadow-lg shadow-rose-500/20'
                : 'hover:bg-white/10 text-cyan-400 hover:text-cyan-300'
            }`}
            title={!isUnchainedMode ? t.chat.enableUnchained : t.chat.unchainedActive}
          >
            <Sparkles size={22} strokeWidth={1.5} />
          </button>

          {/* Regenerate Last Response */}
          <button
            onClick={regenerateLastResponse}
            disabled={isLoading || messages.length < 2}
            className="p-3 hover:bg-white/10 active:scale-95 rounded-xl transition-all duration-200 text-zinc-500 hover:text-rose-400 disabled:opacity-30 disabled:cursor-not-allowed"
            title={t.chat.regenerateResponse}
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
        className={`flex-1 min-h-0 overflow-y-auto px-4 py-6 pb-48 ${
          isGoldMode ? 'scrollbar-gold' : ''
        }`}
      >
        <div className="max-w-5xl mx-auto">
          {messages.map((message, index) => (
            <MessageBubble
              key={index}
              message={message}
              isUser={message.role === 'user'}
              character={character}
              userName={userName}
              onCopy={copyMessageToClipboard}
              onSpeak={handleSpeak}
              voiceEnabled={voiceEnabled}
              fontSize={fontSize}
              isGoldMode={isGoldMode}
            />
          ))}
          
          {isLoading && (
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
              <div className="glass rounded-2xl px-5 py-3.5">
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
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* v1.0 ROSE NOIR: Floating Input "Cockpit" - BLOCK 6.7: Detached, premium styling */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-5xl z-50">
        {/* Smart Suggestions - Rose Noir Pills */}
        {smartSuggestionsEnabled && smartSuggestions.length > 0 && (
          <div className="flex gap-2.5 mb-4 flex-wrap justify-center">
            {smartSuggestions.map((suggestion, i) => (
              <button
                key={i}
                onClick={() => handleSuggestionClick(suggestion)}
                disabled={isLoading}
                className={`px-4 py-2 bg-zinc-900/95 backdrop-blur-2xl border rounded-full text-sm transition-all duration-200 disabled:opacity-50 flex items-center gap-2 shadow-lg ${
                  isGoldMode
                    ? 'border-amber-500/40 text-amber-100 hover:bg-amber-500/10 hover:shadow-[0_0_15px_-3px_rgba(245,158,11,0.3)] hover:border-amber-400'
                    : 'border-zinc-700/50 hover:border-rose-500/30 text-zinc-400 hover:text-rose-300 hover:bg-rose-500/10'
                }`}
                title="Click to send"
              >
                <Sparkles size={12} className="text-rose-400/70" />
                <span>{suggestion}</span>
              </button>
            ))}
          </div>
        )}

        {/* Floating Input Bar - Premium Glass Cockpit */}
        <div className={`bg-zinc-900/95 backdrop-blur-2xl rounded-3xl shadow-[0_20px_50px_-10px_rgba(0,0,0,0.8)] px-5 py-4 flex items-center gap-3 transition-all duration-200 ${
          isGoldMode ? 'border border-amber-500/30 focus-within:border-amber-400 focus-within:ring-1 focus-within:ring-amber-400/50' : 'border border-rose-500/30 focus-within:border-rose-500'
        }`}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={t.chat.messageCharacter.replace('{name}', character.isCustom ? character.name : (t.characters?.[character.id]?.name || character.name))}
            disabled={isLoading}
            className="flex-1 bg-transparent border-none text-white text-lg placeholder-zinc-500 focus:outline-none disabled:opacity-50 px-2"
          />
          <button
            onClick={() => handleSend()}
            disabled={isLoading || !input.trim()}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 disabled:opacity-30 shadow-lg flex-shrink-0 ${
              isGoldMode
                ? 'bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-600 hover:to-yellow-500 text-black font-bold shadow-amber-900/20 disabled:from-zinc-600 disabled:to-zinc-700'
                : 'bg-gradient-to-br from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white shadow-rose-500/30 disabled:from-zinc-600 disabled:to-zinc-700'
            }`}
            title={t.chat.send}
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
                      const currentSettings = JSON.parse(localStorage.getItem('settings') || '{}');
                      currentSettings.imageGenEnabled = true;
                      localStorage.setItem('settings', JSON.stringify(currentSettings));
                      await window.electronAPI?.saveSettings?.(currentSettings);
                      console.log('[ChatInterface] Image Generation enabled directly');
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
                title="Close"
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

      {showPassionResumeModal && passionResumeData && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[200]">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-sm mx-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">{t.chat.passionResumeTitle}</h3>
            <p className="text-sm text-zinc-400 mb-4">
              {(t.chat.passionResumeMessage || '').replace('{level}', passionResumeData.lastLevel)}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowPassionResumeModal(false);
                  setPassionResumeData(null);
                }}
                className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors"
              >
                {t.chat.passionResumeFresh}
              </button>
              <button
                onClick={() => {
                  if (sessionId) {
                    passionManager.setPassion(sessionId, passionResumeData.lastLevel);
                    if (passionResumeData.lastHistory) {
                      passionManager.restoreHistory(sessionId, passionResumeData.lastHistory);
                    }
                  }
                  setPassionLevel(passionResumeData.lastLevel);
                  setShowPassionResumeModal(false);
                  setPassionResumeData(null);
                }}
                className="flex-1 px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 rounded-lg text-sm transition-colors"
              >
                {(t.chat.passionResumeResume || '').replace('{level}', passionResumeData.lastLevel)}
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