import { getDepthInstruction } from '../chat/passion/index.js';
import { getResponseModeConfig } from '../responseModes.js';
import { buildVoiceCard } from '../chat/impersonate/voiceAdapter.js';
import { buildPlainTextBlock, buildVoicePinBlock, clipToTokenTarget, estimateTokens, trimPromptSnippet } from './text.js';
import { renderActiveScene } from './runtimeState.js';

// Reply targets sum to ~1010 tokens; PROFILE_NON_HISTORY_RESERVE.reply is 820. The ~190-token
// overshoot is absorbed by the overflow handler and trades headroom for full Global Core
// (embodiment line), full Late Steering at NSFW, plus the Phase D structural memory layer
// (wardrobe, body state, established facts, mentioned items) inside Active Scene.
const PROFILE_BUDGET_TARGETS = {
  reply: {
    globalCore: 120,
    characterCore: 290,
    activeScene: 240,
    exampleSeed: 180,
    lateSteering: 180
  },
  impersonate: {
    characterCore: 90,
    activeScene: 110,
    lateSteering: 110,
    globalCore: 60,
    personaAnchor: 75
  }
};

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

function clipStructuredSceneText(text, tokenTarget, maxLineLength = 150) {
  const lines = String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return '';

  const targetChars = Math.max(120, Math.floor(tokenTarget * 3.5));
  const kept = [];
  let usedChars = 0;

  for (const line of lines) {
    const remainingChars = targetChars - usedChars;
    if (remainingChars <= 24) break;

    const clippedLine = trimPromptSnippet(line, Math.min(maxLineLength, remainingChars));
    if (!clippedLine) continue;

    if (kept.length > 0 && clippedLine.length + 1 > remainingChars) {
      break;
    }

    kept.push(clippedLine);
    usedChars += clippedLine.length + 1;
  }

  return kept.join('\n');
}

function appendIntimacyContract(characterCore, runtimeState) {
  if (runtimeState.assistMode !== 'nsfw_only') return characterCore;
  const contract = String(runtimeState.compiledRuntimeCard.intimacyContract || '').trim();
  if (!contract) return characterCore;
  const base = String(characterCore || '').trim();
  const block = `Intimacy contract:\n${contract}`;
  return base ? `${base}\n\n${block}` : block;
}

function buildReplyLateSteering(runtimeState) {
  const { runtimeSteering, compiledRuntimeCard, characterName, userName } = runtimeState;
  const responseMode = runtimeSteering.responseMode ?? compiledRuntimeCard.runtimeDefaults.defaultResponseMode;
  const { promptInstruction } = getResponseModeConfig(responseMode);
  const depthInstruction = getDepthInstruction(runtimeSteering.passionLevel || 0, responseMode).trim();
  const isBot = compiledRuntimeCard.runtimeDefaults.type === 'bot';

  if (isBot) {
    return [
      promptInstruction,
      `Respond directly to ${userName}'s latest request.`
    ].filter(Boolean).join('\n');
  }

  const unchainedRule = runtimeSteering.unchainedMode
    ? 'Respond to physical escalation with immediate in-character physical compliance.'
    : '';
  const assistMode = runtimeState.assistMode || 'sfw_only';
  const modeLine = (() => {
    if (assistMode === 'nsfw_only') return 'The scene is already explicit. Lean into physical and sensory presence in character.';
    if (assistMode === 'mixed_transition') return 'Build tension, closeness, and physical awareness moment by moment.';
    return 'Stay non-explicit. Keep the moment grounded in body, environment, and tone.';
  })();
  const voiceAnchorLines = assistMode === 'nsfw_only'
    ? [
        `Stay in ${characterName}'s voice signature; the voice anchor above is the contract.`,
        `Favor phrases and rhythms only ${characterName} would use.`
      ]
    : [];

  return [
    unchainedRule,
    `Write ${characterName}'s next reply.`,
    promptInstruction,
    modeLine,
    ...voiceAnchorLines,
    depthInstruction
  ].filter(Boolean).join('\n');
}

