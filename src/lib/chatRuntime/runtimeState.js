import { compileCharacterRuntimeCard, resolveRuntimeCardTemplates } from './compiler.js';
import {
  estimateTokens,
  normalizeWhitespace,
  pickSentenceByKeywords,
  resolveTemplates,
  splitSentences,
  trimPromptSnippet,
  truncateMiddle
} from './text.js';

const PROFILE_HISTORY_SHARE = {
  reply: 0.4,
  suggestions: 0.18,
  impersonate: 0.22
};

const PROFILE_NON_HISTORY_RESERVE = {
  reply: 820,
  suggestions: 420,
  impersonate: 520
};

const SCENE_MEMORY_MAX_TOKENS = 200;
const SCENE_MEMORY_MAX_FACTS = 3;
const SCENE_MEMORY_MAX_LIST_ENTRIES = 8;
const SCENE_MEMORY_VERSION = 1;

const RELATIONSHIP_KEYWORDS = [
  'master',
  'neighbor',
  'rival',
  'partner',
  'friend',
  'lover',
  'customer',
  'guest',
  'owner',
  'service',
  'tension',
  'attracted'
];

const LOCATIVE_PHRASE_PATTERN = /\b(?:in|into|inside|on|at|near|by|under|above|across|outside)\s+(?:the|a|an|my|your|his|her|their|our)\s+\w+(?:\s+\w+){0,2}\b/gi;
const EXPLICIT_LOCATION_INTENT_PATTERN = /(?:let'?s\s+go\s+to|we'?re\s+(?:now\s+)?(?:in|at)|i\s+(?:take|guide|lead|bring|carry|move)\s+(?:her|him|them|you)\s+(?:to|into|inside)|i\s+(?:lock|enter|open)\s+(?:the|a|an|my|your|his|her|their)|now\s+we'?re\s+in)/i;

/**
 * Structural anatomy-exclusion set. A locative phrase whose noun is in this set
 * (e.g. "into her mouth", "between her thighs") is a body-part action, not a
 * physical setting. This is NOT a setting keyword whitelist — never expand it
 * with location words.
 */
const ANATOMY_WORDS = new Set([
  'mouth', 'throat', 'pussy', 'ass', 'cock', 'breast', 'breasts', 'tits', 'dick',
  'cunt', 'clit', 'lips', 'fingers', 'hands', 'hair', 'arms', 'legs', 'knees',
  'thigh', 'thighs', 'neck', 'chest', 'hips', 'back', 'shoulder', 'shoulders',
  'ear', 'ears', 'eye', 'eyes', 'face', 'hole', 'holes', 'womb', 'tongue',
  'palm', 'palms', 'cheeks', 'butt', 'butthole', 'anus', 'balls', 'nipple',
  'nipples', 'mound', 'slit'
]);

/**
 * Structural idiom-rejection set. Locative-shaped phrases whose noun is in this
 * set are stock idioms or temporal markers ("by the way", "in the moment",
 * "at night") rather than physical settings. This is NOT a setting keyword
 * whitelist — never expand it with location words.
 */
const ABSTRACT_NOUN_WORDS = new Set([
  'way', 'time', 'times', 'end', 'beginning', 'meantime', 'future', 'past',
  'present', 'moment', 'moments', 'air', 'light', 'dark', 'mind', 'mood',
  'sight', 'case', 'fact', 'sense', 'terms', 'contrast', 'general', 'short',
  'long', 'total', 'addition', 'brief', 'truth', 'process', 'middle',
  'silence', 'distance', 'morning', 'evening', 'night', 'afternoon'
]);

const CONTINUITY_KEYWORDS = [
  'still',
  'again',
  'continue',
  'closer',
  'against',
  'around',
  'between',
  'lean',
  'hold',
  'held',
  'kiss',
  'touch',
  'follow',
  'wait',
  'watch',
  'promise',
  'stay',
  'keep',
  'come',
  'inside',
  'outside',
  'doorway',
  'counter',
  'bed',
  'couch',
  'chair',
  'desk',
  'breath',
  'voice',
  'shiver',
  'chin',
  'waist',
  'hand',
  'fingers',
  'throat',
  'chest',
  'step'
];

const EXPLICIT_INTIMACY_PATTERN = /\b(?:sex|sexual|naked|nude|moan|thrust|grind|ride|cock|dick|pussy|clit|cum|orgasm|breasts?|nipples?|between (?:my|your|her|his) legs|inside (?:me|you|her|him)|hardcore|fuck(?:ing|ed)?|suck(?:ing|ed)?|lick(?:ing|ed)?|spread(?:ing)? (?:my|your|her|his) legs)\b/i;
const FLIRTY_TENSION_PATTERN = /\b(?:blush(?:ing)?|flush(?:ed|ing)?|shiver(?:ing)?|breath(?:less|ing)?|tension|chemistry|closer|close|linger(?:ing)?|lean(?:ing)?|touch(?:ing|es)?|waist|throat|chin|lips?|kiss(?:es|ed|ing)?|hold(?:ing)?|stay|invite|pull(?:ing)?|want(?:s|ed|ing)?|need(?:s|ed|ing)?)\b/i;
const ESCALATION_OPENING_PATTERN = /\b(?:come closer|closer|kiss me|kiss me properly|touch me|hold me|stay with me|stay close|come here|pull me|pull me in|want you|need you|show me|don't stop|keep going|keep me right here|let me|invite me|take me|want this)\b/i;
const DEESCALATION_PATTERN = /\b(?:please stop|stop that|stop this|stop now|slow down|not now|later|focus|back to work|back to the task|let'?s keep this professional|we should behave|we should stop|that's enough)\b/i;

function collectAssistSignals({ history = [], activeScene, sceneState, persistedSceneMemory }) {
  const recentMessages = history.slice(-6);
  const recentText = recentMessages.map((message) => message.content).join('\n');
  const latestUserTurn = [...history].reverse().find((message) => message.role === 'user')?.content || '';
  const latestAssistantTurn = [...history].reverse().find((message) => message.role === 'assistant')?.content || '';
  const beatText = [
    activeScene?.latest_character_action_or_reaction,
    activeScene?.latest_user_action_or_request,
    activeScene?.open_thread,
    activeScene?.continuity,
    sceneState?.continuity_facts?.join(' | '),
    persistedSceneMemory?.open_thread
  ].filter(Boolean).join('\n');
  const explicitHits = [recentText, beatText].filter(Boolean).reduce((count, text) => count + (EXPLICIT_INTIMACY_PATTERN.test(text) ? 1 : 0), 0);
  const flirtyHits = [recentText, beatText].filter(Boolean).reduce((count, text) => count + (FLIRTY_TENSION_PATTERN.test(text) ? 1 : 0), 0);
  const escalationOpening = ESCALATION_OPENING_PATTERN.test(beatText) || ESCALATION_OPENING_PATTERN.test(latestUserTurn);
  const deescalationText = `${latestUserTurn}\n${activeScene?.open_thread || ''}`;
  const explicitContinuation = /\bdon'?t stop\b/i.test(deescalationText);
  const deescalating = !explicitContinuation && DEESCALATION_PATTERN.test(deescalationText);

  return {
    recentText,
    latestUserTurn,
    latestAssistantTurn,
    explicitHits,
    flirtyHits,
    escalationOpening,
    deescalating
  };
}

function deriveAssistMode({ character, runtimeSteering, activeScene, sceneState, history, persistedSceneMemory }) {
  const isBot = character?.type === 'bot';
  if (isBot) {
    return {
      value: 'bot_conversation',
      debug: {
        nsfwAllowed: false,
        explicitHits: 0,
        flirtyHits: 0,
        escalationOpening: false,
        deescalating: false,
        reason: 'bot_override'
      }
    };
  }

  const categoryAllowsNsfw = character?.category === 'nsfw';
  const unchainedMode = Boolean(runtimeSteering?.unchainedMode);
  const nsfwAllowed = categoryAllowsNsfw || unchainedMode;
  const signals = collectAssistSignals({
    history,
    activeScene,
    sceneState,
    persistedSceneMemory
  });
  const elevatedPassion = Number(runtimeSteering?.passionLevel || 0) >= 20;
  const strongPassion = Number(runtimeSteering?.passionLevel || 0) >= 35;
  const explicitScene = signals.explicitHits > 0;
  const flirtScene = signals.flirtyHits > 0;
  const chargedEscalation = !explicitScene
    && !signals.deescalating
    && signals.escalationOpening
    && signals.flirtyHits >= 1
    && strongPassion;
  const sustainedNsfwMomentum = !explicitScene
    && !signals.deescalating
    && categoryAllowsNsfw
    && signals.flirtyHits >= 2
    && strongPassion;

  if (nsfwAllowed && !signals.deescalating && (explicitScene || chargedEscalation || sustainedNsfwMomentum)) {
    return {
      value: 'nsfw_only',
      debug: {
        nsfwAllowed,
        explicitHits: signals.explicitHits,
        flirtyHits: signals.flirtyHits,
        escalationOpening: signals.escalationOpening,
        deescalating: signals.deescalating,
        reason: explicitScene
          ? 'explicit_scene'
          : (chargedEscalation ? 'charged_escalation' : 'sustained_nsfw_momentum')
      }
    };
  }

  if (
    nsfwAllowed
    && !explicitScene
    && !signals.deescalating
    && (signals.escalationOpening || flirtScene)
    && (unchainedMode || elevatedPassion || signals.escalationOpening || signals.flirtyHits >= 2 || strongPassion)
  ) {
    return {
      value: 'mixed_transition',
      debug: {
        nsfwAllowed,
        explicitHits: signals.explicitHits,
        flirtyHits: signals.flirtyHits,
        escalationOpening: signals.escalationOpening,
        deescalating: signals.deescalating,
        reason: 'flirty_scene_with_escalation'
      }
    };
  }

  return {
    value: 'sfw_only',
    debug: {
      nsfwAllowed,
      explicitHits: signals.explicitHits,
      flirtyHits: signals.flirtyHits,
      escalationOpening: signals.escalationOpening,
      deescalating: signals.deescalating,
      reason: nsfwAllowed ? 'insufficient_escalation' : 'category_gate'
    }
  };
}

function normalizeHistory(history) {
  return (history || [])
    .filter((message) => (message?.role === 'user' || message?.role === 'assistant') && typeof message?.content === 'string' && message.content.trim())
    .map((message) => ({ role: message.role, content: message.content }));
}

function normalizeTimestampValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function getLatestAssistantTimestamp(history) {
  for (let index = (history || []).length - 1; index >= 0; index -= 1) {
    if (history[index]?.role === 'assistant') {
      return normalizeTimestampValue(history[index]?.timestamp);
    }
  }

  return null;
}

function findProtectedIndices(history) {
  const latestUserIndex = history.map((message) => message.role).lastIndexOf('user');
  const latestAssistantIndex = latestUserIndex >= 0
    ? history.slice(0, latestUserIndex).map((message) => message.role).lastIndexOf('assistant')
    : history.map((message) => message.role).lastIndexOf('assistant');

  const protectedIndices = new Set();

  if (latestAssistantIndex >= 0) {
    protectedIndices.add(latestAssistantIndex);
    if (latestAssistantIndex > 0 && history[latestAssistantIndex - 1]?.role === 'user') {
      protectedIndices.add(latestAssistantIndex - 1);
    }
  }

  if (latestUserIndex >= 0) {
    protectedIndices.add(latestUserIndex);
    if (latestUserIndex > 0 && history[latestUserIndex - 1]?.role === 'assistant') {
      protectedIndices.add(latestUserIndex - 1);
    }
  }

  return protectedIndices;
}

function truncateHistoryMessage(content, budgetTokens) {
  const targetChars = Math.max(150, Math.floor(budgetTokens * 3.5));
  return truncateMiddle(content, targetChars, Math.floor(targetChars * 0.4), Math.floor(targetChars * 0.45));
}

function selectRecentHistory(history, budgetTokens) {
  const normalizedHistory = normalizeHistory(history);
  const protectedIndices = findProtectedIndices(normalizedHistory);
  const protectedEntries = [...protectedIndices]
    .sort((left, right) => left - right)
    .map((index) => ({
      ...normalizedHistory[index],
      _meta: {
        protected: true,
        truncated: false,
        sourceIndex: index
      }
    }));

  let selectedTokenCount = protectedEntries.reduce((sum, message) => sum + estimateTokens(message.content), 0);
  let remainingBudget = Math.max(0, budgetTokens - selectedTokenCount);
  const candidateIndices = normalizedHistory
    .map((_, index) => index)
    .filter((index) => !protectedIndices.has(index))
    .sort((left, right) => right - left);

  const selectedIndices = new Set(protectedIndices);
  let truncationCandidate = null;
  let truncatedIndex = null;
  let truncatedContent = '';

  for (const index of candidateIndices) {
    const message = normalizedHistory[index];
    const messageTokens = estimateTokens(message.content);
    if (messageTokens <= remainingBudget) {
      selectedIndices.add(index);
      selectedTokenCount += messageTokens;
      remainingBudget -= messageTokens;
      continue;
    }

    if (!truncationCandidate && remainingBudget >= 45) {
      truncationCandidate = { index, message };
    }
  }

  if (truncationCandidate && remainingBudget >= 45) {
    truncatedContent = truncateHistoryMessage(truncationCandidate.message.content, remainingBudget);
    const truncatedTokens = estimateTokens(truncatedContent);
    if (truncatedTokens <= budgetTokens) {
      truncatedIndex = truncationCandidate.index;
      selectedIndices.add(truncationCandidate.index);
      selectedTokenCount += truncatedTokens;
      remainingBudget = Math.max(0, remainingBudget - truncatedTokens);
    }
  }

  const selectedMessages = [...selectedIndices]
    .sort((left, right) => left - right)
    .map((index) => {
      const original = normalizedHistory[index];
      const content = index === truncatedIndex ? truncatedContent : original.content;

      return {
        role: original.role,
        content,
        _meta: {
          protected: protectedIndices.has(index),
          truncated: content !== original.content,
          sourceIndex: index
        }
      };
    });

  return {
    messages: selectedMessages,
    debug: {
      keptCount: selectedMessages.length,
      totalCount: normalizedHistory.length,
      protectedCount: protectedEntries.length,
      truncatedOldestNonProtected: selectedMessages.some((message) => message._meta.truncated && !message._meta.protected)
    }
  };
}

function findLatestTurn(history, role) {
  return [...history].reverse().find((message) => message.role === role)?.content || '';
}

function findLatestRole(history) {
  return history[history.length - 1]?.role || '';
}

function pickRecentSentenceByKeywords(history, keywords, maxLength = 150) {
  const loweredKeywords = keywords.map((keyword) => keyword.toLowerCase());

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const sentences = splitSentences(history[index]?.content || '');
    for (const sentence of sentences) {
      const loweredSentence = sentence.toLowerCase();
      if (loweredKeywords.some((keyword) => loweredSentence.includes(keyword))) {
        return trimPromptSnippet(sentence, maxLength);
      }
    }
  }

  return '';
}

function stripActionBlocks(text) {
  return String(text || '')
    .replace(/\*\*[^*]*\*\*/g, ' ')
    .replace(/\*[^*]*\*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isAnatomyLocative(phrase) {
  const tokens = String(phrase || '').toLowerCase().split(/\s+/);
  return tokens.some((token) => ANATOMY_WORDS.has(token));
}

function isAbstractLocative(phrase) {
  const tokens = String(phrase || '').toLowerCase().split(/\s+/);
  return tokens.some((token) => ABSTRACT_NOUN_WORDS.has(token));
}

function extractLocativePhrase(text, maxLength = 150, { stripActions = true } = {}) {
  const source = stripActions ? stripActionBlocks(text) : String(text || '').replace(/[*]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!source) return '';
  const matches = source.match(LOCATIVE_PHRASE_PATTERN) || [];
  for (const match of matches) {
    if (isAnatomyLocative(match)) continue;
    if (isAbstractLocative(match)) continue;
    return trimPromptSnippet(match, maxLength);
  }
  return '';
}

function pickRecentLocativePhrase(history, maxLength = 150) {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    const content = message?.content || '';
    const stripActions = message?.role !== 'user';
    const phrase = extractLocativePhrase(content, maxLength, { stripActions });
    if (phrase) return phrase;
  }
  return '';
}

const EXPLICIT_OVERRIDE_NOUN_PATTERN = /(?:let'?s\s+go\s+(?:to|into|inside)|we'?re\s+(?:now\s+)?(?:in|at|inside|into)|i\s+(?:take|guide|lead|bring|carry|move)\s+(?:her|him|them|you)\s+(?:to|into|inside|onto)|i\s+(?:lock|enter|open)|now\s+we'?re\s+(?:in|at|inside|into))\s+((?:the|a|an|my|your|his|her|their|our)\s+\w+(?:\s+\w+){0,2})/i;

function applyExplicitLocationOverride(latestUserContent, fallback) {
  const text = String(latestUserContent || '');
  if (!text.trim()) return { value: fallback, overridden: false };
  if (!EXPLICIT_LOCATION_INTENT_PATTERN.test(text)) {
    return { value: fallback, overridden: false };
  }
  const directMatch = text.match(EXPLICIT_OVERRIDE_NOUN_PATTERN);
  if (directMatch?.[1]) {
    const candidate = directMatch[1];
    if (!isAnatomyLocative(candidate) && !isAbstractLocative(candidate)) {
      return { value: trimPromptSnippet(candidate, 150), overridden: true };
    }
  }
  const phrase = extractLocativePhrase(text, 150);
  if (!phrase) return { value: fallback, overridden: false };
  return { value: phrase, overridden: true };
}

function sanitizeSceneAnchor(text, keywords = [], maxLength = 150) {
  const flattened = String(text || '')
    .replace(/[*"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const loweredKeywords = keywords.map((keyword) => keyword.toLowerCase());
  const matchingSentence = splitSentences(flattened)
    .find((sentence) => loweredKeywords.some((keyword) => sentence.toLowerCase().includes(keyword)));

  return trimPromptSnippet(matchingSentence || flattened || text, maxLength);
}

function cleanSceneMemoryLine(text, maxLength) {
  const cleaned = String(text || '')
    .replace(/\b(?:user|assistant|human|ai|character)\s*:/gi, ' ')
    .replace(/[*"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return trimPromptSnippet(cleaned, maxLength);
}

function sanitizeSceneMemoryLine(text, maxLength = 120) {
  const raw = String(text || '').trim();
  if (/\b(?:user|assistant|human|ai|character)\s*:/i.test(raw)) return '';

  const cleaned = cleanSceneMemoryLine(text, maxLength);
  if (!cleaned) return '';

  const lowered = cleaned.toLowerCase();
  if (/[|]/.test(cleaned)) return '';
  if (/\b(?:said|asked|replied|answered)\b/i.test(lowered)) return '';

  return cleaned;
}

function trimSceneMemoryFacts(facts) {
  return (facts || [])
    .map((fact) => sanitizeSceneMemoryLine(fact, 96))
    .filter(Boolean)
    .slice(0, SCENE_MEMORY_MAX_FACTS);
}

function sanitizeMemoryListEntries(entries, { maxLength = 64, maxEntries = SCENE_MEMORY_MAX_LIST_ENTRIES, validate = null } = {}) {
  if (!Array.isArray(entries)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of entries) {
    const cleaned = sanitizeSceneMemoryLine(entry, maxLength);
    if (!cleaned) continue;
    if (typeof validate === 'function' && !validate(cleaned)) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= maxEntries) break;
  }
  return out;
}

function trimSceneMemoryToBudget(memory) {
  if (!memory) return null;

  const trimmed = {
    setting_anchor: sanitizeSceneMemoryLine(memory.setting_anchor, 96),
    relationship_anchor: sanitizeSceneMemoryLine(memory.relationship_anchor, 96),
    continuity_facts: trimSceneMemoryFacts(memory.continuity_facts),
    open_thread: sanitizeSceneMemoryLine(memory.open_thread, 96),
    nsfwArcAnchor: sanitizeSceneMemoryLine(memory.nsfwArcAnchor, 96),
    wardrobe: sanitizeMemoryListEntries(memory.wardrobe, {
      maxLength: 60,
      validate: (entry) => Boolean(trimToClothingHead(entry))
    }),
    bodyState: sanitizeMemoryListEntries(memory.bodyState, { maxLength: 60 }),
    establishedFacts: sanitizeMemoryListEntries(memory.establishedFacts, { maxLength: 72 }),
    mentionedItems: sanitizeMemoryListEntries(memory.mentionedItems, { maxLength: 40, maxEntries: 16 }),
    source_assistant_timestamp: normalizeTimestampValue(memory.source_assistant_timestamp),
    updated_at: memory.updated_at || new Date().toISOString(),
    version: SCENE_MEMORY_VERSION
  };

  const contentTokenCount = () => estimateTokens([
    trimmed.setting_anchor,
    trimmed.relationship_anchor,
    ...(trimmed.continuity_facts || []),
    trimmed.open_thread,
    ...(trimmed.wardrobe || []),
    ...(trimmed.bodyState || []),
    ...(trimmed.establishedFacts || []),
    ...(trimmed.mentionedItems || [])
  ].filter(Boolean).join('\n'));

  if (contentTokenCount() > SCENE_MEMORY_MAX_TOKENS) {
    trimmed.open_thread = '';
  }

  while (trimmed.continuity_facts.length > 2 && contentTokenCount() > SCENE_MEMORY_MAX_TOKENS) {
    trimmed.continuity_facts = trimmed.continuity_facts.slice(0, -1);
  }

  if (contentTokenCount() > SCENE_MEMORY_MAX_TOKENS) {
    trimmed.relationship_anchor = trimPromptSnippet(trimmed.relationship_anchor, 72);
  }

  if (contentTokenCount() > SCENE_MEMORY_MAX_TOKENS) {
    trimmed.setting_anchor = trimPromptSnippet(trimmed.setting_anchor, 72);
  }

  while (trimmed.mentionedItems.length > 0 && contentTokenCount() > SCENE_MEMORY_MAX_TOKENS) {
    trimmed.mentionedItems = trimmed.mentionedItems.slice(0, -1);
  }

  while (trimmed.establishedFacts.length > 0 && contentTokenCount() > SCENE_MEMORY_MAX_TOKENS) {
    trimmed.establishedFacts = trimmed.establishedFacts.slice(0, -1);
  }

  while (trimmed.bodyState.length > 0 && contentTokenCount() > SCENE_MEMORY_MAX_TOKENS) {
    trimmed.bodyState = trimmed.bodyState.slice(0, -1);
  }

  while (trimmed.wardrobe.length > 0 && contentTokenCount() > SCENE_MEMORY_MAX_TOKENS) {
    trimmed.wardrobe = trimmed.wardrobe.slice(0, -1);
  }

  if (contentTokenCount() > SCENE_MEMORY_MAX_TOKENS) {
    return null;
  }

  const isEmpty = !trimmed.setting_anchor
    && !trimmed.relationship_anchor
    && trimmed.continuity_facts.length === 0
    && !trimmed.open_thread
    && !trimmed.nsfwArcAnchor
    && trimmed.wardrobe.length === 0
    && trimmed.bodyState.length === 0
    && trimmed.establishedFacts.length === 0
    && trimmed.mentionedItems.length === 0;

  if (isEmpty) {
    return null;
  }

  return trimmed;
}

export function validateSceneMemory(sceneMemory, history = []) {
  if (!sceneMemory || typeof sceneMemory !== 'object') return null;

  const sourceAssistantTimestamp = normalizeTimestampValue(sceneMemory.source_assistant_timestamp);
  const latestAssistantTimestamp = getLatestAssistantTimestamp(history);
  if (sourceAssistantTimestamp === null || latestAssistantTimestamp === null || sourceAssistantTimestamp !== latestAssistantTimestamp) {
    return null;
  }

  return trimSceneMemoryToBudget({
    ...sceneMemory,
    source_assistant_timestamp: sourceAssistantTimestamp
  });
}

function sanitizeLocativeAnchor(text, maxLength = 120) {
  return trimPromptSnippet(
    String(text || '').replace(/[*"]/g, ' ').replace(/\s+/g, ' ').trim(),
    maxLength
  );
}

function deriveSettingAnchor(history, sceneSeed, sceneMemory) {
  const frozenArcAnchor = sanitizeSceneMemoryLine(sceneMemory?.nsfwArcAnchor, 120);
  if (frozenArcAnchor) {
    const latestUserContent = [...history].reverse().find((message) => message.role === 'user')?.content || '';
    const override = applyExplicitLocationOverride(latestUserContent, frozenArcAnchor);
    if (override.overridden) {
      return { value: sanitizeLocativeAnchor(override.value, 120), source: 'nsfw_arc_override' };
    }
    return { value: sanitizeLocativeAnchor(frozenArcAnchor, 120), source: 'nsfw_arc_frozen' };
  }

  const historyAnchor = pickRecentLocativePhrase(history, 150);
  if (historyAnchor) {
    return { value: sanitizeLocativeAnchor(historyAnchor, 120), source: 'history' };
  }

  if (sceneMemory?.setting_anchor) {
    return { value: sanitizeSceneMemoryLine(sceneMemory.setting_anchor, 120), source: 'memory' };
  }

  const seedAnchor = extractLocativePhrase(sceneSeed, 150) || trimPromptSnippet(sceneSeed, 150);
  if (seedAnchor) {
    return { value: sanitizeLocativeAnchor(seedAnchor, 120), source: 'seed' };
  }

  return { value: '', source: 'none' };
}

function deriveRelationshipAnchor(history, compiledRuntimeCard, sceneMemory) {
  const historyAnchor = pickRecentSentenceByKeywords(history, RELATIONSHIP_KEYWORDS, 150);
  if (historyAnchor) {
    return { value: sanitizeSceneAnchor(historyAnchor, RELATIONSHIP_KEYWORDS, 150), source: 'history' };
  }

  if (sceneMemory?.relationship_anchor) {
    return { value: sanitizeSceneMemoryLine(sceneMemory.relationship_anchor, 120), source: 'memory' };
  }

  const seedText = `${compiledRuntimeCard.sceneSeed || ''}\n${compiledRuntimeCard.characterCore || ''}`;
  const seedAnchor = pickSentenceByKeywords(seedText, RELATIONSHIP_KEYWORDS, 150) || trimPromptSnippet(compiledRuntimeCard.sceneSeed || '', 150);
  if (seedAnchor) {
    return { value: sanitizeSceneAnchor(seedAnchor, RELATIONSHIP_KEYWORDS, 150), source: 'seed' };
  }

  return { value: '', source: 'none' };
}

function scoreContinuitySentence(sentence) {
  const lowered = sentence.toLowerCase();
  let score = 0;

  if (sentence.length >= 28) score += 1;
  if (sentence.includes('*')) score += 2;
  if (/[?!"']/.test(sentence)) score += 1;
  if (CONTINUITY_KEYWORDS.some((keyword) => lowered.includes(keyword))) score += 2;
  if (/\b(please|can you|could you|show me|tell me|stay|come|kiss|touch|hold|take|keep going|don't stop)\b/i.test(sentence)) score += 2;

  return score;
}

function stripQuotedDialogue(text) {
  return String(text || '')
    .replace(/"[^"]*"/g, ' ')
    .replace(/\*+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractContinuityFact(message, candidate, maxLength = 110) {
  const actionMatch = String(message?.content || '').match(/\*([^*]+)\*/);
  if (actionMatch?.[1]) {
    return trimPromptSnippet(actionMatch[1], maxLength);
  }

  const plainCandidate = stripQuotedDialogue(candidate);
  if (!plainCandidate) return '';

  if (message?.role === 'user' && !/[.*]/.test(message.content || '')) {
    const loweredPlain = plainCandidate.toLowerCase();
    const carriesSceneFact = Boolean(extractLocativePhrase(plainCandidate, 110))
      || CONTINUITY_KEYWORDS.some((keyword) => loweredPlain.includes(keyword));
    if (!carriesSceneFact) {
      return '';
    }
  }

  return trimPromptSnippet(plainCandidate, maxLength);
}

function collectContinuityFacts(history, excludedTurns = []) {
  const facts = [];
  const seen = new Set(
    excludedTurns
      .map((turn) => normalizeWhitespace(turn).toLowerCase())
      .filter(Boolean)
  );
  const recentHistory = history.slice(-8);

  for (let index = recentHistory.length - 1; index >= 0; index -= 1) {
    const message = recentHistory[index];
    const sentenceCandidates = splitSentences(message.content);
    const candidates = sentenceCandidates.length > 0
      ? sentenceCandidates
      : [trimPromptSnippet(message.content, 130)];

    for (const candidate of candidates) {
      if (scoreContinuitySentence(candidate) < 3) continue;

      const fact = extractContinuityFact(message, candidate, 110);
      if (!fact) continue;

      const normalized = normalizeWhitespace(fact).toLowerCase();
      if (seen.has(normalized)) continue;

      seen.add(normalized);
      facts.push(fact);
      if (facts.length >= 3) {
        return facts;
      }
    }
  }

  return facts;
}

function containsAnatomy(text) {
  const tokens = String(text || '').toLowerCase().split(/[^a-z]+/).filter(Boolean);
  return tokens.some((token) => ANATOMY_WORDS.has(token));
}

function extractAssistantOpenThread(latestAssistantTurn) {
  const latestAssistant = String(latestAssistantTurn || '').trim();
  if (!latestAssistant) return '';

  const plainAssistant = stripActionBlocks(latestAssistant);

  const assistantQuestion = plainAssistant.match(/[^.?!]*\?/g);
  if (assistantQuestion?.length > 0) {
    return trimPromptSnippet(assistantQuestion[assistantQuestion.length - 1], 160);
  }

  const expectationPattern = /\b(?:await(?:ing)?|wait(?:ing)?|approval|acknowledg(?:e|ment)|guidance|instruction|response|answer|permission|decision|choice|expect(?:ing|ant|antly)?|be gentle|keep going|don'?t stop)\b/i;
  const directivePattern = /^(?:sit|stand|come|stay|close|open|take|give|show|tell|look|listen|wait|follow|go|keep|hold|bring|move|step|speak|answer|focus|read|watch|leave|stop|start|continue|join|meet|let'?s)\b/i;
  const trailingAction = latestAssistant.match(/\*([^*]+)\*\s*$/);
  if (trailingAction?.[1] && expectationPattern.test(trailingAction[1]) && !containsAnatomy(trailingAction[1])) {
    return trimPromptSnippet(cleanSceneMemoryLine(trailingAction[1], 160), 160);
  }

  const tailSnippet = plainAssistant.slice(-220).replace(/\s+/g, ' ').trim();
  const tailSentences = splitSentences(tailSnippet);
  for (let index = tailSentences.length - 1; index >= 0; index -= 1) {
    const sentence = cleanSceneMemoryLine(tailSentences[index], 160);
    if (containsAnatomy(sentence)) continue;
    if (expectationPattern.test(sentence)) {
      return trimPromptSnippet(sentence, 160);
    }
    if (directivePattern.test(sentence)) {
      const previousSentence = index > 0 ? cleanSceneMemoryLine(tailSentences[index - 1], 160) : '';
      if (previousSentence && directivePattern.test(previousSentence)) {
        return trimPromptSnippet(`${previousSentence} ${sentence}`, 160);
      }
      return trimPromptSnippet(sentence, 160);
    }
    const previousSentence = index > 0 ? cleanSceneMemoryLine(tailSentences[index - 1], 160) : '';
    if (previousSentence && directivePattern.test(previousSentence) && sentence.length <= 80) {
      return trimPromptSnippet(`${previousSentence} ${sentence}`, 160);
    }
  }

  const sentences = splitSentences(plainAssistant);
  for (let index = sentences.length - 1; index >= 0; index -= 1) {
    const sentence = cleanSceneMemoryLine(sentences[index], 160);
    if (containsAnatomy(sentence)) continue;
    if (expectationPattern.test(sentence)) {
      return trimPromptSnippet(sentence, 160);
    }
    if (directivePattern.test(sentence)) {
      const previousSentence = index > 0 ? cleanSceneMemoryLine(sentences[index - 1], 160) : '';
      if (previousSentence && directivePattern.test(previousSentence)) {
        return trimPromptSnippet(`${previousSentence} ${sentence}`, 160);
      }
      return trimPromptSnippet(sentence, 160);
    }
    const previousSentence = index > 0 ? cleanSceneMemoryLine(sentences[index - 1], 160) : '';
    if (previousSentence && directivePattern.test(previousSentence) && sentence.length <= 80) {
      return trimPromptSnippet(`${previousSentence} ${sentence}`, 160);
    }
  }

  return '';
}

function deriveOpenThread(latestUserTurn, latestAssistantTurn, lastTurnRole = '') {
  const latestUser = String(latestUserTurn || '').trim();
  const assistantCue = extractAssistantOpenThread(latestAssistantTurn);

  if (lastTurnRole === 'assistant' && assistantCue) {
    return assistantCue;
  }

  if (/\?$/.test(latestUser)) {
    return trimPromptSnippet(latestUser, 160);
  }

  const explicitRequest = latestUser.match(/(?:please|can you|could you|do|let|show|tell|stay|come|kiss|touch|take|hold)\b[\s\S]*/i);
  if (explicitRequest) {
    return trimPromptSnippet(explicitRequest[0], 160);
  }

  if (assistantCue) {
    return assistantCue;
  }

  return '';
}

function derivePersistentOpenThread(latestUserTurn, latestAssistantTurn) {
  const latestUser = String(latestUserTurn || '').trim();
  const assistantCue = extractAssistantOpenThread(latestAssistantTurn);

  if (assistantCue) {
    return sanitizeSceneMemoryLine(assistantCue, 96);
  }

  if (/\?$/.test(latestUser)) {
    return sanitizeSceneMemoryLine(latestUser, 96);
  }

  const explicitRequest = latestUser.match(/(?:please|can you|could you|do|let|show|tell|stay|come|kiss|touch|take|hold|keep|follow)\b[\s\S]*/i);
  if (explicitRequest) {
    return sanitizeSceneMemoryLine(explicitRequest[0], 96);
  }

  return '';
}

function deriveScopeFromText(sourceText, sourceRole = 'user') {
  const normalized = normalizeWhitespace(String(sourceText || '').trim());
  if (!normalized) {
    return {
      level: 'same_beat',
      source_role: sourceRole,
      anchor: '',
      guidance: ''
    };
  }

  const broadDirection = /\b(?:let'?s|we(?:'ll)?|start|begin|go|head|move|lead|take|bring|there|here|inside|outside|upstairs|downstairs|first)\b/i.test(normalized);
  const broadArea = /\b(?:drawing room|living room|room|hall|parlou?r|study|library|kitchen|bedroom|bathroom|office|garden|balcony|hallway|stairs?|wing|floor|area|section|deck)\b/i.test(normalized);
  const specificObject = /\b(?:window|door|chair|table|desk|bed|mirror|curtain|piano|mantelpiece|sofa|cloth|pane|frame|shelf|shelves|counter|register|patio|deck seven|deck 7|diagnostic|diagnostics|life-support|life support|layout|scan|schematic)\b/i.test(normalized);
  const taskVerb = /\b(?:show|demonstrate|explain|walk me through|inspect|check|look at|clean|wipe|fold|polish|buff|wash|arrange|dust|review|scan|summarize|answer|decide|choose|pull up)\b/i.test(normalized);
  const genericTaskOnly = /\b(?:inspect|check|review|look over|look around|assess|evaluate)\b/i.test(normalized) && !specificObject;

  if (broadDirection && broadArea && !specificObject && !taskVerb) {
    return {
      level: 'broad_area_selection',
      source_role: sourceRole,
      anchor: trimPromptSnippet(normalized, 120),
      guidance: 'Stay at the same area-selection level. Confirm, proceed, or choose where to begin there without inventing a narrower object or micro-task.'
    };
  }

  if (genericTaskOnly) {
    return {
      level: 'generic_task',
      source_role: sourceRole,
      anchor: trimPromptSnippet(normalized, 120),
      guidance: 'Keep the task generic. Do not invent what is being inspected, checked, or reviewed unless the exchange already named it.'
    };
  }

  if (taskVerb || specificObject) {
    return {
      level: 'concrete_task',
      source_role: sourceRole,
      anchor: trimPromptSnippet(normalized, 120),
      guidance: 'Stay on the named task, object, or step and carry that forward directly.'
    };
  }

  if (/\?$/.test(normalized)) {
    return {
      level: 'question',
      source_role: sourceRole,
      anchor: trimPromptSnippet(normalized, 120),
      guidance: 'Answer the whole question directly before opening a different thread.'
    };
  }

  return {
    level: 'same_beat',
    source_role: sourceRole,
    anchor: trimPromptSnippet(normalized, 120),
    guidance: 'Stay on the full latest beat instead of narrowing or widening it on your own.'
  };
}

function deriveTurnScope(latestUserTurn, latestAssistantTurn, lastTurnRole = '') {
  const latestUser = normalizeWhitespace(String(latestUserTurn || '').trim());
  const assistantCue = normalizeWhitespace(extractAssistantOpenThread(latestAssistantTurn));
  if (lastTurnRole === 'assistant' && assistantCue) {
    return {
      level: 'response_cue',
      source_role: 'assistant',
      anchor: trimPromptSnippet(assistantCue, 120),
      guidance: 'Answer or acknowledge this exact cue before switching focus.'
    };
  }

  return deriveScopeFromText(latestUser, 'user');
}

function deriveSceneState({ compiledRuntimeCard, history, charName, userName, sceneMemory = null }) {
  const latestUserTurn = findLatestTurn(history, 'user');
  const latestAssistantTurn = findLatestTurn(history, 'assistant');
  const latestRole = findLatestRole(history);
  const settingAnchor = deriveSettingAnchor(history, compiledRuntimeCard.sceneSeed || '', sceneMemory);
  const relationshipAnchor = deriveRelationshipAnchor(history, compiledRuntimeCard, sceneMemory);
  const continuityFacts = collectContinuityFacts(
    history,
    [latestAssistantTurn, latestUserTurn]
  );
  const continuityFromMemory = continuityFacts.length > 0
    ? continuityFacts
    : trimSceneMemoryFacts(sceneMemory?.continuity_facts || []);
  const openThread = deriveOpenThread(latestUserTurn, latestAssistantTurn, latestRole);
  const turnScope = deriveTurnScope(latestUserTurn, latestAssistantTurn, latestRole);
  const userTurnScope = deriveScopeFromText(latestUserTurn, 'user');

  const wardrobe = Array.isArray(sceneMemory?.wardrobe) ? sceneMemory.wardrobe : [];
  const bodyState = Array.isArray(sceneMemory?.bodyState) ? sceneMemory.bodyState : [];
  const establishedFacts = Array.isArray(sceneMemory?.establishedFacts) ? sceneMemory.establishedFacts : [];
  const mentionedItems = Array.isArray(sceneMemory?.mentionedItems) ? sceneMemory.mentionedItems : [];

  return {
    setting_anchor: settingAnchor.value,
    relationship_anchor: relationshipAnchor.value,
    continuity_facts: continuityFromMemory,
    current_exchange: {
      latest_character_action_or_reaction: trimPromptSnippet(latestAssistantTurn, 170),
      latest_user_action_or_request: trimPromptSnippet(latestUserTurn, 160)
    },
    user_turn_scope: userTurnScope,
    turn_scope: turnScope,
    last_turn_role: latestRole,
    open_thread: openThread || sanitizeSceneMemoryLine(sceneMemory?.open_thread, 96) || '',
    wardrobe,
    bodyState,
    establishedFacts,
    mentionedItems,
    debug: {
      settingSource: settingAnchor.source,
      relationshipSource: relationshipAnchor.source,
      memoryApplied: Boolean(sceneMemory)
    }
  };
}

function buildActiveScene(sceneState) {
  const continuity = sceneState.continuity_facts.join(' | ');
  const normalizedSetting = normalizeWhitespace(sceneState.setting_anchor).toLowerCase();
  const normalizedContinuity = normalizeWhitespace(continuity).toLowerCase();
  const distinctContinuity = normalizedContinuity && normalizedContinuity !== normalizedSetting
    ? continuity
    : '';
  const immediateSituation = distinctContinuity
    || (sceneState.last_turn_role === 'assistant'
      ? (
        sceneState.open_thread
        || sceneState.current_exchange.latest_character_action_or_reaction
        || sceneState.current_exchange.latest_user_action_or_request
      )
      : (
        sceneState.current_exchange.latest_user_action_or_request
        || sceneState.open_thread
        || sceneState.current_exchange.latest_character_action_or_reaction
      ))
    || sceneState.setting_anchor;

  return {
    location_or_setting: sceneState.setting_anchor,
    immediate_situation: trimPromptSnippet(immediateSituation, 140),
    relationship_state: sceneState.relationship_anchor,
    continuity: trimPromptSnippet(distinctContinuity, 170),
    latest_character_action_or_reaction: sceneState.current_exchange.latest_character_action_or_reaction,
    latest_user_action_or_request: sceneState.current_exchange.latest_user_action_or_request,
    user_turn_scope_level: sceneState.user_turn_scope?.level || 'same_beat',
    user_turn_scope_anchor: sceneState.user_turn_scope?.anchor || '',
    user_turn_scope_guidance: sceneState.user_turn_scope?.guidance || '',
    turn_scope_level: sceneState.turn_scope?.level || 'same_beat',
    turn_scope_anchor: sceneState.turn_scope?.anchor || '',
    turn_scope_guidance: sceneState.turn_scope?.guidance || '',
    open_thread: sceneState.open_thread,
    wardrobe: Array.isArray(sceneState.wardrobe) ? sceneState.wardrobe : [],
    body_state: Array.isArray(sceneState.bodyState) ? sceneState.bodyState : [],
    established_facts: Array.isArray(sceneState.establishedFacts) ? sceneState.establishedFacts : [],
    mentioned_items: Array.isArray(sceneState.mentionedItems) ? sceneState.mentionedItems : []
  };
}

function shouldUseExampleSeed({ history, compiledRuntimeCard, profile, assistMode }) {
  if (!compiledRuntimeCard.exampleSeed || profile !== 'reply') return false;

  const assistantTurns = history.filter((message) => message.role === 'assistant');
  const recentAssistantText = assistantTurns.slice(-2).map((message) => message.content).join('\n');
  const coldChat = assistantTurns.length <= 1;
  const sparseCadenceEvidence = recentAssistantText.replace(/\s+/g, ' ').trim().length < 320;
  const stillFormingVoice = assistantTurns.length <= 4;

  if (compiledRuntimeCard.runtimeDefaults.type === 'bot') {
    return assistantTurns.length === 0 && compiledRuntimeCard.runtimeDefaults.voiceDependsOnExamples;
  }

  if (assistMode === 'nsfw_only') return true;

  return coldChat || stillFormingVoice || compiledRuntimeCard.runtimeDefaults.voiceDependsOnExamples || sparseCadenceEvidence;
}

const SUBJECT_PRONOUNS = new Set(['i', 'you', 'he', 'she', 'we', 'they', 'it', 'his', 'her', 'their', 'my', 'your', 'our']);
const STRUCTURAL_SCORE_MARGIN = 2;

function stripLeadingActionsAndQuotes(sentence) {
  let remaining = String(sentence || '').trim();
  while (remaining.length > 0) {
    const before = remaining;
    remaining = remaining.replace(/^\*[^*]*\*\s*/, '');
    remaining = remaining.replace(/^["“”'']+/, '').trim();
    if (remaining === before) break;
  }
  return remaining;
}

function startsWithImperativeMood(sentence) {
  const stripped = stripLeadingActionsAndQuotes(sentence);
  if (!stripped) return false;
  const firstWordMatch = stripped.match(/^([A-Za-z]+)\b/);
  if (!firstWordMatch) return false;
  const firstWord = firstWordMatch[1].toLowerCase();
  if (SUBJECT_PRONOUNS.has(firstWord)) return false;
  return true;
}

function scoreCharacterResponseStructure(characterResponse) {
  const text = String(characterResponse || '').trim();
  if (!text) return 0;

  const sentences = splitSentences(text).filter(Boolean);
  if (sentences.length === 0) return 0;

  const wordCounts = sentences.map((sentence) => sentence.replace(/[*"]/g, ' ').trim().split(/\s+/).filter(Boolean).length);
  const totalWords = wordCounts.reduce((sum, count) => sum + count, 0);
  const avgSentenceLength = totalWords / sentences.length;

  let score = 0;

  if (avgSentenceLength < 12) score += 2;
  if (avgSentenceLength < 8) score += 1;

  const fragmentMarkers = (text.match(/—|\.\.\.|…/g) || []).length;
  if (fragmentMarkers >= 2) score += 1;
  if (fragmentMarkers >= 4) score += 1;

  const hasInterleavedAsteriskActionsAndQuotes = /\*[^*]+\*[^*"]*"[^"]+"/.test(text) || /"[^"]+"[^*"]*\*[^*]+\*/.test(text);
  if (hasInterleavedAsteriskActionsAndQuotes) score += 2;

  const imperativeCount = sentences.reduce((count, sentence) => count + (startsWithImperativeMood(sentence) ? 1 : 0), 0);
  if (imperativeCount >= 1) score += 1;
  if (imperativeCount >= 2) score += 1;

  return score;
}

function formatExamplePair(entry) {
  const userLine = String(entry?.user || '').trim();
  const assistantLine = String(entry?.character || '').trim();
  if (!userLine || !assistantLine) return '';
  return `{{user}}: ${userLine}\n{{char}}: ${assistantLine}`;
}

function pickExampleDialogue(exampleDialogues, assistMode) {
  if (!Array.isArray(exampleDialogues) || exampleDialogues.length === 0) return null;
  if (assistMode !== 'nsfw_only') return null;

  const scored = exampleDialogues
    .map((entry) => ({ entry, formatted: formatExamplePair(entry), score: scoreCharacterResponseStructure(entry?.character) }))
    .filter((candidate) => candidate.formatted);

  if (scored.length === 0) return null;

  const sortedByScore = [...scored].sort((left, right) => right.score - left.score);
  const top = sortedByScore[0];
  const second = sortedByScore[1];

  if (!second || top.score - second.score >= STRUCTURAL_SCORE_MARGIN) {
    return top.formatted;
  }

  return null;
}

function calculateHistoryBudget(totalBudget, profile) {
  const historyShare = PROFILE_HISTORY_SHARE[profile] || PROFILE_HISTORY_SHARE.reply;
  const nonHistoryReserve = PROFILE_NON_HISTORY_RESERVE[profile] || PROFILE_NON_HISTORY_RESERVE.reply;
  const sharedBudget = Math.floor(totalBudget * historyShare);
  const reservedBudget = totalBudget - nonHistoryReserve;
  return Math.max(180, Math.min(sharedBudget, reservedBudget));
}

const VOICE_PIN_FALLBACK = "Stay in {{char}}'s established voice and mannerisms across all scene types, including intimate moments. Reuse the speech patterns and physical reactions visible in earlier turns rather than shifting into generic intimate-scene prose.";

function resolveVoicePin({ character, charName, assistMode }) {
  const defaultPin = String(character?.voicePin || '').trim();
  const nsfwPin = String(character?.voicePinNsfw || '').trim();
  const avoid = String(character?.voiceAvoid || '').trim();

  if (assistMode === 'nsfw_only' && nsfwPin) {
    return { pin: nsfwPin, avoid, source: 'voicePinNsfw' };
  }

  if (defaultPin) {
    return { pin: defaultPin, avoid, source: 'voicePin' };
  }

  return {
    pin: VOICE_PIN_FALLBACK.replace(/\{\{char\}\}/g, charName || 'the character'),
    avoid: '',
    source: 'fallback'
  };
}

export function buildRuntimeState({ character, history, userName = 'User', runtimeSteering = {} }) {
  const charName = String(character?.name || 'Character').trim() || 'Character';
  const totalBudget = Math.max(320, runtimeSteering.availableContextTokens || 2048);
  const profile = runtimeSteering.profile || 'reply';
  const normalizedHistory = normalizeHistory(history);
  const validatedSceneMemory = validateSceneMemory(runtimeSteering.persistedSceneMemory, history);
  const carriedArcAnchor = sanitizeSceneMemoryLine(runtimeSteering.persistedSceneMemory?.nsfwArcAnchor, 96);
  const sceneMemoryForDerivation = carriedArcAnchor
    ? { ...(validatedSceneMemory || {}), nsfwArcAnchor: carriedArcAnchor }
    : validatedSceneMemory;
  const compiledRuntimeCard = resolveRuntimeCardTemplates(compileCharacterRuntimeCard(character), charName, userName);
  const historyBudget = calculateHistoryBudget(totalBudget, profile);
  const selectedRecentHistory = selectRecentHistory(normalizedHistory, historyBudget);
  const sceneHistory = selectedRecentHistory.messages.map((message) => ({
    role: message.role,
    content: message.content
  }));
  const sceneState = deriveSceneState({
    compiledRuntimeCard,
    history: sceneHistory,
    charName,
    userName,
    sceneMemory: sceneMemoryForDerivation
  });
  const activeScene = buildActiveScene(sceneState);
  const assistMode = deriveAssistMode({
    character,
    runtimeSteering,
    activeScene,
    sceneState,
    history: sceneHistory,
    persistedSceneMemory: validatedSceneMemory
  });

  const voicePinResolution = resolveVoicePin({
    character,
    charName,
    assistMode: assistMode.value
  });

  const intimateExamplePick = pickExampleDialogue(character?.exampleDialogues, assistMode.value);
  if (intimateExamplePick) {
    compiledRuntimeCard.exampleSeed = resolveTemplates(intimateExamplePick, charName, userName);
  }

  return {
    compiledRuntimeCard,
    sceneState,
    activeScene,
    assistMode: assistMode.value,
    assistModeDebug: assistMode.debug,
    persistedSceneMemory: validatedSceneMemory,
    selectedRecentHistory,
    runtimeSteering,
    userName,
    characterName: charName,
    exampleEligibility: shouldUseExampleSeed({
      history: normalizedHistory,
      compiledRuntimeCard,
      profile,
      assistMode: assistMode.value
    }),
    voicePinResolution
  };
}

/**
 * Closed grammatical class of clothing-shape head-nouns. NOT a wardrobe whitelist —
 * these are the structural tail markers used by the wardrobe extractor to know when a
 * captured noun-phrase actually names a garment. Expanding this is acceptable; broad
 * vocabulary scraping is not.
 */
const CLOTHING_HEAD_PATTERN = /(dress|shirt|blouse|skirt|pants|trousers|shorts|jeans|coat|jacket|gown|robe|uniform|apron|stockings|socks|shoes|boots|heels|panties|thong|bra|hat|scarf|tie|belt|gloves?|glove|veil|mask|sash|cloak|cape|sweater|hoodie|leggings|tights|underwear|lingerie|bikini|swimsuit|nightgown|chemise|corset|bodice|negligee|kimono|dressing\s+gown|nightie|top|camisole|tank)/;
const CLOTHING_HEAD_EXACT_PATTERN = /^(?:dress|shirt|blouse|skirt|pants|trousers|shorts|jeans|coat|jacket|gown|robe|uniform|apron|stockings|socks|shoes|boots|heels|panties|thong|bra|hat|scarf|tie|belt|gloves?|glove|veil|mask|sash|cloak|cape|sweater|hoodie|leggings|tights|underwear|lingerie|bikini|swimsuit|nightgown|chemise|corset|bodice|negligee|kimono|nightie|top|camisole|tank)$/;
const WARDROBE_TAIL_PHRASE = /(?:^|\s)(?:a|an|her|his|their|the|my|your)\s+([a-z][\w-]*(?:\s+[a-z][\w-]*){0,3})/gi;

function tokenizeWords(text) {
  return String(text || '').toLowerCase().split(/[^a-z]+/).filter(Boolean);
}

function isAnatomyHead(phrase) {
  const tokens = tokenizeWords(phrase);
  if (tokens.length === 0) return false;
  return ANATOMY_WORDS.has(tokens[tokens.length - 1]);
}

function isAbstractHead(phrase) {
  const tokens = tokenizeWords(phrase);
  if (tokens.length === 0) return false;
  return ABSTRACT_NOUN_WORDS.has(tokens[tokens.length - 1]);
}

function normalizeWardrobePhrase(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function trimToClothingHead(phrase) {
  const tokens = String(phrase || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '';
  for (let index = 0; index < tokens.length; index += 1) {
    if (CLOTHING_HEAD_EXACT_PATTERN.test(tokens[index])) {
      return tokens.slice(0, index + 1).join(' ');
    }
  }
  return '';
}

function extractWardrobeFromText(text) {
  const source = String(text || '').replace(/[*"]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!source) return [];
  const found = [];
  const seen = new Set();

  const collect = (phrase) => {
    const head = trimToClothingHead(phrase);
    if (!head) return;
    if (isAnatomyHead(head)) return;
    if (isAbstractHead(head)) return;
    if (seen.has(head)) return;
    seen.add(head);
    found.push(head);
  };

  const tailRegex = /\b(?:wearing|dressed\s+in|clad\s+in)\s+(?:a|an|her|his|their|the|my|your)\s+([a-z][\w\s-]{2,40})/gi;
  let match;
  while ((match = tailRegex.exec(source)) !== null) {
    collect(match[1]);
  }

  const possessiveRegex = /\b(?:her|his|their|my|your)\s+([a-z][\w\s-]{2,40})/gi;
  while ((match = possessiveRegex.exec(source)) !== null) {
    collect(match[1]);
  }

  const conjunctionRegex = /\band\s+(?:a|an|her|his|their|the|my|your)?\s*([a-z][\w-]+(?:\s+[a-z][\w-]+){0,3})/gi;
  while ((match = conjunctionRegex.exec(source)) !== null) {
    collect(match[1]);
  }

  return found;
}

export function extractWardrobeMutations(text) {
  return extractWardrobeFromText(text);
}

/**
 * Extract clothing-removal head tokens from text. Mirrors extractWardrobeFromText
 * but for removal-shaped patterns. Returns last-token clothing heads (e.g. 'jeans')
 * suitable for last-token equality matching against accumulated wardrobe entries.
 */
function extractWardrobeRemovalsFromText(text) {
  const source = String(text || '').replace(/[*"]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!source) return [];
  const heads = [];
  const seen = new Set();

  const collectHead = (phrase) => {
    const trimmed = trimToClothingHead(phrase);
    if (!trimmed) return;
    if (isAnatomyHead(trimmed)) return;
    if (isAbstractHead(trimmed)) return;
    const tokens = trimmed.split(/\s+/).filter(Boolean);
    const head = tokens[tokens.length - 1];
    if (!head) return;
    if (seen.has(head)) return;
    seen.add(head);
    heads.push(head);
  };

  const trailingDirection = /\b(?:take|took|takes|taking|remove|removed|removes|removing|slip|slipped|slips|strip|stripped|strips|stripping|peel|peels?|peeled|tug|tugged|tugs|pull|pulled|pulls|pulling|drop|drops|dropped|dropping|toss|tosses|tossed|tossing|throw|throws|threw|throwing|tore|tears|tearing)\s+(?:her|his|their|my|your|the)\s+([a-z][\w\s-]{2,40}?)\s+(?:off|away|aside|down|out)\b/gi;
  let match;
  while ((match = trailingDirection.exec(source)) !== null) {
    collectHead(match[1]);
  }

  const leadingDirection = /\b(?:take|took|takes|taking|remove|removed|removes|removing|slip|slipped|slips|strip|stripped|strips|stripping|peel|peels?|peeled|tug|tugged|tugs|pull|pulled|pulls|pulling|drop|drops|dropped|dropping|toss|tosses|tossed|tossing|throw|throws|threw|throwing|tore|tears|tearing)\s+(?:off|away|aside|down|out)\s+(?:of\s+)?(?:a\s+|an\s+|her\s+|his\s+|their\s+|my\s+|your\s+|the\s+)?([a-z][\w\s-]{2,40})/gi;
  while ((match = leadingDirection.exec(source)) !== null) {
    collectHead(match[1]);
  }

  const slipsOutOf = /\bslips?\s+out\s+of\s+(?:a\s+|an\s+|her\s+|his\s+|their\s+|my\s+|your\s+|the\s+)?([a-z][\w\s-]{2,40})/gi;
  while ((match = slipsOutOf.exec(source)) !== null) {
    collectHead(match[1]);
  }

  const fallsToFloor = /\b(?:her|his|their|my|your|the)\s+([a-z][\w\s-]{2,40}?)\s+(?:slips?|fell|falls?|drops?|lands?|hits?)\s+(?:to|on|off)\s+(?:the\s+)?(?:floor|ground)/gi;
  while ((match = fallsToFloor.exec(source)) !== null) {
    collectHead(match[1]);
  }

  const noLonger = /\b(?:without|no\s+longer\s+wearing)\s+(?:a\s+|an\s+|her\s+|his\s+|their\s+|my\s+|your\s+|the\s+)?([a-z][\w\s-]{2,40})/gi;
  while ((match = noLonger.exec(source)) !== null) {
    collectHead(match[1]);
  }

  return heads;
}

export function extractWardrobeRemovals(text) {
  return extractWardrobeRemovalsFromText(text);
}

const BODY_STATE_ADD_VERBS = /^(?:tied|bound|stuffed|gagged|covered|blindfolded|chained|cuffed|lashed)$/i;
const BODY_STATE_REMOVE_VERBS = /^(?:untied|unbound|removed|uncovered|ungagged|unblindfolded|unchained|uncuffed)$/i;
const BODY_STATE_ADD_PATTERN = /\b(tied|bound|stuffed|gagged|covered|blindfolded|chained|cuffed|lashed)\s+(?:her|his|their|the|my|your)?\s*([a-z][\w\s-]{2,40})/gi;
const BODY_STATE_REMOVE_PATTERN = /\b(untied|unbound|removed|uncovered|ungagged|unblindfolded|unchained|uncuffed)\s+(?:her|his|their|the|my|your)?\s*([a-z][\w\s-]{2,40})/gi;
const POSITION_PATTERN = /(?:^|\b(?:she|he|they)\s+|\b(?:[A-Z][a-z]+)\s+)(kneeling|standing|sitting|lying|kneels|stands|sits|lies|bent\s+over|bends\s+over|on\s+(?:her|his|their)\s+(?:knees|hands\s+and\s+knees|back|stomach|side))\b(?!\s+(?:through|about|to)\b)/i;
const POSITION_REMOVE_VERB = /\b(?:rises|stands\s+up|gets\s+up|stood\s+up|rose)\b/i;
const INVERSE_VERB_MAP = {
  untied: 'tied',
  unbound: 'bound',
  removed: 'removed',
  uncovered: 'covered',
  ungagged: 'gagged',
  unblindfolded: 'blindfolded',
  unchained: 'chained',
  uncuffed: 'cuffed'
};

function trimBodyStateObject(raw) {
  const tokens = String(raw || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '';
  const stopAt = tokens.findIndex((token, index) => index > 0 && /^(?:and|but|then|so|while|with|to|behind|over|on|under|in|at|near|by)$/i.test(token));
  const trimmed = stopAt === -1 ? tokens : tokens.slice(0, stopAt + 1);
  if (trimmed.length === 0) return '';
  if (/^(?:and|but|then|so|while|with|to|behind|over|on|under|in|at|near|by)$/i.test(trimmed[trimmed.length - 1])) {
    trimmed.pop();
  }
  if (trimmed.length === 0) return '';
  if (!ANATOMY_WORDS.has(trimmed[trimmed.length - 1]) && trimmed.length > 1) {
    const last = trimmed[trimmed.length - 1];
    if (ABSTRACT_NOUN_WORDS.has(last)) return '';
  }
  return trimmed.join(' ');
}

function normalizePositionPhrase(raw) {
  const lowered = String(raw || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!lowered) return '';
  if (/^kneels?$|^kneeling$|^on\s+(?:her|his|their)\s+knees$/i.test(lowered)) return 'kneeling';
  if (/^stands?$|^standing$/i.test(lowered)) return 'standing';
  if (/^sits?$|^sitting$/i.test(lowered)) return 'sitting';
  if (/^lies$|^lying$/i.test(lowered)) return 'lying';
  if (/^bends?\s+over$|^bent\s+over$/i.test(lowered)) return 'bent over';
  if (/^on\s+(?:her|his|their)\s+hands\s+and\s+knees$/i.test(lowered)) return 'on hands and knees';
  if (/^on\s+(?:her|his|their)\s+back$/i.test(lowered)) return 'on back';
  if (/^on\s+(?:her|his|their)\s+stomach$/i.test(lowered)) return 'on stomach';
  if (/^on\s+(?:her|his|their)\s+side$/i.test(lowered)) return 'on side';
  return '';
}

export function extractBodyStateMutations(text, currentState = []) {
  const source = String(text || '').replace(/[*"]/g, ' ').replace(/\s+/g, ' ').trim();
  const state = Array.isArray(currentState) ? [...currentState] : [];
  if (!source) return state;

  const restraintEntries = state.filter((entry) => entry.startsWith('restraint:'));
  const positionEntries = state.filter((entry) => entry.startsWith('position:'));
  const otherEntries = state.filter((entry) => !entry.startsWith('restraint:') && !entry.startsWith('position:'));

  const restraintSet = new Set(restraintEntries.map((entry) => entry.slice('restraint:'.length).trim()));

  let match;
  BODY_STATE_REMOVE_PATTERN.lastIndex = 0;
  while ((match = BODY_STATE_REMOVE_PATTERN.exec(source)) !== null) {
    const verb = match[1].toLowerCase();
    if (!BODY_STATE_REMOVE_VERBS.test(verb)) continue;
    const obj = trimBodyStateObject(match[2]);
    if (!obj) continue;
    const inverseVerb = INVERSE_VERB_MAP[verb];
    if (!inverseVerb) continue;
    for (const entry of [...restraintSet]) {
      const lowered = entry.toLowerCase();
      if (!lowered.startsWith(`${inverseVerb} `)) continue;
      const objTokens = obj.split(/\s+/).filter(Boolean);
      const headToken = objTokens[objTokens.length - 1];
      if (!headToken) continue;
      if (lowered.includes(headToken)) {
        restraintSet.delete(entry);
      }
    }
  }

  BODY_STATE_ADD_PATTERN.lastIndex = 0;
  while ((match = BODY_STATE_ADD_PATTERN.exec(source)) !== null) {
    const verb = match[1].toLowerCase();
    if (!BODY_STATE_ADD_VERBS.test(verb)) continue;
    const obj = trimBodyStateObject(match[2]);
    if (!obj) continue;
    const phrase = `${verb} ${obj}`.trim();
    restraintSet.add(phrase);
  }

  let nextPosition = positionEntries.length > 0 ? positionEntries[0].slice('position:'.length).trim() : '';
  const positionMatch = source.match(POSITION_PATTERN);
  if (positionMatch?.[1]) {
    const normalized = normalizePositionPhrase(positionMatch[1]);
    if (normalized) {
      nextPosition = normalized;
    }
  }
  if (POSITION_REMOVE_VERB.test(source)) {
    nextPosition = '';
  }

  const out = [...otherEntries];
  if (nextPosition) {
    out.push(`position: ${nextPosition}`);
  }
  for (const entry of restraintSet) {
    out.push(`restraint: ${entry}`);
  }
  return out;
}

function accumulateBodyState(history, previousBodyState = []) {
  let state = Array.isArray(previousBodyState) ? [...previousBodyState] : [];
  for (const message of history || []) {
    if (message?.role !== 'user' && message?.role !== 'assistant') continue;
    state = extractBodyStateMutations(message.content, state);
  }
  const seen = new Set();
  const out = [];
  for (const entry of state) {
    const key = entry.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out.slice(0, SCENE_MEMORY_MAX_LIST_ENTRIES);
}

export function extractEstablishedFacts(text) {
  const source = String(text || '').replace(/[*"]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!source) return [];
  const found = [];
  const seen = new Set();

  const pushFact = (fact) => {
    const cleaned = fact.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!cleaned) return;
    if (seen.has(cleaned)) return;
    seen.add(cleaned);
    found.push(cleaned);
  };

  const neverParticiple = /\b(?:has\s+|have\s+|had\s+|is\s+|was\s+)?never\s+(?:been|had|done|tried|touched|kissed|fucked|tasted|seen|felt|met|spoken|talked|gone|gotten)\s+([a-z][\w\s'-]{2,50})/gi;
  let match;
  while ((match = neverParticiple.exec(source)) !== null) {
    const before = source.slice(Math.max(0, match.index - 40), match.index).toLowerCase();
    if (/\bdon'?t\s+say\s+/.test(before)) continue;
    const phrase = match[0].toLowerCase().replace(/^(?:has|have|had|is|was)\s+/, '').replace(/\s+/g, ' ').trim();
    pushFact(phrase);
  }

  const neverBefore = /\b(?:has\s+|have\s+|had\s+)?never\s+([a-z][\w\s'-]{2,40}?)\s+before\b/gi;
  while ((match = neverBefore.exec(source)) !== null) {
    const phrase = `never ${match[1]} before`.toLowerCase().replace(/\s+/g, ' ').trim();
    pushFact(phrase);
  }

  const firstTime = /\b(?:first\s+time|virgin\s+(?:to|in|here))\b[^.!?;]{0,80}/gi;
  while ((match = firstTime.exec(source)) !== null) {
    const phrase = match[0].toLowerCase().replace(/\s+/g, ' ').trim();
    pushFact(phrase);
  }

  return found;
}

function accumulateEstablishedFacts(history, previousFacts = []) {
  const seen = new Set();
  const out = [];
  for (const entry of previousFacts || []) {
    const key = String(entry || '').toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  for (const message of history || []) {
    if (message?.role !== 'user' && message?.role !== 'assistant') continue;
    const facts = extractEstablishedFacts(message.content);
    for (const fact of facts) {
      const key = fact.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(fact);
    }
  }
  return out.slice(0, SCENE_MEMORY_MAX_LIST_ENTRIES);
}

const PRONOUN_HEADS = new Set([
  'i', 'me', 'my', 'mine', 'myself',
  'you', 'your', 'yours', 'yourself',
  'he', 'him', 'his', 'himself',
  'she', 'her', 'hers', 'herself',
  'it', 'its', 'itself',
  'we', 'us', 'our', 'ours', 'ourselves',
  'they', 'them', 'their', 'theirs', 'themselves',
  'one', 'ones', 'someone', 'somebody', 'anyone', 'anybody', 'no one', 'nobody'
]);

export function extractMentionedItems(userMessageText) {
  const source = String(userMessageText || '').replace(/[*"]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!source) return [];
  const found = [];
  const seen = new Set();

  const npRegex = /\b(?:the|a|an|my|your|his|her|their|our)\s+([a-z][\w-]+(?:\s+[a-z][\w-]+){0,2})/gi;
  let match;
  while ((match = npRegex.exec(source)) !== null) {
    const phrase = match[1].toLowerCase().trim();
    if (!phrase) continue;
    const tokens = phrase.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const head = tokens[tokens.length - 1];
    if (PRONOUN_HEADS.has(head)) continue;
    if (ANATOMY_WORDS.has(head)) continue;
    if (ABSTRACT_NOUN_WORDS.has(head)) continue;
    if (head.length < 3) continue;
    if (seen.has(phrase)) continue;
    seen.add(phrase);
    found.push(phrase);
  }

  return found;
}

function accumulateMentionedItems(history, previousItems = []) {
  const seen = new Set();
  const out = [];
  for (const entry of previousItems || []) {
    const key = String(entry || '').toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  for (const message of history || []) {
    if (message?.role !== 'user') continue;
    const items = extractMentionedItems(message.content);
    for (const item of items) {
      const key = item.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out.slice(0, 16);
}

function accumulateWardrobe(history, previousWardrobe = []) {
  const seen = new Set();
  let entries = [];
  for (const entry of previousWardrobe || []) {
    const normalized = normalizeWardrobePhrase(entry);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    entries.push(entry);
  }

  const dropByHead = (head) => {
    if (!head) return;
    entries = entries.filter((entry) => {
      const tokens = normalizeWardrobePhrase(entry).split(/\s+/).filter(Boolean);
      const lastToken = tokens[tokens.length - 1] || '';
      if (lastToken === head) {
        seen.delete(normalizeWardrobePhrase(entry));
        return false;
      }
      return true;
    });
  };

  for (const message of history || []) {
    if (message?.role !== 'user' && message?.role !== 'assistant') continue;

    const removals = extractWardrobeRemovalsFromText(message.content);
    for (const head of removals) {
      dropByHead(head);
    }

    const phrases = extractWardrobeFromText(message.content);
    for (const phrase of phrases) {
      const normalized = normalizeWardrobePhrase(phrase);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      entries.push(phrase);
    }

    for (const head of removals) {
      dropByHead(head);
    }
  }
  return entries.slice(0, SCENE_MEMORY_MAX_LIST_ENTRIES);
}

/**
 * Builds the per-turn scene-memory snapshot. nsfwArcAnchor binds only to a continuous
 * nsfw_only arc — it is snapshotted on first nsfw_only entry, carried while the arc
 * holds, overridden by an explicit user location move, and cleared when assistMode
 * leaves nsfw_only.
 */
export function resolveSessionSceneMemory({ character, history, userName = 'User', previousSceneMemory = null }) {
  const normalizedHistory = Array.isArray(history) ? history : [];
  const validatedPrevious = validateSceneMemory(previousSceneMemory, normalizedHistory);
  const carryArcAnchor = sanitizeSceneMemoryLine(
    validatedPrevious?.nsfwArcAnchor || previousSceneMemory?.nsfwArcAnchor,
    96
  );
  const latestMessage = normalizedHistory[normalizedHistory.length - 1] || null;

  if (latestMessage?.role !== 'assistant') {
    return validatedPrevious;
  }

  const latestAssistantTimestamp = normalizeTimestampValue(latestMessage.timestamp);
  if (latestAssistantTimestamp === null) {
    return null;
  }

  const carriedSceneMemory = carryArcAnchor
    ? { ...(validatedPrevious || {}), nsfwArcAnchor: carryArcAnchor }
    : validatedPrevious;

  const runtimeState = buildRuntimeState({
    character,
    history: normalizedHistory,
    userName,
    runtimeSteering: {
      profile: 'reply',
      availableContextTokens: 8192,
      responseMode: 'normal',
      passionLevel: 0,
      unchainedMode: false,
      persistedSceneMemory: carriedSceneMemory
    }
  });

  const latestUserTurn = findLatestTurn(runtimeState.selectedRecentHistory.messages, 'user');
  const latestAssistantTurn = findLatestTurn(runtimeState.selectedRecentHistory.messages, 'assistant');

  const previousArcAnchor = carryArcAnchor;
  let nextArcAnchor = '';
  if (runtimeState.assistMode === 'nsfw_only') {
    if (previousArcAnchor) {
      const override = applyExplicitLocationOverride(latestUserTurn, previousArcAnchor);
      nextArcAnchor = override.overridden ? override.value : previousArcAnchor;
    } else {
      nextArcAnchor = runtimeState.sceneState.setting_anchor || '';
    }
  }

  const wardrobe = accumulateWardrobe(normalizedHistory, validatedPrevious?.wardrobe);

  const sceneMemory = trimSceneMemoryToBudget({
    setting_anchor: runtimeState.sceneState.setting_anchor,
    relationship_anchor: runtimeState.sceneState.relationship_anchor,
    continuity_facts: runtimeState.sceneState.continuity_facts,
    open_thread: derivePersistentOpenThread(latestUserTurn, latestAssistantTurn),
    nsfwArcAnchor: nextArcAnchor,
    wardrobe,
    bodyState: accumulateBodyState(normalizedHistory, validatedPrevious?.bodyState),
    establishedFacts: accumulateEstablishedFacts(normalizedHistory, validatedPrevious?.establishedFacts),
    mentionedItems: accumulateMentionedItems(normalizedHistory, validatedPrevious?.mentionedItems),
    source_assistant_timestamp: latestAssistantTimestamp,
    updated_at: new Date().toISOString(),
    version: SCENE_MEMORY_VERSION
  });

  return sceneMemory;
}

function joinList(list) {
  if (!Array.isArray(list) || list.length === 0) return '';
  return list.filter((entry) => String(entry || '').trim()).join(', ');
}

export function renderActiveScene(activeScene, { compact = false } = {}) {
  const wardrobeLine = joinList(activeScene.wardrobe);
  const bodyStateLine = joinList(activeScene.body_state);
  const establishedFactsLine = joinList(activeScene.established_facts);
  const mentionedItemsLine = joinList(activeScene.mentioned_items);

  const fields = compact
    ? [
        ['Setting', activeScene.location_or_setting],
        ['Situation', activeScene.immediate_situation],
        ['Wardrobe', wardrobeLine],
        ['Body state', bodyStateLine],
        ['Continuity', activeScene.continuity],
        ['Character Beat', activeScene.latest_character_action_or_reaction],
        ['User Beat', activeScene.latest_user_action_or_request],
        ['Open Thread', activeScene.open_thread]
      ]
    : [
        ['Setting', activeScene.location_or_setting],
        ['Situation', activeScene.immediate_situation],
        ['Wardrobe', wardrobeLine],
        ['Body state', bodyStateLine],
        ['Established facts', establishedFactsLine],
        ['Items established by user', mentionedItemsLine],
        ['Relationship', activeScene.relationship_state],
        ['Continuity', activeScene.continuity],
        ['Character Beat', activeScene.latest_character_action_or_reaction],
        ['User Beat', activeScene.latest_user_action_or_request],
        ['Open Thread', activeScene.open_thread]
      ];

  return fields
    .filter(([, value]) => Boolean(String(value || '').trim()))
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n');
}
