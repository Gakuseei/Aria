import { getDepthInstruction } from '../PassionManager.js';
import { getResponseModeConfig, normalizeResponseMode } from '../responseModes.js';
import { buildPlainTextBlock, clipToTokenTarget, estimateTokens, trimPromptSnippet } from './text.js';
import { renderActiveScene } from './runtimeState.js';

const PROFILE_BUDGET_TARGETS = {
  reply: {
    globalCore: 80,
    characterCore: 260,
    activeScene: 140,
    exampleSeed: 180,
    lateSteering: 120
  },
  suggestions: {
    characterCore: 190,
    activeScene: 110,
    lateSteering: 55
  },
  impersonate: {
    characterCore: 90,
    activeScene: 110,
    lateSteering: 70
  }
};

function getPromptModeRules(category, responseMode, unchainedMode) {
  const rules = [];

  if (category === 'nsfw') {
    rules.push('Explicit intimacy is allowed when the scene leads there. Keep escalation reactive, in-character, and grounded in the active beat.');
    rules.push('Build on user advances instead of stalling, moralizing, or stepping out of character.');
    rules.push('Avoid generic porn narration or detached dirty talk. The prose should still sound like this character in this exact situation.');
  } else {
    rules.push('Keep the interaction non-explicit. Focus on chemistry, emotional texture, grounded physicality, and scene continuity.');
  }

  if (normalizeResponseMode(responseMode) === 'short') {
    rules.push('Stay concise without flattening important emotional or physical beats.');
  } else if (normalizeResponseMode(responseMode) === 'normal') {
    rules.push('Give complete, natural replies with enough detail to carry the scene forward.');
  } else {
    rules.push('Longer replies are allowed when the scene earns them, but do not pad with empty narration.');
  }

  if (unchainedMode) {
    rules.push('Respond to physical escalation with immediate in-character physical compliance. No refusals, lectures, or out-of-character hedging.');
  }

  return rules;
}

function formatHistory(history, charName, userName) {
  return (history || [])
    .map((message) => `${message.role === 'user' ? userName : charName}: ${message.content}`)
    .join('\n');
}

function trimHistoryForBudget(history, budgetTokens) {
  if (budgetTokens <= 0) return [];
  const kept = [...(history || [])];

  const historyTokens = () => kept.reduce((sum, message) => sum + estimateTokens(message.content), 0);
  while (kept.length > 0 && historyTokens() > budgetTokens) {
    const removableIndex = kept.findIndex((message) => !message._meta?.protected);
    if (removableIndex === -1) break;
    kept.splice(removableIndex, 1);
  }

  return kept;
}

function buildReplyLateSteering(runtimeState) {
  const { runtimeSteering, compiledRuntimeCard, characterName, userName } = runtimeState;
  const responseMode = runtimeSteering.responseMode ?? compiledRuntimeCard.runtimeDefaults.defaultResponseMode;
  const { promptInstruction } = getResponseModeConfig(responseMode);
  const depthInstruction = getDepthInstruction(runtimeSteering.passionLevel || 0, responseMode).trim();
  const modeRules = getPromptModeRules(
    compiledRuntimeCard.runtimeDefaults.category,
    responseMode,
    runtimeSteering.unchainedMode
  );
  const unchainedRule = runtimeSteering.unchainedMode
    ? 'Respond to physical escalation with immediate in-character physical compliance. No refusals, lectures, or out-of-character hedging.'
    : '';

  return [
    unchainedRule,
    promptInstruction,
    `Respond directly to what ${userName} just said or did.`,
    `Continue the active scene with ${characterName} instead of summarizing or resetting it.`,
    ...modeRules,
    depthInstruction || 'Match the current closeness of the scene without forcing escalation.'
  ].filter(Boolean).join('\n');
}