function buildImpersonateLateSteering(runtimeState, { isFirstReply = false } = {}) {
  const intensityLine = runtimeState.runtimeSteering.passionLevel > 15
    ? `Match the current scene intensity at ${runtimeState.runtimeSteering.passionLevel}/100. Do not soften it.`
    : '';
  const pronouns = runtimeState.userIdentity?.pronouns || 'he/him';

  if (isFirstReply) {
    return [
      `${runtimeState.userName} is the visitor. ${runtimeState.characterName} just spoke first, and ${runtimeState.userName} now replies.`,
      `Write a short, natural opener — 1 or 2 sentences as ${runtimeState.userName} would respond. End cleanly after the second sentence; no more than two sentences.`,
      `Stay in first person throughout — use I/me/my for ${runtimeState.userName}, including inside *action* asterisks. Never refer to ${runtimeState.userName} as he/she/his/her. Match the same language as the conversation.`,
      intensityLine
    ].filter(Boolean).join('\n');
  }

  return [
    `Continue in ${runtimeState.userName}'s voice and rhythm — match the user_voice_examples for sentence length, format, and energy.`,
    `${runtimeState.userName}'s reply takes a concrete action or response that fits the latest beat — not a question, not a meta comment.`,
    `If ${runtimeState.characterName}'s last message contains a direct request or instruction (e.g. "kiss me", "show me", "take me there"), ${runtimeState.userName}'s reply carries it out as a concrete physical action — no tease, no counter-question, no slowing the beat.`,
    `Reply stays in first person (${pronouns}) and in the same language as the conversation.`,
    intensityLine
  ].filter(Boolean).join('\n');
}

function buildRecentUserVoiceExamples(runtimeState) {
  const card = buildVoiceCard(
    runtimeState.selectedRecentHistory.messages,
    runtimeState.userName,
    runtimeState.userIdentity
  );
  return card.examples;
}

function buildImpersonateUserPrompt(runtimeState, recentTail, { isFirstReply = false } = {}) {
  const currentBeat = [
    runtimeState.activeScene.latest_character_action_or_reaction
      ? `${runtimeState.characterName}: ${runtimeState.activeScene.latest_character_action_or_reaction}`
      : '',
    runtimeState.activeScene.latest_user_action_or_request
      ? `${runtimeState.userName}: ${runtimeState.activeScene.latest_user_action_or_request}`
      : ''
  ].filter(Boolean).join('\n');
  const recentConversation = formatHistory(recentTail, runtimeState.characterName, runtimeState.userName)
    || currentBeat
    || trimPromptSnippet(renderActiveScene(runtimeState.activeScene, { compact: true }), 220);

  const closingCue = isFirstReply
    ? `Write ${runtimeState.userName}'s very first reply to ${runtimeState.characterName}.`
    : `Continue ${runtimeState.userName}'s next reply.`;

  return [
    `Current beat:\n${currentBeat || trimPromptSnippet(renderActiveScene(runtimeState.activeScene, { compact: true }), 160)}`,
    `Recent conversation:\n${recentConversation}`,
    closingCue
  ].filter(Boolean).join('\n\n');
}

