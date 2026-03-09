/**
 * Per-model-family sampling defaults and auto-detection.
 * @module modelProfiles
 */

/** @type {Record<string, {label: string, temperature: number, topP: number, topK: number, maxResponseTokens: number, minP: number, repeatPenalty: number, repeatLastN: number, penalizeNewline: boolean, flags: Record<string, boolean>}>} */
export const MODEL_PROFILES = {
  qwen: {
    label: 'Qwen',
    temperature: 0.8,
    topP: 0.9,
    topK: 30,
    maxResponseTokens: 256,
    minP: 0.05,
    repeatPenalty: 1.1,
    repeatLastN: 256,
    penalizeNewline: false,
    flags: { think: false }
  },
  mistral: {
    label: 'Mistral',
    temperature: 0.8,
    topP: 0.9,
    topK: 30,
    maxResponseTokens: 256,
    minP: 0.05,
    repeatPenalty: 1.1,
    repeatLastN: 256,
    penalizeNewline: false,
    flags: {}
  },
  llama: {
    label: 'Llama',
    temperature: 0.8,
    topP: 0.9,
    topK: 40,
    maxResponseTokens: 256,
    minP: 0.05,
    repeatPenalty: 1.1,
    repeatLastN: 256,
    penalizeNewline: false,
    flags: {}
  },
  gemma: {
    label: 'Gemma',
    temperature: 0.7,
    topP: 0.9,
    topK: 30,
    maxResponseTokens: 256,
    minP: 0.05,
    repeatPenalty: 1.1,
    repeatLastN: 256,
    penalizeNewline: false,
    flags: {}
  },
  deepseek: {
    label: 'DeepSeek',
    temperature: 0.8,
    topP: 0.9,
    topK: 30,
    maxResponseTokens: 256,
    minP: 0.05,
    repeatPenalty: 1.1,
    repeatLastN: 256,
    penalizeNewline: false,
    flags: { think: false }
  },
  phi: {
    label: 'Phi',
    temperature: 0.7,
    topP: 0.85,
    topK: 30,
    maxResponseTokens: 256,
    minP: 0.05,
    repeatPenalty: 1.1,
    repeatLastN: 256,
    penalizeNewline: false,
    flags: {}
  },
  generic: {
    label: 'Generic',
    temperature: 0.8,
    topP: 0.9,
    topK: 30,
    maxResponseTokens: 256,
    minP: 0.05,
    repeatPenalty: 1.1,
    repeatLastN: 256,
    penalizeNewline: false,
    flags: {}
  }
};

/** @type {Array<{key: string, patterns: string[]}>} */
const FAMILY_KEYWORDS = [
  { key: 'qwen', patterns: ['qwen'] },
  { key: 'mistral', patterns: ['mistral', 'mixtral'] },
  { key: 'llama', patterns: ['llama'] },
  { key: 'gemma', patterns: ['gemma'] },
  { key: 'deepseek', patterns: ['deepseek'] },
  { key: 'phi', patterns: ['phi'] }
];

/**
 * Detect model family from a model name string.
 * @param {string} modelName - Ollama model name (e.g. "HammerAI/mn-mag-mell-r1:12b-q4_K_M")
 * @returns {string} Family key ("qwen", "llama", etc.) or "generic" if unknown
 */
export function detectModelFamily(modelName) {
  const lower = (modelName || '').toLowerCase();
  for (const { key, patterns } of FAMILY_KEYWORDS) {
    if (patterns.some(p => lower.includes(p))) return key;
  }
  return 'generic';
}

/**
 * Get the full sampling profile for a model, with family key included.
 * @param {string} modelName - Ollama model name
 * @returns {{family: string, label: string, temperature: number, topP: number, topK: number, maxResponseTokens: number, minP: number, repeatPenalty: number, repeatLastN: number, penalizeNewline: boolean, flags: Record<string, boolean>}}
 */
export function getModelProfile(modelName) {
  const family = detectModelFamily(modelName);
  return { family, ...MODEL_PROFILES[family] };
}
