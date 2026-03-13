/**
 * errorMessages.js — Centralized error message mapping
 *
 * Maps common technical error patterns to user-friendly translation keys.
 * All user-visible strings go through t() from LanguageContext.
 */

/**
 * Error patterns mapped to translation keys.
 * Order matters — first match wins.
 */
const ERROR_PATTERNS = [
  { pattern: /ECONNREFUSED|Failed to fetch|fetch failed|NetworkError/i, key: 'connectionRefused' },
  { pattern: /abort|AbortError|The operation was aborted/i, key: 'timeout' },
  { pattern: /timeout|timed? ?out|ETIMEDOUT/i, key: 'timeout' },
  { pattern: /No response from Ollama|empty response/i, key: 'noOllamaResponse' },
  { pattern: /No models installed|no models found/i, key: 'noModelsInstalled' },
  { pattern: /404/i, key: 'http404' },
  { pattern: /429/i, key: 'http429' },
  { pattern: /500/i, key: 'http500' },
  { pattern: /503/i, key: 'http503' },
];

/**
 * Match a raw error message to a user-friendly translation key.
 * @param {string} rawError - The raw error string (e.g. error.message)
 * @param {object} t - Translation object from useLanguage()
 * @param {string} [fallbackKey] - Optional fallback translation path (e.g. 'chat.sendError')
 * @returns {string} User-friendly error message
 */
export function getUserErrorMessage(rawError, t, fallbackKey) {
  if (!rawError || typeof rawError !== 'string') {
    return resolveKey(t, fallbackKey) || t?.common?.error || 'Error';
  }

  for (const { pattern, key } of ERROR_PATTERNS) {
    if (pattern.test(rawError)) {
      const msg = t?.errors?.[key];
      if (msg) return msg;
    }
  }

  // Check if the raw error already looks user-friendly (no stack traces, short)
  if (rawError.length < 120 && !rawError.includes('\n') && !rawError.includes('at ')) {
    return rawError;
  }

  return resolveKey(t, fallbackKey) || t?.common?.error || 'Error';
}

/**
 * Get an HTTP status error message.
 * @param {number} status - HTTP status code
 * @param {object} t - Translation object
 * @returns {string} User-friendly message for the status code
 */
export function getHttpErrorMessage(status, t) {
  const key = `http${status}`;
  return t?.errors?.[key] || `HTTP ${status}`;
}

/**
 * Resolve a dotted key path on the translation object.
 * e.g. resolveKey(t, 'chat.sendError') → t.chat.sendError
 */
function resolveKey(t, keyPath) {
  if (!t || !keyPath) return null;
  return keyPath.split('.').reduce((obj, k) => obj?.[k], t) || null;
}
