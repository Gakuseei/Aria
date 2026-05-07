/**
 * Pure prompt builder for the Smart Suggestions feature.
 * Inputs: compiled runtime card, recent history slice, character name, user name.
 * Output: { systemPrompt, userPrompt }.
 */

export const SUGGESTION_PROMPT_CONSTANTS = Object.freeze({
  userMsgTrimChars: 280,
  charMsgTrimChars: 600,
  recentUserCount: 3,
  recentCharCount: 2
});

const SYSTEM_TEMPLATE = (characterName, userName, characterCore, openThread) => `
You write three short reply pills for ${userName} in an ongoing scene with ${characterName}.

${characterName}: ${characterCore}

Open thread right now: ${openThread || '(scene just started)'}

Match ${userName}'s voice and the language of the most recent ${userName} messages. Anchor every pill to the latest beat from ${characterName} — especially the closing line.

Return only valid JSON:
{
  "pills": [
    { "role": "stay",    "text": "<natural immediate response>" },
    { "role": "forward", "text": "<lean in slightly>" },
    { "role": "push",    "text": "<commit fully>" }
  ]
}

Pills can be dialogue, action, or a mix — pick whichever fits the latest beat.
Keep similar length across the three.
Each pill is a single sendable line, max ~12 words.
`.trim();

function trimText(value, cap) {
  const text = String(value || '').trim();
  if (text.length <= cap) return text;
  return text.slice(0, cap - 1).trimEnd() + '…';
}

function takeLast(messages, role, count) {
  return messages.filter((m) => m?.role === role).slice(-count);
}

/**
 * Builds system and user prompts for the Smart Suggestions feature.
 * @param {Object} options
 * @param {Object} options.compiledCard - Character runtime card with characterCore and activeScene.open_thread properties.
 * @param {string} options.compiledCard.characterCore - Character's core personality and traits.
 * @param {string} options.compiledCard.activeScene.open_thread - Current scene context or opening line.
 * @param {Array<{role: string, content: string}>} options.history - Recent chat messages with role ('user'|'assistant') and content.
 * @param {string} options.characterName - Character's display name.
 * @param {string} options.userName - User's display name.
 * @returns {{systemPrompt: string, userPrompt: string}} Object containing formatted system and user prompts.
 */
export function buildSuggestionPrompt({
  compiledCard,
  history,
  characterName,
  userName
}) {
  const characterCore = String(compiledCard?.characterCore || '').trim() || characterName;
  const openThread = String(compiledCard?.activeScene?.open_thread || '').trim();

  const recentUser = takeLast(history || [], 'user', SUGGESTION_PROMPT_CONSTANTS.recentUserCount);
  const recentChar = takeLast(history || [], 'assistant', SUGGESTION_PROMPT_CONSTANTS.recentCharCount);

  const userBlock = recentUser.length === 0
    ? '(no prior user messages yet)'
    : recentUser.map((m) => `- ${trimText(m.content, SUGGESTION_PROMPT_CONSTANTS.userMsgTrimChars)}`).join('\n');

  const charBlock = recentChar.length === 0
    ? '(no prior character messages yet)'
    : recentChar.map((m) => `- ${trimText(m.content, SUGGESTION_PROMPT_CONSTANTS.charMsgTrimChars)}`).join('\n');

  const charCliffNote = recentChar.length > 0
    ? '\n  (latest, closing line matters most)'
    : '';

  const systemPrompt = SYSTEM_TEMPLATE(characterName, userName, characterCore, openThread);

  const userPrompt = [
    `Recent ${userName} messages (for voice and language):`,
    userBlock,
    '',
    `Recent ${characterName} messages:${charCliffNote}`,
    charBlock,
    '',
    'Generate the three pills now.'
  ].join('\n');

  return { systemPrompt, userPrompt };
}
