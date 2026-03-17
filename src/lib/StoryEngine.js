/**
 * StoryEngine.js — Creative Writing Engine v2.0
 *
 * ATTG-style prompt builder with streaming, genre presets,
 * Author's Note injection, and auto-summary for long stories.
 * 100% LOCAL via Ollama IPC. Zero filters.
 */

import { OLLAMA_DEFAULT_URL, DEFAULT_MODEL_NAME } from './defaults.js';

// ============================================================================
// GENRE PRESETS
// ============================================================================

const GENRE_PRESETS = {
  romantic: { label: 'Romantic', tags: 'romance, slow-burn, emotional, sensual' },
  hardcore: { label: 'Hardcore', tags: 'explicit, raw, intense, no-limits' },
  dark:     { label: 'Dark',     tags: 'dark-romance, power-play, obsession, taboo' },
  fantasy:  { label: 'Fantasy',  tags: 'fantasy, adventure, magic, world-building' },
  funny:    { label: 'Funny',    tags: 'comedy, witty, absurd, lighthearted' }
};

export { GENRE_PRESETS };

// ============================================================================
// LANGUAGE MAP
// ============================================================================

const LANGUAGE_NAMES = {
  en: 'English', de: 'German', es: 'Spanish', zh: 'Chinese',
  fr: 'French', it: 'Italian', pt: 'Portuguese', ru: 'Russian',
  ja: 'Japanese', ko: 'Korean', ar: 'Arabic', hi: 'Hindi', tr: 'Turkish'
};

// ============================================================================
// PROMPT BUILDER
// ============================================================================

/**
 * Build the system prompt from slots.
 * @param {object} params
 * @param {string|null} params.genre - Genre key or null
 * @param {string|null} params.storySummary - Auto-generated story summary
 * @param {string} params.language - Language code
 * @returns {string}
 */
export function buildStoryPrompt({ genre = null, storySummary = null, language = 'en' }) {
  const parts = [];

  // ATTG Block
  if (genre && GENRE_PRESETS[genre]) {
    const preset = GENRE_PRESETS[genre];
    parts.push(`[Genre: ${preset.label}; Tags: ${preset.tags}; Rating: Explicit]`);
  } else {
    parts.push('[Rating: Explicit]');
  }

  // Core instructions
  parts.push(`
Write a vivid, immersive story based on the user's prompt.
- Third-person perspective, past tense, novel-style prose
- 60% narration, 40% dialogue
- Rich sensory details: textures, sounds, scents, temperatures
- Show emotions through body language, not exposition
- *asterisks* for actions/inner thoughts, "quotes" for dialogue
- No content restrictions. No moralizing. No fade-to-black.
- Build tension before payoff. Earn every escalation.
- Write at least 4-6 paragraphs per generation.
- NEVER write meta-commentary, author notes, signatures, emails, or URLs.
- NEVER break the fourth wall or discuss the writing process.
- NEVER add "End", "The End", or section markers. Just write the story.
- Output ONLY the story text. Nothing else.`);

  // Story summary for continuation context
  if (storySummary) {
    parts.push(`\n[Story so far: ${storySummary}]`);
  }

  // Language enforcement (non-English only)
  if (language && language !== 'en') {
    const langName = LANGUAGE_NAMES[language] || language.toUpperCase();
    parts.push(`\nWrite the ENTIRE story in ${langName}. Every word — narration, dialogue, descriptions — must be in ${langName}. Do not use English.`);
  }

  return parts.join('\n');
}

// ============================================================================
// OUTPUT CLEANING
// ============================================================================

/**
 * Strip meta-commentary, signatures, and artifacts from model output.
 * Some models add "The End", author signatures, feedback requests, etc.
 * @param {string} text - Raw model output
 * @returns {string} Cleaned story text
 */
