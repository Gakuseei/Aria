import { OLLAMA_DEFAULT_URL, DEFAULT_MODEL_NAME, API_TIMEOUT_MS } from '../defaults.js';
import { loadSettings } from '../storage/settings.js';
import { isElectron } from '../chat/platform.js';

const MODEL_CAPS_CACHE = {};
const MODEL_CAPS_CACHE_MAX = 16;

function cacheModelCaps(key, caps) {
  const keys = Object.keys(MODEL_CAPS_CACHE);
  if (keys.length >= MODEL_CAPS_CACHE_MAX) {
    delete MODEL_CAPS_CACHE[keys[0]];
  }
  MODEL_CAPS_CACHE[key] = caps;
}

/**
 * Context size presets (tokens). Users pick a tier in Settings.
 * Ollama offloads to CPU if VRAM is exceeded — safe to overshoot.
 */
export const CONTEXT_SIZE_OPTIONS = [2048, 3072, 4096, 6144, 8192, 12288, 16384];

const LEGACY_CONTEXT_SIZE_MAP = {
  low: 3072,
  medium: 4096,
  high: 6144,
  max: 8192
};

export const ASSIST_BUDGET_CONFIG = {
  constrained: {
    suggestionNumCtxCap: 4096,
    suggestionContextReserve: 768,
    suggestionMaxTokens: 108,
    suggestionRetryTarget: 3,
    impersonateNumCtxCap: 3072,
    impersonateContextReserve: 384,
    impersonateFirstTokens: 104,
    impersonateRetryTokens: 132,
    allowWeakRetry: false,
    allowInvalidRetry: true
  },
  default: {
    suggestionNumCtxCap: 4096,
    suggestionContextReserve: 768,
    suggestionMaxTokens: 108,
    suggestionRetryTarget: 3,
    impersonateNumCtxCap: 4096,
    impersonateContextReserve: 256,
    impersonateFirstTokens: 120,
    impersonateRetryTokens: 152,
    allowWeakRetry: true,
    allowInvalidRetry: true
  },
  roomy: {
    suggestionNumCtxCap: 4096,
    suggestionContextReserve: 704,
    suggestionMaxTokens: 120,
    suggestionRetryTarget: 3,
    impersonateNumCtxCap: 4096,
    impersonateContextReserve: 192,
    impersonateFirstTokens: 136,
    impersonateRetryTokens: 176,
    allowWeakRetry: true,
    allowInvalidRetry: true
  }
};

function parseModelParamB(modelName = '') {
  const match = String(modelName).toLowerCase().match(/(\d+(?:\.\d+)?)\s*b\b/);
  return match ? parseFloat(match[1]) : null;
}

function parseParameterSizeB(parameterSize = '') {
  const match = String(parameterSize).toLowerCase().match(/(\d+(?:\.\d+)?)\s*b\b/);
  return match ? parseFloat(match[1]) : null;
}

export function deriveAssistBudgetTier({ parameterSize = '', modelName = '', contextSize = 4096, maxResponseTokens = 256 } = {}) {
  const parameterB = parseParameterSizeB(parameterSize) ?? parseModelParamB(modelName);
  const normalizedContext = normalizeContextSize(contextSize, modelName || parameterSize);
  const numericMaxTokens = Number.isFinite(Number(maxResponseTokens)) ? Number(maxResponseTokens) : 256;

  if ((Number.isFinite(parameterB) && parameterB <= 8) || normalizedContext <= 4096 || numericMaxTokens <= 192) {
    return 'constrained';
  }

  if ((Number.isFinite(parameterB) && parameterB >= 20) || normalizedContext >= 8192 || numericMaxTokens >= 512) {
    return 'roomy';
  }

  return 'default';
}

export function getRecommendedContextSizeForModel(modelName = '') {
  const paramB = parseModelParamB(modelName);
  if (!Number.isFinite(paramB)) return 4096;
  if (paramB <= 14) return 4096;
  return 6144;
}

export function normalizeContextSize(value, modelName = '') {
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (LEGACY_CONTEXT_SIZE_MAP[trimmed]) return LEGACY_CONTEXT_SIZE_MAP[trimmed];
    const numeric = Number.parseInt(trimmed, 10);
    if (Number.isFinite(numeric)) value = numeric;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return getRecommendedContextSizeForModel(modelName);
  }

  const bounded = Math.max(CONTEXT_SIZE_OPTIONS[0], Math.min(CONTEXT_SIZE_OPTIONS[CONTEXT_SIZE_OPTIONS.length - 1], Math.round(value)));
  return CONTEXT_SIZE_OPTIONS.reduce((nearest, option) => {
    return Math.abs(option - bounded) < Math.abs(nearest - bounded) ? option : nearest;
  }, CONTEXT_SIZE_OPTIONS[0]);
}

/**
 * Compute the capped num_ctx for a given model.
 * Centralised so every Ollama request uses the same value.
 */
export async function getModelCtx(ollamaUrl, model, requestedContextSize = 4096) {
  const caps = await getModelCapabilities(ollamaUrl, model);
  const normalizedContextSize = normalizeContextSize(requestedContextSize, model || caps.parameterSize);
  return Math.min(caps.contextLength, normalizedContextSize);
}

/**
 * Unload model from Ollama to fully clear KV cache.
 * Call this when switching characters / leaving chat.
 */
export async function unloadOllamaModel(settings) {
  try {
    const ollamaUrl = settings?.ollamaUrl || OLLAMA_DEFAULT_URL;
    const model = settings?.ollamaModel || DEFAULT_MODEL_NAME;
    if (isElectron()) {
      await window.electronAPI.ollamaUnload({ ollamaUrl, model });
    } else {
      await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [], keep_alive: 0 })
      });
    }
    console.log('[API] Model unloaded (keep_alive: 0)');
  } catch (err) {
    console.warn('[API] Model unload failed:', err?.message);
  }
}

