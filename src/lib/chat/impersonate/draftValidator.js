import { cleanTranscriptArtifacts } from '../common.js';
import {
  escapeRegex,
  repairLeadingActionBlock,
  repairLeadingNarrationSegment
} from '../language.js';

const GENERIC_PATTERN = /\b(?:electricity between us|cannot deny|there'?s no denying|lingering for a heartbeat longer than necessary|beneath those long lashes|warm smile spreads|vision bathed in|presence has come to mean|hint of color in her cheeks|warmth between us|something unspoken)\b/i;
const META_LEAD_PATTERN = /^(?:here(?:'s| is)?|sure|okay|alright|i can|i'll|let me|try this|you could say|maybe)\b/i;
const MALFORMED_LEAD_PATTERN = /^\*?\s*I\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/;

/**
 * Detects boilerplate phrasing that signals a generic, low-effort draft.
 * @param {string} text
 * @returns {boolean}
 */
export function containsGenericPhrasing(text) {
  return GENERIC_PATTERN.test(String(text || ''));
}

/**
 * Detects meta/assistant-style leads (e.g. "Sure, here's...").
 * @param {string} text
 * @returns {boolean}
 */
export function containsMetaLead(text) {
  return META_LEAD_PATTERN.test(String(text || '').trim());
}

/**
 * Returns true when a draft begins from the wrong POV or with malformed casing.
 * @param {string} text
 * @param {string} userName
 * @param {string} [charName]
 * @returns {boolean}
 */
export function hasInvalidImpersonateLead(text, userName, charName = '') {
  const trimmed = String(text || '').trim();
  if (!trimmed) return true;
  if (MALFORMED_LEAD_PATTERN.test(trimmed)) return true;
  const escapedUserName = escapeRegex(userName || 'User');
  const invalidLeads = [
    'You\\b',
    'Your\\b',
    "You're\\b",
    "You've\\b",
    "You'll\\b",
    "You'd\\b",
    `${escapedUserName}\\b`,
    `${escapedUserName}'s\\b`,
    '\\*?\\s*(?:She|He|Her|His)\\b'
  ];
  if (charName) invalidLeads.push(`${escapeRegex(charName)}\\b`);
  return new RegExp(`^(?:${invalidLeads.join('|')})`, 'i').test(trimmed);
}

/**
 * Sanitizes a raw model draft into a user-POV impersonate reply.
 * @param {string} rawText
 * @param {{ charName?: string, userName?: string }} [options]
 * @returns {{ text: string, repaired: boolean, valid: boolean }}
 */
export function finalizeImpersonateDraft(rawText, { charName = '', userName = 'User' } = {}) {
  let cleaned = String(rawText || '').trim();
  if (!cleaned) return { text: '', repaired: false, valid: false };

  cleaned = cleaned.replace(/<\/s>/g, '');
  cleaned = cleaned.replace(/\[TOOL_CALLS\]/g, '');
  cleaned = cleaned.replace(/<\|[^|]*\|>/g, '');
  cleaned = cleaned.replace(/~+\s*$/g, '');
  cleaned = cleaned.replace(/\s*\(\d+\s*words?\)\s*/gi, ' ');
  cleaned = cleaned.replace(/^[./]+(?=\*)/gm, '');

  const metaCut = cleaned.search(/\n---|\n\n(?:I chose|I picked|This |The |Here |Note)/i);
  if (metaCut > 0) cleaned = cleaned.substring(0, metaCut);

  // Pre-clean blank: cleanTranscriptArtifacts strips `${charName}:` lines, so a post-clean check would never fire on bare char-led drafts.
  if (charName && (cleaned.startsWith(`${charName}:`) || cleaned.startsWith(`${charName} :`))) {
    return { text: '', repaired: false, valid: false };
  }

  cleaned = cleanTranscriptArtifacts(cleaned, charName);

  const lastCh = cleaned.slice(-1);
  if (lastCh && !['.', '!', '?', '"', '*', ')'].includes(lastCh)) {
    const end = Math.max(
      cleaned.lastIndexOf('*'),
      cleaned.lastIndexOf('"'),
      cleaned.lastIndexOf('.'),
      cleaned.lastIndexOf('!'),
      cleaned.lastIndexOf('?')
    );
    if (end > 0 && end > cleaned.length * 0.3) cleaned = cleaned.substring(0, end + 1);
  }

  if (charName) {
    const charSpeakIdx = cleaned.indexOf(`\n${charName}:`);
    if (charSpeakIdx >= 0) cleaned = cleaned.substring(0, charSpeakIdx).trim();
  }

  if (cleaned.startsWith(`${userName}:`) || cleaned.startsWith(`${userName} :`)) {
    cleaned = cleaned.replace(/^\S+:\s*/, '');
  }
  cleaned = cleaned.replace(/^I:\s*/i, '');
  cleaned = cleaned.replace(/^User:\s*/i, '');

  const beforeRepair = cleaned;
  cleaned = repairLeadingActionBlock(cleaned, userName);
  if (!cleaned.startsWith('*')) {
    cleaned = repairLeadingNarrationSegment(cleaned, userName);
  }

  cleaned = cleaned.trim();

  return {
    text: cleaned,
    repaired: cleaned !== beforeRepair,
    valid: Boolean(cleaned) && !hasInvalidImpersonateLead(cleaned, userName, charName)
  };
}

/**
 * Structural-only gate for impersonate drafts. Verifies POV correctness and that
 * the draft is non-trivially populated. Length threshold is intentionally low (4)
 * — quality and length are governed by the prompt + sampler upstream, not by a
 * post-hoc validator.
 *
 * @param {string} text
 * @param {string} userName
 * @param {string} charName
 * @returns {boolean}
 */
export function isStructurallyValid(text, userName, charName) {
  const trimmed = String(text || '').trim();
  if (trimmed.length < 4) return false;
  if (hasInvalidImpersonateLead(trimmed, userName, charName)) return false;
  return true;
}

const BODY_PARTS = '(?:head|hand|hands|stomach|belly|face|eyes|lips|chest|arm|arms|shoulder|shoulders|back|leg|legs|chin|neck|hair|lap|wrist|knee|knees|mouth|jaw|finger|fingers)';

function userPossessivePronouns(userPronouns) {
  const p = String(userPronouns || '').toLowerCase();
  const out = [];
  if (/\bhe\b|\bhim\b|\bhis\b/.test(p)) out.push('his');
  if (/\bshe\b|\bher\b|\bhers\b/.test(p)) out.push('her');
  if (/\bthey\b|\bthem\b|\btheir\b/.test(p)) out.push('their');
  return out;
}

/**
 * Detects 3rd-person POV bleed inside *action* segments (user narrated as he/she/they).
 * Scoped to asterisk blocks where the implicit subject is the user.
 * Same-pronoun scenes (e.g. she-user + she-char) may produce false positives —
 * acceptable trade-off until a char.gender field exists.
 *
 * @param {string} text
 * @param {string} userPronouns - e.g. "he/him"
 * @returns {boolean}
 */
export function containsMidSentencePovBleed(text, userPronouns) {
  const pron = userPossessivePronouns(userPronouns);
  if (!pron.length) return false;
  const actionRe = /\*([^*]+)\*/g;
  const pronRe = new RegExp(`\\b(?:${pron.join('|')})\\s+${BODY_PARTS}\\b`, 'i');
  let m;
  while ((m = actionRe.exec(String(text || ''))) !== null) {
    if (pronRe.test(m[1])) return true;
  }
  return false;
}
