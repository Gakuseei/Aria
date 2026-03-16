export const OLLAMA_DEFAULT_URL = 'http://127.0.0.1:11434';
export const DEFAULT_MODEL_NAME = 'HammerAI/mn-mag-mell-r1:12b-q4_K_M';

export const IMAGE_GEN_DEFAULT_URL = 'http://127.0.0.1:7860';
export const VOICE_DEFAULT_URL = 'http://127.0.0.1:5000';

export const API_TIMEOUT_MS = 5000;

export const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

export const IMAGE_GEN_STANDARD = {
  steps: 20,
  sampler_name: 'Euler a',
  cfg_scale: 7,
  width: 512,
  height: 768,
};

export const IMAGE_GEN_PREMIUM = {
  steps: 28,
  sampler_name: 'Euler',
  cfg_scale: 3.5,
  width: 1024,
  height: 1024,
};