export async function getModelCapabilities(ollamaUrl, modelName) {
  const cacheKey = `${ollamaUrl}::${modelName}`;
  if (MODEL_CAPS_CACHE[cacheKey]) return MODEL_CAPS_CACHE[cacheKey];

  const defaults = { contextLength: 4096, parameterSize: '7B' };
  try {
    if (isElectron()) {
      const result = await window.electronAPI.ollamaModelInfo({ ollamaUrl, model: modelName });
      const caps = {
        contextLength: result.contextLength || 4096,
        parameterSize: result.parameterSize || '7B'
      };
      cacheModelCaps(cacheKey, caps);
      return caps;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    const res = await fetch(`${ollamaUrl}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ name: modelName })
    });
    clearTimeout(timer);
    if (!res.ok) return defaults;
    const info = await res.json();

    let ctxParam = info.model_info?.['general.context_length']
      || info.model_info?.['llama.context_length']
      || info.model_info?.['qwen2.context_length']
      || info.model_info?.['qwen35.context_length'];
    if (typeof ctxParam !== 'number') {
      const mi = info.model_info || {};
      for (const key of Object.keys(mi)) {
        if (key.endsWith('.context_length') && typeof mi[key] === 'number') {
          ctxParam = mi[key];
          break;
        }
      }
    }
    const contextLength = typeof ctxParam === 'number' ? ctxParam : 4096;

    const paramRaw = info.details?.parameter_size || '7B';
    const caps = { contextLength, parameterSize: paramRaw };
    cacheModelCaps(cacheKey, caps);
    return caps;
  } catch (err) {
    console.warn('[API] getModelCapabilities failed for', modelName, ':', err?.message);
    return defaults;
  }
}

export const testOllamaConnection = async (url = OLLAMA_DEFAULT_URL) => {
  try {
    if (isElectron()) {
      const result = await window.electronAPI.ollamaModels({ ollamaUrl: url });
      if (result.success) {
        return { success: true, message: `✅ Connected! Found ${result.totalCount} models.` };
      }
      return { success: false, message: `❌ Connection failed: ${result.error}` };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${url}/api/tags`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      const modelCount = data.models ? data.models.length : 0;
      return {
        success: true,
        message: `✅ Connected! Found ${modelCount} models.`
      };
    } else {
      return { success: false, message: `❌ Connection failed: ${response.status}` };
    }
  } catch (error) {
    return { success: false, message: `❌ Connection failed: ${error.message}` };
  }
};

/**
 * Fetch available Ollama models
 * v8.1: RE-EXPORTED for Settings auto-detect dropdown
 * v1.1: STRICT FILTER - Blacklist embedding models (nomic-embed-text, BERT, etc.)
 */
export const fetchOllamaModels = async (ollamaUrl = OLLAMA_DEFAULT_URL) => {
  try {
    if (isElectron()) {
      const result = await window.electronAPI.ollamaModels({ ollamaUrl });
      return result.success ? result.models : [];
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    const response = await fetch(`${ollamaUrl}/api/tags`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`);
    }

    const data = await response.json();

    if (data.models && Array.isArray(data.models)) {
      const allModels = data.models.map(m => m.name);
      const chatModels = allModels.filter(name => {
        const lowerName = name.toLowerCase();
        if (lowerName.includes('embed')) return false;
        if (lowerName.includes('bert')) return false;
        return true;
      });
      return chatModels;
    }

    return [];
  } catch (error) {
    console.error('[v8.1 API] Error fetching Ollama models:', error);
    return [];
  }
};

/**
 * Auto-detect and set the first available Ollama model
 * This ensures the app always has a valid model configured
 */
export const autoDetectAndSetModel = async (ollamaUrl = OLLAMA_DEFAULT_URL) => {
  try {
    const models = await fetchOllamaModels(ollamaUrl);

    if (!models || models.length === 0) {
      console.error('[API] No Ollama models found — user needs to install a model');
      return { success: false, error: 'No models installed', models: [] };
    }

    // Get current settings (loadSettings returns the settings object directly)
    const settings = await loadSettings();

    // Check if current model exists in available models
    const currentModel = settings.ollamaModel;
    if (currentModel) {
      const exactMatch = models.includes(currentModel);
      // Fuzzy: only when no tag specified (e.g. 'dolphin3' matches 'dolphin3:latest')
      // Do NOT match across different tags ('gemma3:27b' vs 'gemma3:7b' are different models)
      const fuzzyMatch = !exactMatch && !currentModel.includes(':') &&
        models.find(m => m.split(':')[0] === currentModel);

      if (exactMatch || fuzzyMatch) {
        return { success: true, model: currentModel, models: models, changed: false };
      }
    }

    // Auto-select first available model
    const selectedModel = models[0];

    // Update settings properly (via Electron IPC if in Electron, otherwise localStorage)
    const updatedSettings = {
      ...settings,
      ollamaModel: selectedModel,
      ollamaUrl: ollamaUrl
    };

    // Save to both IPC AND localStorage to keep them in sync
    localStorage.setItem('settings', JSON.stringify(updatedSettings));
    if (isElectron()) {
      const saveResult = await window.electronAPI.saveSettings(updatedSettings);
      if (!saveResult || !saveResult.success) {
        console.error('[API] Failed to save auto-detected model via IPC');
      }
    }
    return {
      success: true,
      model: selectedModel,
      models: models,
      changed: true,
      message: `Auto-selected model: ${selectedModel}`
    };

  } catch (error) {
    console.error('[v8.2 Auto-Detect] ❌ Error:', error);
    return { success: false, error: error.message, models: [] };
  }
};
