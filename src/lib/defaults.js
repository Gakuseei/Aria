export const OLLAMA_DEFAULT_URL = 'http://127.0.0.1:11434';
export const DEFAULT_MODEL_NAME = 'HammerAI/mn-mag-mell-r1:12b-q4_K_M';

export const API_TIMEOUT_MS = 5000;
export const DATA_VERSION = 1;

export const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

export const DEFAULT_SUGGESTION_PROFILE = Object.freeze({
  temperature: 0.55,
  topP: 0.92,
  topK: 40,
  minP: 0.05,
  repeatPenalty: 1.05
});
