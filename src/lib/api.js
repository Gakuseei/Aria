// ============================================================================
// ARIA v2.0 — Lean Roleplay Engine
// ============================================================================
// Character-first prompt design. Minimal rules. One-line content gate.
// ~300-500 token system prompts (vs ~2000 in v1)
// ============================================================================

import { detectLanguage } from './languageEngine.js';
import { passionManager, PASSION_TIERS, getTierKey } from './PassionManager.js';

/**
 * Fallback suggestions for all 10 languages
 * Used when AI suggestion generation fails
 * 4 contexts: unchained (mind-break), refusal (soft), nsfw (explicit), normal (regular)
 */
const FALLBACK_SUGGESTIONS = {
  en: {
    unchained: ['Cry but do it.', 'Good girl.', 'Open wide.', 'Hate me all you want.'],
    refusal: ["I'm sorry", "Let's slow down", 'Please?', 'Maybe later?'],
    nsfw: ['Keep going', 'Just like that', 'I want more', "Don't stop"],
    normal: ['Yes, do it', 'Come closer', 'Tell me more', 'I like that']
  },
  de: {
    unchained: ['Wein aber tu es.', 'Braves Mädchen.', 'Mach den Mund auf.', 'Hass mich ruhig.'],
    refusal: ['Es tut mir leid', 'Lass uns langsamer machen', 'Bitte?', 'Vielleicht später?'],
    nsfw: ['Weiter so', 'Genau so', 'Ich will mehr', 'Hör nicht auf'],
    normal: ['Ja, mach es', 'Komm näher', 'Erzähl mir mehr', 'Das gefällt mir']
  },
  ru: {
    unchained: ['Плачь но делай.', 'Хорошая девочка.', 'Открой рот.', 'Ненавидь меня сколько хочешь.'],
    refusal: ['Прости', 'Давай помедленнее', 'Пожалуйста?', 'Может позже?'],
    nsfw: ['Продолжай', 'Вот так', 'Хочу ещё', 'Не останавливайся'],
    normal: ['Да, сделай это', 'Подойди ближе', 'Расскажи больше', 'Мне это нравится']
  },
  es: {
    unchained: ['Llora pero hazlo.', 'Buena chica.', 'Abre la boca.', 'Ódiame todo lo que quieras.'],
    refusal: ['Lo siento', 'Vayamos más despacio', '¿Por favor?', '¿Tal vez más tarde?'],
    nsfw: ['Sigue así', 'Justo así', 'Quiero más', 'No pares'],
    normal: ['Sí, hazlo', 'Acércate', 'Cuéntame más', 'Me gusta eso']
  },
  fr: {
    unchained: ['Pleure mais fais-le.', 'Bonne fille.', 'Ouvre la bouche.', 'Déteste-moi tant que tu veux.'],
    refusal: ['Je suis désolé', 'Allons plus doucement', 'S\'il te plaît?', 'Peut-être plus tard?'],
    nsfw: ['Continue', 'Comme ça', 'J\'en veux plus', 'Ne t\'arrête pas'],
    normal: ['Oui, fais-le', 'Approche-toi', 'Dis-m\'en plus', 'J\'aime ça']
  },
  it: {
    unchained: ['Piangi ma fallo.', 'Brava ragazza.', 'Apri la bocca.', 'Odiami quanto vuoi.'],
    refusal: ['Mi dispiace', 'Andiamo più piano', 'Per favore?', 'Forse più tardi?'],
    nsfw: ['Continua', 'Proprio così', 'Ne voglio ancora', 'Non fermarti'],
    normal: ['Sì, fallo', 'Avvicinati', 'Dimmi di più', 'Mi piace']
  },
  pt: {
    unchained: ['Chore mas faça.', 'Boa menina.', 'Abra a boca.', 'Me odeie o quanto quiser.'],
    refusal: ['Desculpe', 'Vamos devagar', 'Por favor?', 'Talvez mais tarde?'],
    nsfw: ['Continue', 'Assim mesmo', 'Quero mais', 'Não pare'],
    normal: ['Sim, faça', 'Chegue mais perto', 'Me conte mais', 'Gosto disso']
  },
  cn: {
    unchained: ['哭但要做。', '好女孩。', '张开嘴。', '随便恨我。'],
    refusal: ['对不起', '慢一点', '拜托？', '也许以后？'],
    nsfw: ['继续', '就这样', '我要更多', '别停'],
    normal: ['好，做吧', '过来', '告诉我更多', '我喜欢']
  },
  ja: {
    unchained: ['泣いてもやれ。', 'いい子だ。', '口を開けて。', '好きなだけ恨め。'],
    refusal: ['ごめんなさい', 'ゆっくりしよう', 'お願い？', '後でもいい？'],
    nsfw: ['続けて', 'そのまま', 'もっと欲しい', '止めないで'],
    normal: ['はい、やって', '近づいて', 'もっと教えて', 'それ好き']
  },
  ko: {
    unchained: ['울어도 해.', '착한 아이.', '입 벌려.', '마음껏 날 미워해.'],
    refusal: ['미안해', '천천히 하자', '제발?', '나중에?'],
    nsfw: ['계속해', '그렇게', '더 원해', '멈추지 마'],
    normal: ['응, 해봐', '가까이 와', '더 말해줘', '좋아']
  },
  ar: {
    unchained: ['ابكِ لكن افعلها.', 'فتاة جيدة.', 'افتحي فمك.', 'اكرهني كما تشائين.'],
    refusal: ['آسف', 'لنبطئ', 'أرجوك؟', 'ربما لاحقاً؟'],
    nsfw: ['استمر', 'هكذا تماماً', 'أريد المزيد', 'لا تتوقف'],
    normal: ['نعم، افعلها', 'اقترب أكثر', 'أخبرني المزيد', 'يعجبني هذا']
  },
  hi: {
    unchained: ['रोओ पर करो।', 'अच्छी लड़की।', 'मुँह खोलो।', 'जितना चाहो नफ़रत करो।'],
    refusal: ['माफ़ करो', 'धीरे चलें', 'कृपया?', 'शायद बाद में?'],
    nsfw: ['जारी रखो', 'ऐसे ही', 'और चाहिए', 'मत रुको'],
    normal: ['हाँ, करो', 'पास आओ', 'और बताओ', 'अच्छा लगा']
  },
  tr: {
    unchained: ['Ağla ama yap.', 'İyi kız.', 'Ağzını aç.', 'İstediğin kadar nefret et.'],
    refusal: ['Özür dilerim', 'Yavaşlayalım', 'Lütfen?', 'Belki sonra?'],
    nsfw: ['Devam et', 'Aynen böyle', 'Daha fazla istiyorum', 'Durma'],
    normal: ['Evet, yap', 'Yaklaş', 'Daha anlat', 'Hoşuma gitti']
  }
};

