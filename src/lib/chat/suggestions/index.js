import { OLLAMA_DEFAULT_URL, DEFAULT_MODEL_NAME } from '../../defaults.js';
import { assembleRuntimeContext, buildRuntimeState } from '../../chatRuntime/index.js';
import { ASSIST_BUDGET_CONFIG, deriveAssistBudgetTier, getModelCtx, getModelCapabilities } from '../../ollama/index.js';
import { isElectron } from '../platform.js';
import { deconjugateSimplePresent, repairLeadingActionBlock, repairLeadingNarrationSegment } from '../language.js';
import { getModelProfile } from '../../modelProfiles.js';

let suggestionAbortController = null;
let suggestionRequestId = 0;
const MIN_USABLE_SUGGESTIONS = 1;
const SUGGESTION_TARGET_COUNT = 3;
const SUGGESTION_MAX_WORDS = 12;
const SUGGESTION_MAX_CHARS = 84;
const SUGGESTION_ROLE_ORDER = ['stay', 'bold', 'progress'];

const SINGLE_SUGGESTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    suggestion: { type: 'string', maxLength: 120 }
  },
  required: ['suggestion']
};

const SUGGESTION_REQUEST_SPECS = [
  { role: 'stay', temperature: 0.36, maxTokens: 48 },
  { role: 'bold', temperature: 0.46, maxTokens: 56 },
  { role: 'progress', temperature: 0.42, maxTokens: 60 }
];

const SUGGESTION_RETRY_NOTE = 'Retry note: the previous answer drifted, got too generic, or broke formatting. Return one cleaner suggestion that is tightly anchored to the latest exchange, uses a concrete detail when natural, and stays sendable right now.';

