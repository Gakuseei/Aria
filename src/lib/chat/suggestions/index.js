/**
 * Smart Suggestions orchestrator.
 * Uses the configured small suggestion model (or chat-model fallback) to
 * generate three role-locked reply pills per character turn.
 */

import { OLLAMA_DEFAULT_URL, DEFAULT_MODEL_NAME, DEFAULT_SUGGESTION_PROFILE } from '../../defaults.js';
import { compileCharacterRuntimeCard } from '../../chatRuntime/compiler.js';
import { buildSuggestionPrompt } from './prompt.js';
import { parseSuggestionJson } from './parse.js';
import { applySanityFilters } from './sanity.js';
import { isElectron } from '../platform.js';

const PILL_MAX_TOKENS = 120;
const PILL_MAX_TOKENS_RETRY = 80;

const SUGGESTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    pills: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          role: { type: 'string', enum: ['stay', 'forward', 'push'] },
          text: { type: 'string', maxLength: 200 }
        },
        required: ['role', 'text']
      }
    }
  },
  required: ['pills']
};

let suggestionRequestId = 0;
let suggestionAbortController = null;

/**
 * Aborts any in-flight suggestion request and invalidates the request id.
 */
export function abortSuggestionCall() {
  suggestionRequestId += 1;
  if (suggestionAbortController) {
    try { suggestionAbortController.abort(); } catch {}
    suggestionAbortController = null;
  }
}

/**
 * Normalize a suggestion text for display.
 * @param {string} value
 * @returns {string}
 */
export function normalizeSuggestionDisplayValue(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function pickModel(settings) {
  const explicit = String(settings?.suggestionModel || '').trim();
  if (explicit) return explicit;
  if (settings?.suggestionFallbackToChat === false) return null;
  return String(settings?.ollamaModel || DEFAULT_MODEL_NAME).trim() || null;
}

function pickProfile(model, settings) {
  const customProfiles = settings?.customProfiles || {};
  if (model && customProfiles[model]) return customProfiles[model];
  return DEFAULT_SUGGESTION_PROFILE;
}

async function callOllama({ currentRequestId, model, profile, prompts, maxTokens, ollamaUrl }) {
  const params = {
    messages: [{ role: 'user', content: prompts.userPrompt }],
    systemPrompt: prompts.systemPrompt,
    model,
    ollamaUrl,
    temperature: profile.temperature ?? profile.temp ?? 0.55,
    maxTokens,
    top_k: profile.topK ?? profile.top_k ?? 40,
    top_p: profile.topP ?? profile.top_p ?? 0.92,
    min_p: profile.minP ?? profile.min_p ?? 0.05,
    repeat_penalty: profile.repeatPenalty ?? profile.repeat_penalty ?? 1.05,
    format: SUGGESTION_JSON_SCHEMA,
    tag: 'suggestions'
  };

  if (isElectron()) {
    suggestionAbortController = null;
    const result = await window.electronAPI.aiChat(params);
    if (currentRequestId !== suggestionRequestId) return null;
    if (!result?.success) return null;
    return result.content || '';
  }

  const controller = new AbortController();
  suggestionAbortController = controller;
  try {
    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: prompts.systemPrompt },
          { role: 'user',   content: prompts.userPrompt }
        ],
        stream: false,
        format: SUGGESTION_JSON_SCHEMA,
        options: {
          temperature: params.temperature,
          num_predict: maxTokens,
          top_k: params.top_k,
          top_p: params.top_p,
          min_p: params.min_p,
          repeat_penalty: params.repeat_penalty
        }
      })
    });
    if (currentRequestId !== suggestionRequestId) return null;
    if (!response.ok) return null;
    const json = await response.json();
    return json?.message?.content || '';
  } catch (err) {
    if (err?.name === 'AbortError') return null;
    return null;
  }
}

async function attemptOnce({ history, character, userName, settings, currentRequestId, maxTokens, previousPills }) {
  const model = pickModel(settings);
  if (!model) return [];

  const compiledCard = compileCharacterRuntimeCard(character);
  const prompts = buildSuggestionPrompt({
    compiledCard,
    history,
    characterName: character?.name || 'Character',
    userName: userName || 'You'
  });

  const profile = pickProfile(model, settings);
  const ollamaUrl = settings?.ollamaUrl || OLLAMA_DEFAULT_URL;

  const raw = await callOllama({ currentRequestId, model, profile, prompts, maxTokens, ollamaUrl });
  if (raw === null) return null;
  const parsed = parseSuggestionJson(raw);
  const filtered = applySanityFilters(parsed, { previousPills });
  if (!filtered) return null;
  return [filtered.stay, filtered.forward, filtered.push];
}

/**
 * Generate three role-locked pills for the latest character turn.
 * Calls onResult([stay, forward, push]) on success or onResult([]) on failure / fallback-disabled.
 *
 * @param {Array<{role:string, content:string}>} history
 * @param {Object} character
 * @param {string} userName
 * @param {Object} settings
 * @param {(pills:string[]) => void} onResult
 * @returns {Promise<void>}
 */
export async function generateSuggestionsBackground(history, character, userName, settings, onResult) {
  suggestionRequestId += 1;
  const currentRequestId = suggestionRequestId;
  const previousPills = Array.isArray(settings?.previousPills) ? settings.previousPills : [];

  try {
    let result = await attemptOnce({
      history, character, userName, settings,
      currentRequestId,
      maxTokens: PILL_MAX_TOKENS,
      previousPills
    });

    if (currentRequestId !== suggestionRequestId) return;

    if (result === null) {
      result = await attemptOnce({
        history, character, userName, settings,
        currentRequestId,
        maxTokens: PILL_MAX_TOKENS_RETRY,
        previousPills
      });
      if (currentRequestId !== suggestionRequestId) return;
    }

    onResult(result || []);
  } catch (err) {
    if (currentRequestId !== suggestionRequestId) return;
    if (err?.name === 'AbortError') return;
    onResult([]);
  } finally {
    if (currentRequestId === suggestionRequestId) {
      suggestionAbortController = null;
    }
  }
}

export { parseSuggestionJson as parseSuggestionResponse } from './parse.js';