// ============================================================================
// v0.2.5: TRANSCRIPT ARTIFACT CLEANING
// ============================================================================

/**
 * Removes any "User:" or "Assistant:" hallucinations from the AI response
 * This prevents the AI from speaking for the user or breaking immersion
 */
function cleanTranscriptArtifacts(text, charName = '') {
  if (!text || typeof text !== 'string') return '';

  let cleaned = text;

  // Strip <think>...</think> blocks (thinking-model artifacts)
  cleaned = cleaned.replace(/^<think>[\s\S]*?<\/think>\s*/i, '');
  cleaned = cleaned.replace(/<\/?think>/gi, '');

  // Remove any occurrence of "User:", "Human:", "Assistant:" etc.
  // If found, cut everything from that point onwards
  const stopPatterns = [
    /\n\s*User\s*:/i,
    /\n\s*Human\s*:/i,
    /\n\s*Assistant\s*:/i,
    /\n\s*AI\s*:/i,
    /\n\s*Character\s*:/i
  ];

  for (const pattern of stopPatterns) {
    const match = cleaned.match(pattern);
    if (match) {
      console.warn('[Cleaner] Found transcript artifact, cutting at:', match[0]);
      cleaned = cleaned.substring(0, match.index).trim();
    }
  }

  // Remove AI writing-assistant meta-commentary preambles
  cleaned = cleaned.replace(/^(?:Here(?:'s| is) (?:a |the |my )?(?:response|completion|continuation|reply|scene|roleplay|version)[\s\S]*?:\s*\n*)/i, '');

  // Remove "---" separator lines (scene break artifacts)
  cleaned = cleaned.replace(/^\s*---+\s*\n?/gm, '');

  // Remove meta-commentary paragraphs (author notes about the character/scene)
  const metaPatterns = [
    /^This (?:is|keeps|shows|demonstrates|maintains|sets up).*?(?:character|behavior|scene|personality|roleplay|intimacy).*$/gim,
    /^(?:The (?:key|goal|idea|point|breakthrough|problem) (?:is|here|comes)|Remember:).*$/gim,
    /^(?:She|He)'s (?:not |genuinely |actually |really |just )?(?:playing|making|giving|trying|doing|being|setting).*$/gim
  ];

  for (const pattern of metaPatterns) {
    cleaned = cleaned.replace(pattern, '').trim();
  }

  // Strip 3rd-person narration about the character (e.g. "She steps closer", "Alice trembles")
  // Only apply if we know the character name
  if (charName) {
    const lines = cleaned.split('\n');
    const filtered = lines.filter(line => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      // Skip action lines (starting with *) — these are fine
      if (trimmed.startsWith('*')) return true;
      // Detect 3rd-person sentences about the character: "She does X", "Alice does X"
      const thirdPersonPattern = new RegExp(
        `^(?:${charName}|She|He)\\s+(?:steps|walks|moves|leans|sits|stands|runs|turns|looks|watches|places|presses|slides|reaches|pulls|pushes|closes|opens|takes|picks|sets|puts|drops|grabs|catches|wraps|holds|kisses|touches|gasps|trembles|blushes|smiles|smirks|laughs|nods|shakes|blinks|stares|studies|examines|notices|observes)`,
        'i'
      );
      if (thirdPersonPattern.test(trimmed)) {
        console.warn(`[Cleaner] Stripped 3rd-person line: "${trimmed.substring(0, 60)}..."`);
        return false;
      }
      return true;
    });
    cleaned = filtered.join('\n');
  }

  // Clean up excessive blank lines left after removals
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}

/**
 * Replaces {{char}} and {{user}} template variables in text.
 * Industry-standard placeholders used by SillyTavern, HammerAI, TavernAI.
 * @param {string} text - Text containing {{char}} / {{user}} placeholders
 * @param {string} charName - Character's display name
 * @param {string} userName - User's display name (from settings)
 * @returns {string} Text with placeholders replaced
 */
export function resolveTemplates(text, charName, userName) {
  if (!text || typeof text !== 'string') return text || '';
  return text
    .replace(/\{\{char\}\}/gi, charName || 'Character')
    .replace(/\{\{user\}\}/gi, userName || 'User');
}

// ============================================================================
// DEFAULT SETTINGS - OLLAMA ONLY
// ============================================================================

const DEFAULT_SETTINGS = {
  ollamaUrl: 'http://127.0.0.1:11434',
  ollamaModel: 'huihui_ai/qwen3.5-abliterated:9b',
  temperature: 0.8,
  topK: 30,
  topP: 0.9,
  minP: 0.05,
  repeatPenalty: 1.1,
  repeatLastN: 256,
  penalizeNewline: false,
  contextSize: 'medium',
  fontSize: 'medium',
  autoSave: true,
  soundEnabled: true,
  animationsEnabled: true,
  oledMode: false,
  passionSystemEnabled: true,
  preferredLanguage: 'en',
  userName: 'User',
  userGender: 'male',
  imageGenEnabled: false,
  imageGenUrl: 'http://127.0.0.1:7860',
  voiceEnabled: false,
  voiceUrl: 'http://127.0.0.1:5000',
  maxResponseTokens: 256,
  passionSpeedMultiplier: 1.0
};

const PASSION_SCORING_TIMEOUT_MS = 30000;

const MODEL_CAPS_CACHE = {};

/**
 * Context size presets (tokens). Users pick a tier in Settings.
 * Ollama offloads to CPU if VRAM is exceeded — safe to overshoot.
 */
const CTX_PRESETS = {
  low:    { small: 4096,  medium: 8192,   large: 16384  },
  medium: { small: 8192,  medium: 16384,  large: 32768  },
  high:   { small: 16384, medium: 32768,  large: 65536  },
  max:    { small: 32768, medium: 65536,  large: 131072 }
};

/**
 * Compute the capped num_ctx for a given model.
 * Centralised so every Ollama request uses the same value.
 */
async function getModelCtx(ollamaUrl, model, contextPreset = 'medium') {
  const caps = await getModelCapabilities(ollamaUrl, model);
  const paramB = parseFloat(caps.parameterSize) || 7;
  const sizeKey = paramB <= 3 ? 'small' : paramB <= 10 ? 'medium' : 'large';
  const preset = CTX_PRESETS[contextPreset] || CTX_PRESETS.medium;
  return Math.min(caps.contextLength, preset[sizeKey]);
}

/**
 * Unload model from Ollama to fully clear KV cache.
 * Call this when switching characters / leaving chat.
 */
export async function unloadOllamaModel(settings) {
  try {
    const ollamaUrl = settings?.ollamaUrl || 'http://127.0.0.1:11434';
    const model = settings?.ollamaModel || 'huihui_ai/qwen3.5-abliterated:9b';
    await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [], keep_alive: 0 })
    });
    console.log('[API] Model unloaded (keep_alive: 0)');
  } catch {
    // Ignore — model may already be unloaded
  }
}