const SUGGESTION_META_PATTERN = /^(?:here(?:'s| are)?|these(?: are)?|sure|okay|note|options?|suggestions?|you could say|you might say|try saying)\b/i;
const SUGGESTION_NON_ACTION_PATTERN = /^(?:explain|describe|clarify|suggest|propose)\b/i;
const SUGGESTION_DETACHED_DIRECTIVE_PATTERN = /^(?:watch|inspect|examine|evaluate|assess|verify|check|observe|monitor)\b/i;
const SUGGESTION_SELF_INSTRUCTION_PATTERN = /^(?:maintain|keep)\s+(?:eye contact|my gaze|gaze)\b/i;
const SUGGESTION_FIRST_PERSON_SELF_INSTRUCTION_PATTERN = /^\*?I\s+(?:maintain|keep)\s+(?:eye contact|my gaze|gaze)\b/i;
const SUGGESTION_META_DIRECTIVE_LEAD_PATTERN = /^(?:ask|asking|compliment|complimenting|praise|praising|reassure|reassuring|explain|explaining|describe|describing|suggest|suggesting|propose|proposing)\b/i;
const SUGGESTION_LABEL_PATTERN = /^(?:stay|safe|progress|bold|option\s*\d+|action\s*\d+|current beat|stay in scene|move forward|bolder(?: or more forward)?|fresh angle|unexpected(?: angle)?)\s*[:\-]\s*/i;
const SUGGESTION_BAD_LEAD_PATTERN = /^(?:i|you|he|she|they|we|it|this|that|these|those|there|here|please|option|action|pace|scene|same|stay|progress|bolder|fresh)\b/i;
const SUGGESTION_DIALOGUE_PATTERN = /["“”]/;
const SUGGESTION_OVEREXPLAIN_PATTERN = /\b(?:because|while|so that|which makes|letting|making|feeling|as you|as she|as he)\b/i;
const SUGGESTION_DIRECT_DIALOGUE_VERB_PATTERN = /\b(?:say|saying|said|murmur|murmuring|whisper|whispering|tell|telling|ask|asking)\b/i;
const SUGGESTION_PROGRESSIVE_TAIL_PATTERN = /\s+and\s+(?:begin|starting|start|continue|continuing|keep|keeping|list|listing|tell|telling|explain|explaining|show|showing|reveal|revealing)\b/i;
const SUGGESTION_FUTURE_PLAN_PATTERN = /\b(?:in future|in the future|from now on|next time|later tonight|tomorrow|going forward)\b/i;
const SUGGESTION_AUTHORITY_TONE_PATTERN = /\b(?:i command|i order|i insist|you will|you must)\b/i;
const SUGGESTION_PASSIVE_PATTERN = /\b(?:smile|nod|look|glance|watch|wait|pause|listen)\b/i;
const SUGGESTION_PROGRESS_PATTERN = /\b(?:invite|pull|guide|lead|bring|take|sit|move|close|touch|kiss|confess|admit|answer|ask|offer|decide|tell|reveal|reach)\b/i;
const SUGGESTION_BOLD_PATTERN = /\b(?:touch|kiss|pull|guide|lean|closer|waist|thigh|lap|admit|confess|breath|neck)\b/i;
const SUGGESTION_ACTION_OBJECT_PATTERN = /\b(?:her|him|them|their|his|face|hair|hand|hands|waist|chin|ear|ears|neck|arm|arms|shoulder|shoulders|cheek|cheeks|lips|mouth|fingers|throat|back|hip|hips|collarbone|knuckles|wrist|wrists)\b/i;
const SUGGESTION_IMPERATIVE_ACTION_VERB_PATTERN = /\b(?:touch|take|guide|pull|hold|brush|stroke|tilt|rest|trail|trace|squeeze|cup|kiss|lean|step|move|reach|press|draw|bring|offer|wrap|tuck|lift|caress|slide|thread|graze|nudge|catch|keep|pat|cup)\b/i;
const WRITE_FOR_ME_GENERIC_PATTERN = /\b(?:electricity between us|cannot deny|there'?s no denying|lingering for a heartbeat longer than necessary|beneath those long lashes|warm smile spreads|vision bathed in|presence has come to mean|hint of color in her cheeks|warmth between us|something unspoken)\b/i;
const INCOMPLETE_SUGGESTION_ENDING_PATTERN = /\b(?:a|an|the|this|that|these|those|another|some|any|more|every|expensive|impressive|your|my|her|his|their|our)\s*$/i;
const INCOMPLETE_SUGGESTION_PROGRESSIVE_ENDING_PATTERN = /\b(?:whispering|smirking|watching|waiting|looking|leaning|reaching|moving|commenting)\s*$/i;
const INCOMPLETE_SUGGESTION_ADJECTIVE_ENDING_PATTERN = /\b(?:quick|warm|small|gentle|soft|slow|long|brief)\s*$/i;
const INCOMPLETE_SUGGESTION_VERB_ENDING_PATTERN = /\b(?:have|enjoy|appreciate|like|love|let|consider|discuss|explore|adjust|test)\s*$/i;
const INCOMPLETE_SUGGESTION_PHRASE_ENDING_PATTERN = /\b(?:how much(?: you)?|on how|how|it's okay to|okay to|by\s+(?:commenting|saying|asking|mentioning|telling)|in the future|related to your\s+[a-z'-]+|to\s+(?:test|consider|discuss|explore|adjust)|behind closed|beyond|not)\s*$/i;
const BOT_PHYSICAL_SUGGESTION_PATTERN = /\b(?:kiss|waist|thigh|lap|neck|body|breath|touch|lick|ride|grind)\b/i;
const USER_ANATOMY_ASSUMPTION_PATTERN = /\b(?:cock|dick|shaft|breasts?|boobs?|tits?|nipples?|pussy|clit|balls?|curves?)\b/i;
const SUGGESTION_SUSPICIOUS_SELF_TARGET_PATTERN = /\b(?:caress|cup|kiss|trace|brush|stroke|press|trail|slide|touch|bring|draw|rest|place|reach|lean|tilt|guide|pull|hold)\b[^.!?]{0,80}\b(?:my\s+(?:chin|cheek|cheeks|face|jawline|cheekbone|cheekbones|ear|ears|neck|throat|lips?|mouth|waist|hip|hips|back|chest|collarbone|shoulder|shoulders|skin)|small\s+of\s+my\s+back)\b/i;
const SUGGESTION_GENERIC_ACTION_PATTERN = /^(?:change the subject|keep talking|say something nice|say more)$/i;
const SUGGESTION_REFLECTIVE_META_LEAD_PATTERN = /^(?:I\s+(?:can't help but|find myself|appreciate|understand|must admit|suppose)|Well\b|Thank you\b)/i;
const SUGGESTION_MALFORMED_META_LEAD_PATTERN = /^\*?\s*I\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/;

function detectSuggestionRole(text = '') {
  const lowered = String(text || '').toLowerCase();
  if (/^\s*(?:stay|safe)\s*[:\-]/i.test(lowered)) return 'stay';
  if (/^\s*progress\s*[:\-]/i.test(lowered)) return 'progress';
  if (/^\s*bold\s*[:\-]/i.test(lowered)) return 'bold';
  return null;
}

function cleanSuggestionCandidate(part) {
  let candidate = String(part || '').trim();
  if (!candidate) return '';

  candidate = candidate
    .replace(/^[-•]\s*/, '')
    .replace(/^['"“”`*:.\-\d)\s]+/, '')
    .replace(/['"“”`*:,|.\-\s]+$/, '')
    .replace(SUGGESTION_LABEL_PATTERN, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (/^[A-Za-z][A-Za-z\s]{1,24}:\s+/.test(candidate)) {
    const [prefix, rest] = candidate.split(/:\s+/, 2);
    if (/\b(option|action|pace|scene|angle|move)\b/i.test(prefix || '')) {
      candidate = String(rest || '').trim();
    }
  }

  return candidate;
}

function collapseImmediateSuggestionRepeat(candidate) {
  const words = String(candidate || '').trim().split(/\s+/).filter(Boolean);
  if (words.length < 4) return String(candidate || '').trim();

  for (let size = Math.min(8, Math.floor(words.length / 2)); size >= 2; size--) {
    const left = words.slice(0, size).join(' ').toLowerCase();
    const right = words.slice(size, size * 2).join(' ').toLowerCase();
    if (left && left === right) {
      return words.slice(0, size).concat(words.slice(size * 2)).join(' ').trim();
    }
  }

  return words.join(' ');
}

function trimSuggestionCandidate(candidate) {
  let compact = collapseImmediateSuggestionRepeat(candidate);
  if (!compact) return '';

  compact = compact.replace(/\s+/g, ' ').trim();
  compact = compact.replace(/^Well\s*,?\s*/i, '').trim();
  compact = compact.replace(/\s*["“”][^"“”]*["“”]\s*$/g, '').trim();

  const dialogueCut = compact.search(/\s+["“”]/);
  if (dialogueCut > 0) {
    compact = compact.slice(0, dialogueCut).trim();
  }

  const sentenceCut = compact.search(/[.!?](?:\s|$)/);
  if (sentenceCut > 0) {
    compact = compact.slice(0, sentenceCut).trim();
  }

  if (compact.length > SUGGESTION_MAX_CHARS || compact.split(/\s+/).filter(Boolean).length > SUGGESTION_MAX_WORDS) {
    const clauseParts = compact
      .split(/(?:\s+-\s+|;\s+|,\s+|(?=\s+(?:because|while|so that|letting|making|as)\b)|(?=\s+(?:before|after)\s+(?:continuing|moving|speaking|telling|explaining)\b)|(?=\s+and\s+(?:begin|starting|start|continue|continuing|keep|keeping|list|listing|tell|telling|explain|explaining|show|showing|reveal|revealing)\b))/i)
      .map((part) => part.trim())
      .filter(Boolean);
    if (clauseParts.length > 1) {
      compact = clauseParts[0];
    }
  }

  if ((compact.length > SUGGESTION_MAX_CHARS || compact.split(/\s+/).filter(Boolean).length > SUGGESTION_MAX_WORDS) && SUGGESTION_PROGRESSIVE_TAIL_PATTERN.test(compact)) {
    compact = compact.split(SUGGESTION_PROGRESSIVE_TAIL_PATTERN)[0].trim();
  }

  if (compact.length > SUGGESTION_MAX_CHARS || compact.split(/\s+/).filter(Boolean).length > SUGGESTION_MAX_WORDS) {
    return '';
  }

  compact = compact
    .replace(/\b(?:and|or|to|with|in|into|onto|from|for|of|on|at|by|up|down|the|a|an|that|this|there|before|after)$/i, '')
    .replace(/['"“”`*:,|.\-\s]+$/, '')
    .trim();

  while (
    INCOMPLETE_SUGGESTION_ENDING_PATTERN.test(compact)
    || INCOMPLETE_SUGGESTION_PROGRESSIVE_ENDING_PATTERN.test(compact)
    || INCOMPLETE_SUGGESTION_ADJECTIVE_ENDING_PATTERN.test(compact)
    || INCOMPLETE_SUGGESTION_VERB_ENDING_PATTERN.test(compact)
    || INCOMPLETE_SUGGESTION_PHRASE_ENDING_PATTERN.test(compact)
  ) {
    const words = compact.split(/\s+/).filter(Boolean);
    if (words.length <= 2) return '';
    words.pop();
    compact = words.join(' ').trim();
  }

  compact = compact
    .replace(/\b(?:and|or|to|with|in|into|onto|from|for|of|on|at|by|up|down|the|a|an|that|this|there|before|after)$/i, '')
    .replace(/['"“”`*:,|.\-\s]+$/, '')
    .trim();

  while (
    INCOMPLETE_SUGGESTION_ENDING_PATTERN.test(compact)
    || INCOMPLETE_SUGGESTION_PROGRESSIVE_ENDING_PATTERN.test(compact)
    || INCOMPLETE_SUGGESTION_ADJECTIVE_ENDING_PATTERN.test(compact)
    || INCOMPLETE_SUGGESTION_VERB_ENDING_PATTERN.test(compact)
    || INCOMPLETE_SUGGESTION_PHRASE_ENDING_PATTERN.test(compact)
  ) {
    const words = compact.split(/\s+/).filter(Boolean);
    if (words.length <= 2) return '';
    words.pop();
    compact = words.join(' ').trim();
  }

  compact = compact
    .replace(/\b(?:and|or|to|with|in|into|onto|from|for|of|on|at|by|up|down|the|a|an|that|this|there|before|after)$/i, '')
    .replace(/['"“”`*:,|.\-\s]+$/, '')
    .trim();

  const finalWordCount = compact.split(/\s+/).filter(Boolean).length;
  if (finalWordCount < 2) {
    return '';
  }

  if (SUGGESTION_GENERIC_ACTION_PATTERN.test(compact)) {
    return '';
  }

  return compact;
}

function compactSuggestionCandidate(candidate) {
  let compact = trimSuggestionCandidate(candidate);
  if (!compact) return '';

  const wordCount = compact.split(/\s+/).filter(Boolean).length;
  if (compact.length <= SUGGESTION_MAX_CHARS && wordCount <= SUGGESTION_MAX_WORDS) {
    return compact;
  }

  return compact;
}

function shouldRewriteSuggestionAsAction(candidate, assistMode = 'sfw_only', rawCandidate = '') {
  const trimmed = String(candidate || '').trim();
  const raw = String(rawCandidate || '');
  if (!trimmed || assistMode === 'bot_conversation') return false;
  if (raw.trim().startsWith('*')) return true;
  if (trimmed.startsWith('*') || /^["“]/.test(trimmed)) return false;
  if (/\b(?:I|me|my|mine|I'm|I've|I'll|I'd)\b/i.test(trimmed)) return false;
  if (SUGGESTION_META_DIRECTIVE_LEAD_PATTERN.test(trimmed)) return false;

  return (SUGGESTION_DIALOGUE_PATTERN.test(raw) && /^[\p{Ll}]/u.test(trimmed))
    || SUGGESTION_ACTION_OBJECT_PATTERN.test(trimmed)
    || (/^(?:gently|softly|slowly|carefully|lightly|quietly|briefly|firmly)\b/i.test(trimmed) && SUGGESTION_IMPERATIVE_ACTION_VERB_PATTERN.test(trimmed))
    || (/^(?:touch|take|guide|pull|hold|brush|stroke|tilt|rest|trail|trace|squeeze|cup|kiss|lean|step|move|reach|press|draw|bring|offer|wrap|tuck|lift|caress|slide|thread|graze|nudge|catch|pat)\b/i.test(trimmed) && !/\b(?:me|us)\b/i.test(trimmed))
    || (/^(?:smile|smiles|nod|nods|glance|glances|look|looks|wait|waits|pause|pauses|lean|leans|reach|reaches|take|takes|give|gives|maintain|maintains|keep|keeps|step|steps|move|moves|bring|brings|touch|touches|guide|guides|pull|pulls|hold|holds|cup|cups|brush|brushes|trace|traces|stroke|strokes|offer|offers|place|places)\b/i.test(trimmed) && !/\b(?:me|us)\b/i.test(trimmed));
}

function splitSuggestionDialogue(candidate) {
  const text = String(candidate || '').trim();
  const quoteMatch = text.match(/["“”]|(?:^|[\s([{])'/);
  if (!quoteMatch || typeof quoteMatch.index !== 'number') {
    return { narration: text, dialogue: '' };
  }

  const quoteToken = quoteMatch[0];
  const quoteIndex = quoteMatch.index + (quoteToken.length > 1 ? quoteToken.length - 1 : 0);

  return {
    narration: text.slice(0, quoteIndex).trim(),
    dialogue: text.slice(quoteIndex).trim()
  };
}

function normalizeSuggestionDialogue(dialogue) {
  let normalized = String(dialogue || '')
    .replace(/^["“”'\s]+/, '')
    .replace(/["“”'\s]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return '';
  if (/\b(?:me|my)'(?:ve|ll|d|m|re|s)\b/i.test(normalized)) return '';

  normalized = normalized
    .replace(/\b(the way|how|why)\s+me\s+([a-z][a-z'-]*)\b/gi, '$1 you $2')
    .replace(/\b(when|if|unless|before|after|because|while)\s+me\s+([a-z][a-z'-]*)\b/gi, '$1 I $2')
    .replace(/^Me\s+([a-z][a-z'-]*)\b/, 'You $1');

  if (/\bme\s+(?:am|is|are|was|were|have|has|had|do|does|did|can|could|will|would|should|need|want|command|look|looks|sound|sounds|feel|feels|deserve|deserves)\b/i.test(normalized)) {
    return '';
  }

  if (/\b(?:aren't|wasn't|weren't|not)\s+me\b/i.test(normalized)) {
    return '';
  }

  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  if (wordCount < 2) return '';

  if (!/[.!?]$/.test(normalized)) {
    normalized = `${normalized}.`;
  }

  return `"${normalized}"`;
}

function repairFirstPersonOwnershipDrift(action) {
  return String(action || '').replace(
    /\b((?:hold(?:ing)?|pull(?:ing)?|draw(?:ing)?|press(?:ing)?|gather(?:ing)?|wrap(?:ping)?|tuck(?:ing)?)\b[^.!?]{0,80}\b(?:against|to|into|onto)\s+)(his|her)\s+(chest|body|frame|waist|arms?|side)\b/gi,
    '$1my $3'
  );
}

function hasSuspiciousFirstPersonSubjectSwitch(candidate) {
  const inner = String(candidate || '').trim().replace(/^\*|\*$/g, '');
  if (!/^I\b/i.test(inner)) return false;

  return /,\s+(?!and\b|then\b|I\b|my\b|gently\b|softly\b|slowly\b|carefully\b|lightly\b|quietly\b|looking\b|letting\b|keeping\b|holding\b|drawing\b|pressing\b|pulling\b|reaching\b|guiding\b|moving\b|bringing\b|smiling\b|nodding\b|waiting\b|leaning\b|resting\b|tracing\b|brushing\b)(?:[a-z]+s)\b/i.test(inner);
}

function hasSuspiciousFirstPersonOwnershipDrift(candidate) {
  const inner = String(candidate || '').trim().replace(/^\*|\*$/g, '');
  if (!/^I\b/i.test(inner)) return false;
  if (/^I\s+my\b/i.test(inner)) return true;
  if (/\b(?:into|toward|towards)\s+my\s+eyes\b/i.test(inner)) return true;
  return SUGGESTION_SUSPICIOUS_SELF_TARGET_PATTERN.test(inner);
}

function rewriteSuggestionAsFirstPersonAction(candidate) {
  const trimmed = String(candidate || '').trim();
  if (!trimmed) return '';

  const { narration, dialogue } = splitSuggestionDialogue(trimmed);
  const actionSource = cleanSuggestionCandidate(narration || trimmed);
  const cleanedDialogue = String(dialogue || '').trim();

  let normalized = actionSource
    .replace(/^\*+|\*+$/g, '')
    .replace(cleanedDialogue ? /\b(?:and|then)\s+(?:say|says|said|whisper|whispers|whispered|murmur|murmurs|murmured|tell|tells|told)\b.*$/i : /$^/, '')
    .replace(/\byourself\b/gi, 'myself')
    .replace(/\byours\b/gi, 'mine')
    .replace(/\byour\b/gi, 'my')
    .replace(/\byou\b(?!['’])/gi, 'me');

  normalized = repairLeadingNarrationSegment(normalized, 'I')
    .replace(/^\*+|\*+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return '';

  if (!/^I\b/.test(normalized)) {
    normalized = `I ${normalized}`;
  }

  normalized = normalized.replace(/^I\s+((?:[A-Za-z']+ly\s+)*)((?:[A-Za-z']+))/i, (match, adverbs = '', verb = '') => {
    const repairedVerb = deconjugateSimplePresent(verb) || verb;
    return `I ${adverbs}${repairedVerb}`;
  });
  normalized = repairFirstPersonOwnershipDrift(normalized);
  if (/\bbehind\s+(?:him|her)\b/i.test(normalized)) return '';
  normalized = normalized.replace(/^I\s+([A-Z])/, (_, lead) => `I ${lead.toLowerCase()}`);
  normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  if (!/[.!?]$/.test(normalized)) {
    normalized = `${normalized}.`;
  }

  const action = `*${normalized}*`;
  const normalizedDialogue = normalizeSuggestionDialogue(cleanedDialogue);
  return [action, normalizedDialogue].filter(Boolean).join(' ');
}

function finalizeSuggestionCandidate(candidate, assistMode = 'sfw_only', rawCandidate = '') {
  const hasSuspiciousTrailingFragment = (value) => {
    const visible = String(value || '').replace(/["“”*]/g, ' ').trim();
    if (!visible) return false;
    const rawLastWord = visible.split(/\s+/).pop() || '';
    const lastWord = rawLastWord.replace(/[^A-Za-z]/g, '') || '';
    if (/[a-z][A-Z]/.test(rawLastWord)) return true;
    if (lastWord.length === 1 && !['a', 'i'].includes(lastWord.toLowerCase())) return true;
    if (lastWord.length >= 3 && !/[aeiouy]/i.test(lastWord)) return true;
    return false;
  };

  let finalized = compactSuggestionCandidate(candidate);
  let effectiveRawCandidate = String(rawCandidate || '');
  if (!finalized) return '';

  if (assistMode !== 'bot_conversation') {
    const mixedLeadingActionMatch = effectiveRawCandidate.trim().match(/^\*([^*]+)\*\s+(.+)$/s);
    if (mixedLeadingActionMatch) {
      const actionOnly = cleanSuggestionCandidate(`*${mixedLeadingActionMatch[1]}*`);
      if (actionOnly) {
        finalized = compactSuggestionCandidate(actionOnly) || finalized;
        effectiveRawCandidate = `*${mixedLeadingActionMatch[1].trim()}*`;
      }
    }
  }

  if (SUGGESTION_PROGRESSIVE_TAIL_PATTERN.test(finalized)) {
    finalized = finalized.split(SUGGESTION_PROGRESSIVE_TAIL_PATTERN)[0].trim();
  }

  if (assistMode !== 'bot_conversation' && (SUGGESTION_META_DIRECTIVE_LEAD_PATTERN.test(finalized) || SUGGESTION_DETACHED_DIRECTIVE_PATTERN.test(finalized) || SUGGESTION_SELF_INSTRUCTION_PATTERN.test(finalized))) {
    return '';
  }

  if (assistMode !== 'bot_conversation' && SUGGESTION_FUTURE_PLAN_PATTERN.test(finalized)) {
    return '';
  }

  if (assistMode !== 'bot_conversation' && !finalized.startsWith('*') && (SUGGESTION_REFLECTIVE_META_LEAD_PATTERN.test(finalized) || SUGGESTION_MALFORMED_META_LEAD_PATTERN.test(finalized))) {
    return '';
  }

  if (finalized.includes('*')) {
    return '';
  }

  if ((assistMode === 'sfw_only' || assistMode === 'mixed_transition') && SUGGESTION_AUTHORITY_TONE_PATTERN.test(finalized)) {
    return '';
  }

  if (assistMode !== 'bot_conversation' && /^\*[^*]+\*$/.test(finalized) && !/^\*I\b/i.test(finalized)) {
    finalized = repairLeadingActionBlock(finalized, 'I');
    if (/^\*I\b[^*]*\bme\b/i.test(finalized)) {
      return '';
    }
  }

  if (shouldRewriteSuggestionAsAction(finalized, assistMode, effectiveRawCandidate)) {
    const rewriteSource = SUGGESTION_DIALOGUE_PATTERN.test(effectiveRawCandidate) ? effectiveRawCandidate : finalized;
    finalized = rewriteSuggestionAsFirstPersonAction(rewriteSource);
    if (
      /^\*I\b[^*]*\bme\b/i.test(finalized)
      || hasSuspiciousFirstPersonSubjectSwitch(finalized)
      || hasSuspiciousFirstPersonOwnershipDrift(finalized)
      || SUGGESTION_FIRST_PERSON_SELF_INSTRUCTION_PATTERN.test(finalized)
      || hasSuspiciousTrailingFragment(finalized)
    ) {
      return '';
    }
  } else {
    const hadQuotedDialogue = SUGGESTION_DIALOGUE_PATTERN.test(effectiveRawCandidate) || SUGGESTION_DIALOGUE_PATTERN.test(String(candidate || ''));
    finalized = finalized
      .replace(/^["“”]+/, '')
      .replace(/["“”]+$/, '')
      .trim();

    if (
      assistMode !== 'bot_conversation'
      && !finalized.startsWith('*')
      && !hadQuotedDialogue
      && /^I\b/i.test(finalized)
      && !SUGGESTION_DIRECT_DIALOGUE_VERB_PATTERN.test(finalized)
    ) {
      finalized = normalizeSuggestionDisplayValue(`*${finalized.replace(/^[*\s]+|[*\s]+$/g, '')}*`);
    }

    if (assistMode !== 'bot_conversation' && !finalized.startsWith('*') && !/^[A-ZÄÖÜ"“]/.test(finalized)) {
      return '';
    }

    if (!finalized.startsWith('*')) {
      const spokenWordCount = finalized.split(/\s+/).filter(Boolean).length;
      if (assistMode !== 'bot_conversation' && spokenWordCount < 2) return '';
      if (assistMode === 'bot_conversation' && spokenWordCount < 4 && !/[.!?]$/.test(finalized)) return '';
      if (!/[.!?]$/.test(finalized)) {
        finalized = `${finalized}.`;
      }
    }
  }

  if (/[\u3040-\u30ff\u3400-\u9fff]/u.test(finalized)) {
    return '';
  }

  if (SUGGESTION_FIRST_PERSON_SELF_INSTRUCTION_PATTERN.test(finalized) || hasSuspiciousFirstPersonOwnershipDrift(finalized) || hasSuspiciousTrailingFragment(finalized)) {
    return '';
  }

  return finalized.length <= SUGGESTION_MAX_CHARS ? finalized : '';
}

function dedupeSuggestionAgainstHistory(candidate, lastUserMsg, previousSuggestions = []) {
  if (lastUserMsg) {
    const candidateLower = candidate.toLowerCase().trim();
    const lastUserLower = lastUserMsg.toLowerCase().trim();
    if (lastUserLower.includes(candidateLower) || candidateLower.includes(lastUserLower)) {
      return false;
    }
  }

  const stopWords = new Set(['her', 'his', 'him', 'she', 'the', 'your', 'you', 'my', 'and', 'into', 'with', 'from', 'that', 'this', 'then', 'them', 'their', 'its', 'our', 'for']);
  const toWords = (text) => text
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));
  const candidateWords = toWords(candidate);

  if (candidateWords.length === 0) {
    return true;
  }

  return !previousSuggestions.some((previous) => {
    const previousWords = toWords(previous);
    if (previousWords.length === 0) {
      return false;
    }
    const overlap = candidateWords.filter((word) => previousWords.includes(word)).length;
    const shorter = Math.min(candidateWords.length, previousWords.length);
    const threshold = shorter <= 3 ? 0.5 : 0.7;
    return overlap >= shorter * threshold;
  });
}

function scoreSuggestionCandidate(candidate, rawCandidate = '', role = null, assistMode = 'sfw_only') {
  const text = String(candidate || '').trim();
  if (!text) return -Infinity;

  const words = text.split(/\s+/).filter(Boolean);
  const lower = text.toLowerCase();
  let score = 100;

  if (words.length < 2) score -= 40;
  if (words.length > 8) score -= (words.length - 8) * 7;
  if (text.length > 72) score -= Math.ceil((text.length - 72) / 6) * 5;
  if (SUGGESTION_BAD_LEAD_PATTERN.test(text) && !/^\*?I\b/.test(text)) score -= 18;
  if (SUGGESTION_DIALOGUE_PATTERN.test(rawCandidate) && !text.startsWith('*')) score -= 16;
  if (SUGGESTION_OVEREXPLAIN_PATTERN.test(text)) score -= 14;
  if (SUGGESTION_REFLECTIVE_META_LEAD_PATTERN.test(text)) score -= 22;
  if (/[,:;]/.test(text) && !text.startsWith('*')) score -= 8;
  if (/\b(?:master|mistress|sir)\b/i.test(lower)) score -= 10;
  if (SUGGESTION_DIRECT_DIALOGUE_VERB_PATTERN.test(text) && SUGGESTION_DIALOGUE_PATTERN.test(rawCandidate)) score -= 12;
  if (!/^[A-Za-z*]/.test(text)) score -= 10;
  if (SUGGESTION_PROGRESS_PATTERN.test(text)) score += 12;
  if (SUGGESTION_BOLD_PATTERN.test(text)) score += 6;
  if (text.startsWith('*I ')) score += 10;
  if (/^[A-Z][^*]+[.!?]$/.test(text) && !SUGGESTION_META_DIRECTIVE_LEAD_PATTERN.test(text)) score += 6;
  if (SUGGESTION_META_DIRECTIVE_LEAD_PATTERN.test(text)) score -= 30;
  if (SUGGESTION_FUTURE_PLAN_PATTERN.test(text)) score -= 24;
  if (SUGGESTION_AUTHORITY_TONE_PATTERN.test(text)) score -= 20;
  if (SUGGESTION_PASSIVE_PATTERN.test(text) && !SUGGESTION_PROGRESS_PATTERN.test(text)) score -= 8;

  if (role === 'stay') {
    if (SUGGESTION_PASSIVE_PATTERN.test(text)) score += 4;
    if (SUGGESTION_BOLD_PATTERN.test(text)) score -= 4;
  } else if (role === 'bold') {
    if (SUGGESTION_BOLD_PATTERN.test(text)) score += 10;
    if (/\b(?:wait|pause|watch quietly)\b/i.test(text)) score -= 8;
  } else if (role === 'progress') {
    if (SUGGESTION_PROGRESS_PATTERN.test(text)) score += 14;
    if (SUGGESTION_PASSIVE_PATTERN.test(text) && !SUGGESTION_PROGRESS_PATTERN.test(text)) score -= 16;
  }

  if (assistMode === 'bot_conversation') {
    if (/\b(?:kiss|waist|thigh|lap|neck|body|breath|touch)\b/i.test(text)) score -= 60;
    if (/\b(?:ask|answer|confirm|offer|clarify|review|check|tell|show|schedule|explain)\b/i.test(text)) score += 10;
  } else if (assistMode === 'sfw_only') {
    if (/\b(?:kiss|waist|thigh|lap|neck|body|make me|take me)\b/i.test(text)) score -= 22;
    if (/\b(?:smile|stay|tell|answer|offer|admit|reach|sit|look|hold|take|guide|touch)\b/i.test(text)) score += 4;
  } else if (assistMode === 'mixed_transition') {
    if (/\b(?:hardcore|fuck|cock|pussy|cum)\b/i.test(text)) score -= 30;
    if (/\b(?:closer|touch|kiss|admit|invite|pull|hold|lean)\b/i.test(text)) score += 8;
  }

  return score;
}

function isMalformedSuggestionCandidate(candidate) {
  const text = String(candidate || '').trim();
  if (!text) return true;

  const visible = text.replace(/["“”*]/g, '').trim();
  const words = visible.split(/\s+/).filter(Boolean);
  if (words.length >= 4 && text.startsWith('*I ')) {
    const tail = words[words.length - 1]?.replace(/[^\p{L}\p{N}'-]+/gu, '') || '';
    if (tail && tail.length <= 2) return true;
  }

  return false;
}

function pickBetterSuggestionBatch(primary, fallback, assistMode = 'sfw_only') {
  const primaryBatch = Array.isArray(primary) ? primary : [];
  const fallbackBatch = Array.isArray(fallback) ? fallback : [];
  const summarize = (batch) => ({
    batch,
    malformedCount: batch.filter(isMalformedSuggestionCandidate).length,
    scoreSum: batch.reduce((sum, candidate) => sum + scoreSuggestionCandidate(candidate, candidate, null, assistMode), 0)
  });

  const left = summarize(primaryBatch);
  const right = summarize(fallbackBatch);

  if (right.malformedCount !== left.malformedCount) {
    return right.malformedCount < left.malformedCount ? right.batch : left.batch;
  }

  if (right.batch.length !== left.batch.length) {
    return right.batch.length > left.batch.length ? right.batch : left.batch;
  }

  return right.scoreSum > left.scoreSum ? right.batch : left.batch;
}

function buildSuggestionSafetyFallback(history = [], runtimeState = null, lastUserMsg = '') {
  const assistantMessages = [...(history || [])].filter((message) => message?.role === 'assistant');
  const lastAssistant = String(assistantMessages.at(-1)?.content || '').trim();
  const lastAssistantLower = lastAssistant.toLowerCase();
  const assistMode = runtimeState?.compiledRuntimeCard?.runtimeDefaults?.type === 'bot'
    ? 'bot_conversation'
    : (runtimeState?.assistMode || 'sfw_only');
  const isBot = assistMode === 'bot_conversation';

  const templates = isBot
    ? (/\b(?:risk|safe|safest|danger|threat|signal|contact|scan|sensor|anomaly)\b/i.test(lastAssistantLower)
        ? ['Give me the short version.', 'What do you recommend right now?', 'Draft the first line for me.']
        : ['Summarize that for me.', 'What do you recommend next?', 'Draft the first line for me.'])
    : assistMode === 'nsfw_only'
      ? ['Don\'t stop.', 'Come closer.', 'Show me what you want.']
      : assistMode === 'mixed_transition'
        ? ['Keep going.', 'Come a little closer.', 'Show me what you mean.']
        : (/\b(?:nervous|safe|relax|worried|thinking|comfort|eat|meal)\b/i.test(lastAssistantLower)
            ? ['Tell me more.', 'You can relax around me.', 'Come sit with me.']
            : ['Tell me more.', 'Come a little closer.', 'Show me what you mean.']);

  const normalized = templates
    .map((candidate) => normalizeSuggestionDisplayValue(candidate))
    .filter(Boolean)
    .filter((candidate) => !USER_ANATOMY_ASSUMPTION_PATTERN.test(candidate) || USER_ANATOMY_ASSUMPTION_PATTERN.test(lastUserMsg || ''))
    .filter((candidate) => dedupeSuggestionAgainstHistory(candidate, lastUserMsg, []));

  return Array.from(new Set(normalized)).slice(0, SUGGESTION_TARGET_COUNT);
}

function pickRoleFallbackSuggestion(role, history = [], runtimeState = null, lastUserMsg = '', previousSuggestions = []) {
  const roleIndex = SUGGESTION_ROLE_ORDER.indexOf(role);
  const candidates = buildSuggestionSafetyFallback(history, runtimeState, lastUserMsg);
  const preferred = roleIndex >= 0 ? candidates[roleIndex] : '';
  const options = [preferred, ...candidates].filter(Boolean);

  for (const option of options) {
    if (!dedupeSuggestionAgainstHistory(option, lastUserMsg, previousSuggestions)) continue;
    if (isTooSimilarToSelected(option, previousSuggestions)) continue;
    return option;
  }

  return '';
}

export function normalizeSuggestionDisplayValue(suggestion) {
  let normalized = collapseImmediateSuggestionRepeat(String(suggestion || ''))
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return '';

  const mixedActionMatch = normalized.match(/^\*([^*]+)\*\s+(.+)$/);
  if (mixedActionMatch) {
    const action = String(mixedActionMatch[1] || '').trim().replace(/["“”*]+/g, '').trim();
    const dialogue = String(mixedActionMatch[2] || '').trim().replace(/^["“”*\s]+/, '').replace(/["“”*\s]+$/, '').trim();
    const fixedAction = action ? `*${/[.!?]$/.test(action) ? action : `${action}.`}*` : '';
    if (!dialogue) return fixedAction;
    const fixedDialogue = `"${/[.!?]$/.test(dialogue) ? dialogue : `${dialogue}.`}"`;
    const actionComparable = action.toLowerCase().replace(/^i\s+/, '').replace(/[^a-z\s]/g, '').trim();
    const dialogueComparable = dialogue.toLowerCase().replace(/^(?:i|you)\s+/, '').replace(/[^a-z\s]/g, '').trim();
    if (actionComparable && dialogueComparable && (actionComparable.includes(dialogueComparable) || dialogueComparable.includes(actionComparable))) {
      return fixedDialogue;
    }
    return [fixedAction, fixedDialogue].filter(Boolean).join(' ');
  }

  const quoteCount = (normalized.match(/["“”]/g) || []).length;
  if (quoteCount % 2 === 1) {
    normalized = `${normalized}"`;
  }

  normalized = normalized
    .replace(/^["“”]+/, '')
    .replace(/["“”]+$/, '')
    .trim();

  if (/^\*[^*]+\*$/.test(normalized)) {
    const inner = normalized.slice(1, -1).trim();
    if (!inner) return '';
    const innerQuoteCount = (inner.match(/["“”]/g) || []).length;
    const repairedInner = innerQuoteCount % 2 === 1 ? `${inner}"` : inner;
    return `*${/[.!?]$/.test(repairedInner) ? repairedInner : `${repairedInner}.`}*`;
  }

  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}

function isTooSimilarToSelected(candidate, selected) {
  const currentWords = String(candidate || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);

  if (currentWords.length === 0) return true;

  const currentLead = currentWords[0];
  return selected.some((existing) => {
    const existingWords = String(existing || '')
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .split(/\s+/)
      .filter(Boolean);
    if (existingWords.length === 0) return false;

    const overlap = currentWords.filter((word) => existingWords.includes(word)).length;
    const shorter = Math.min(currentWords.length, existingWords.length);
    const sameLead = existingWords[0] === currentLead;
    return overlap >= Math.max(2, Math.ceil(shorter * 0.7)) || (sameLead && overlap >= Math.max(2, shorter - 1));
  });
}

export function parseSuggestionResponse(raw, lastUserMsg = '', previousSuggestions = [], options = {}) {
  const assistMode = options.assistMode || 'sfw_only';
  const original = String(raw || '').trim();
  const parseJsonObjectParts = (obj) => {
    const objectParts = ['stay', 'progress', 'bold']
      .map((role) => ({ role, value: typeof obj?.[role] === 'string' ? obj[role] : '' }))
      .filter((entry) => entry.value.trim());
    if (objectParts.length === 0) return null;
    const selected = [];
    const roleBuckets = { stay: null, progress: null, bold: null };
    objectParts.forEach(({ role, value }) => {
      const rawValue = String(value || '').trim();
      const finalized = finalizeSuggestionCandidate(cleanSuggestionCandidate(rawValue), assistMode, rawValue);
      if (!finalized) return;
      if (assistMode === 'bot_conversation' && BOT_PHYSICAL_SUGGESTION_PATTERN.test(finalized)) return;
      if (USER_ANATOMY_ASSUMPTION_PATTERN.test(finalized) && !USER_ANATOMY_ASSUMPTION_PATTERN.test(lastUserMsg || '')) return;
      const wordCount = finalized.replace(/["“”*]/g, '').split(/\s+/).filter(Boolean).length;
      if (finalized.length < 2 || finalized.length > SUGGESTION_MAX_CHARS || wordCount < 2 || wordCount > SUGGESTION_MAX_WORDS) return;
      if (SUGGESTION_META_PATTERN.test(finalized) || SUGGESTION_NON_ACTION_PATTERN.test(finalized) || (assistMode !== 'bot_conversation' && SUGGESTION_META_DIRECTIVE_LEAD_PATTERN.test(finalized))) return;
      if (!dedupeSuggestionAgainstHistory(finalized, lastUserMsg, previousSuggestions)) return;
      if (isTooSimilarToSelected(finalized, selected)) return;
      if (scoreSuggestionCandidate(finalized, value, role, assistMode) < 52) return;
      roleBuckets[role] = finalized;
      selected.push(finalized);
    });
    return SUGGESTION_ROLE_ORDER.map((role) => roleBuckets[role]).filter(Boolean).slice(0, SUGGESTION_TARGET_COUNT);
  };

  try {
    const parsed = JSON.parse(original);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const parsedObjectParts = parseJsonObjectParts(parsed);
      if (parsedObjectParts) return parsedObjectParts;
    }
  } catch {
    const partial = {};
    const fieldPattern = /"(stay|progress|bold)"\s*:\s*"((?:\\.|[^"\\])*)"/g;
    let match;
    while ((match = fieldPattern.exec(original)) !== null) {
      partial[match[1]] = match[2]
        .replace(/\\n/g, ' ')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }
    const partialObjectParts = parseJsonObjectParts(partial);
    if (partialObjectParts) return partialObjectParts;
  }

  const cleaned = original
    .replace(/\[TOOL_CALLS\]/gi, '')
    .replace(/<\/?s>/gi, '')
    .replace(/\bassistant\b/gi, '')
    .replace(/```[\s\S]*?```/g, '')
    .trim();

  let parts = cleaned
    .split(/[|\n]/)
    .map((part) => ({ raw: String(part || '').trim(), cleaned: cleanSuggestionCandidate(part) }))
    .filter((part) => part.raw || part.cleaned);

  if (parts.length < 2) {
    parts = cleaned
      .split(/\d+[.)]\s*/)
      .map((part) => ({ raw: String(part || '').trim(), cleaned: cleanSuggestionCandidate(part) }))
      .filter((part) => part.raw || part.cleaned);
  }

  if (parts.length < 2) {
    parts = cleaned
      .split(/\s*;\s*/)
      .map((part) => ({ raw: String(part || '').trim(), cleaned: cleanSuggestionCandidate(part) }))
      .filter((part) => part.raw || part.cleaned);
  }

  const selected = [];
  const roleBuckets = { stay: null, progress: null, bold: null };

  parts.forEach(({ raw: rawPart, cleaned: cleanedPart }) => {
    const role = detectSuggestionRole(rawPart);
    const finalized = finalizeSuggestionCandidate(cleanedPart, assistMode, rawPart);
    if (!finalized) return;
    if (assistMode === 'bot_conversation' && BOT_PHYSICAL_SUGGESTION_PATTERN.test(finalized)) return;
    const wordCount = finalized.replace(/["“”*]/g, '').split(/\s+/).filter(Boolean).length;
    if (finalized.length < 2 || finalized.length > SUGGESTION_MAX_CHARS || wordCount < 2 || wordCount > SUGGESTION_MAX_WORDS) return;
    if (SUGGESTION_META_PATTERN.test(finalized) || SUGGESTION_NON_ACTION_PATTERN.test(finalized) || (assistMode !== 'bot_conversation' && SUGGESTION_META_DIRECTIVE_LEAD_PATTERN.test(finalized))) return;
    if (!dedupeSuggestionAgainstHistory(finalized, lastUserMsg, previousSuggestions)) return;
    if (isTooSimilarToSelected(finalized, selected)) return;
    if (scoreSuggestionCandidate(finalized, rawPart, role, assistMode) < 44) return;
    if (role && !roleBuckets[role]) {
      roleBuckets[role] = finalized;
      selected.push(finalized);
      return;
    }
    selected.push(finalized);
  });

  const ordered = SUGGESTION_ROLE_ORDER
    .map((role) => roleBuckets[role])
    .filter(Boolean);

  selected.forEach((candidate) => {
    if (ordered.length >= SUGGESTION_TARGET_COUNT) return;
    if (ordered.includes(candidate)) return;
    ordered.push(candidate);
  });

  return ordered.slice(0, SUGGESTION_TARGET_COUNT);
}

function parseSingleSuggestionResponse(raw, role, lastUserMsg = '', previousSuggestions = [], options = {}) {
  const assistMode = options.assistMode || 'sfw_only';
  const original = String(raw || '').trim();
  if (!original) return '';

  let rawValue = original;
  try {
    const parsed = JSON.parse(original);
    if (typeof parsed?.suggestion === 'string') {
      rawValue = parsed.suggestion;
    } else if (typeof parsed?.[role] === 'string') {
      rawValue = parsed[role];
    }
  } catch {
    const match = original.match(/"(?:suggestion|stay|bold|progress)"\s*:\s*"((?:\\.|[^"\\])*)"/);
    if (match?.[1]) {
      rawValue = match[1]
        .replace(/\\n/g, ' ')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }
  }

  const finalized = finalizeSuggestionCandidate(cleanSuggestionCandidate(rawValue), assistMode, rawValue);
  if (!finalized) return '';
  if (assistMode === 'bot_conversation' && BOT_PHYSICAL_SUGGESTION_PATTERN.test(finalized)) return '';
  if (USER_ANATOMY_ASSUMPTION_PATTERN.test(finalized) && !USER_ANATOMY_ASSUMPTION_PATTERN.test(lastUserMsg || '')) return '';

  const wordCount = finalized.replace(/["“”*]/g, '').split(/\s+/).filter(Boolean).length;
  if (finalized.length < 2 || finalized.length > SUGGESTION_MAX_CHARS || wordCount < 2 || wordCount > SUGGESTION_MAX_WORDS) return '';
  if (SUGGESTION_META_PATTERN.test(finalized) || SUGGESTION_NON_ACTION_PATTERN.test(finalized) || (assistMode !== 'bot_conversation' && SUGGESTION_META_DIRECTIVE_LEAD_PATTERN.test(finalized))) return '';
  if (!dedupeSuggestionAgainstHistory(finalized, lastUserMsg, previousSuggestions)) return '';
  if (isTooSimilarToSelected(finalized, previousSuggestions)) return '';

  const minScore = role === 'stay' ? 40 : 44;
  if (scoreSuggestionCandidate(finalized, rawValue, role, assistMode) < minScore) return '';

  return finalized;
}

async function requestSuggestionContent(chatParams, currentRequestId) {
  if (isElectron()) {
    suggestionAbortController = null;
    const result = await window.electronAPI.aiChat({ ...chatParams, tag: 'suggestions' });
    if (currentRequestId !== suggestionRequestId) return null;
    if (!result?.success) throw new Error(result?.error || 'Suggestion generation failed');
    return result.content || '';
  }

  const controller = new AbortController();
  suggestionAbortController = controller;

  try {
    const res = await fetch(`${chatParams.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: chatParams.model,
        messages: [
          { role: 'system', content: chatParams.systemPrompt },
          { role: 'user', content: chatParams.messages[0].content }
        ],
        stream: false,
        options: {
          num_predict: chatParams.maxTokens,
          temperature: chatParams.temperature,
          num_ctx: chatParams.num_ctx,
          ...(typeof chatParams.top_k === 'number' ? { top_k: chatParams.top_k } : {}),
          ...(typeof chatParams.top_p === 'number' ? { top_p: chatParams.top_p } : {}),
          ...(typeof chatParams.min_p === 'number' ? { min_p: chatParams.min_p } : {}),
          ...(typeof chatParams.repeat_penalty === 'number' ? { repeat_penalty: chatParams.repeat_penalty } : {}),
          ...(typeof chatParams.repeat_last_n === 'number' ? { repeat_last_n: chatParams.repeat_last_n } : {}),
          ...(typeof chatParams.penalize_newline === 'boolean' ? { penalize_newline: chatParams.penalize_newline } : {})
        },
        ...(chatParams.format ? { format: chatParams.format } : {})
      })
    });
    const data = await res.json();
    if (currentRequestId !== suggestionRequestId) return null;
    return data.message?.content || '';
  } finally {
    suggestionAbortController = null;
  }
}

/**
 * Abort any in-flight suggestion generation.
 * Call before sendMessage/regenerate so Ollama is free for the chat stream.
 */
export function abortSuggestionCall() {
  suggestionRequestId++;
  if (suggestionAbortController) {
    suggestionAbortController.abort();
    suggestionAbortController = null;
  }
  if (isElectron() && window.electronAPI?.abortAiChat) {
    window.electronAPI.abortAiChat('suggestions');
  }
}

/**
 * Generate smart suggestions in background via /api/chat.
 * Sends last 6 messages + OOC instruction to get user response options.
 * @param {Array} history - Full conversation messages array
 * @param {string} charName - Character name
 * @param {string} charDescription - Character description for context
 * @param {string} userName - User display name
 * @param {object} settings - App settings
 * @param {function} callback - Receives string[] or null
 * @param {string[]} [previousSuggestions] - Previous suggestions to avoid repeating
 * @param {number} [passionLevel=0] - Current passion level (0-100) for intensity matching
 */
export async function generateSuggestionsBackground(history, character, userName, settings, callback, previousSuggestions = [], passionLevel = 0, sceneMemory = null, unchainedMode = false) {
  abortSuggestionCall();
  const currentRequestId = ++suggestionRequestId;

  const ollamaUrl = settings.ollamaUrl || OLLAMA_DEFAULT_URL;
  const model = settings.ollamaModel || DEFAULT_MODEL_NAME;
  const numCtx = await getModelCtx(ollamaUrl, model, settings.contextSize || 4096);
  const assistBudgetTier = deriveAssistBudgetTier({
    parameterSize: (await getModelCapabilities(ollamaUrl, model)).parameterSize,
    modelName: model,
    contextSize: settings.contextSize || 4096,
    maxResponseTokens: settings.maxResponseTokens
  });
  const budgetConfig = ASSIST_BUDGET_CONFIG[assistBudgetTier];
  const suggestionNumCtx = Math.min(numCtx, budgetConfig.suggestionNumCtxCap);
  const profile = getModelProfile(model);
  const lastUserMsg = [...(history || [])].reverse().find((message) => message?.role === 'user')?.content || '';
  const baseRuntimeState = buildRuntimeState({
    character,
    history,
    userName,
    runtimeSteering: {
      profile: 'suggestions',
      availableContextTokens: Math.max(256, suggestionNumCtx - budgetConfig.suggestionContextReserve),
      passionLevel,
      unchainedMode,
      assistBudgetTier,
      avoidSuggestions: [...previousSuggestions, lastUserMsg ? lastUserMsg.slice(0, 80) : ''].filter(Boolean),
      persistedSceneMemory: sceneMemory
    }
  });
  const effectiveSuggestionAssistMode = baseRuntimeState.compiledRuntimeCard?.runtimeDefaults?.type === 'bot'
    ? 'bot_conversation'
    : baseRuntimeState.assistMode;
  const selected = [];

  try {
    for (const spec of SUGGESTION_REQUEST_SPECS) {
      if (currentRequestId !== suggestionRequestId) return;

      const roleRuntimeState = buildRuntimeState({
        character,
        history,
        userName,
        runtimeSteering: {
          profile: 'suggestions',
          suggestionRole: spec.role,
          availableContextTokens: Math.max(256, suggestionNumCtx - budgetConfig.suggestionContextReserve),
          passionLevel,
          unchainedMode,
          assistBudgetTier,
          avoidSuggestions: [...previousSuggestions, ...selected, lastUserMsg ? lastUserMsg.slice(0, 80) : ''].filter(Boolean),
          persistedSceneMemory: sceneMemory
        }
      });
      const runtimeContext = assembleRuntimeContext({ profile: 'suggestions', runtimeState: roleRuntimeState });
      const rolePreviousSuggestions = [...previousSuggestions, ...selected];
      const chatParams = {
        messages: [{ role: 'user', content: runtimeContext.userPrompt }],
        systemPrompt: runtimeContext.systemPrompt,
        model,
        isOllama: true,
        ollamaUrl,
        temperature: spec.temperature,
        maxTokens: Math.min(budgetConfig.suggestionMaxTokens, spec.maxTokens),
        num_ctx: suggestionNumCtx,
        top_k: settings.topK ?? profile.topK,
        top_p: settings.topP ?? profile.topP,
        min_p: settings.minP ?? profile.minP,
        repeat_penalty: settings.repeatPenalty ?? profile.repeatPenalty,
        repeat_last_n: settings.repeatLastN ?? profile.repeatLastN,
        penalize_newline: settings.penalizeNewline ?? profile.penalizeNewline,
        format: SINGLE_SUGGESTION_JSON_SCHEMA
      };

      console.log(`[API] Suggestions runtime (${spec.role}):`, runtimeContext.debug);

      let candidate = '';
      try {
        const raw = await requestSuggestionContent(chatParams, currentRequestId);
        if (currentRequestId !== suggestionRequestId) return;
        candidate = parseSingleSuggestionResponse(raw || '', spec.role, lastUserMsg, rolePreviousSuggestions, {
          assistMode: effectiveSuggestionAssistMode
        });
        console.log(`[API] Suggestions ${spec.role}: ${candidate ? 'ok' : 'miss'} from "${String(raw || '').trim().slice(0, 160)}"`);

        if (!candidate) {
          const retryParams = {
            ...chatParams,
            temperature: Math.max(0.2, spec.temperature - 0.06),
            messages: [{ role: 'user', content: `${runtimeContext.userPrompt}\n\n${SUGGESTION_RETRY_NOTE}` }]
          };
          const retryRaw = await requestSuggestionContent(retryParams, currentRequestId);
          if (currentRequestId !== suggestionRequestId) return;
          candidate = parseSingleSuggestionResponse(retryRaw || '', spec.role, lastUserMsg, rolePreviousSuggestions, {
            assistMode: effectiveSuggestionAssistMode
          });
          console.log(`[API] Suggestions ${spec.role} retry: ${candidate ? 'ok' : 'miss'} from "${String(retryRaw || '').trim().slice(0, 160)}"`);
        }
      } catch (err) {
        if (err?.name === 'AbortError' || err?.message === 'aborted') return;
        console.warn(`[API] Suggestion generation failed for ${spec.role}:`, err?.message);
      }

      if (!candidate && selected.length === 0) {
        candidate = pickRoleFallbackSuggestion(spec.role, history, roleRuntimeState, lastUserMsg, selected);
      }

      if (!candidate) continue;
      if (!dedupeSuggestionAgainstHistory(candidate, lastUserMsg, rolePreviousSuggestions)) continue;
      if (isTooSimilarToSelected(candidate, selected)) continue;
      selected.push(candidate);
    }

    if (currentRequestId !== suggestionRequestId) return;
    callback(selected.length >= MIN_USABLE_SUGGESTIONS ? selected : null);
  } catch (err) {
    if (err?.name === 'AbortError' || err?.message === 'aborted') return;
    console.warn('[API] Suggestion generation failed:', err?.message);
    callback(selected.length >= MIN_USABLE_SUGGESTIONS ? selected : null);
  }
}