export function assembleRuntimeContext({ profile, runtimeState }) {
  const targets = PROFILE_BUDGET_TARGETS[profile] || PROFILE_BUDGET_TARGETS.reply;
  const totalBudget = Math.max(320, runtimeState.runtimeSteering.availableContextTokens || 2048);
  const debug = {
    profile,
    assistMode: runtimeState.assistMode || 'sfw_only',
    assistModeDebug: runtimeState.assistModeDebug || null,
    assistBudgetTier: runtimeState.runtimeSteering.assistBudgetTier || 'default',
    includedBlocks: [],
    droppedBlocks: [],
    historyCountKept: runtimeState.selectedRecentHistory.messages.length,
    historyWasTruncated: runtimeState.selectedRecentHistory.debug.truncatedOldestNonProtected,
    sceneContinuityCount: runtimeState.sceneState?.continuity_facts?.length || 0,
    sceneSettingSource: runtimeState.sceneState?.debug?.settingSource || 'unknown',
    sceneRelationshipSource: runtimeState.sceneState?.debug?.relationshipSource || 'unknown',
    sceneMemoryUsed: Boolean(runtimeState.persistedSceneMemory)
  };

  if (profile === 'reply') {
    const blocks = [];
    const activeSceneFull = renderActiveScene(runtimeState.activeScene, { compact: false });
    const activeSceneCompact = renderActiveScene(runtimeState.activeScene, { compact: true });
    const lateSteering = clipToTokenTarget(buildReplyLateSteering(runtimeState), targets.lateSteering);
    let activeScene = clipStructuredSceneText(activeSceneFull, targets.activeScene, 145);
    let exampleSeed = runtimeState.exampleEligibility ? clipToTokenTarget(runtimeState.compiledRuntimeCard.exampleSeed, targets.exampleSeed) : '';

    blocks.push(buildPlainTextBlock('Global Core', clipToTokenTarget(runtimeState.compiledRuntimeCard.globalCore, targets.globalCore)));
    debug.includedBlocks.push('Global Core');

    blocks.push(buildPlainTextBlock('Character Core', appendIntimacyContract(clipToTokenTarget(runtimeState.compiledRuntimeCard.characterCore, targets.characterCore), runtimeState)));
    debug.includedBlocks.push('Character Core');

    const userIdentity = runtimeState.userIdentity || {};
    const userBlockText = `${userIdentity.name || runtimeState.userName} (${userIdentity.label || 'male'}, pronouns: ${userIdentity.pronouns || 'he/him'})`;
    blocks.push(buildPlainTextBlock('User', userBlockText));
    debug.includedBlocks.push('User');

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
      exampleSeed = clipToTokenTarget(exampleSeed, Math.max(80, Math.floor(targets.exampleSeed * 0.5)));
      systemPrompt = [
        buildPlainTextBlock('Global Core', clipToTokenTarget(runtimeState.compiledRuntimeCard.globalCore, targets.globalCore)),
        buildPlainTextBlock('Character Core', appendIntimacyContract(clipToTokenTarget(runtimeState.compiledRuntimeCard.characterCore, targets.characterCore), runtimeState)),
        buildPlainTextBlock('User', userBlockText),
        buildPlainTextBlock('Active Scene', activeScene),
        buildPlainTextBlock('Example Seed', exampleSeed),
        buildPlainTextBlock('Late Steering', lateSteering)
      ].filter(Boolean).join('\n\n');
      totalTokens = estimateTokens(systemPrompt) + historyMessages.reduce((sum, message) => sum + estimateTokens(message.content), 0);
    }

    if (totalTokens > totalBudget && exampleSeed) {
      exampleSeed = '';
      debug.includedBlocks = debug.includedBlocks.filter((block) => block !== 'Example Seed');
      if (!debug.droppedBlocks.includes('Example Seed')) debug.droppedBlocks.push('Example Seed');
      systemPrompt = [
        buildPlainTextBlock('Global Core', clipToTokenTarget(runtimeState.compiledRuntimeCard.globalCore, targets.globalCore)),
        buildPlainTextBlock('Character Core', appendIntimacyContract(clipToTokenTarget(runtimeState.compiledRuntimeCard.characterCore, targets.characterCore), runtimeState)),
        buildPlainTextBlock('User', userBlockText),
        buildPlainTextBlock('Active Scene', activeScene),
        buildPlainTextBlock('Late Steering', lateSteering)
      ].filter(Boolean).join('\n\n');
      totalTokens = estimateTokens(systemPrompt) + historyMessages.reduce((sum, message) => sum + estimateTokens(message.content), 0);
    }

    if (totalTokens > totalBudget) {
      activeScene = clipStructuredSceneText(activeSceneCompact, 95, 120);
      debug.droppedBlocks.push('Active Scene Support');
      systemPrompt = [
        buildPlainTextBlock('Global Core', clipToTokenTarget(runtimeState.compiledRuntimeCard.globalCore, targets.globalCore)),
        buildPlainTextBlock('Character Core', appendIntimacyContract(clipToTokenTarget(runtimeState.compiledRuntimeCard.characterCore, targets.characterCore), runtimeState)),
        buildPlainTextBlock('User', userBlockText),
        buildPlainTextBlock('Active Scene', activeScene),
        exampleSeed ? buildPlainTextBlock('Example Seed', exampleSeed) : '',
        buildPlainTextBlock('Late Steering', lateSteering)
      ].filter(Boolean).join('\n\n');
      totalTokens = estimateTokens(systemPrompt) + historyMessages.reduce((sum, message) => sum + estimateTokens(message.content), 0);
    }

    if (totalTokens > totalBudget) {
      const remainingHistoryBudget = Math.max(0, totalBudget - estimateTokens(systemPrompt));
      historyMessages = trimHistoryForBudget(historyMessages, remainingHistoryBudget);
    }

    debug.historyCountKept = historyMessages.length;

    const finalHistoryMessages = historyMessages.map((message) => ({ role: message.role, content: message.content }));

    const voicePinBlock = buildVoicePinBlock({
      pin: runtimeState.voicePinResolution?.pin,
      avoid: runtimeState.voicePinResolution?.avoid
    });
    if (voicePinBlock) {
      finalHistoryMessages.push({ role: 'system', content: voicePinBlock });
      debug.voicePinInjected = true;
      debug.voicePinSource = runtimeState.voicePinResolution?.source || 'unknown';
    } else {
      debug.voicePinInjected = false;
    }

    return {
      profile,
      systemPrompt,
      historyMessages: finalHistoryMessages,
      debug
    };
  }

  const recentTail = runtimeState.selectedRecentHistory.messages.slice(-6);
  const userMsgCount = runtimeState.selectedRecentHistory.messages.filter((m) => m.role === 'user').length;
  const isFirstReply = userMsgCount === 0;
  const minimalCharacterReference = clipToTokenTarget(runtimeState.compiledRuntimeCard.characterCore, targets.characterCore);
  const impersonateUserIdentity = runtimeState.userIdentity || {};
  const impersonateUserBlock = buildPlainTextBlock(
    'User',
    `${impersonateUserIdentity.name || runtimeState.userName} (${impersonateUserIdentity.label || 'male'}, pronouns: ${impersonateUserIdentity.pronouns || 'he/him'})`
  );
  const userVoiceBlock = buildRecentUserVoiceExamples(runtimeState);
  const userVoiceSection = (!isFirstReply && userVoiceBlock) ? buildPlainTextBlock('User Voice', userVoiceBlock) : '';
  const characterName = runtimeState.characterName || 'Character';
  const userName = runtimeState.userName || 'User';
  const profileSampler = runtimeState.runtimeSteering.resolvedProfile || null;
  // Drop the format-mandate line ("Actions go in *asterisks*. Dialogue stays in plain text.") that compiler.js bakes into globalCore for non-bot characters. Impersonate detects format from the user's voice card instead — both clauses must go together.
  const impersonateGlobalCore = String(runtimeState.compiledRuntimeCard.globalCore || '')
    .split('\n')
    .filter((line) => !/Actions go in \*asterisks\*/i.test(line))
    .join('\n');

  const roleDeclaration = isFirstReply
    ? `Role: write as ${runtimeState.userName}. ${runtimeState.characterName} just spoke first; your output is ${runtimeState.userName}'s reply — ${runtimeState.userName}'s words and actions only, in first person.`
    : '';
  const roleBlock = roleDeclaration ? buildPlainTextBlock('Role', roleDeclaration) : '';

  const sceneBlock = buildPlainTextBlock('Active Scene', clipStructuredSceneText(renderActiveScene(runtimeState.activeScene, { compact: true }), targets.activeScene, 115));
  const lateSteeringBlock = buildPlainTextBlock('Late Steering', clipToTokenTarget(buildImpersonateLateSteering(runtimeState, { isFirstReply }), targets.lateSteering));

  const systemPrompt = (isFirstReply
    ? [
        roleBlock,
        impersonateUserBlock,
        sceneBlock,
        lateSteeringBlock
      ]
    : [
        buildPlainTextBlock('Global Core', clipToTokenTarget(impersonateGlobalCore, targets.globalCore)),
        impersonateUserBlock,
        sceneBlock,
        runtimeState.compiledRuntimeCard.personaAnchor
          ? buildPlainTextBlock('Persona Anchor', clipToTokenTarget(runtimeState.compiledRuntimeCard.personaAnchor, targets.personaAnchor))
          : '',
        buildPlainTextBlock('Character Reference', minimalCharacterReference),
        userVoiceSection,
        lateSteeringBlock
      ]
  ).filter(Boolean).join('\n\n');

  if (isFirstReply) {
    debug.includedBlocks.push('Role', 'User', 'Active Scene', 'Late Steering');
    debug.droppedBlocks.push('Global Core', 'Persona Anchor', 'Character Reference', 'User Voice');
  } else {
    debug.includedBlocks.push('Global Core', 'User', 'Active Scene', 'Character Reference', 'Late Steering');
    if (runtimeState.compiledRuntimeCard.personaAnchor) debug.includedBlocks.push('Persona Anchor');
    else debug.droppedBlocks.push('Persona Anchor');
    if (userVoiceBlock) debug.includedBlocks.push('User Voice');
    else debug.droppedBlocks.push('User Voice');
  }
  debug.droppedBlocks.push('Example Seed');

  const stopStrings = [
    `\n${characterName}:`,
    `\n${characterName} :`,
    `${characterName}:`,
    '<|im_end|>',
    '\n***'
  ];

  const sampler = profileSampler ? {
    temperature: profileSampler.temperature,
    topK: profileSampler.topK,
    topP: profileSampler.topP,
    minP: profileSampler.minP,
    repeatPenalty: profileSampler.repeatPenalty,
    repeatLastN: profileSampler.repeatLastN,
    penalizeNewline: profileSampler.penalizeNewline,
    flags: profileSampler.flags || {}
  } : null;

  return {
    profile,
    systemPrompt,
    userPrompt: buildImpersonateUserPrompt(runtimeState, recentTail, { isFirstReply }),
    assistantPrefix: `${userName}: `,
    stopStrings,
    sampler,
    debug: {
      ...debug,
      historyCountKept: recentTail.length,
      firstReply: isFirstReply
    }
  };
}