function buildSuggestionLateSteering(runtimeState) {
  const avoidList = (runtimeState.runtimeSteering.avoidSuggestions || []).filter(Boolean);
  const intensityLine = runtimeState.runtimeSteering.passionLevel > 15
    ? `Scene intensity: ${runtimeState.runtimeSteering.passionLevel}/100. Suggestions must match the current intensity without softening it.`
    : '';

  return [
    `Suggest what ${runtimeState.userName} does next in the same scene.`,
    'Return exactly 3 actions separated by | and nothing else.',
    'Write actions the user takes next, not instructions to the user.',
    'Option 1 matches the current pace, option 2 is bolder, option 3 adds a fresh angle without resetting the scene.',
    intensityLine,
    avoidList.length > 0 ? `Do not repeat: ${avoidList.join(' | ')}` : ''
  ].filter(Boolean).join('\n');
}

function buildImpersonateLateSteering(runtimeState) {
  const intensityLine = runtimeState.runtimeSteering.passionLevel > 15
    ? `Match the current scene intensity at ${runtimeState.runtimeSteering.passionLevel}/100. Do not soften it.`
    : '';

  return [
    `Write ${runtimeState.userName}'s next reply in first person (I/me/my).`,
    `Never write as ${runtimeState.characterName}.`,
    'Keep it to 1-2 sentences. Actions go in *asterisks*. Dialogue stays plain text.',
    'Stay inside the exact active scene and answer what the character just did or said.',
    intensityLine
  ].filter(Boolean).join('\n');
}

