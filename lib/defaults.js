const OLLAMA_DEFAULT_URL = 'http://127.0.0.1:11434';
const DEFAULT_MODEL_NAME = 'HammerAI/mn-mag-mell-r1:12b-q4_K_M';
const DATA_VERSION = 1;

// Models that were previously shipped as Aria defaults.
// ONLY exact former defaults — never generic community model names.
const KNOWN_OLD_DEFAULT_MODELS = [
  'llama3:latest',
  'llama3:8b'
];

module.exports = { OLLAMA_DEFAULT_URL, DEFAULT_MODEL_NAME, DATA_VERSION, KNOWN_OLD_DEFAULT_MODELS };
