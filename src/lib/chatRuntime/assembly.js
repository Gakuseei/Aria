import { getDepthInstruction } from '../chat/passion/index.js';
import { getResponseModeConfig } from '../responseModes.js';
import { buildVoiceCard } from '../chat/impersonate/voiceAdapter.js';
import { computeSentenceTarget } from '../chat/impersonate/index.js';
import { buildPlainTextBlock, buildVoicePinBlock, clipToTokenTarget, estimateTokens, trimPromptSnippet } from './text.js';
import { formatRecentBanHint } from '../chat/repetitionGuard.js';
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

const NARRATOR_LANG_NAME = {
  en: 'English', de: 'German', es: 'Spanish', zh: 'Chinese',
  fr: 'French', it: 'Italian', pt: 'Portuguese', ru: 'Russian',
  ja: 'Japanese', ko: 'Korean', ar: 'Arabic', hi: 'Hindi', tr: 'Turkish'
};

function readAppLanguage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem('language') || 'en';
    }
  } catch {
    /* SSR / no-storage env */
  }
  return 'en';
}

function buildNarratorLateSteering(runtimeState) {
  const { runtimeSteering, compiledRuntimeCard } = runtimeState;
  const responseMode = runtimeSteering.responseMode ?? compiledRuntimeCard.runtimeDefaults.defaultResponseMode;
  const { promptInstruction } = getResponseModeConfig(responseMode);
  const depthInstruction = getDepthInstruction(runtimeSteering.passionLevel || 0, responseMode).trim();
  const unchainedRule = runtimeSteering.unchainedMode
    ? 'No safety hedging. Narrate physical escalation directly when the protagonist drives it.'
    : '';
  const assistMode = runtimeState.assistMode || 'sfw_only';
  const modeLine = (() => {
    if (assistMode === 'nsfw_only') return 'The scene is already explicit. Narrate it plainly without flinching.';
    if (assistMode === 'mixed_transition') return 'Build tension and physical awareness moment by moment.';
    return 'Keep the scene grounded in body, environment, and tone.';
  })();
  const language = runtimeSteering.language || readAppLanguage();
  const languageLine = (language && language !== 'en' && NARRATOR_LANG_NAME[language])
    ? `Respond in ${NARRATOR_LANG_NAME[language]}.`
    : '';

  return [
    unchainedRule,
    'Continue the scene in third person around the protagonist\'s latest action.',
    promptInstruction,
    modeLine,
    depthInstruction,
    languageLine
  ].filter(Boolean).join('\n');
}

function assembleNarratorReply(runtimeState, targets, totalBudget, debug) {
  const blocks = [];
  const activeSceneFull = renderActiveScene(runtimeState.activeScene, { compact: false });
  const activeSceneCompact = renderActiveScene(runtimeState.activeScene, { compact: true });
  const lateSteering = clipToTokenTarget(buildNarratorLateSteering(runtimeState), targets.lateSteering);
  let activeScene = clipStructuredSceneText(activeSceneFull, targets.activeScene, 145);

  blocks.push(buildPlainTextBlock('Global Core', clipToTokenTarget(runtimeState.compiledRuntimeCard.globalCore, targets.globalCore)));
  debug.includedBlocks.push('Global Core');

  blocks.push(buildPlainTextBlock('Narrator Style', clipToTokenTarget(runtimeState.compiledRuntimeCard.characterCore, targets.characterCore)));
  debug.includedBlocks.push('Narrator Style');

  const userIdentity = runtimeState.userIdentity || {};
  const protagonistName = userIdentity.name || runtimeState.userName;
  const protagonistDetails = [userIdentity.label, userIdentity.pronouns ? `pronouns: ${userIdentity.pronouns}` : '']
    .filter(Boolean)
    .join(', ');
  const protagonistBlockText = userIdentity.isUnset
    ? (protagonistDetails
        ? `Protagonist: (the addressed person, ${protagonistDetails})`
        : `Protagonist: (the addressed person)`)
    : (protagonistDetails
        ? `Protagonist: ${protagonistName} (${protagonistDetails})`
        : `Protagonist: ${protagonistName}`);
  blocks.push(buildPlainTextBlock('Protagonist', protagonistBlockText));
  debug.includedBlocks.push('Protagonist');

  if (activeScene) {
    blocks.push(buildPlainTextBlock('Active Scene', activeScene));
    debug.includedBlocks.push('Active Scene');
  } else {
    debug.droppedBlocks.push('Active Scene');
  }

  blocks.push(buildPlainTextBlock('Late Steering', lateSteering));
  debug.includedBlocks.push('Late Steering');

  let systemPrompt = blocks.filter(Boolean).join('\n\n');
  let historyMessages = [...runtimeState.selectedRecentHistory.messages];
  let totalTokens = estimateTokens(systemPrompt) + historyMessages.reduce((sum, message) => sum + estimateTokens(message.content), 0);

  if (totalTokens > totalBudget) {
    activeScene = clipStructuredSceneText(activeSceneCompact, 95, 120);
    debug.droppedBlocks.push('Active Scene Support');
    systemPrompt = [
      buildPlainTextBlock('Global Core', clipToTokenTarget(runtimeState.compiledRuntimeCard.globalCore, targets.globalCore)),
      buildPlainTextBlock('Narrator Style', clipToTokenTarget(runtimeState.compiledRuntimeCard.characterCore, targets.characterCore)),
      buildPlainTextBlock('Protagonist', protagonistBlockText),
      activeScene ? buildPlainTextBlock('Active Scene', activeScene) : '',
      buildPlainTextBlock('Late Steering', lateSteering)
    ].filter(Boolean).join('\n\n');
    totalTokens = estimateTokens(systemPrompt) + historyMessages.reduce((sum, message) => sum + estimateTokens(message.content), 0);
  }

  if (totalTokens > totalBudget) {
    const remainingHistoryBudget = Math.max(0, totalBudget - estimateTokens(systemPrompt));
    historyMessages = trimHistoryForBudget(historyMessages, remainingHistoryBudget);
  }

  debug.historyCountKept = historyMessages.length;
  debug.voicePinInjected = false;
  debug.voicePinSource = 'narrator_bypass';

  const finalHistoryMessages = historyMessages.map((message) => ({ role: message.role, content: message.content }));

  return {
    profile: 'reply',
    systemPrompt,
    historyMessages: finalHistoryMessages,
    debug
  };
}

