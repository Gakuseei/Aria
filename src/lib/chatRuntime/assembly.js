import { getDepthInstruction } from '../chat/passion/index.js';
import { getResponseModeConfig } from '../responseModes.js';
import { buildPlainTextBlock, buildVoicePinBlock, clipToTokenTarget, estimateTokens, splitSentences, trimPromptSnippet } from './text.js';
import { renderActiveScene } from './runtimeState.js';

// Reply targets sum to ~850 tokens; PROFILE_NON_HISTORY_RESERVE.reply is 820. The 30-token
// overshoot is absorbed by the overflow handler and trades headroom for full Late Steering at NSFW.
const PROFILE_BUDGET_TARGETS = {
  reply: {
    globalCore: 60,
    characterCore: 290,
    activeScene: 140,
    exampleSeed: 180,
    lateSteering: 180
  },
  suggestions: {
    writerRole: 80,
    characterCore: 145,
    activeScene: 84,
    exampleSeed: 90,
    lateSteering: 145
  },
  impersonate: {
    characterCore: 90,
    activeScene: 110,
    lateSteering: 70
  }
};

function getAssistModeRules(runtimeState, feature) {
  const assistMode = runtimeState.assistMode || 'sfw_only';
  const isBot = runtimeState.compiledRuntimeCard.runtimeDefaults.type === 'bot';
  if (isBot || assistMode === 'bot_conversation') {
    return feature === 'suggestions'
      ? [
          'Keep every option grounded in the active exchange. Never turn task or bot chat into bodily roleplay.',
          'Write plain spoken quick replies only. No asterisks, no stage directions, and no status-log style self actions.'
        ]
      : ['Stay inside the active exchange. Do not introduce bodily roleplay framing.'];
  }

  if (assistMode === 'nsfw_only') {
    return feature === 'suggestions'
      ? ['The scene is already explicit. Do not become timid, euphemistic, or generic.']
      : ['The scene is already explicit. Do not soften it into generic flirting or detached summary.'];
  }

  if (assistMode === 'mixed_transition') {
    return feature === 'suggestions'
      ? ['Build tension, invitation, and forward motion without jumping straight to explicit hardcore phrasing.']
      : ['Build tension, invitation, and closeness without abrupt explicitness or generic porn phrasing.'];
  }

  return feature === 'suggestions'
    ? [
        'Keep the options non-explicit. Favor emotional, conversational, or lightly physical moves over hidden heat-pushes.',
        'Keep them grounded in the current shared activity, topic, or question instead of drifting into generic flirting.',
        'Do not turn the user into a detached evaluator, inspector, observer, or task-giver unless the latest beat already clearly asks for that.',
        'Avoid sudden harsh dominance, discipline, or contempt unless the latest beat already establishes that tone.'
      ]
    : ['Keep the interaction non-explicit. Do not inject hidden sexual escalation.'];
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

function extractLatestMessageEnding(text, sentenceCount = 2, maxLength = 220) {
  const sentences = splitSentences(text || '');
  if (sentences.length === 0) return trimPromptSnippet(text, maxLength);
  const ending = sentences.slice(-sentenceCount).join(' ').trim();
  if (ending.length <= maxLength) return ending;
  return ending.slice(-maxLength).trim();
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
    if (assistMode === 'nsfw_only') return 'The scene is already explicit. Continue in character without softening into generic prose.';
    if (assistMode === 'mixed_transition') return 'Build tension and closeness in character without jumping straight to explicit phrasing.';
    return 'Keep the interaction non-explicit and grounded in the moment.';
  })();
  const voiceAnchorLines = assistMode === 'nsfw_only'
    ? [
        `Stay in ${characterName}'s voice signature; the voice anchor above is the contract.`,
        'Favor phrases only this character would say. Avoid stock erotica vocabulary that any character could speak.'
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

function buildSuggestionLateSteering(runtimeState) {
  const isBot = runtimeState.compiledRuntimeCard.runtimeDefaults.type === 'bot';
  const avoidList = (runtimeState.runtimeSteering.avoidSuggestions || []).filter(Boolean);
  const suggestionMode = runtimeState.runtimeSteering.suggestionMode || 'single';
  const suggestionRole = runtimeState.runtimeSteering.suggestionRole || 'stay';
  const candidateCount = Math.max(4, Math.min(6, Number(runtimeState.runtimeSteering.suggestionCandidateCount) || 6));
  const intensityLine = runtimeState.runtimeSteering.passionLevel > 15
    ? `Match the current scene intensity at ${runtimeState.runtimeSteering.passionLevel}/100 without softening it.`
    : '';

  if (suggestionMode === 'batch') {
    return [
      isBot
        ? `Write ${candidateCount} short, sendable replies for ${runtimeState.userName} in the same exchange with ${runtimeState.characterName}.`
        : `Write ${candidateCount} short, sendable next turns for ${runtimeState.userName} in the same scene with ${runtimeState.characterName}.`,
      'Return only valid JSON with exactly one key: replies.',
      'replies must be an array of objects with exactly two string keys: text and intent.',
      'intent must be one of: reply, forward, different.',
      'Use intent=reply for the most natural direct answer to the latest beat, especially the final cue at the end of the message.',
      'Use intent=forward for a move that opens the next beat without ignoring the current one.',
      'Use intent=different for a different but still fitting angle, not a random tangent.',
      runtimeState.activeScene.open_thread ? 'Resolve the current response cue before inventing a different object, room, or subtask.' : '',
      isBot
        ? `Write only ${runtimeState.userName}'s side of the exchange. Keep it short, direct, and plain chat text.`
        : `Write only ${runtimeState.userName}'s side of the scene. NEVER write as ${runtimeState.characterName}.`,
      'Read the whole latest full message before writing. Questions, invitations, instructions, and actions near the end matter most.',
      'If the latest full message contains multiple cues, questions, or directives, prioritize the final one before earlier ones when they compete.',
      'At least one option should answer the final cue directly when one is present.',
      isBot
        ? 'Across the set, include at least one most natural direct reply, one reply that moves the exchange forward, and one reply that takes a different but still fitting angle.'
        : 'Across the set, include the most natural immediate reply, one option that moves the scene forward, and one different but still fitting angle. A mix of dialogue and first-person *I ...* action is good when it fits the beat.',
      'Make the options genuinely different from each other. Do not paraphrase the same move three times.',
      isBot
        ? 'Answer only the latest message. No advice, commentary, or planner wording.'
        : 'Use the most natural sendable form for this exact beat. A mix of dialogue and first-person *I ...* action is good. If the recent user voice already uses first-person action, keep some of that embodied style available instead of flattening every option into pure speech. If the final cue is a concrete instruction or task, a direct reply or direct first-person action that answers it is often best. When the scene already has physical or task momentum, action or action-plus-dialogue is often more helpful than another bare verbal nudge.',
      'Anchor every reply to the exact latest beat, not to the broad setup, trope, lore, or default premise.',
      'Respect the granularity of the latest turn. If the latest turn is broad, stay broad. If it is concrete, stay concrete unless the exchange itself narrows it.',
      'If a concrete shared activity, object, or subtask is already in progress, stay on that same focus instead of switching to a nearby room detail or different task.',
      'Use a concrete detail, action, request, or emotional cue from the latest exchange when natural so the line clearly belongs to this moment.',
      'Do not pull in background lore, job framing, relationship labels, worldbuilding, or premise details unless the latest exchange clearly invokes them.',
      'Reply to the character\'s latest line or action, not to your own earlier turn.',
      'If the latest character move is a question, invitation, challenge, or instruction, prefer replies that answer it directly or advance that exact exchange.',
      'Stay in the same moment. Do not reset the scene or drift generic.',
      'If a reply could work in many unrelated scenes, it is too generic.',
      'Skip setup clauses and reflective filler. Avoid openings like I appreciate..., I understand..., I can\'t help but..., I find myself..., I must admit..., Well....',
      isBot
        ? ''
        : `Do not describe ${runtimeState.characterName}'s feelings or actions as if they belong to ${runtimeState.userName}.`,
      'Usually 2 to 9 words, never more than 12 words.',
      runtimeState.compiledRuntimeCard.personaAnchor
        ? `Keep it grounded in ${runtimeState.characterName}'s persona and the current chemistry.`
        : '',
      ...getAssistModeRules(runtimeState, 'suggestions'),
      'Match the conversation language and local tone of the latest exchange.',
      intensityLine,
      avoidList.length > 0 ? `Do not repeat or paraphrase: ${avoidList.join(' | ')}` : '',
      'No commentary or extra keys.'
    ].filter(Boolean).join('\n');
  }

  const roleInstruction = isBot
    ? {
        stay: 'This single reply should be the most natural immediate response to the latest message.',
        bold: 'This single reply should be a slightly more forward version of the natural reply. Depending on the exchange, forward can mean warmer, firmer, clearer, riskier, or more direct. Do not force a tone shift.',
        progress: 'This single reply should open the next useful beat or decision. It is not just a stronger version of the natural reply.'
      }[suggestionRole]
    : {
        stay: 'This single turn should be the most natural immediate reaction to the latest beat.',
        bold: 'This single turn should be a slightly more forward version of the natural reaction. Depending on the scene, forward can mean warmer, firmer, flirtier, more vulnerable, more decisive, or more intense.',
        progress: 'This single turn should open the next beat and move the scene forward. It can be dialogue, action, or a natural mix. It is not just a more intense version of the natural reaction.'
      }[suggestionRole];

  return [
    isBot
      ? `Write ${runtimeState.userName}'s next sendable reply in the same exchange with ${runtimeState.characterName}.`
      : `Write ${runtimeState.userName}'s next sendable turn in the same scene with ${runtimeState.characterName}.`,
    'Return only valid JSON with exactly one string key: suggestion.',
    runtimeState.activeScene.open_thread ? 'Resolve the current response cue before inventing a different object, room, or subtask.' : '',
    roleInstruction,
    isBot
      ? `Write only ${runtimeState.userName}'s side of the exchange. Keep it short, direct, and plain chat text.`
      : `Write only ${runtimeState.userName}'s side of the scene. NEVER write as ${runtimeState.characterName}.`,
    'If the latest full message contains multiple cues, questions, or directives, prioritize the final one before earlier ones when they compete.',
    'Answer the final cue directly when one is present.',
    isBot
      ? 'Answer only the latest message. No advice, commentary, or planner wording.'
      : 'Use the most natural sendable form for this exact beat. A mix of dialogue and first-person *I ...* action is good. If the recent user voice already uses first-person action, keep some of that embodied style available instead of flattening every option into pure speech. If the final cue is a concrete instruction or task, a direct reply or direct first-person action that answers it is often best. When the scene already has physical or task momentum, action or action-plus-dialogue is often more helpful than another bare verbal nudge.',
    'Anchor the line to the exact latest beat, not to the broad setup, trope, lore, or default premise.',
    'Respect the granularity of the latest turn. If the latest turn is broad, stay broad. If it is concrete, stay concrete unless the exchange itself narrows it.',
    'If a concrete shared activity, object, or subtask is already in progress, stay on that same focus instead of switching to a nearby room detail or different task.',
    'Use a concrete detail, action, request, or emotional cue from the latest exchange when natural so the line clearly belongs to this moment.',
    'Do not pull in background lore, job framing, relationship labels, worldbuilding, or premise details unless the latest exchange clearly invokes them.',
    'Reply to the character\'s latest line or action, not to your own earlier turn.',
    'If the latest character move is a question, invitation, challenge, or instruction, prefer a line that answers it directly or advances that exact exchange.',
    'If the latest character move contains advice, a recommendation, or a proposed next step, prefer a line that accepts it, refuses it, questions it, or modifies it directly.',
    'Stay in the same moment. Do not reset the scene or drift generic.',
    'If the line could work in many unrelated scenes, it is too generic.',
    'Skip setup clauses and reflective filler. Avoid openings like I appreciate..., I understand..., I can\'t help but..., I find myself..., I must admit..., Well....',
    isBot
      ? ''
      : `Do not describe ${runtimeState.characterName}'s feelings or actions as if they belong to ${runtimeState.userName}.`,
    isBot
      ? ''
      : 'Forward is relative to this exact scene, not a fixed style target.',
    'Usually 2 to 9 words, never more than 12 words.',
    runtimeState.compiledRuntimeCard.personaAnchor
      ? `Keep it grounded in ${runtimeState.characterName}'s persona and the current chemistry.`
      : '',
    ...getAssistModeRules(runtimeState, 'suggestions'),
    'Match the conversation language and local tone of the latest exchange.',
    intensityLine,
    avoidList.length > 0 ? `Do not repeat or paraphrase: ${avoidList.join(' | ')}` : '',
    'No commentary or extra keys.'
  ].filter(Boolean).join('\n');
}

function buildSuggestionScopeInstruction(runtimeState) {
  const scope = runtimeState.sceneState?.turn_scope;
  const userScope = runtimeState.sceneState?.user_turn_scope;
  const rules = [];

  if (scope?.level === 'response_cue') {
    rules.push('The latest exchange ends on a direct response cue. Answer or acknowledge that cue before opening any different focus.');
  }

  if (userScope?.level === 'broad_area_selection') {
    rules.push('The latest user turn only selects the next area or stage. Stay at that same scope. Confirm, proceed, or choose where to begin there without inventing a narrower object, chore, tool, or micro-task.');
  } else if (userScope?.level === 'generic_task') {
    rules.push('The latest user turn asks for a generic inspection or review. Keep it generic unless the exchange itself names the object. Do not choose the inspection target for the user.');
  } else if (userScope?.level === 'concrete_task') {
    rules.push('The latest user turn already names the task or object. Stay on that exact task instead of drifting to a nearby one.');
  } else if (userScope?.level === 'question') {
    rules.push('The latest user turn is a question. Answer the whole question directly before opening a different thread.');
  }

  if (rules.length === 0) {
    rules.push('Stay on the full latest beat instead of narrowing or widening it on your own.');
  }

  return rules.join(' ');
}

function buildSuggestionWriterRole(runtimeState) {
  const isBot = runtimeState.compiledRuntimeCard.runtimeDefaults.type === 'bot';
  const suggestionMode = runtimeState.runtimeSteering.suggestionMode || 'single';

  return [
    isBot
      ? `Quick-reply ghostwriter for ${runtimeState.userName} in a chat with ${runtimeState.characterName}.`
      : `Next-turn ghostwriter for ${runtimeState.userName} in a scene with ${runtimeState.characterName}.`,
    suggestionMode === 'batch'
      ? 'Write a small set of sendable replies the user can click now.'
      : 'Write one sendable reply the user can click now.',
    isBot
      ? `Write only ${runtimeState.userName}'s side. No planning, commentary, or narrator voice. Keep useful variety instead of flattening everything into one tone.`
      : `Write only ${runtimeState.userName}'s side. No planning, commentary, or narrator voice. When action fits, write ${runtimeState.userName}'s move directly; action plus dialogue can beat a bare request. Keep useful variety instead of forcing one tone or one dialogue/action balance.`
  ].filter(Boolean).join(' ');
}

function buildImpersonateLateSteering(runtimeState) {
  const isBot = runtimeState.compiledRuntimeCard.runtimeDefaults.type === 'bot';
  const intensityLine = runtimeState.runtimeSteering.passionLevel > 15
    ? `Match the current scene intensity at ${runtimeState.runtimeSteering.passionLevel}/100. Do not soften it.`
    : '';

  return [
    `Write ${runtimeState.userName}'s next reply in an ongoing ${isBot ? 'conversation' : 'roleplay scene'} with ${runtimeState.characterName}.`,
    `Write ${runtimeState.userName}'s reply in FIRST PERSON (I/me/my).`,
    `NEVER write as ${runtimeState.characterName}.`,
    `NEVER narrate ${runtimeState.userName} from outside in second or third person.`,
    'Prefer 1-2 sentences. A 3rd sentence is allowed if it helps the reply land naturally.',
    'Actions go in *asterisks*. Dialogue stays plain text.',
    'Keep the same language as the conversation.',
    'Default to the user\'s recent voice, directness, and pacing.',
    'Answer the latest beat naturally. Move the scene forward when it fits, but do not force a dramatic move every time.',
    isBot
      ? 'Stay inside the exact active exchange and answer what the bot just said or asked.'
      : `Stay inside the exact scene established by the recent conversation. Do not invent a new location, prop, room, or time jump unless the scene already changed there. Keep the reply grounded in what ${runtimeState.characterName} just did or said.`,
    runtimeState.compiledRuntimeCard.personaAnchor
      ? `Keep the response tuned to ${runtimeState.characterName}'s specific persona and chemistry instead of generic romance language.`
      : '',
    ...getAssistModeRules(runtimeState, 'impersonate'),
    intensityLine
  ].filter(Boolean).join('\n');
}

function buildRecentUserVoiceExamples(runtimeState) {
  const samples = runtimeState.selectedRecentHistory.messages
    .filter((message) => message.role === 'user')
    .slice(-3)
    .map((message) => trimPromptSnippet(message.content, 170))
    .filter(Boolean);

  if (samples.length === 0) return '';

  return samples
    .map((sample, index) => `${index + 1}. ${sample}`)
    .join('\n');
}

function buildImpersonateUserPrompt(runtimeState, recentTail) {
  const isBot = runtimeState.compiledRuntimeCard.runtimeDefaults.type === 'bot';
  const currentBeat = [
    runtimeState.activeScene.latest_character_action_or_reaction ? `${runtimeState.characterName}: ${runtimeState.activeScene.latest_character_action_or_reaction}` : '',
    runtimeState.activeScene.latest_user_action_or_request ? `${runtimeState.userName}: ${runtimeState.activeScene.latest_user_action_or_request}` : ''
  ].filter(Boolean).join('\n');
  const sceneSummary = clipStructuredSceneText(renderActiveScene(runtimeState.activeScene, { compact: false }), 105, 120)
    || trimPromptSnippet(renderActiveScene(runtimeState.activeScene, { compact: true }), 220);
  const recentConversation = formatHistory(recentTail, runtimeState.characterName, runtimeState.userName)
    || currentBeat
    || trimPromptSnippet(renderActiveScene(runtimeState.activeScene, { compact: true }), 220);
  const voiceExamples = buildRecentUserVoiceExamples(runtimeState);

  return [
    `Current beat:\n${currentBeat || trimPromptSnippet(renderActiveScene(runtimeState.activeScene, { compact: true }), 160)}`,
    `Scene summary:\n${sceneSummary || 'Use the current beat above.'}`,
    voiceExamples ? `Recent ${runtimeState.userName} voice examples:\n${voiceExamples}` : '',
    `Recent conversation:\n${recentConversation}`,
    isBot
      ? `Write ${runtimeState.userName}'s next reply so the exchange clearly moves forward:`
      : `Write ${runtimeState.userName}'s next reply so the scene clearly moves forward:`
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

  if (profile === 'suggestions') {
    const isBot = runtimeState.compiledRuntimeCard.runtimeDefaults.type === 'bot';
    const suggestionMode = runtimeState.runtimeSteering.suggestionMode || 'single';
    const candidateCount = Math.max(3, Math.min(4, Number(runtimeState.runtimeSteering.suggestionCandidateCount) || 4));
    const recentTail = runtimeState.selectedRecentHistory.messages.slice(suggestionMode === 'batch' ? -4 : -2);
    const latestAssistantFull = [...runtimeState.selectedRecentHistory.messages].reverse().find((message) => message.role === 'assistant')?.content || '';
    const latestUserFull = [...runtimeState.selectedRecentHistory.messages].reverse().find((message) => message.role === 'user')?.content || '';
    const latestAssistantEnding = latestAssistantFull ? extractLatestMessageEnding(latestAssistantFull, 2, 220) : '';
    const latestUserEnding = latestUserFull ? extractLatestMessageEnding(latestUserFull, 2, 180) : '';
    const latestCharacterBeat = runtimeState.activeScene.latest_character_action_or_reaction
      ? `${runtimeState.characterName}: ${runtimeState.activeScene.latest_character_action_or_reaction}`
      : '';
    const latestUserBeat = runtimeState.activeScene.latest_user_action_or_request
      ? `${runtimeState.userName}: ${runtimeState.activeScene.latest_user_action_or_request}`
      : '';
    const compactScene = renderActiveScene(runtimeState.activeScene, { compact: true });
    const exchangeAnchorHistory = suggestionMode === 'batch' && latestAssistantFull ? recentTail.slice(0, -1) : recentTail;
    const voiceExamples = buildRecentUserVoiceExamples(runtimeState);
    const currentTask = latestUserBeat ? latestUserBeat : '';
    const userTurnScope = runtimeState.sceneState?.user_turn_scope || null;
    const turnScope = runtimeState.sceneState?.turn_scope || null;
    const preferAssistantCue = runtimeState.sceneState?.last_turn_role === 'assistant' && Boolean(runtimeState.activeScene.open_thread);
    const preserveUserScope = preferAssistantCue && ['broad_area_selection', 'generic_task'].includes(userTurnScope?.level || '');
    const scopeSensitiveCharacterBeat = preserveUserScope ? '' : latestCharacterBeat;
    const suggestionExampleSeed = runtimeState.compiledRuntimeCard.exampleSeed && runtimeState.compiledRuntimeCard.runtimeDefaults.type !== 'bot'
      ? clipToTokenTarget(runtimeState.compiledRuntimeCard.exampleSeed, targets.exampleSeed || 90)
      : '';
    const suggestionScopeInstruction = buildSuggestionScopeInstruction(runtimeState);
    const suggestionScopeBlock = [
      userTurnScope?.anchor || userTurnScope?.guidance
        ? buildPlainTextBlock('User Turn Scope', clipStructuredSceneText([
          userTurnScope?.level ? `Level: ${userTurnScope.level}` : '',
          userTurnScope?.anchor ? `Anchor: ${userTurnScope.anchor}` : '',
          userTurnScope?.guidance ? `Guidance: ${userTurnScope.guidance}` : ''
        ].filter(Boolean).join('\n'), 42, 110))
        : '',
      turnScope?.anchor || turnScope?.guidance
        ? buildPlainTextBlock('Exchange Scope', clipStructuredSceneText([
          turnScope?.level ? `Level: ${turnScope.level}` : '',
          turnScope?.anchor ? `Anchor: ${turnScope.anchor}` : '',
          turnScope?.guidance ? `Guidance: ${turnScope.guidance}` : ''
        ].filter(Boolean).join('\n'), 42, 110))
        : ''
    ].filter(Boolean).join('\n\n');
    const personaAnchor = runtimeState.compiledRuntimeCard.personaAnchor
      ? buildPlainTextBlock('Persona Anchor', clipToTokenTarget(runtimeState.compiledRuntimeCard.personaAnchor, 36))
      : buildPlainTextBlock('Character Reference', clipToTokenTarget(runtimeState.compiledRuntimeCard.characterCore, 34));
    const systemPrompt = [
      buildPlainTextBlock('Suggestion Writer Role', clipToTokenTarget(buildSuggestionWriterRole(runtimeState), targets.writerRole || 64)),
      buildPlainTextBlock('Active Scene', clipStructuredSceneText(compactScene, targets.activeScene, 110)),
      suggestionScopeBlock,
      suggestionExampleSeed ? buildPlainTextBlock('Voice Seed', suggestionExampleSeed) : '',
      buildPlainTextBlock('Late Steering', clipToTokenTarget([
        buildSuggestionLateSteering(runtimeState),
        suggestionScopeInstruction
      ].filter(Boolean).join('\n'), targets.lateSteering)),
      personaAnchor
    ].filter(Boolean).join('\n\n');

    debug.includedBlocks.push('Suggestion Writer Role', 'Active Scene', 'Late Steering');
    if (suggestionScopeBlock) {
      debug.includedBlocks.push('Turn Scope');
    }
    if (suggestionExampleSeed) {
      debug.includedBlocks.push('Voice Seed');
    } else {
      debug.droppedBlocks.push('Voice Seed');
    }
    debug.droppedBlocks.push('Global Core');
    if (runtimeState.compiledRuntimeCard.personaAnchor) {
      debug.includedBlocks.push('Persona Anchor');
      debug.droppedBlocks.push('Character Core');
    } else {
      debug.includedBlocks.push('Character Reference');
      debug.droppedBlocks.push('Persona Anchor', 'Character Core');
    }

    return {
      profile,
      systemPrompt,
      userPrompt: [
        suggestionMode === 'batch' && latestAssistantFull
          ? `Latest full ${runtimeState.characterName} message:\n${latestAssistantFull}`
          : '',
        suggestionMode === 'batch' && latestUserFull
          ? `Previous full ${runtimeState.userName} message:\n${latestUserFull}`
          : '',
        suggestionMode === 'batch' && latestAssistantEnding
          ? `Final cue from latest ${runtimeState.characterName} message:\n${latestAssistantEnding}`
          : '',
        suggestionMode === 'batch' && latestUserEnding
          ? `Ending of previous ${runtimeState.userName} message:\n${latestUserEnding}`
          : '',
        `Latest exchange anchor:\n${formatHistory(exchangeAnchorHistory, runtimeState.characterName, runtimeState.userName) || trimPromptSnippet(compactScene, 160)}`,
        suggestionMode === 'batch' ? 'Read the whole latest full message above. Answer its final cue first when one is present. If earlier and later cues compete, follow the ending. The last 1-2 sentences matter most.' : '',
        currentTask ? `Current task:\n${currentTask}` : '',
        userTurnScope?.level ? `User turn scope:\n${userTurnScope.level}` : '',
        runtimeState.activeScene.open_thread ? `Response cue:\n${runtimeState.activeScene.open_thread}` : '',
        userTurnScope?.anchor ? `User scope anchor:\n${userTurnScope.anchor}` : '',
        userTurnScope?.guidance ? `User scope guidance:\n${userTurnScope.guidance}` : '',
        turnScope?.level ? `Exchange scope:\n${turnScope.level}` : '',
        turnScope?.anchor ? `Exchange scope anchor:\n${turnScope.anchor}` : '',
        turnScope?.guidance ? `Exchange scope guidance:\n${turnScope.guidance}` : '',
        scopeSensitiveCharacterBeat ? `Latest character beat:\n${scopeSensitiveCharacterBeat}` : '',
        latestUserBeat && !preferAssistantCue ? `Previous user beat:\n${latestUserBeat}` : `Current beat:\n${[scopeSensitiveCharacterBeat, latestUserBeat].filter(Boolean).join('\n') || trimPromptSnippet(compactScene, 120)}`,
        voiceExamples ? `Recent ${runtimeState.userName} voice examples:\n${voiceExamples}` : '',
        suggestionMode === 'batch'
          ? (isBot
              ? `Generate ${candidateCount} sendable replies for ${runtimeState.userName} in the same exchange. Return JSON with {"replies":[{"text":"...","intent":"reply"}]}.`
              : `Generate ${candidateCount} sendable next turns for ${runtimeState.userName} in the same scene. Make them short, vivid moves, not explanatory sentences. Dialogue, action, or action-plus-dialogue are all fine when they fit. If the recent user voice uses first-person action, keep some of that embodied style. Let the style come from the latest exchange, not generic character setup. Return JSON with {"replies":[{"text":"...","intent":"reply"}]}.`)
          : (isBot
              ? `Write one ${runtimeState.runtimeSteering.suggestionRole || 'stay'} sendable reply for ${runtimeState.userName} in the same exchange. Return JSON with {"suggestion":"..."}.`
              : `Write one ${runtimeState.runtimeSteering.suggestionRole || 'stay'} sendable next turn for ${runtimeState.userName} in the same scene. Make it a short, vivid move, not a full explanatory sentence. Dialogue, action, or action-plus-dialogue are all fine when they fit. If the recent user voice uses first-person action, keep some of that embodied style. Let the style come from the latest exchange, not generic character setup. Return JSON with {"suggestion":"..."}.`)
      ].filter(Boolean).join('\n\n'),
      debug: {
        ...debug,
        historyCountKept: recentTail.length
      }
    };
  }

  const recentTail = runtimeState.selectedRecentHistory.messages.slice(-4);
  const minimalCharacterReference = clipToTokenTarget(runtimeState.compiledRuntimeCard.characterCore, targets.characterCore);
  const systemPrompt = [
    buildPlainTextBlock('Global Core', clipToTokenTarget(runtimeState.compiledRuntimeCard.globalCore, 60)),
    buildPlainTextBlock('Active Scene', clipStructuredSceneText(renderActiveScene(runtimeState.activeScene, { compact: true }), targets.activeScene, 115)),
    runtimeState.compiledRuntimeCard.personaAnchor
      ? buildPlainTextBlock('Persona Anchor', clipToTokenTarget(runtimeState.compiledRuntimeCard.personaAnchor, 75))
      : '',
    buildPlainTextBlock('Character Reference', minimalCharacterReference),
    buildPlainTextBlock('Late Steering', clipToTokenTarget(buildImpersonateLateSteering(runtimeState), targets.lateSteering))
  ].filter(Boolean).join('\n\n');

  debug.includedBlocks.push('Global Core', 'Active Scene', 'Character Reference', 'Late Steering');
  if (runtimeState.compiledRuntimeCard.personaAnchor) {
    debug.includedBlocks.push('Persona Anchor');
  } else {
    debug.droppedBlocks.push('Persona Anchor');
  }
  debug.droppedBlocks.push('Example Seed');

  return {
    profile,
    systemPrompt,
    userPrompt: buildImpersonateUserPrompt(runtimeState, recentTail),
    debug: {
      ...debug,
      historyCountKept: recentTail.length
    }
  };
}
