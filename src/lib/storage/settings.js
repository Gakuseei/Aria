import { OLLAMA_DEFAULT_URL, DEFAULT_MODEL_NAME, VOICE_DEFAULT_URL, DATA_VERSION } from '../defaults.js';
import { normalizeContextSize } from '../ollama/index.js';
import { isElectron } from '../chat/platform.js';

const DEFAULT_ANIMATIONS_ENABLED = !Boolean(
  globalThis?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches,
);

const DEFAULT_SETTINGS = {
  dataVersion: DATA_VERSION,
  ollamaUrl: OLLAMA_DEFAULT_URL,
  ollamaModel: DEFAULT_MODEL_NAME,
  customProfiles: {},
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
  userPronouns: 'he/him',
  voiceEnabled: false,
  voiceUrl: VOICE_DEFAULT_URL,
  maxResponseTokens: 256,
  suggestionModel: null,
  suggestionFallbackToChat: true
};

const LEGACY_SAMPLING_FIELDS = [
  'temperature',
  'topK',
  'topP',
  'minP',
  'repeatPenalty',
  'repeatLastN',
  'penalizeNewline'
];

export function hoistLegacySamplingToCustomProfiles(settings) {
  if (!settings || typeof settings !== 'object') return settings;
  const model = settings.ollamaModel;
  const hoist = {};
  for (const field of LEGACY_SAMPLING_FIELDS) {
    const value = settings[field];
    if (value !== undefined && value !== null) hoist[field] = value;
    delete settings[field];
  }
  if (model && Object.keys(hoist).length > 0) {
    const existing = (settings.customProfiles && settings.customProfiles[model]) || {};
    settings.customProfiles = {
      ...(settings.customProfiles || {}),
      [model]: { ...hoist, ...existing }
    };
  } else if (!settings.customProfiles) {
    settings.customProfiles = {};
  }
  return settings;
}

export const loadSettings = async () => {
  try {
    if (isElectron()) {
      const result = await window.electronAPI.loadSettings();

      if (result && result.success && result.settings) {
        const merged = hoistLegacySamplingToCustomProfiles({
          ...DEFAULT_SETTINGS,
          ...result.settings
        });
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
        const merged = hoistLegacySamplingToCustomProfiles({
          ...DEFAULT_SETTINGS,
          ...parsed
        });
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
