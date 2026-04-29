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

const SCENE_MEMORY_MAX_TOKENS = 120;
const SCENE_MEMORY_MAX_FACTS = 3;
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

const SETTING_KEYWORDS = [
  'room',
  'house',
  'estate',
  'apartment',
  'office',
  'bar',
  'cafe',
  'manor',
  'road',
  'hallway',
  'building',
  'doorway',
  'balcony',
  'street',
  'kitchen',
  'bed',
  'couch',
  'desk',
  'counter',
  'stool',
  'night',
  'evening',
  'morning'
];

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

function trimSceneMemoryToBudget(memory) {
  if (!memory) return null;

  const trimmed = {
    setting_anchor: sanitizeSceneMemoryLine(memory.setting_anchor, 96),
    relationship_anchor: sanitizeSceneMemoryLine(memory.relationship_anchor, 96),
    continuity_facts: trimSceneMemoryFacts(memory.continuity_facts),
    open_thread: sanitizeSceneMemoryLine(memory.open_thread, 96),
    source_assistant_timestamp: normalizeTimestampValue(memory.source_assistant_timestamp),
    updated_at: memory.updated_at || new Date().toISOString(),
    version: SCENE_MEMORY_VERSION
  };

  const contentTokenCount = () => estimateTokens([
    trimmed.setting_anchor,
    trimmed.relationship_anchor,
    ...(trimmed.continuity_facts || []),
    trimmed.open_thread
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

  if (contentTokenCount() > SCENE_MEMORY_MAX_TOKENS) {
    return null;
  }

  if (!trimmed.setting_anchor && !trimmed.relationship_anchor && trimmed.continuity_facts.length === 0 && !trimmed.open_thread) {
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

function deriveSettingAnchor(history, sceneSeed, sceneMemory) {
  const historyAnchor = pickRecentSentenceByKeywords(history, SETTING_KEYWORDS, 150);
  if (historyAnchor) {
    return { value: sanitizeSceneAnchor(historyAnchor, SETTING_KEYWORDS, 150), source: 'history' };
  }

  if (sceneMemory?.setting_anchor) {
    return { value: sanitizeSceneMemoryLine(sceneMemory.setting_anchor, 120), source: 'memory' };
  }

  const seedAnchor = pickSentenceByKeywords(sceneSeed, SETTING_KEYWORDS, 150) || trimPromptSnippet(sceneSeed, 150);
  if (seedAnchor) {
    return { value: sanitizeSceneAnchor(seedAnchor, SETTING_KEYWORDS, 150), source: 'seed' };
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
    const carriesSceneFact = SETTING_KEYWORDS.some((keyword) => loweredPlain.includes(keyword))
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

function extractAssistantOpenThread(latestAssistantTurn) {
  const latestAssistant = String(latestAssistantTurn || '').trim();
  if (!latestAssistant) return '';

  const assistantQuestion = latestAssistant.match(/[^.?!]*\?/g);
  if (assistantQuestion?.length > 0) {
    return trimPromptSnippet(assistantQuestion[assistantQuestion.length - 1], 160);
  }

  const expectationPattern = /\b(?:await(?:ing)?|wait(?:ing)?|approval|acknowledg(?:e|ment)|guidance|instruction|response|answer|permission|decision|choice|expect(?:ing|ant|antly)?|be gentle|keep going|don'?t stop)\b/i;
  const directivePattern = /^(?:sit|stand|come|stay|close|open|take|give|show|tell|look|listen|wait|follow|go|keep|hold|bring|move|step|speak|answer|focus|read|watch|leave|stop|start|continue|join|meet|let'?s)\b/i;
  const trailingAction = latestAssistant.match(/\*([^*]+)\*\s*$/);
  if (trailingAction?.[1] && expectationPattern.test(trailingAction[1])) {
    return trimPromptSnippet(cleanSceneMemoryLine(trailingAction[1], 160), 160);
  }

  const tailSnippet = latestAssistant.slice(-220).replace(/\s+/g, ' ').trim();
  const tailSentences = splitSentences(tailSnippet);
  for (let index = tailSentences.length - 1; index >= 0; index -= 1) {
    const sentence = cleanSceneMemoryLine(tailSentences[index], 160);
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

  const sentences = splitSentences(latestAssistant);
  for (let index = sentences.length - 1; index >= 0; index -= 1) {
    const sentence = cleanSceneMemoryLine(sentences[index], 160);
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
    open_thread: sceneState.open_thread
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
    sceneMemory: validatedSceneMemory
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

export function resolveSessionSceneMemory({ character, history, userName = 'User', previousSceneMemory = null }) {
  const normalizedHistory = Array.isArray(history) ? history : [];
  const validatedPrevious = validateSceneMemory(previousSceneMemory, normalizedHistory);
  const latestMessage = normalizedHistory[normalizedHistory.length - 1] || null;

  if (latestMessage?.role !== 'assistant') {
    return validatedPrevious;
  }

  const latestAssistantTimestamp = normalizeTimestampValue(latestMessage.timestamp);
  if (latestAssistantTimestamp === null) {
    return null;
  }

  const runtimeState = buildRuntimeState({
    character,
    history: normalizedHistory,
    userName,
    runtimeSteering: {
      profile: 'reply',
      availableContextTokens: 8192,
      responseMode: 'normal',
      passionLevel: 0,
      unchainedMode: false
    }
  });

  const latestUserTurn = findLatestTurn(runtimeState.selectedRecentHistory.messages, 'user');
  const latestAssistantTurn = findLatestTurn(runtimeState.selectedRecentHistory.messages, 'assistant');
  const sceneMemory = trimSceneMemoryToBudget({
    setting_anchor: runtimeState.sceneState.setting_anchor,
    relationship_anchor: runtimeState.sceneState.relationship_anchor,
    continuity_facts: runtimeState.sceneState.continuity_facts,
    open_thread: derivePersistentOpenThread(latestUserTurn, latestAssistantTurn),
    source_assistant_timestamp: latestAssistantTimestamp,
    updated_at: new Date().toISOString(),
    version: SCENE_MEMORY_VERSION
  });

  return sceneMemory;
}

export function renderActiveScene(activeScene, { compact = false } = {}) {
  const fields = compact
    ? [
        ['Setting', activeScene.location_or_setting],
        ['Situation', activeScene.immediate_situation],
        ['Continuity', activeScene.continuity],
        ['Character Beat', activeScene.latest_character_action_or_reaction],
        ['User Beat', activeScene.latest_user_action_or_request],
        ['Open Thread', activeScene.open_thread]
      ]
    : [
        ['Setting', activeScene.location_or_setting],
        ['Situation', activeScene.immediate_situation],
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