export function assembleRuntimeContext({ profile, runtimeState }) {
  const targets = PROFILE_BUDGET_TARGETS[profile] || PROFILE_BUDGET_TARGETS.reply;
  const totalBudget = Math.max(320, runtimeState.runtimeSteering.availableContextTokens || 2048);
  const debug = {
    profile,
    includedBlocks: [],
    droppedBlocks: [],
    historyCountKept: runtimeState.selectedRecentHistory.messages.length,
    historyWasTruncated: runtimeState.selectedRecentHistory.debug.truncatedOldestNonProtected
  };

  if (profile === 'reply') {
    const blocks = [];
    const activeSceneFull = renderActiveScene(runtimeState.activeScene, { compact: false });
    const activeSceneCompact = renderActiveScene(runtimeState.activeScene, { compact: true });
    const lateSteering = clipToTokenTarget(buildReplyLateSteering(runtimeState), targets.lateSteering);
    let activeScene = clipToTokenTarget(activeSceneFull, targets.activeScene);
    let exampleSeed = runtimeState.exampleEligibility ? clipToTokenTarget(runtimeState.compiledRuntimeCard.exampleSeed, targets.exampleSeed) : '';

    blocks.push(buildPlainTextBlock('Global Core', clipToTokenTarget(runtimeState.compiledRuntimeCard.globalCore, targets.globalCore)));
    debug.includedBlocks.push('Global Core');

    blocks.push(buildPlainTextBlock('Character Core', clipToTokenTarget(runtimeState.compiledRuntimeCard.characterCore, targets.characterCore)));
    debug.includedBlocks.push('Character Core');

    blocks.push(buildPlainTextBlock('Active Scene', activeScene));
    debug.includedBlocks.push('Active Scene');

    if (exampleSeed) {
      blocks.push(buildPlainTextBlock('Example Seed', exampleSeed));
      debug.includedBlocks.push('Example Seed');
    } else {
      debug.droppedBlocks.push('Example Seed');
    }

    blocks.push(buildPlainTextBlock('Late Steering', lateSteering));
    debug.includedBlocks.push('Late Steering');

    let systemPrompt = blocks.filter(Boolean).join('\n\n');
    let historyMessages = [...runtimeState.selectedRecentHistory.messages];
    let totalTokens = estimateTokens(systemPrompt) + historyMessages.reduce((sum, message) => sum + estimateTokens(message.content), 0);

    if (totalTokens > totalBudget && exampleSeed) {
      exampleSeed = '';
      debug.includedBlocks = debug.includedBlocks.filter((block) => block !== 'Example Seed');
      if (!debug.droppedBlocks.includes('Example Seed')) debug.droppedBlocks.push('Example Seed');
      systemPrompt = [
        buildPlainTextBlock('Global Core', clipToTokenTarget(runtimeState.compiledRuntimeCard.globalCore, targets.globalCore)),
        buildPlainTextBlock('Character Core', clipToTokenTarget(runtimeState.compiledRuntimeCard.characterCore, targets.characterCore)),
        buildPlainTextBlock('Active Scene', activeScene),
        buildPlainTextBlock('Late Steering', lateSteering)
      ].filter(Boolean).join('\n\n');
      totalTokens = estimateTokens(systemPrompt) + historyMessages.reduce((sum, message) => sum + estimateTokens(message.content), 0);
    }

    if (totalTokens > totalBudget) {
      activeScene = clipToTokenTarget(activeSceneCompact, 95);
      debug.droppedBlocks.push('Active Scene Support');
      systemPrompt = [
        buildPlainTextBlock('Global Core', clipToTokenTarget(runtimeState.compiledRuntimeCard.globalCore, targets.globalCore)),
        buildPlainTextBlock('Character Core', clipToTokenTarget(runtimeState.compiledRuntimeCard.characterCore, targets.characterCore)),
        buildPlainTextBlock('Active Scene', activeScene),
        buildPlainTextBlock('Late Steering', lateSteering)
      ].filter(Boolean).join('\n\n');
      totalTokens = estimateTokens(systemPrompt) + historyMessages.reduce((sum, message) => sum + estimateTokens(message.content), 0);
    }

    if (totalTokens > totalBudget) {
      const remainingHistoryBudget = Math.max(0, totalBudget - estimateTokens(systemPrompt));
      historyMessages = trimHistoryForBudget(historyMessages, remainingHistoryBudget);
    }

    debug.historyCountKept = historyMessages.length;

    return {
      profile,
      systemPrompt,
      historyMessages: historyMessages.map((message) => ({ role: message.role, content: message.content })),
      debug
    };
  }

  if (profile === 'suggestions') {
    const recentTail = runtimeState.selectedRecentHistory.messages.slice(-4);
    const systemPrompt = [
      buildPlainTextBlock('Character Core', clipToTokenTarget(runtimeState.compiledRuntimeCard.characterCore, targets.characterCore)),
      buildPlainTextBlock('Active Scene', clipToTokenTarget(renderActiveScene(runtimeState.activeScene, { compact: true }), targets.activeScene)),
      buildPlainTextBlock('Late Steering', clipToTokenTarget(buildSuggestionLateSteering(runtimeState), targets.lateSteering))
    ].filter(Boolean).join('\n\n');

    debug.includedBlocks.push('Character Core', 'Active Scene', 'Late Steering');
    debug.droppedBlocks.push('Global Core', 'Example Seed');

    return {
      profile,
      systemPrompt,
      userPrompt: `Recent scene tail:\n${formatHistory(recentTail, runtimeState.characterName, runtimeState.userName) || trimPromptSnippet(renderActiveScene(runtimeState.activeScene, { compact: true }), 220)}\n\n3 actions for ${runtimeState.userName} in the same scene:`,
      debug: {
        ...debug,
        historyCountKept: recentTail.length
      }
    };
  }

  const recentTail = runtimeState.selectedRecentHistory.messages.slice(-4);
  const minimalCharacterReference = clipToTokenTarget(runtimeState.compiledRuntimeCard.characterCore, targets.characterCore);
  const systemPrompt = [
    buildPlainTextBlock('Active Scene', clipToTokenTarget(renderActiveScene(runtimeState.activeScene, { compact: true }), targets.activeScene)),
    buildPlainTextBlock('Character Reference', minimalCharacterReference),
    buildPlainTextBlock('Late Steering', clipToTokenTarget(buildImpersonateLateSteering(runtimeState), targets.lateSteering))
  ].filter(Boolean).join('\n\n');

  debug.includedBlocks.push('Active Scene', 'Character Reference', 'Late Steering');
  debug.droppedBlocks.push('Global Core', 'Example Seed');

  return {
    profile,
    systemPrompt,
    userPrompt: `Recent scene tail:\n${formatHistory(recentTail, runtimeState.characterName, runtimeState.userName) || trimPromptSnippet(renderActiveScene(runtimeState.activeScene, { compact: true }), 220)}\n\nWrite ${runtimeState.userName}'s next reply without changing the scene:`,
    debug: {
      ...debug,
      historyCountKept: recentTail.length
    }
  };
}
