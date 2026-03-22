import { compileCharacterRuntimeCard, resolveRuntimeCardTemplates } from './compiler.js';
import {
  compactHistoryText,
  estimateTokens,
  normalizeWhitespace,
  pickSentenceByKeywords,
  splitSentences,
  trimPromptSnippet,
  truncateMiddle
} from './text.js';

const PROFILE_HISTORY_SHARE = {
  reply: 0.58,
  suggestions: 0.42,
  impersonate: 0.36
};

const PROFILE_NON_HISTORY_CEILING = {
  reply: 750,
  suggestions: 360,
  impersonate: 300
};

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

function normalizeHistory(history) {
  return (history || [])
    .filter((message) => (message?.role === 'user' || message?.role === 'assistant') && typeof message?.content === 'string' && message.content.trim())
    .map((message) => ({ role: message.role, content: message.content }));
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

function deriveRecentSceneDigest(history, charName, userName) {
  const recentTail = history.slice(-4);
  return recentTail
    .map((message) => `${message.role === 'user' ? userName : charName}: ${compactHistoryText(message.content, 180)}`)
    .join(' | ');
}

function findLatestTurn(history, role) {
  return [...history].reverse().find((message) => message.role === role)?.content || '';
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

function deriveSettingAnchor(history, sceneSeed) {
  const historyAnchor = pickRecentSentenceByKeywords(history, SETTING_KEYWORDS, 150);
  if (historyAnchor) {
    return { value: historyAnchor, source: 'history' };
  }

  const seedAnchor = pickSentenceByKeywords(sceneSeed, SETTING_KEYWORDS, 150) || trimPromptSnippet(sceneSeed, 150);
  if (seedAnchor) {
    return { value: seedAnchor, source: 'seed' };
  }

  return { value: '', source: 'none' };
}

function deriveRelationshipAnchor(history, compiledRuntimeCard) {
  const historyAnchor = pickRecentSentenceByKeywords(history, RELATIONSHIP_KEYWORDS, 150);
  if (historyAnchor) {
    return { value: historyAnchor, source: 'history' };
  }

  const seedText = `${compiledRuntimeCard.sceneSeed || ''}\n${compiledRuntimeCard.characterCore || ''}`;
  const seedAnchor = pickSentenceByKeywords(seedText, RELATIONSHIP_KEYWORDS, 150) || trimPromptSnippet(compiledRuntimeCard.sceneSeed || '', 150);
  if (seedAnchor) {
    return { value: seedAnchor, source: 'seed' };
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

function collectContinuityFacts(history, charName, userName, recentSceneDigest, excludedTurns = []) {
  const facts = [];
  const seen = new Set(
    excludedTurns
      .map((turn) => normalizeWhitespace(turn).toLowerCase())
      .filter(Boolean)
  );
  const recentHistory = history.slice(-8);

  for (let index = recentHistory.length - 1; index >= 0; index -= 1) {
    const message = recentHistory[index];
    const speaker = message.role === 'user' ? userName : charName;
    const sentenceCandidates = splitSentences(message.content);
    const candidates = sentenceCandidates.length > 0
      ? sentenceCandidates
      : [trimPromptSnippet(message.content, 130)];

    for (const candidate of candidates) {
      const clipped = trimPromptSnippet(candidate, 130);
      if (!clipped) continue;

      const normalized = normalizeWhitespace(clipped).toLowerCase();
      if (seen.has(normalized)) continue;
      if (scoreContinuitySentence(clipped) < 3) continue;

      seen.add(normalized);
      facts.push(`${speaker}: ${clipped}`);
      if (facts.length >= 4) {
        return facts;
      }
    }
  }

  if (facts.length === 0 && recentSceneDigest) {
    facts.push(trimPromptSnippet(recentSceneDigest, 160));
  }

  return facts;
}

function deriveOpenThread(latestUserTurn, latestAssistantTurn) {
  const latestUser = String(latestUserTurn || '').trim();
  const latestAssistant = String(latestAssistantTurn || '').trim();

  if (/\?$/.test(latestUser)) {
    return trimPromptSnippet(latestUser, 160);
  }

  const explicitRequest = latestUser.match(/(?:please|can you|could you|do|let|show|tell|stay|come|kiss|touch|take|hold)\b[\s\S]*/i);
  if (explicitRequest) {
    return trimPromptSnippet(explicitRequest[0], 160);
  }

  const assistantQuestion = latestAssistant.match(/[^.?!]*\?/g);
  if (assistantQuestion && assistantQuestion.length > 0) {
    return trimPromptSnippet(assistantQuestion[assistantQuestion.length - 1], 160);
  }

  return 'Continue the current beat without resetting the scene.';
}

function deriveSceneState({ compiledRuntimeCard, history, charName, userName }) {
  const latestUserTurn = findLatestTurn(history, 'user');
  const latestAssistantTurn = findLatestTurn(history, 'assistant');
  const recentSceneDigest = deriveRecentSceneDigest(history, charName, userName);
  const settingAnchor = deriveSettingAnchor(history, compiledRuntimeCard.sceneSeed || '');
  const relationshipAnchor = deriveRelationshipAnchor(history, compiledRuntimeCard);
  const continuityFacts = collectContinuityFacts(
    history,
    charName,
    userName,
    recentSceneDigest,
    [latestAssistantTurn, latestUserTurn]
  );

  return {
    setting_anchor: settingAnchor.value,
    relationship_anchor: relationshipAnchor.value,
    continuity_facts: continuityFacts,
    current_exchange: {
      latest_character_action_or_reaction: trimPromptSnippet(latestAssistantTurn, 170),
      latest_user_action_or_request: trimPromptSnippet(latestUserTurn, 160)
    },
    open_thread: deriveOpenThread(latestUserTurn, latestAssistantTurn),
    debug: {
      settingSource: settingAnchor.source,
      relationshipSource: relationshipAnchor.source
    }
  };
}

function buildActiveScene(sceneState, recentSceneDigest = '') {
  const continuity = sceneState.continuity_facts.join(' | ');
  const immediateSituation = continuity || recentSceneDigest || sceneState.setting_anchor || sceneState.open_thread;

  return {
    location_or_setting: sceneState.setting_anchor,
    immediate_situation: trimPromptSnippet(immediateSituation, 180),
    relationship_state: sceneState.relationship_anchor,
    continuity: trimPromptSnippet(continuity, 220),
    latest_character_action_or_reaction: sceneState.current_exchange.latest_character_action_or_reaction,
    latest_user_action_or_request: sceneState.current_exchange.latest_user_action_or_request,
    open_thread: sceneState.open_thread
  };
}

function shouldUseExampleSeed({ history, compiledRuntimeCard, profile }) {
  if (!compiledRuntimeCard.exampleSeed || profile !== 'reply') return false;

  const assistantTurns = history.filter((message) => message.role === 'assistant');
  const recentAssistantText = assistantTurns.slice(-2).map((message) => message.content).join('\n');
  const coldChat = assistantTurns.length <= 1;
  const sparseCadenceEvidence = recentAssistantText.replace(/\s+/g, ' ').trim().length < 220;

  if (compiledRuntimeCard.runtimeDefaults.type === 'bot') {
    return assistantTurns.length === 0 && compiledRuntimeCard.runtimeDefaults.voiceDependsOnExamples;
  }

  return coldChat || compiledRuntimeCard.runtimeDefaults.voiceDependsOnExamples || sparseCadenceEvidence;
}

function calculateHistoryBudget(totalBudget, profile) {
  const historyShare = PROFILE_HISTORY_SHARE[profile] || PROFILE_HISTORY_SHARE.reply;
  const nonHistoryCeiling = PROFILE_NON_HISTORY_CEILING[profile] || PROFILE_NON_HISTORY_CEILING.reply;
  const sharedBudget = Math.floor(totalBudget * historyShare);
  return Math.max(180, Math.max(sharedBudget, totalBudget - nonHistoryCeiling));
}

export function buildRuntimeState({ character, history, userName = 'User', runtimeSteering = {} }) {
  const charName = String(character?.name || 'Character').trim() || 'Character';
  const totalBudget = Math.max(320, runtimeSteering.availableContextTokens || 2048);
  const profile = runtimeSteering.profile || 'reply';
  const normalizedHistory = normalizeHistory(history);
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
    userName
  });
  const activeScene = buildActiveScene(sceneState, deriveRecentSceneDigest(sceneHistory, charName, userName));

  return {
    compiledRuntimeCard,
    sceneState,
    activeScene,
    selectedRecentHistory,
    runtimeSteering,
    userName,
    characterName: charName,
    exampleEligibility: shouldUseExampleSeed({
      history: normalizedHistory,
      compiledRuntimeCard,
      profile
    })
  };
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
