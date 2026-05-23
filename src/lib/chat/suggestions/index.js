/**
 * Smart Suggestions orchestrator (v2 — beat-adaptive, on-demand).
 *
 * Public API:
 *   abortSuggestionCall()
 *   normalizeSuggestionDisplayValue(text)
 *   generateSuggestions(history, character, userName, settings, options) -> Promise<string[]>
 */

import { OLLAMA_DEFAULT_URL, DEFAULT_MODEL_NAME, DEFAULT_SUGGESTION_PROFILE } from '../../defaults.js';
import { buildSuggestionPrompt } from './prompt.js';
import { buildSuggestionSchema } from './schema.js';
import { parseSuggestionJson } from './parse.js';
import { applySanityFilters } from './sanity.js';
import { APP_LANG_NAME_BY_LOCALE } from './language.js';
import { isElectron } from '../platform.js';

const PILL_MAX_TOKENS = 220;
const PILL_MAX_TOKENS_RETRY = 160;

let suggestionRequestId = 0;
let suggestionAbortController = null;

export function abortSuggestionCall() {
  suggestionRequestId += 1;
  if (suggestionAbortController) {
    try { suggestionAbortController.abort(); } catch {}
    suggestionAbortController = null;
  }
}

export function normalizeSuggestionDisplayValue(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}


async function callOllama({ currentRequestId, model, profile, prompts, schema, maxTokens, ollamaUrl }) {
  const params = {
    messages: [
      { role: 'system', content: prompts.systemPrompt },
      { role: 'user', content: prompts.userPrompt }
    ],
    model,
    options: {
      temperature: profile.temperature,
      top_p: profile.topP,
      top_k: profile.topK,
      min_p: profile.minP,
      repeat_penalty: profile.repeatPenalty,
      num_predict: maxTokens
    },
    format: schema,
    stream: false,
    ollamaUrl,
    isOllama: true
  };

  if (!isElectron()) return null;
  const ctrl = new AbortController();
  suggestionAbortController = ctrl;
  try {
    const result = await window.electronAPI.aiChat(params, { signal: ctrl.signal });
    if (currentRequestId !== suggestionRequestId) return null;
    if (!result?.success) return null;
    return String(result.content || '').trim();
  } catch (err) {
    if (err?.name === 'AbortError') return null;
    console.warn('[suggestions] callOllama error:', err);
    return null;
  } finally {
    if (suggestionAbortController === ctrl) suggestionAbortController = null;
  }
}

async function attemptOnce({ currentRequestId, history, character, userName, settings, locale, previousPills, maxTokens, retryHint }) {
  const characterName = String(character?.name || 'Character').trim();
  const appLanguageName = APP_LANG_NAME_BY_LOCALE[locale] || 'English';
  const model = String(settings?.ollamaModel || DEFAULT_MODEL_NAME).trim();
  const profile = { ...DEFAULT_SUGGESTION_PROFILE };
  const ollamaUrl = settings?.ollamaUrl || OLLAMA_DEFAULT_URL;
  const schema = buildSuggestionSchema(appLanguageName, userName, characterName);
  const prompts = buildSuggestionPrompt({ history, characterName, userName, appLanguageName });
  if (retryHint) prompts.systemPrompt += `\n\n${retryHint}`;

  const raw = await callOllama({ currentRequestId, model, profile, prompts, schema, maxTokens, ollamaUrl });
  if (raw === null) return { texts: null, rejected: [] };
  const parsed = parseSuggestionJson(raw);
  if (!parsed) {
    console.warn('[suggestions] parse failed for raw:', String(raw).slice(0, 240));
    return { texts: null, rejected: [] };
  }
  const lastAssistantMessage = [...(history || [])].reverse()
    .find((m) => m?.role === 'assistant' && String(m.content || '').trim());
  const { kept, rejected } = applySanityFilters(parsed, {
    characterName,
    locale,
    previousPills: previousPills || [],
    lastAssistantMessage: lastAssistantMessage ? String(lastAssistantMessage.content).trim() : ''
  });
  if (kept.length < 3) {
    console.warn('[suggestions] sanity rejected pills:', rejected);
    return { texts: null, rejected };
  }
  return { texts: kept.map((p) => p.text), rejected: [] };
}

function reasonLabel(reason, userName) {
  return {
    pov_bleed: `started with character pronoun or name (must speak as ${userName})`,
    echo: `echoed character's last message`,
    repetition: `repeated a previous pill`,
    wrong_lang: `wrong language`,
    too_long: `over 18 words`
  }[reason] || 'failed sanity';
}

function buildRetryHint(rejections, userName) {
  if (!rejections?.length) return null;
  const reasonsByText = rejections
    .map((r) => `- "${String(r.text || '').slice(0, 80)}" rejected: ${reasonLabel(r.reason, userName)}`)
    .join('\n');
  return `Previous pills failed:\n${reasonsByText}\nRewrite ALL three pills from ${userName}'s perspective only. Use "I"/"me"/"my". NEVER start with "She"/"He"/"They" or the character's name.`;
}

/**
 * On-demand entry. Generates 3 pills.
 * @param {Array<{role:string, content:string}>} history
 * @param {object} character
 * @param {string} userName
 * @param {object} settings
 * @param {object} [options]
 * @param {string[]} [options.previousPills]
 * @param {string} [options.locale='en']
 * @returns {Promise<string[]>}
 */
export async function generateSuggestions(history, character, userName, settings, options = {}) {
  suggestionRequestId += 1;
  const currentRequestId = suggestionRequestId;
  const previousPills = Array.isArray(options.previousPills) ? options.previousPills : [];
  const locale = String(options.locale || 'en').toLowerCase();

  try {
    let attempt = await attemptOnce({
      currentRequestId, history, character, userName, settings, locale, previousPills,
      maxTokens: PILL_MAX_TOKENS
    });
    if (currentRequestId !== suggestionRequestId) return [];
    if (!attempt.texts) {
      const retryHint = buildRetryHint(attempt.rejected, userName)
        || `Previous attempt was rejected. Pills MUST be in target language, from ${userName}'s perspective, distinct from each other.`;
      attempt = await attemptOnce({
        currentRequestId, history, character, userName, settings, locale, previousPills,
        maxTokens: PILL_MAX_TOKENS_RETRY,
        retryHint
      });
      if (currentRequestId !== suggestionRequestId) return [];
    }
    return attempt.texts || [];
  } catch (err) {
    console.warn('[suggestions] generateSuggestions error:', err);
    return [];
  }
}