function buildReplyLateSteering(runtimeState) {
  const { runtimeSteering, compiledRuntimeCard, characterName, userName, userIdentity } = runtimeState;
  const responseMode = runtimeSteering.responseMode ?? compiledRuntimeCard.runtimeDefaults.defaultResponseMode;
  const { promptInstruction } = getResponseModeConfig(responseMode);
  const depthInstruction = getDepthInstruction(runtimeSteering.passionLevel || 0, responseMode).trim();
  const isBot = compiledRuntimeCard.runtimeDefaults.type === 'bot';
  const userPossessive = userIdentity?.isUnset ? "the user's" : `${userName}'s`;

  if (isBot) {
    return [
      promptInstruction,
      `Respond directly to ${userPossessive} latest request.`
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

function buildImpersonateConstraints(runtimeState, sentenceTarget, isFirstReply) {
  const charName = runtimeState.characterName || 'Character';
  const userName = runtimeState.userName || 'User';
  const isUnset = Boolean(runtimeState.userIdentity?.isUnset);
  const userPossessive = isUnset ? "the user's" : `${userName}'s`;
  const sentenceWord = sentenceTarget === 1 ? 'sentence' : 'sentences';
  if (isFirstReply) {
    return [
      'Constraints:',
      `1. Write only ${userPossessive} reply, in first person.`,
      `2. One ${sentenceWord}, short and natural. Stop cleanly.`,
      `3. Do not write ${charName}'s next message.`,
      `4. Same language as ${charName}'s greeting.`
    ].join('\n');
  }
  const passion = Number(runtimeState.runtimeSteering?.passionLevel) || 0;
  const lines = [
    'Constraints:',
    `1. Write only ${userPossessive} reply, in first person.`,
    `2. ${sentenceTarget} ${sentenceWord} only. Stop cleanly.`,
    `3. Do not write ${charName}'s dialogue, actions, or thoughts.`,
    '4. Same language as the conversation.',
    `5. If ${charName}'s last message asks for a physical action, take it.`
  ];
  if (passion > 15) lines.push(`6. Match scene intensity ${passion}/100.`);
  return lines.join('\n');
}

function buildImpersonateUserPrompt(runtimeState, recentTail, { isFirstReply = false } = {}) {
  const isUnset = Boolean(runtimeState.userIdentity?.isUnset);
  const userLabel = isUnset ? 'Me' : runtimeState.userName;
  const userPossessive = isUnset ? "the user's" : `${runtimeState.userName}'s`;
  const currentBeat = [
    runtimeState.activeScene.latest_character_action_or_reaction
      ? `${runtimeState.characterName}: ${runtimeState.activeScene.latest_character_action_or_reaction}`
      : '',
    runtimeState.activeScene.latest_user_action_or_request
      ? `${userLabel}: ${runtimeState.activeScene.latest_user_action_or_request}`
      : ''
  ].filter(Boolean).join('\n');
  const recentConversation = formatHistory(recentTail, runtimeState.characterName, userLabel)
    || currentBeat
    || trimPromptSnippet(renderActiveScene(runtimeState.activeScene, { compact: true }), 220);

  const closingCue = isFirstReply
    ? `Write ${userPossessive} very first reply to ${runtimeState.characterName}.`
    : `Continue ${userPossessive} next reply.`;

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
    personaType: runtimeState.personaType || 'character',
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

  if (profile === 'impersonate' && runtimeState.personaType === 'narrator') {
    debug.droppedBlocks.push('impersonate_narrator_skip');
    return {
      profile,
      systemPrompt: '',
      userPrompt: '',
      assistantPrefix: '',
      stopStrings: [],
      sampler: null,
      narratorSkip: true,
      debug: {
        ...debug,
        historyCountKept: 0,
        firstReply: false,
        sentenceTarget: 0,
        skipReason: 'narrator_persona'
      }
    };
  }

  if (profile === 'reply') {
    if (runtimeState.personaType === 'narrator') {
      return assembleNarratorReply(runtimeState, targets, totalBudget, debug);
    }
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
    const userBlockText = userIdentity.isUnset
      ? `(the addressed person, ${userIdentity.label || 'male'}, pronouns: ${userIdentity.pronouns || 'he/him'})`
      : `${userIdentity.name || runtimeState.userName} (${userIdentity.label || 'male'}, pronouns: ${userIdentity.pronouns || 'he/him'})`;
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

    const banHintPhrases = runtimeState.runtimeSteering?.lastTurnBannedPhrases || [];
    const banHint = formatRecentBanHint(banHintPhrases);
    if (banHint) {
      finalHistoryMessages.push({ role: 'system', content: banHint });
      debug.banHintInjected = true;
      debug.banHintPhrases = banHintPhrases.slice();
    } else {
      debug.banHintInjected = false;
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
  const sentenceTarget = computeSentenceTarget(runtimeState.voiceFeatures, isFirstReply);
  const minimalCharacterReference = clipToTokenTarget(runtimeState.compiledRuntimeCard.characterCore, targets.characterCore);
  const impersonateUserIdentity = runtimeState.userIdentity || {};
  const userName = runtimeState.userName || 'User';
  const characterName = runtimeState.characterName || 'Character';
  const userInline = `${impersonateUserIdentity.name || userName} (${impersonateUserIdentity.label || 'male'}, pronouns: ${impersonateUserIdentity.pronouns || 'he/him'})`;
  const sceneText = clipStructuredSceneText(renderActiveScene(runtimeState.activeScene, { compact: true }), targets.activeScene, 115);
  const profileSampler = runtimeState.runtimeSteering.resolvedProfile || null;

  let voiceExamplesBlock = '';
  if (!isFirstReply) {
    const card = buildVoiceCard(runtimeState.selectedRecentHistory.messages, userName, impersonateUserIdentity);
    voiceExamplesBlock = card.examples || '';
  }

  const opening = isFirstReply
    ? `Write ${userName}'s first reply to ${characterName}. One sentence, first person.`
    : `You are continuing a fictional chat. Your task: write ${userName}'s next reply.`;

  const impersonateGlobalCore = String(runtimeState.compiledRuntimeCard.globalCore || '')
    .split('\n')
    .filter((line) => !/Actions go in \*asterisks\*/i.test(line))
    .join('\n');

  const blocks = [
    opening,
    isFirstReply ? '' : `<global>\n${clipToTokenTarget(impersonateGlobalCore, targets.globalCore)}\n</global>`,
    `<character>\n${minimalCharacterReference}\n</character>`,
    `<user>${userInline}${isFirstReply ? '. New visitor.' : '.'}</user>`,
    `<scene>\n${sceneText}\n</scene>`,
    voiceExamplesBlock,
    buildImpersonateConstraints(runtimeState, sentenceTarget, isFirstReply)
  ].filter(Boolean);

  const systemPrompt = blocks.join('\n\n');

  if (isFirstReply) {
    debug.includedBlocks.push('opening', 'character', 'user', 'scene', 'constraints');
    debug.droppedBlocks.push('global', 'user_voice_examples');
  } else {
    debug.includedBlocks.push('opening', 'global', 'character', 'user', 'scene', 'constraints');
    if (voiceExamplesBlock) debug.includedBlocks.push('user_voice_examples');
    else debug.droppedBlocks.push('user_voice_examples');
  }

  const stopStrings = [
    `\n${characterName}:`,
    `\n${characterName} :`,
    `\n*${characterName} `,
    `\n${characterName} `,
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
      firstReply: isFirstReply,
      sentenceTarget
    }
  };
}