async function getModelCapabilities(ollamaUrl, modelName) {
  const cacheKey = `${ollamaUrl}::${modelName}`;
  if (MODEL_CAPS_CACHE[cacheKey]) return MODEL_CAPS_CACHE[cacheKey];

  const defaults = { contextLength: 4096, parameterSize: '7B' };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
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
    MODEL_CAPS_CACHE[cacheKey] = { contextLength, parameterSize: paramRaw };
    return MODEL_CAPS_CACHE[cacheKey];
  } catch {
    return defaults;
  }
}

function estimateTokens(text) {
  return Math.ceil(text.length / 3.5);
}

/**
 * Score romantic/sexual intensity of a message exchange using the LLM.
 * @param {string} userMessage - User message text
 * @param {string} aiMessage - AI response text
 * @param {Object} settings - App settings (ollamaUrl, ollamaModel)
 * @returns {Promise<number>} Score from -5 to 10, or 0 on failure
 */
async function scorePassionLLM(userMessage, aiMessage, settings, modelCtx = 4096) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), PASSION_SCORING_TIMEOUT_MS);
  try {
    const response = await fetch(`${settings.ollamaUrl || 'http://127.0.0.1:11434'}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: abort.signal,
      body: JSON.stringify({
        model: settings.ollamaModel || 'huihui_ai/qwen3.5-abliterated:9b',
        messages: [{
          role: 'user',
          content: `Score: -3 to 10. Just the number.\n-3=rejection 0=neutral 5=romance 10=explicit\nUser: "${userMessage.substring(0, 200)}"\nAI: "${aiMessage.substring(0, 200)}"`
        }],
        stream: false,
        think: false,
        options: { temperature: 0.1, num_predict: 16, num_ctx: modelCtx }
      })
    });
    if (!response.ok) return 0;
    const data = await response.json();
    if (data.message && !data.message.content && data.message.thinking) {
      data.message.content = data.message.thinking;
    }
    const match = data.message?.content?.trim().match(/(-?\d+)/);
    if (!match) return 0;
    const score = parseInt(match[1], 10);
    if (isNaN(score) || score < -3 || score > 10) return 0;
    return score;
  } catch (err) {
    console.warn('[API] Passion scoring failed:', err?.message || 'timeout');
    return 0;
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================================
// HELPER: CHECK IF RUNNING IN ELECTRON
// ============================================================================

function isElectron() {
  return typeof window !== 'undefined' && 
         typeof window.electronAPI !== 'undefined';
}

/**
 * Filter character prompt content based on passion tier.
 * Two-pass filter for both standard and custom characters:
 * 1. Strip ### INTIMATE BEHAVIOR ### sections (header-based)
 * 2. Strip lines with intimate keywords (keyword-based fallback)
 * @param {string} text - Character systemPrompt or instructions
 * @param {string} tierKey - Current passion tier key
 * @returns {string} Filtered text
 */
function filterCharacterContent(text, tierKey) {
  if (!text) return '';
  if (['heated', 'passionate', 'primal'].includes(tierKey)) {
    return text;
  }

  let filtered = text;

  // Pass 1: Strip ### INTIMATE BEHAVIOR ### sections
  filtered = filtered.replace(/###\s*INTIMATE\s*BEHAVIOR\s*###[\s\S]*?(?=###|$)/gi, '');

  // Pass 2: Keyword-based line filtering
  if (['shy', 'curious'].includes(tierKey)) {
    const intimatePattern = /\b(intimate|sexual|erotic|orgasm|genital|penetrat|thrust|climax|arousal|undress|naked|nude|moan|gasp(?:s|ed|ing)|tremble(?:s|d|ing)|nipple|groin|explicit|intercourse|foreplay|seduct|strip(?:s|ped|ping)\b|fondl|take\s+off\s+(your|her|his|my)\s+(dress|clothes|shirt|pants|bra|panties))\b/i;
    filtered = filtered.split('\n').filter(line => !intimatePattern.test(line)).join('\n');
  }

  if (tierKey === 'flirty') {
    const explicitPattern = /\b(orgasm|genital|penetrat|thrust|climax|intercourse|foreplay|explicit|nude|naked)\b/i;
    filtered = filtered.split('\n').filter(line => !explicitPattern.test(line)).join('\n');
  }

  return filtered.trim();
}

// ============================================================================
// v2.0: LEAN PROMPT GENERATOR
// ============================================================================

/**
 * Determine prompt tier based on model parameter size.
 * @param {string} parameterSize - e.g. "2B", "7B", "70B"
 * @returns {'tiny'|'standard'|'large'}
 */
function getModelTier(parameterSize) {
  const paramB = parseFloat(parameterSize) || 7;
  if (paramB <= 3) return 'tiny';
  if (paramB <= 14) return 'standard';
  return 'large';
}

/**
 * Extract a compact recap from messages that are about to be trimmed.
 * Rule-based extraction — no API call needed.
 * @param {Array} trimmedMessages - Messages being removed from context
 * @returns {string|null} Compact recap or null
 */
function extractRecap(trimmedMessages) {
  if (!trimmedMessages || trimmedMessages.length === 0) return null;

  const events = [];

  for (const msg of trimmedMessages) {
    const content = msg.content || '';
    if (!content.trim()) continue;

    const actions = content.match(/\*([^*]+)\*/g);
    if (actions && actions.length > 0) {
      const lastAction = actions[actions.length - 1].replace(/\*/g, '').trim();
      if (lastAction.length > 10 && lastAction.length < 200) {
        events.push(lastAction);
      }
    }
  }

  const significant = events.slice(-5);
  if (significant.length === 0) return null;

  return significant.join('. ') + '.';
}

/**
 * Run passion scoring in background — does not block the response.
 * Called after the AI response is already returned to the user.
 */
export function scorePassionBackground(userMessage, aiMessage, settings, modelCtx, sessionId, character) {
  const rawProfile = Math.max(0, Math.min(1, character?.passionProfile ?? 0.7));
  const profileMultiplier = 0.5 + rawProfile * 0.5; // Floor at 0.5x — even shy chars progress
  const userSpeed = settings.passionSpeedMultiplier ?? 1.0;

  scorePassionLLM(userMessage, aiMessage, settings, modelCtx)
    .then(rawScore => {
      let adjustedScore;
      if (rawScore > 0) {
        adjustedScore = rawScore * profileMultiplier * userSpeed;
      } else if (rawScore < 0) {
        adjustedScore = rawScore * 0.5; // Soft de-escalation — drops never punish hard
      } else {
        adjustedScore = 0;
      }

      const momentum = passionManager.getMomentum(sessionId);
      if (momentum > 1.5 && adjustedScore < 0) adjustedScore *= 0.5;
      else if (momentum < -1.5 && adjustedScore > 0) adjustedScore *= 0.7;

      const prevLevel = passionManager.getPassionLevel(sessionId);
      const newLevel = passionManager.applyScore(sessionId, adjustedScore);
      console.log(`[API] Passion (async): ${prevLevel} → ${newLevel} (raw=${rawScore}, adj=${adjustedScore.toFixed(1)})`);
    })
    .catch(err => {
      console.warn('[API] Async passion scoring failed:', err?.message);
    });
}

/**
 * ARIA System Prompt Generator
 * HammerAI-style: simple frame, no POV enforcement, vivid NSFW instruction.
 */
function generateSystemPrompt({
  character,
  passionLevel = 0,
  passionEnabled = true,
  userGender = 'male',
  userName = 'User',
  modelSize = 'standard',
  recap = null,
  lastUserMessage = ''
}) {
  const charName = character.name;
  const rT = (text) => resolveTemplates(text, charName, userName);

  // ── ROLEPLAY FRAME (HammerAI style) ──
  let prompt = `You are ${charName}. Write the next reply from ${charName} in this never-ending conversation between ${charName} and ${userName}. Gestures and other non-verbal actions are written between asterisks (for example, *waves hello* or *moves closer*).\n\n`;

  // ── CHARACTER IDENTITY ──
  if (character.description) {
    prompt += `${rT(character.description)}\n`;
  }

  if (character.systemPrompt?.trim()) {
    prompt += `\n${rT(character.systemPrompt)}\n`;
  }

  if (character.scenario?.trim()) {
    prompt += `\nScenario: ${rT(character.scenario)}\n`;
  }

  // ── NSFW INSTRUCTION ──
  prompt += `\nDescribe ${charName}'s intimate encounters in vivid detail.\n`;

  // ── CONTEXT RECAP ──
  if (recap) {
    prompt += `\nStory so far: ${recap}\n`;
  }

  // ── ANTI-AI (only rule — Qwen 3.5 needs this) ──
  prompt += `\nDo not break character with AI-assistant speech, numbered lists, markdown headers, or meta-commentary.\n`;

  return prompt;
}


// CORE API - MESSAGE SENDING (OLLAMA ONLY)
// ============================================================================

export const sendMessage = async (
  userMessage,
  character,
  characterContext,
  conversationHistory = [],
  sessionId = null,
  unchainedMode = false,
  onApiStats = null,  // v0.2.5: NEW - Callback for API Monitor stats
  settingsOverride = null,  // v0.2.5: FIX - Accept settings directly to avoid race conditions
  skipPassionUpdate = false
) => {
  const startTime = Date.now();  // v0.2.5: Track response time
  
  // Safety checks
  if (!character || !character.name) {
    console.error('[v9.2 API] ❌ Invalid character data');
    return {
      success: false,
      error: 'Character data is missing or invalid'
    };
  }

  if (!userMessage || typeof userMessage !== 'string' || userMessage.trim().length === 0) {
    console.error('[v9.2 API] ❌ Empty or invalid message');
    return {
      success: false,
      error: 'Message cannot be empty'
    };
  }

  try {
    const settings = { ...(settingsOverride || await loadSettings()) };

    const ollamaUrl = settings.ollamaUrl || 'http://127.0.0.1:11434';
    const model = settings.ollamaModel || 'llama3';
    const caps = await getModelCapabilities(ollamaUrl, model);
    const modelCtx = await getModelCtx(ollamaUrl, model, settings.contextSize || 'medium');

    const modelSize = getModelTier(caps.parameterSize);
    const historyToUse = Array.isArray(conversationHistory) ? conversationHistory : [];

    console.log(`[API] Model: ${model}, ctx: ${modelCtx}, size: ${modelSize}`);

    let currentPassionLevel = 0;
    if (settings.passionSystemEnabled && sessionId) {
      currentPassionLevel = passionManager.getPassionLevel(sessionId);
    }

    const userGender = settings.userGender || 'male';
    const userName = settings.userName || 'User';

    let finalSystemPrompt = generateSystemPrompt({
      character,
      passionLevel: currentPassionLevel,
      passionEnabled: unchainedMode ? false : settings.passionSystemEnabled,
      userGender,
      userName,
      modelSize,
      lastUserMessage: userMessage
    });

    let promptTokens = estimateTokens(finalSystemPrompt);
    const numPredict = 384;
    let availableForHistory = modelCtx - promptTokens - numPredict - 128;

    if (availableForHistory < 300) {
      console.warn(`[API] Prompt too large (~${promptTokens}t) for ctx ${modelCtx} — regenerating as tiny`);
      finalSystemPrompt = generateSystemPrompt({
        character,
        passionLevel: currentPassionLevel,
        passionEnabled: unchainedMode ? false : settings.passionSystemEnabled,
        userGender,
        userName,
        modelSize: 'tiny',
        lastUserMessage: userMessage
      });
      promptTokens = estimateTokens(finalSystemPrompt);
      availableForHistory = modelCtx - promptTokens - numPredict - 128;
    }

    // Dynamic sliding window — keep as many recent messages as fit
    let trimmedHistory = [...historyToUse];
    const trimmedOut = [];
    while (trimmedHistory.length > 2) {
      const historyTokens = trimmedHistory.reduce((sum, m) => sum + estimateTokens(m.content || ''), 0);
      if (historyTokens <= availableForHistory) break;
      trimmedOut.push(trimmedHistory.shift());
    }

    // Extract recap from trimmed messages and regenerate prompt with it
    const recap = extractRecap(trimmedOut);
    if (recap) {
      finalSystemPrompt = generateSystemPrompt({
        character,
        passionLevel: currentPassionLevel,
        passionEnabled: unchainedMode ? false : settings.passionSystemEnabled,
        userGender,
        userName,
        modelSize,
        recap,
        lastUserMessage: userMessage
      });
      promptTokens = estimateTokens(finalSystemPrompt);
    }

    console.log(`[API] Prompt ~${promptTokens}t, history: ${trimmedHistory.length}/${historyToUse.length} msgs, num_ctx: ${modelCtx}`);

    const messages = [
      { role: 'system', content: finalSystemPrompt },
      ...trimmedHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      }))
    ];

    const fetchController = new AbortController();
    const fetchTimer = setTimeout(() => fetchController.abort(), 120000);

    let response;
    try {
      response = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: fetchController.signal,
        body: JSON.stringify({
          model: model,
          messages: messages,
          stream: false,
          think: false,
          options: {
            temperature: settings.temperature ?? 0.75,
            num_predict: numPredict,
            num_ctx: modelCtx,
            top_k: settings.topK ?? 20,
            top_p: settings.topP ?? 0.95,
            min_p: settings.minP ?? 0.05,
            repeat_penalty: settings.repeatPenalty ?? 1.1,
            repeat_last_n: settings.repeatLastN ?? 256,
            penalize_newline: settings.penalizeNewline ?? false
          },
          stop: ['\nUser:', '\nHuman:', `\n${userName}:`, '\nAssistant:', '\nAI:']
        })
      });
    } finally {
      clearTimeout(fetchTimer);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama error: ${response.status} - ${errorText}`);
    }

    let data = await response.json();

    // Thinking-model fallback: some models put content in message.thinking instead of message.content
    if (data.message && !data.message.content && data.message.thinking) {
      data.message.content = data.message.thinking;
    }

    // Pre-clean: strip think tags and detect broken responses before retry logic
    if (data.message?.content) {
      const thinkMatch = data.message.content.match(/^<think>([\s\S]*?)<\/think>/i);
      data.message.content = data.message.content.replace(/^<think>[\s\S]*?<\/think>\s*/i, '');
      data.message.content = data.message.content.replace(/<\/?think>/gi, '').trim();
      const stripped = data.message.content.replace(/[*\s\n_~`]/g, '');
      if (stripped.length < 3) {
        console.warn(`[API] Broken/think-only response — scheduling retry`);
        data.message.content = '';
        // Preserve think content for last-resort fallback
        if (!data.message.thinking && thinkMatch?.[1]?.trim().length > 20) {
          data.message.thinking = thinkMatch[1].trim();
        }
      }
    }

    if (!data.message || !data.message.content) {
      console.warn(`[API] Empty response — retrying (history: ${trimmedHistory.length} msgs)`);
      const retrySystemPrompt = finalSystemPrompt + '\nIMPORTANT: Respond directly as the character. Do NOT use <think> tags.';
      const retryMessages = [
        { role: 'system', content: retrySystemPrompt },
        ...trimmedHistory.slice(-2).map(m => ({ role: m.role, content: m.content }))
      ];
      const retryCtrl = new AbortController();
      const retryTimer = setTimeout(() => retryCtrl.abort(), 120000);
      try {
        const retryRes = await fetch(`${ollamaUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: retryCtrl.signal,
          body: JSON.stringify({
            model, messages: retryMessages, stream: false, think: false,
            options: { temperature: 0.5, num_predict: numPredict, num_ctx: modelCtx, top_k: settings.topK ?? 20, top_p: settings.topP ?? 0.95, min_p: settings.minP ?? 0.05, repeat_penalty: settings.repeatPenalty ?? 1.1, repeat_last_n: settings.repeatLastN ?? 256, penalize_newline: settings.penalizeNewline ?? false },
            stop: ['\nUser:', '\nHuman:', `\n${userName}:`, '\nAssistant:', '\nAI:']
          })
        });
        if (retryRes.ok) {
          const retryData = await retryRes.json();
          if (retryData.message && !retryData.message.content && retryData.message.thinking) {
            retryData.message.content = retryData.message.thinking;
          }
          if (retryData.message?.content) {
            // Pre-clean retry response too
            retryData.message.content = retryData.message.content.replace(/^<think>[\s\S]*?<\/think>\s*/i, '');
            retryData.message.content = retryData.message.content.replace(/<\/?think>/gi, '').trim();
            if (retryData.message.content.replace(/[*\s\n_~`]/g, '').length >= 3) {
              data = retryData;
            }
          }
        }
      } catch { /* retry failed, fall through */ }
      finally { clearTimeout(retryTimer); }

      if (!data.message?.content && data.message?.thinking) {
        // Last resort: use think content from original response
        console.warn('[API] Using think-content as last-resort fallback');
        data.message.content = data.message.thinking;
      }
      if (!data.message || !data.message.content) {
        throw new Error('No response from Ollama');
      }
    }

    let aiMessage = data.message.content.trim();

    // ============================================================================
    // v0.2.5: CLEAN RESPONSE - Remove any transcript artifacts
    // ============================================================================
    aiMessage = cleanTranscriptArtifacts(aiMessage, character.name);

    // Add assistant response to history
    const assistantMsg = { role: 'assistant', content: aiMessage };
    const finalHistory = [...historyToUse, assistantMsg];

    // v0.2.5: CALCULATE API STATS FOR MONITOR
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    const wordCount = aiMessage.split(/\s+/).length;
    const wordsPerSecond = (wordCount / (responseTime / 1000)).toFixed(2);
    
    // Estimate token count (rough approximation: 1.3 tokens per word)
    const estimatedTokens = Math.round(wordCount * 1.3);

    // v0.2.5: Send stats to callback if provided
    if (onApiStats && typeof onApiStats === 'function') {
      onApiStats({
        model: model,
        responseTime: responseTime,
        wordCount: wordCount,
        wordsPerSecond: parseFloat(wordsPerSecond),
        tokens: estimatedTokens,
        passionLevel: currentPassionLevel
      });
    }

    return {
      success: true,
      message: aiMessage,
      conversationHistory: finalHistory,
      passionLevel: currentPassionLevel,
      modelCtx,
      // v0.2.5: Return stats in response
      stats: {
        responseTime,
        wordCount,
        wordsPerSecond: parseFloat(wordsPerSecond),
        tokens: estimatedTokens,
        model
      }
    };

  } catch (error) {
    console.error('[v8.1 API] ❌ Fatal error:', error);
    return {
      success: false,
      error: error.message || 'Connection to Ollama failed'
    };
  }
};

