/**
 * Pure prompt builder for Smart Suggestions v2 (beat-adaptive).
 * Single positive POV constraint, closing-line block, few-shot mirror.
 */

const CLOSING_LINE_MAX_CHARS = 600;
const USER_MIRROR_MAX_CHARS = 280;

/**
 * @param {string} text
 * @returns {string}
 */
export function deriveClosingLine(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  const sentences = (t.match(/[^.!?…]+[.!?…]+["')\]]*|[^.!?…]+$/g) || [t]).map((s) => s.trim()).filter(Boolean);
  const last3 = sentences.slice(-3).join(' ').trim();
  if (last3.length <= CLOSING_LINE_MAX_CHARS) return last3;
  return last3.slice(last3.length - CLOSING_LINE_MAX_CHARS).trim();
}

function lastUserMessage(history) {
  const reversed = [...(history || [])].reverse();
  const found = reversed.find((m) => m?.role === 'user' && String(m.content || '').trim());
  if (!found) return '';
  const t = String(found.content).trim();
  if (t.length <= USER_MIRROR_MAX_CHARS) return t;
  return t.slice(0, USER_MIRROR_MAX_CHARS - 1).trimEnd() + '…';
}

function lastCharMessage(history) {
  const reversed = [...(history || [])].reverse();
  const found = reversed.find((m) => m?.role === 'assistant' && String(m.content || '').trim());
  return found ? String(found.content).trim() : '';
}

/**
 * Builds system + user prompts for Smart Suggestions v2.
 *
 * @param {object} args
 * @param {Array<{role:string,content:string}>} args.history
 * @param {string} args.characterName
 * @param {string} args.userName
 * @param {string} args.appLanguageName - Display name like "German".
 * @returns {{systemPrompt:string, userPrompt:string}}
 */
export function buildSuggestionPrompt({ history, characterName, userName, appLanguageName }) {
  const lang = String(appLanguageName || '').trim() || 'English';
  const closing = deriveClosingLine(lastCharMessage(history));
  const mirror = lastUserMessage(history);

  const closingBlock = closing
    ? `Closing line of ${characterName}'s last message (read this most carefully):\n> ${closing}`
    : `(scene just started)`;

  const mirrorBlock = mirror
    ? `Recent ${userName} voice (mirror style + language):\n> ${mirror}`
    : `(no prior ${userName} messages yet)`;

  const systemPrompt = [
    `You write three pills for ${userName} replying to ${characterName} in an ongoing scene.`,
    '',
    `${userName}'s speech and movement are ONLY defined by ${userName} input.`,
    `Each pill is written by ${userName} in first person, addressing ${characterName} directly. Use "I", "me", "my". Pills may include one short ${userName} action in *asterisks* before or after the dialogue (e.g. *leans in* "I want to hear it"). Pills stay within ${userName}'s voice: ${userName}'s actions, ${userName}'s words. ${characterName}'s name, dialogue, actions, and thoughts belong outside the pill.`,
    '',
    closingBlock,
    '',
    mirrorBlock,
    '',
    'Steps:',
    `1. Classify beat: refusal | invitation | uncertain`,
    `2. Generate three pills mapped to beat tones (hold, move, press)`,
    `3. Each pill is at most 18 words, in ${lang}, and distinct from each other`,
    '',
    'Output JSON matching the schema.'
  ].join('\n');

  const userPrompt = 'Generate the JSON now.';
  return { systemPrompt, userPrompt };
}
