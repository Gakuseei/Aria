import { compileCharacterRuntimeCard, resolveRuntimeCardTemplates } from './compiler.js';
import { compactHistoryText, estimateTokens, pickSentenceByKeywords, trimPromptSnippet, truncateMiddle } from './text.js';

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

function deriveActiveScene({ compiledRuntimeCard, history, charName, userName }) {
  const latestUserTurn = [...history].reverse().find((message) => message.role === 'user')?.content || '';
  const latestAssistantTurn = [...history].reverse().find((message) => message.role === 'assistant')?.content || '';
  const recentSceneDigest = deriveRecentSceneDigest(history, charName, userName);
  const sceneSeed = compiledRuntimeCard.sceneSeed || '';
  const historyLocation = pickSentenceByKeywords(
    `${latestAssistantTurn}\n${latestUserTurn}`,
    ['in the', 'into the', 'onto the', 'inside', 'outside', 'hallway', 'balcony', 'bar', 'cafe', 'room', 'office', 'door', 'window', 'street'],
    150
  );

  return {
    location_or_setting: historyLocation || pickSentenceByKeywords(sceneSeed, ['room', 'house', 'estate', 'apartment', 'office', 'bar', 'cafe', 'manor', 'road', 'hallway', 'building', 'night', 'evening', 'morning'], 150) || trimPromptSnippet(sceneSeed, 150),
    immediate_situation: trimPromptSnippet(recentSceneDigest || sceneSeed || latestAssistantTurn || latestUserTurn, 170),
    relationship_state: pickSentenceByKeywords(`${sceneSeed}\n${compiledRuntimeCard.characterCore || ''}`, RELATIONSHIP_KEYWORDS, 150) || trimPromptSnippet(sceneSeed, 150),
    latest_character_action_or_reaction: trimPromptSnippet(latestAssistantTurn, 170),
    latest_user_action_or_request: trimPromptSnippet(latestUserTurn, 160),
    open_thread: deriveOpenThread(latestUserTurn, latestAssistantTurn)
  };
}

function shouldUseExampleSeed({ history, compiledRuntimeCard, profile }) {
  if (!compiledRuntimeCard.exampleSeed || profile !== 'reply') return false;

  const assistantTurns = history.filter((message) => message.role === 'assistant');
  const recentAssistantText = assistantTurns.slice(-2).map((message) => message.content).join('\n');
  const coldChat = assistantTurns.length <= 1;
  const sparseCadenceEvidence = recentAssistantText.replace(/\s+/g, ' ').trim().length < 220;

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
  const compiledRuntimeCard = resolveRuntimeCardTemplates(compileCharacterRuntimeCard(character), charName, userName);
  const historyBudget = calculateHistoryBudget(totalBudget, profile);
  const selectedRecentHistory = selectRecentHistory(history, historyBudget);
  const activeScene = deriveActiveScene({
    compiledRuntimeCard,
    history: normalizeHistory(history),
    charName,
    userName
  });

  return {
    compiledRuntimeCard,
    activeScene,
    selectedRecentHistory,
    runtimeSteering,
    userName,
    characterName: charName,
    exampleEligibility: shouldUseExampleSeed({
      history: normalizeHistory(history),
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
        ['Character Beat', activeScene.latest_character_action_or_reaction],
        ['User Beat', activeScene.latest_user_action_or_request],
        ['Open Thread', activeScene.open_thread]
      ]
    : [
        ['Setting', activeScene.location_or_setting],
        ['Situation', activeScene.immediate_situation],
        ['Relationship', activeScene.relationship_state],
        ['Character Beat', activeScene.latest_character_action_or_reaction],
        ['User Beat', activeScene.latest_user_action_or_request],
        ['Open Thread', activeScene.open_thread]
      ];

  return fields
    .filter(([, value]) => Boolean(String(value || '').trim()))
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n');
}