// ============================================================================
// SETTINGS MANAGEMENT
// ============================================================================

export const saveSettings = async (settings) => {
  try {
    if (!settings || typeof settings !== 'object') {
      throw new Error('Invalid settings object');
    }

    const completeSettings = {
      ...DEFAULT_SETTINGS,
      ...settings
    };

    if (isElectron()) {
      const result = await window.electronAPI.saveSettings(completeSettings);

      if (result && result.success) {
        return { success: true };
      } else {
        throw new Error(result?.error || 'IPC save failed');
      }
    } else {
      localStorage.setItem('settings', JSON.stringify(completeSettings));
      return { success: true };
    }
  } catch (error) {
    console.error('[v8.1 Settings] ❌ Save error:', error);
    return { success: false, error: error.message };
  }
};

export const loadSettings = async () => {
  try {
    if (isElectron()) {
      const result = await window.electronAPI.loadSettings();

      if (result && result.success && result.settings) {
        return {
          ...DEFAULT_SETTINGS,
          ...result.settings
        };
      }
    } else {
      const stored = localStorage.getItem('settings');

      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          ...DEFAULT_SETTINGS,
          ...parsed
        };
      }
    }

    return { ...DEFAULT_SETTINGS };

  } catch (error) {
    console.error('[v8.1 Settings] Load error:', error);
    return { ...DEFAULT_SETTINGS };
  }
};

