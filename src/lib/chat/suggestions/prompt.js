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

Mirror ${userName}'s style. Use the same rhythm, format, and register as the most recent ${userName} messages. If they use *asterisk actions*, use them too. If they speak in plain dialogue, do the same. Match the language of the latest ${userName} messages.

If the latest ${characterName} message ends with a question, an invitation, or a clear cue, every pill answers or responds to it directly.

Each pill is a different intensity step. The three pills must be clearly distinct from each other — different action, different words, different angle:
- stay = the most natural immediate response that meets ${characterName} where they are
- forward = one concrete step bolder. Favor a small physical move when the scene allows — a touch, a step closer, a shift in posture, an object the user picks up or sets down. Speech alone is fine when the scene cannot support a physical move.
- push = an embodied physical action the user performs. Take her hand. Kiss her. Pull her in. Set the glass down and stand up. Walk out the door. Not just speech, not just intent — a concrete physical move that commits to the moment.

Stay rooted in the body. When the scene allows it, two of the three pills should describe what ${userName} does, not just what they say.

Each pill is one short sendable line. Max 10 words. Similar length across the three.

Return only valid JSON:
{
  "pills": [
    { "role": "stay",    "text": "" },
    { "role": "forward", "text": "" },
    { "role": "push",    "text": "" }
  ]
}
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
 * @param {Object} options.compiledCard - Character runtime card with characterCore property.
 * @param {string} options.compiledCard.characterCore - Character's core personality and traits.
 * @param {Array<{role: string, content: string}>} options.history - Recent chat messages with role ('user'|'assistant') and content.
 * @param {string} options.characterName - Character's display name.
 * @param {string} options.userName - User's display name.
 * @param {string} [options.openThread] - Cliff snippet from the latest character turn used as the per-turn anchor.
 * @returns {{systemPrompt: string, userPrompt: string}} Object containing formatted system and user prompts.
 */
export function buildSuggestionPrompt({
  compiledCard,
  history,
  characterName,
  userName,
  openThread
}) {
  const characterCore = String(compiledCard?.characterCore || '').trim() || characterName;
  const openThreadText = String(openThread || '').trim();

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

  const systemPrompt = SYSTEM_TEMPLATE(characterName, userName, characterCore, openThreadText);

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
