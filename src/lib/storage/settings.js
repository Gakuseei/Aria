import { OLLAMA_DEFAULT_URL, DEFAULT_MODEL_NAME, IMAGE_GEN_DEFAULT_URL, VOICE_DEFAULT_URL, DATA_VERSION } from '../defaults.js';
import { normalizeContextSize } from '../ollama/index.js';
import { isElectron } from '../chat/platform.js';

const DEFAULT_ANIMATIONS_ENABLED = !Boolean(
  globalThis?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches,
);

const DEFAULT_SETTINGS = {
  dataVersion: DATA_VERSION,
  ollamaUrl: OLLAMA_DEFAULT_URL,
  ollamaModel: DEFAULT_MODEL_NAME,
  temperature: 0.8,
  topK: 30,
  topP: 0.9,
  minP: 0.05,
  repeatPenalty: 1.1,
  repeatLastN: 256,
  penalizeNewline: false,
  contextSize: 4096,
  fontSize: 'medium',
  autoSave: true,
  soundEnabled: true,
  animationsEnabled: DEFAULT_ANIMATIONS_ENABLED,
  themeMode: 'dark',
  oledMode: false,
  preferredLanguage: 'en',
  userName: 'User',
  userGender: 'male',
  imageGenEnabled: false,
  imageGenUrl: IMAGE_GEN_DEFAULT_URL,
  voiceEnabled: false,
  voiceUrl: VOICE_DEFAULT_URL,
  maxResponseTokens: 256
};

export const loadSettings = async () => {
  try {
    if (isElectron()) {
      const result = await window.electronAPI.loadSettings();

      if (result && result.success && result.settings) {
        const merged = {
          ...DEFAULT_SETTINGS,
          ...result.settings
        };
        return {
          ...merged,
          contextSize: normalizeContextSize(merged.contextSize, merged.ollamaModel),
          maxResponseTokens: Number.isFinite(Number(merged.maxResponseTokens))
            ? Math.max(96, Math.min(1024, Number(merged.maxResponseTokens)))
            : DEFAULT_SETTINGS.maxResponseTokens
        };
      }
    } else {
      const stored = localStorage.getItem('settings');

      if (stored) {
        const parsed = JSON.parse(stored);
        const merged = {
          ...DEFAULT_SETTINGS,
          ...parsed
        };
        return {
          ...merged,
          contextSize: normalizeContextSize(merged.contextSize, merged.ollamaModel),
          maxResponseTokens: Number.isFinite(Number(merged.maxResponseTokens))
            ? Math.max(96, Math.min(1024, Number(merged.maxResponseTokens)))
            : DEFAULT_SETTINGS.maxResponseTokens
        };
      }
    }

    return { ...DEFAULT_SETTINGS };

  } catch (error) {
    console.error('[v8.1 Settings] Load error:', error);
    return { ...DEFAULT_SETTINGS };
  }
};

// ============================================================================
// SESSION MANAGEMENT WITH HARD RESET
// ============================================================================