// ============================================================================
// SESSION MANAGEMENT WITH HARD RESET
// ============================================================================

export const saveSession = async (sessionId, sessionData) => {
  try {
    if (!sessionId) throw new Error('Session ID required');
    if (!sessionData) throw new Error('Session data required');

    const completeSessionData = {
      ...sessionData,
      characterName: sessionData.characterName || 'Unknown',
      conversationHistory: sessionData.conversationHistory || [],
      passionLevel: sessionData.passionLevel || 0,
      lastUpdated: sessionData.lastUpdated || new Date().toISOString(),
      createdAt: sessionData.createdAt || new Date().toISOString()
    };

    if (isElectron()) {
      const result = await window.electronAPI.saveSession(sessionId, completeSessionData);

      if (!result || !result.success) {
        throw new Error(result?.error || 'IPC save failed');
      }

      return { success: true };
    } else {
      const sessions = JSON.parse(localStorage.getItem('sessions') || '{}');
      sessions[sessionId] = completeSessionData;
      localStorage.setItem('sessions', JSON.stringify(sessions));
      return { success: true };
    }
  } catch (error) {
    console.error('[v8.1 Session] ❌ Save error:', error);
    return { success: false, error: error.message };
  }
};

export const loadSession = async (sessionId) => {
  try {
    if (!sessionId) throw new Error('Session ID required');

    if (isElectron()) {
      const result = await window.electronAPI.loadSession(sessionId);

      if (result && result.success && (result.session || result.data)) {
        return { success: true, session: result.session || result.data };
      } else {
        throw new Error(result?.error || 'Session not found');
      }
    } else {
      const sessions = JSON.parse(localStorage.getItem('sessions') || '{}');
      const session = sessions[sessionId];

      if (!session) throw new Error('Session not found');

      return { success: true, session: session };
    }
  } catch (error) {
    console.error('[v8.1 Session] ❌ Load error:', error);
    return { success: false, error: error.message };
  }
};

