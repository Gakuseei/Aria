/**
 * Smart Suggestions orchestrator (v2 — beat-adaptive, on-demand).
 *
 * Public API:
 *   abortSuggestionCall()
 *   normalizeSuggestionDisplayValue(text)
 *   generateSuggestions(history, character, userName, settings, options) -> Promise<string[]>
 */

import { OLLAMA_DEFAULT_URL, DEFAULT_MODEL_NAME, DEFAULT_SUGGESTION_PROFILE } from '../../defaults.js';
import { compileCharacterRuntimeCard } from '../../chatRuntime/compiler.js';
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

function pickModel(settings, isGoldMode) {
  if (isGoldMode) {
    const explicit = String(settings?.suggestionModel || '').trim();
    if (explicit) return explicit;
  }
  return String(settings?.ollamaModel || DEFAULT_MODEL_NAME).trim();
}

function pickProfile(model, settings, isGoldMode) {
  if (!isGoldMode) return { ...DEFAULT_SUGGESTION_PROFILE };
  const customProfiles = settings?.customProfiles || {};
  const override = (model && customProfiles[model]) || {};
  return { ...DEFAULT_SUGGESTION_PROFILE, ...override };
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

async function attemptOnce({ currentRequestId, history, character, userName, settings, isGoldMode, locale, previousPills, maxTokens, retryHint }) {
  const compiled = await compileCharacterRuntimeCard({ character, settings });
  const characterName = String(character?.name || compiled?.characterName || 'Character').trim();
  const appLanguageName = APP_LANG_NAME_BY_LOCALE[locale] || 'English';
  const model = pickModel(settings, isGoldMode);
  const profile = pickProfile(model, settings, isGoldMode);
  const ollamaUrl = settings?.ollamaUrl || OLLAMA_DEFAULT_URL;
  const schema = buildSuggestionSchema(appLanguageName);
  const prompts = buildSuggestionPrompt({ history, characterName, userName, appLanguageName });
  if (retryHint) prompts.systemPrompt += `\n\n${retryHint}`;

  const raw = await callOllama({ currentRequestId, model, profile, prompts, schema, maxTokens, ollamaUrl });
  if (raw === null) return null;
  const parsed = parseSuggestionJson(raw);
  if (!parsed) {
    console.warn('[suggestions] parse failed for raw:', String(raw).slice(0, 240));
    return null;
  }
  const accepted = applySanityFilters(parsed, { characterName, locale, previousPills: previousPills || [] });
  if (!accepted) {
    console.warn('[suggestions] sanity rejected pills:', parsed);
    return null;
  }
  return accepted.pills.map((p) => p.text);
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
 * @param {boolean} [options.isGoldMode=false]
 * @returns {Promise<string[]>}
 */
export async function generateSuggestions(history, character, userName, settings, options = {}) {
  suggestionRequestId += 1;
  const currentRequestId = suggestionRequestId;
  const previousPills = Array.isArray(options.previousPills) ? options.previousPills : [];
  const locale = String(options.locale || 'en').toLowerCase();
  const isGoldMode = Boolean(options.isGoldMode);

  try {
    let result = await attemptOnce({
      currentRequestId, history, character, userName, settings, isGoldMode, locale, previousPills,
      maxTokens: PILL_MAX_TOKENS
    });
    if (currentRequestId !== suggestionRequestId) return [];
    if (!result) {
      result = await attemptOnce({
        currentRequestId, history, character, userName, settings, isGoldMode, locale, previousPills,
        maxTokens: PILL_MAX_TOKENS_RETRY,
        retryHint: `Previous attempt was rejected. Pills MUST be in target language, from ${userName}'s perspective, distinct from each other.`
      });
      if (currentRequestId !== suggestionRequestId) return [];
    }
    return result || [];
  } catch (err) {
    console.warn('[suggestions] generateSuggestions error:', err);
    return [];
  }
}