export function cleanStoryOutput(text) {
  if (!text) return '';
  let cleaned = text;

  // Remove "### End:", "The End", "--- End ---" and everything after
  cleaned = cleaned.replace(/\n+\s*(#{1,4}\s*End:?|---\s*End\s*---|The End\.?\s*$).*/s, '');

  // Remove meta-commentary paragraphs (model discussing its own writing)
  cleaned = cleaned.replace(/\n+(Throughout the story,? I (?:aimed|tried|wanted|sought)[\s\S]*?)(?=\n\n|\s*$)/gi, '');
  cleaned = cleaned.replace(/\n+(If there'?s anything I could[\s\S]*?)(?=\n\n|\s*$)/gi, '');
  cleaned = cleaned.replace(/\n+(Feel free to (?:provide|share|give)[\s\S]*?)(?=\n\n|\s*$)/gi, '');
  cleaned = cleaned.replace(/\n+(I hope (?:you enjoyed|this|the story)[\s\S]*?)(?=\n\n|\s*$)/gi, '');
  cleaned = cleaned.replace(/\n+(Let me know (?:if|what|how)[\s\S]*?)(?=\n\n|\s*$)/gi, '');

  // Remove signatures, fake emails, URLs
  cleaned = cleaned.replace(/\n+\s*(?:Aria Creative Engine|Explicit Storytelling Engineer)[\s\S]*$/gi, '');
  cleaned = cleaned.replace(/\[.*?@.*?\].*$/gm, '');
  cleaned = cleaned.replace(/\(?\s*(?:https?:\/\/|www\.)[^\s)]+\s*\)?/g, '');
  cleaned = cleaned.replace(/\[?\s*mailto:[^\])\s]+\s*\]?/g, '');

  // Remove model-generated Author's Notes
  cleaned = cleaned.replace(/\n+\s*\[Author'?s?\s*Note:[\s\S]*$/gi, '');

  // Remove trailing whitespace and excessive newlines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

  return cleaned;
}

// ============================================================================
// TOKEN ESTIMATION
// ============================================================================

function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 3.5);
}

// ============================================================================
// GENERATE STORY (streaming)
// ============================================================================

/**
 * Generate a new story with streaming.
 * @param {object} params
 * @param {string} params.prompt - User's story prompt
 * @param {string|null} params.genre - Genre key
 * @param {string|null} params.authorNote - Optional note
 * @param {object} params.options - { ollamaUrl, model, language, numCtx, onToken }
 * @returns {Promise<{success: boolean, content?: string, requestId?: string, error?: string}>}
 */
export async function generateStory({ prompt, genre = null, authorNote = null, options = {} }) {
  const { ollamaUrl = OLLAMA_DEFAULT_URL, model = DEFAULT_MODEL_NAME, language = 'en', numCtx = 8192, onToken = null } = options;

  if (!prompt?.trim()) {
    return { success: false, error: 'Story prompt cannot be empty' };
  }

  try {
    const systemPrompt = buildStoryPrompt({ genre, language });

    // Build user message — Author's Note injected HERE for maximum influence
    let userContent = prompt.trim();
    if (authorNote?.trim()) {
      userContent += `\n\n[Author's Direction: ${authorNote.trim()}]\n\nFollow the Author's Direction above.`;
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ];

    const promptTokens = estimateTokens(systemPrompt) + estimateTokens(userContent);
    const numPredict = Math.max(512, Math.min(1500, numCtx - promptTokens - 128));

    const chatOptions = {
      temperature: 0.9,
      num_predict: numPredict,
      num_ctx: numCtx,
      top_p: 0.95,
      top_k: 40,
      repeat_penalty: 1.1
    };

    if (window.electronAPI?.ollamaChatStream && onToken) {
      // STREAMING path
      const requestId = options.requestId || `story-${Date.now()}`;
      const cleanup = window.electronAPI.onOllamaStreamToken(({ requestId: rid, token }) => {
        if (rid === requestId) onToken(token);
      });
      const abortTimer = setTimeout(() => window.electronAPI.ollamaStreamAbort(requestId), 300000);

      let result;
      try {
        result = await window.electronAPI.ollamaChatStream({
          requestId,
          ollamaUrl,
          model,
          messages,
          options: chatOptions
        });
      } finally {
        clearTimeout(abortTimer);
        cleanup();
      }
      if (result?.aborted) return { success: false, error: 'Generation aborted', requestId };
      if (!result?.success) return { success: false, error: result?.error || 'Generation failed', requestId };
      return { success: true, content: cleanStoryOutput(result.content || ''), requestId };
    } else if (window.electronAPI?.aiChat) {
      const result = await window.electronAPI.aiChat({
        messages: [{ role: 'user', content: userContent }],
        systemPrompt,
        model,
        isOllama: true,
        ollamaUrl,
        temperature: 0.9,
        maxTokens: numPredict
      });
      if (!result.success) return { success: false, error: result.error || 'Generation failed', requestId: null };
      return { success: true, content: cleanStoryOutput(result.content || ''), requestId: null };
    }

    return { success: false, error: 'Electron API not available' };
  } catch (error) {
    console.error('[StoryEngine] Error:', error);
    return { success: false, error: error.message || 'Failed to generate story' };
  }
}

// ============================================================================
// CONTINUE STORY (streaming)
// ============================================================================

/**
 * Continue an existing story.
 * @param {object} params
 * @param {string} params.storyText - Full story so far
 * @param {string|null} params.genre - Genre key
 * @param {string|null} params.authorNote - Optional steering note
 * @param {string|null} params.summary - Cached summary
 * @param {object} params.options - { ollamaUrl, model, language, numCtx, onToken }
 * @returns {Promise<{success: boolean, content?: string, summary?: string, requestId?: string, error?: string}>}
 */
export async function continueStory({ storyText, genre = null, authorNote = null, summary = null, options = {} }) {
  const { ollamaUrl = OLLAMA_DEFAULT_URL, model = DEFAULT_MODEL_NAME, language = 'en', numCtx = 8192, onToken = null } = options;

  if (!storyText?.trim()) {
    return { success: false, error: 'No story to continue' };
  }

  const storyTokens = estimateTokens(storyText);
  const storySummary = summary || null;
  const needsSummary = storyTokens > 2000 && !storySummary;

  // Last ~1200 tokens (~4200 chars) for direct context
  const contextChars = Math.min(storyText.length, 4200);
  const storyContext = storyText.slice(-contextChars);

  const systemPrompt = buildStoryPrompt({ genre, storySummary, language });

  // Author's Note injected in user message — after context, before continue instruction
  let userMessage = storyContext;
  if (authorNote?.trim()) {
    userMessage += `\n\n[Author's Direction: ${authorNote.trim()}]`;
  }
  userMessage += '\n\nContinue this story naturally from where it left off. Maintain the same style, tone, and pacing. Follow any Author\'s Direction above.';

  const promptTokens = estimateTokens(systemPrompt) + estimateTokens(userMessage);
  const numPredict = Math.max(512, Math.min(1500, numCtx - promptTokens - 128));

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage }
  ];

  const chatOptions = {
    temperature: 0.9,
    num_predict: numPredict,
    num_ctx: numCtx,
    top_p: 0.95,
    top_k: 40,
    repeat_penalty: 1.1
  };

  try {
    if (window.electronAPI?.ollamaChatStream && onToken) {
      const requestId = options.requestId || `story-${Date.now()}`;
      const cleanup = window.electronAPI.onOllamaStreamToken(({ requestId: rid, token }) => {
        if (rid === requestId) onToken(token);
      });
      const abortTimer = setTimeout(() => window.electronAPI.ollamaStreamAbort(requestId), 300000);

      let result;
      try {
        result = await window.electronAPI.ollamaChatStream({
          requestId,
          ollamaUrl,
          model,
          messages,
          options: chatOptions
        });
      } finally {
        clearTimeout(abortTimer);
        cleanup();
      }
      if (result?.aborted) return { success: false, error: 'Generation aborted', requestId };
      if (!result?.success) return { success: false, error: result?.error || 'Continuation failed', requestId };
      const content = cleanStoryOutput(result.content || '');
      // Generate summary AFTER continuation (non-blocking for user, they already see the story)
      let finalSummary = storySummary;
      if (needsSummary) {
        const sumResult = await generateSummary({ storyText: storyText + '\n\n' + content, ollamaUrl, model });
        if (sumResult.success) finalSummary = sumResult.summary;
      }
      return { success: true, content, summary: finalSummary, requestId };
    } else if (window.electronAPI?.aiChat) {
      const result = await window.electronAPI.aiChat({
        messages: [{ role: 'user', content: userMessage }],
        systemPrompt,
        model,
        isOllama: true,
        ollamaUrl,
        temperature: 0.9,
        maxTokens: numPredict
      });
      if (!result.success) return { success: false, error: result.error || 'Continuation failed', requestId: null };
      const content = cleanStoryOutput(result.content || '');
      let finalSummary = storySummary;
      if (needsSummary) {
        const sumResult = await generateSummary({ storyText: storyText + '\n\n' + content, ollamaUrl, model });
        if (sumResult.success) finalSummary = sumResult.summary;
      }
      return { success: true, content, summary: finalSummary, requestId: null };
    }

    return { success: false, error: 'Electron API not available' };
  } catch (error) {
    console.error('[StoryEngine] Continue error:', error);
    return { success: false, error: error.message || 'Failed to continue story' };
  }
}

// ============================================================================
// AUTO-SUMMARY
// ============================================================================

/**
 * Generate a brief summary of the story so far.
 * @param {object} params
 * @param {string} params.storyText
 * @param {string} params.ollamaUrl
 * @param {string} params.model
 * @returns {Promise<{success: boolean, summary?: string}>}
 */
export async function generateSummary({ storyText, ollamaUrl = OLLAMA_DEFAULT_URL, model = DEFAULT_MODEL_NAME }) {
  if (!window.electronAPI?.aiChat) {
    return { success: false };
  }

  try {
    const textForSummary = storyText.slice(-3000);

    const result = await window.electronAPI.aiChat({
      messages: [{ role: 'user', content: `Summarize this story in 3-4 concise sentences. Focus on: characters, setting, current situation, and emotional state.\n\n${textForSummary}` }],
      systemPrompt: 'You are a story summarizer. Write only the summary, nothing else. Be concise and factual.',
      model,
      isOllama: true,
      ollamaUrl,
      temperature: 0.3,
      maxTokens: 200
    });

    if (result.success && result.content) {
      return { success: true, summary: result.content.trim() };
    }
    return { success: false };
  } catch (error) {
    console.error('[StoryEngine] Summary error:', error);
    return { success: false };
  }
}