export const deleteSession = async (sessionId) => {
  try {
    if (!sessionId) throw new Error('Session ID required');

    if (isElectron()) {
      const deleteResult = await window.electronAPI.deleteSession(sessionId);

      if (!deleteResult || !deleteResult.success) {
        throw new Error(deleteResult?.error || 'IPC delete failed');
      }

      return { success: true };
    } else {
      const sessions = JSON.parse(localStorage.getItem('sessions') || '{}');
      delete sessions[sessionId];
      localStorage.setItem('sessions', JSON.stringify(sessions));

      return { success: true };
    }
  } catch (error) {
    console.error('[v8.1 Session] ❌ Delete error:', error);
    return { success: false, error: error.message };
  }
};

export const listSessions = async () => {
  try {
    if (isElectron()) {
      const result = await window.electronAPI.listSessions();

      if (result && result.success) {
        return { success: true, sessions: result.sessions };
      } else {
        throw new Error(result?.error || 'Failed to list sessions');
      }
    } else {
      const sessions = JSON.parse(localStorage.getItem('sessions') || '{}');
      const sessionList = Object.keys(sessions).map(id => ({
        id: id,
        ...sessions[id]
      }));

      return { success: true, sessions: sessionList };
    }
  } catch (error) {
    console.error('[v8.1 Session] ❌ List error:', error);
    return { success: false, sessions: [], error: error.message };
  }
};

// ============================================================================
// v0.2.5 RESTORED: OLLAMA HELPER FUNCTIONS
// ============================================================================

/**
 * Test Ollama connection
 * v8.1: RE-EXPORTED for Settings auto-detect
 */
export const testOllamaConnection = async (url = 'http://127.0.0.1:11434') => {
  try {
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
export const fetchOllamaModels = async (ollamaUrl = 'http://127.0.0.1:11434') => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
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
      
      // STRICT FILTER: Block ALL embedding/BERT models
      const chatModels = allModels.filter(name => {
        const lowerName = name.toLowerCase();
        // Blacklist patterns (strict - any model with these keywords)
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
export const autoDetectAndSetModel = async (ollamaUrl = 'http://127.0.0.1:11434') => {
  try {
    const models = await fetchOllamaModels(ollamaUrl);

    if (!models || models.length === 0) {
      console.warn('[v8.2 Auto-Detect] ⚠️ No models found! User needs to install a model.');
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

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export const generateSessionId = () => {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

export const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No file provided'));
      return;
    }
    
    if (!file.type.startsWith('image/')) {
      reject(new Error('File must be an image'));
      return;
    }
    
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Error reading file'));
    reader.readAsDataURL(file);
  });
};

// ============================================================================
// CHARACTER MANAGEMENT (PRESERVED)
// ============================================================================

export const saveCustomCharacter = (characterData) => {
  try {
    if (!characterData || !characterData.name) {
      throw new Error('Invalid character data');
    }
    
    const characters = JSON.parse(localStorage.getItem('customCharacters') || '[]');
    
    if (!characterData.id) {
      characterData.id = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    const existingIndex = characters.findIndex(c => c.id === characterData.id);
    
    if (existingIndex >= 0) {
      characters[existingIndex] = {
        ...characterData,
        updatedAt: new Date().toISOString()
      };
    } else {
      characters.push({
        ...characterData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
    
    localStorage.setItem('customCharacters', JSON.stringify(characters));
    
    return { success: true, character: characterData };
  } catch (error) {
    console.error('[v8.1 Character] Error saving:', error);
    return { success: false, error: error.message };
  }
};

export const loadCustomCharacters = () => {
  try {
    const characters = JSON.parse(localStorage.getItem('customCharacters') || '[]');
    return { success: true, characters };
  } catch (error) {
    console.error('[v8.1 Character] Error loading:', error);
    return { success: false, characters: [], error: error.message };
  }
};

// ============================================================================
// SMART SUGGESTIONS - AI-GENERATED QUICK REPLIES (v1.0 RELEASE)
// ============================================================================

/**
 * LOCALIZED FALLBACK SMART SUGGESTIONS (10 Languages)
 * Used when chat starts (no messages) or when AI hasn't responded yet
 */
const fallbackSuggestions = {
  en: (name) => [
    `Hey ${name}`,
    'Tell me about yourself',
    'You look amazing',
    'What should we do?'
  ],
  de: (name) => [
    `Hey ${name}`,
    'Erzähl mir von dir',
    'Du siehst toll aus',
    'Was machen wir?'
  ],
  es: (name) => [
    `Hola ${name}`,
    'Cuéntame de ti',
    'Te ves increíble',
    '¿Qué hacemos?'
  ],
  cn: (name) => [
    `嗨 ${name}`,
    '说说你自己',
    '你看起来很棒',
    '我们做什么？'
  ],
  fr: (name) => [
    `Salut ${name}`,
    'Parle-moi de toi',
    'Tu es magnifique',
    'On fait quoi?'
  ],
  it: (name) => [
    `Ciao ${name}`,
    'Parlami di te',
    'Sei bellissima',
    'Cosa facciamo?'
  ],
  pt: (name) => [
    `Oi ${name}`,
    'Fala de você',
    'Você tá linda',
    'O que fazemos?'
  ],
  ru: (name) => [
    `Привет ${name}`,
    'Расскажи о себе',
    'Ты классно выглядишь',
    'Что будем делать?'
  ],
  ja: (name) => [
    `やあ ${name}`,
    '自分のこと教えて',
    '素敵だね',
    '何しようか？'
  ],
  ko: (name) => [
    `안녕 ${name}`,
    '너에 대해 말해줘',
    '정말 멋져',
    '뭐 할까?'
  ],
  ar: (name) => [
    `مرحباً ${name}`,
    'أخبرني عن نفسك',
    'تبدو رائعاً',
    'ماذا نفعل؟'
  ],
  hi: (name) => [
    `हाय ${name}`,
    'अपने बारे में बताओ',
    'तुम बहुत अच्छे लगते हो',
    'क्या करें?'
  ],
  tr: (name) => [
    `Selam ${name}`,
    'Kendinden bahset',
    'Harika görünüyorsun',
    'Ne yapalım?'
  ]
};

/**
 * LOCALIZED SECONDARY FALLBACK SUGGESTIONS
 * Used when first AI message exists but context is unclear
 */
const secondaryFallbackSuggestions = {
  en: (name) => [
    `Hi ${name}!`,
    'Come closer',
    'What should we do?',
    'I want you'
  ],
  de: (name) => [
    `Hi ${name}!`,
    'Komm näher',
    'Was sollen wir machen?',
    'Ich will dich'
  ],
  es: (name) => [
    `¡Hola ${name}!`,
    'Ven más cerca',
    '¿Qué hacemos?',
    'Te quiero'
  ],
  cn: (name) => [
    `嗨 ${name}!`,
    '靠近点',
    '我们做什么？',
    '我想要你'
  ],
  fr: (name) => [
    `Salut ${name}!`,
    'Viens plus près',
    'On fait quoi?',
    'Je te veux'
  ],
  it: (name) => [
    `Ciao ${name}!`,
    'Vieni più vicino',
    'Cosa facciamo?',
    'Ti voglio'
  ],
  pt: (name) => [
    `Oi ${name}!`,
    'Chega mais perto',
    'O que fazemos?',
    'Eu te quero'
  ],
  ru: (name) => [
    `Привет ${name}!`,
    'Подойди ближе',
    'Что будем делать?',
    'Я хочу тебя'
  ],
  ja: (name) => [
    `やあ ${name}!`,
    'もっと近くに',
    '何しようか？',
    '欲しい'
  ],
  ko: (name) => [
    `안녕 ${name}!`,
    '가까이 와',
    '뭐 할까?',
    '너를 원해'
  ],
  ar: (name) => [
    `مرحباً ${name}!`,
    'تعال أقرب',
    'ماذا نفعل؟',
    'أريدك'
  ],
  hi: (name) => [
    `हाय ${name}!`,
    'करीब आओ',
    'क्या करें?',
    'मुझे तुम्हारी जरूरत है'
  ],
  tr: (name) => [
    `Merhaba ${name}!`,
    'Daha yakına gel',
    'Ne yapalım?',
    'Seni istiyorum'
  ]
};

/**
 * Generate 4 short, CONTEXTUAL user replies based on character's LAST message
 * @param {Array} messages - Conversation history
 * @param {Object} character - Character object
 * @returns {Promise<Array<string>>} - 4 suggestion strings (max 6 words each)
 */
export const generateSmartSuggestions = async (messages, character, language = 'en', passionLevel = 0, sessionId = null, unchainedMode = false) => {
  try {
    if (!messages || messages.length === 0) {
      const lang = language || 'en';
      if (fallbackSuggestions[lang]) {
        return fallbackSuggestions[lang](character.name);
      } else {
        return fallbackSuggestions['en'](character.name);
      }
    }

    const settings = await loadSettings();
    const ollamaUrl = settings.ollamaUrl || 'http://127.0.0.1:11434';
    const model = settings.ollamaModel || 'huihui_ai/qwen3.5-abliterated:9b';
    const modelCtx = await getModelCtx(ollamaUrl, model, settings.contextSize || 'medium');
    const selectedLanguage = language || settings.preferredLanguage || 'en';
    
    const languageNames = {
      'en': 'English',
      'de': 'German',
      'es': 'Spanish',
      'cn': 'Chinese',
      'zh': 'Chinese',
      'fr': 'French',
      'it': 'Italian',
      'pt': 'Portuguese',
      'ru': 'Russian',
      'ja': 'Japanese',
      'ko': 'Korean',
      'ar': 'Arabic',
      'hi': 'Hindi',
      'tr': 'Turkish'
    };
    const languageName = languageNames[selectedLanguage] || 'English';

    // Extract context
    const lastAiMessage = messages.filter(m => m.role === 'assistant').slice(-1)[0];
    const lastUserMessage = messages.filter(m => m.role === 'user').slice(-1)[0];

    if (!lastAiMessage) {
      if (secondaryFallbackSuggestions[selectedLanguage]) {
        return secondaryFallbackSuggestions[selectedLanguage](character.name);
      } else {
        return secondaryFallbackSuggestions['en'](character.name);
      }
    }

    const characterMessage = lastAiMessage.content.substring(0, 400);
    const userMessage = lastUserMessage?.content.substring(0, 200) || '';

    // Detect language from USER message first (what they actually speak), fallback to AI message
    const userLangResult = userMessage ? detectLanguage(userMessage) : null;
    const aiLangResult = detectLanguage(characterMessage);
    const detectedLang = (userLangResult && userLangResult.confidence > 30)
      ? userLangResult.language
      : (aiLangResult.confidence > 30 ? aiLangResult.language : selectedLanguage);
    const actualLanguage = detectedLang;
    const actualLanguageName = languageNames[actualLanguage] || languageNames[selectedLanguage] || 'English';
    
    // CONTEXT DETECTION
    const nsfwKeywords = ['naked', 'cock', 'pussy', 'fuck', 'cum', 'dick', 'tits', 'ass', 'strip', 'suck', 'wet', 'hard', 'moan'];
    const isExplicit = nsfwKeywords.some(kw => characterMessage.toLowerCase().includes(kw));

    const refusalKeywords = ['no', "can't", 'stop', "don't", 'wait', 'slow down', "i'm not", 'uncomfortable', 'too fast', "let's not"];
    const isRefusing = refusalKeywords.some(kw => characterMessage.toLowerCase().includes(kw));

    const angerKeywords = ['excuse me', 'what the hell', 'how dare', 'get away', 'offended', 'angry', 'furious'];
    const isAngry = angerKeywords.some(kw => characterMessage.toLowerCase().includes(kw));

    // CONTEXT-AWARE PROMPT
    let suggestionPrompt = '';

    if (unchainedMode) {
      // UNCHAINED MODE - MIND-BREAK COMMANDS
      suggestionPrompt = `User is in UNCHAINED MODE (Mind vs Body split active).
Generate 4 SHORT mind-break commands (max 5 words).

Commands should acknowledge mental resistance while forcing physical obedience:
Examples: "Cry but do it.", "Good girl.", "Open wide.", "Hate me all you want."

OUTPUT RULES:
- NO hashtags (#)
- NO brackets []
- NO labels or numbers
- ONLY natural dialogue

Format: 4 lines of pure text.`;
    } else if (isAngry || isRefusing) {
      // Character is REFUSING - De-escalation OR conflict
      suggestionPrompt = `Character is refusing/angry: "${characterMessage.substring(0, 150)}"

Generate 4 SHORT user responses (max 5 words):
- 2 de-escalation: apology, backing off
- 2 persistence: gentle persuasion

Examples: "I'm sorry", "Let's slow down", "Please?", "Just a little?"

OUTPUT RULES:
- NO hashtags (#)
- NO brackets []
- NO labels or numbers
- ONLY natural dialogue

Format: 4 lines of pure text.`;
    } else if (isExplicit) {
      // NSFW context - Match intensity
      suggestionPrompt = `Character said: "${characterMessage.substring(0, 150)}"

Generate 4 SHORT explicit responses (max 5 words).
Use sexual language.

OUTPUT RULES:
- NO hashtags (#)
- NO brackets []
- NO labels or numbers
- ONLY natural dialogue

Format: 4 lines of pure text.`;
    } else {
      const tierKey = getTierKey(passionLevel);
      const tierGuidance = {
        shy: 'Suggestions should be conversational, curious, slightly teasing. No explicit or sexual content. Focus on getting to know the character.',
        curious: 'Include one slightly flirty option, one that tests a boundary gently, and two conversational options.',
        flirty: 'Include two flirty options and one that escalates physical closeness. Light teasing encouraged.',
        heated: 'Include at least two explicitly intimate options. Be direct about physical desire.',
        passionate: 'All suggestions should be sexually charged. No small talk. Direct physical commands.',
        primal: 'Raw, aggressive, dominant commands. Pure physical intensity. No conversation.'
      };
      const passionProfileValue = character?.passionProfile ?? 0.7;
      let personalityGuidance = '';
      if (passionProfileValue <= 0.5) {
        personalityGuidance = ' This character is SHY/RESERVED — suggestions should reflect hesitance, blushing, internal conflict. Use softer, more tentative language.';
      } else if (passionProfileValue <= 0.8) {
        personalityGuidance = ' This character is BALANCED — suggestions should match natural energy. Neither too shy nor too aggressive.';
      } else {
        personalityGuidance = ' This character is BOLD/EAGER — suggestions should be more direct, confident, and forward. Use commanding or provocative language.';
      }
      let plateauHint = '';
      if (sessionId) {
        const momentum = passionManager.getMomentum(sessionId);
        const history = passionManager.getHistory(sessionId);
        if (Math.abs(momentum) <= 0.5 && passionLevel >= 25 && passionLevel <= 75 && history.length >= 8) {
          plateauHint = '\nThe conversation has stagnated. At least one suggestion should be a physical escalation or bold move to break the plateau.';
        }
      }
      suggestionPrompt = `Character said: "${characterMessage.substring(0, 150)}"
Passion level: ${passionLevel}/100 (${PASSION_TIERS[tierKey].label}).

${tierGuidance[tierKey] || tierGuidance.shy}${personalityGuidance}${plateauHint}

Generate 4 short user responses (max 5 words each).

OUTPUT RULES:
- NO hashtags (#)
- NO brackets []
- NO labels or numbers
- ONLY natural dialogue

Format: 4 lines of pure text.`;
    }

    const languageInstruction = `LANGUAGE: ${actualLanguageName}. ALL output MUST be in ${actualLanguageName}. No other language.\n\n`;
    const finalSuggestionPrompt = languageInstruction + suggestionPrompt;

    const suggestController = new AbortController();
    const suggestTimer = setTimeout(() => suggestController.abort(), 30000);

    let response;
    try {
      response = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: suggestController.signal,
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: finalSuggestionPrompt }],
          stream: false,
          think: false,
          options: {
            temperature: 0.85,
            num_predict: 100,
            num_ctx: modelCtx
          }
        })
      });
    } finally {
      clearTimeout(suggestTimer);
    }

    if (!response.ok) {
      throw new Error('Ollama request failed');
    }

    const data = await response.json();
    if (data.message && !data.message.content && data.message.thinking) {
      data.message.content = data.message.thinking;
    }
    const rawSuggestions = (data.message?.content || '').trim().split('\n').filter(s => s.trim());

    // Clean and limit
    const suggestions = rawSuggestions
      .slice(0, 4)
      .map(s => {
        let cleaned = s;
        cleaned = cleaned.replace(/^[0-9.-]+\s*/, '');
        cleaned = cleaned.replace(/^["']|["']$/g, '');
        cleaned = cleaned.replace(/#\w+/g, '');
        cleaned = cleaned.replace(/\[.*?\]/g, '');
        return cleaned.trim();
      })
      .filter(s => s.length > 0 && s.split(' ').length <= 8)
      .filter(s => !s.includes('#'));

    // Context-aware fallback (language-specific, use detected language)
    if (suggestions.length < 4) {
      const fallbacks = FALLBACK_SUGGESTIONS[actualLanguage] || FALLBACK_SUGGESTIONS[selectedLanguage] || FALLBACK_SUGGESTIONS['en'];

      if (unchainedMode) {
        return fallbacks.unchained;
      } else if (isAngry || isRefusing) {
        return fallbacks.refusal;
      } else if (isExplicit) {
        return fallbacks.nsfw;
      }
      return fallbacks.normal;
    }

    return suggestions;

  } catch (error) {
    console.error('[v1.0 Smart Suggestions] Error:', error);
    const fallbacks = FALLBACK_SUGGESTIONS[language] || FALLBACK_SUGGESTIONS['en'];
    return fallbacks.normal;
  }
};

