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

const BATCH_SUGGESTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    replies: {
      type: 'array',
      minItems: 3,
      maxItems: 4,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string', maxLength: 120 },
          intent: { type: 'string', enum: ['reply', 'forward', 'different'] }
        },
        required: ['text', 'intent']
      }
    }
  },
  required: ['replies']
};

const SUGGESTION_CANDIDATE_COUNT = 4;
const SUGGESTION_RETRY_NOTE = 'Retry note: the previous answer drifted, got too generic, duplicated itself, or broke formatting. Return a cleaner batch that answers the latest full message, especially its ending, and gives genuinely different sendable replies right now.';

const SUGGESTION_META_PATTERN = /^(?:here(?:'s| are)?|these(?: are)?|sure|okay|note|options?|suggestions?|you could say|you might say|try saying)\b/i;
const SUGGESTION_NON_ACTION_PATTERN = /^(?:explain|describe|clarify|suggest|propose)\b/i;
const SUGGESTION_DETACHED_DIRECTIVE_PATTERN = /^(?:watch|inspect|examine|evaluate|assess|verify|check|observe|monitor)\b/i;
const SUGGESTION_SELF_INSTRUCTION_PATTERN = /^(?:maintain|keep)\s+(?:eye contact|my gaze|gaze|my\s+eyes?)\b/i;
const SUGGESTION_FIRST_PERSON_SELF_INSTRUCTION_PATTERN = /^\*?I\s+(?:maintain|keep)\s+(?:eye contact|my gaze|gaze|my\s+eyes?)\b/i;
const SUGGESTION_META_DIRECTIVE_LEAD_PATTERN = /^(?:ask|asking|compliment|complimenting|praise|praising|reassure|reassuring|explain|explaining|describe|describing|suggest|suggesting|propose|proposing)\b/i;
const SUGGESTION_LABEL_PATTERN = /^(?:stay|safe|progress|bold|option\s*\d+|action\s*\d+|current beat|stay in scene|move forward|bolder(?: or more forward)?|fresh angle|unexpected(?: angle)?)\s*[:\-]\s*/i;
const SUGGESTION_DIALOGUE_PATTERN = /["“”]/;
const SUGGESTION_DIRECT_DIALOGUE_VERB_PATTERN = /\b(?:say|saying|said|murmur|murmuring|whisper|whispering|tell|telling|ask|asking|reply|replying|respond|responding)\b/i;
const SUGGESTION_PROGRESSIVE_TAIL_PATTERN = /\s+and\s+(?:begin|starting|start|continue|continuing|keep|keeping|list|listing|tell|telling|explain|explaining|show|showing|reveal|revealing)\b/i;
const SUGGESTION_FUTURE_PLAN_PATTERN = /\b(?:in future|in the future|from now on|next time|later tonight|tomorrow|going forward)\b/i;
const SUGGESTION_AUTHORITY_TONE_PATTERN = /\b(?:i command|i order|i insist|you will|you must)\b/i;
const SUGGESTION_ACTION_OBJECT_PATTERN = /\b(?:her|him|them|their|his|face|hair|hand|hands|waist|chin|ear|ears|neck|arm|arms|shoulder|shoulders|cheek|cheeks|lips|mouth|fingers|throat|back|hip|hips|collarbone|knuckles|wrist|wrists)\b/i;
const SUGGESTION_IMPERATIVE_ACTION_VERB_PATTERN = /\b(?:touch|take|guide|pull|hold|brush|stroke|tilt|rest|trail|trace|squeeze|cup|kiss|lean|step|move|reach|press|draw|bring|offer|wrap|tuck|lift|caress|slide|thread|graze|nudge|catch|keep|pat|push|open)\b/i;
const INCOMPLETE_SUGGESTION_ENDING_PATTERN = /\b(?:a|an|the|this|that|these|those|another|some|any|more|every|expensive|impressive|your|my|her|his|their|our)\s*$/i;
const INCOMPLETE_SUGGESTION_PROGRESSIVE_ENDING_PATTERN = /\b(?:whispering|smirking|watching|waiting|looking|leaning|reaching|moving|commenting)\s*$/i;
const INCOMPLETE_SUGGESTION_ADJECTIVE_ENDING_PATTERN = /\b(?:quick|warm|small|gentle|soft|slow|long|brief)\s*$/i;
const INCOMPLETE_SUGGESTION_VERB_ENDING_PATTERN = /\b(?:have|enjoy|appreciate|like|love|let|consider|discuss|explore|adjust|test|want|say|tell|ask|whisper|murmur|reply|answer|start|begin|continue)\s*$/i;
const INCOMPLETE_SUGGESTION_PHRASE_ENDING_PATTERN = /\b(?:how much(?: you)?|on how|how|it's okay to|okay to|by\s+(?:commenting|saying|asking|mentioning|telling)|in the future|related to your\s+[a-z'-]+|to\s+(?:test|consider|discuss|explore|adjust)|behind closed|beyond|not|think\s+about|thinking\s+about|talk\s+about|talking\s+about|speak\s+about|speaking\s+about|while\s+you(?:\s+(?:think|talk|speak|look|wonder))?|as\s+you(?:\s+(?:think|talk|speak|look|wonder))?)\s*$/i;
const INCOMPLETE_SUGGESTION_TRAILING_PREPOSITION_PATTERN = /\b(?:about|around|through|over|under|against|between|toward|towards|without)\s*$/i;
const INCOMPLETE_SUGGESTION_VERB_PARTICLE_PATTERN = /\b(?:think|thinking|talk|talking|speak|speaking|wonder|wondering|ask|asking|tell|telling|show|showing|go|going|come|coming|look|looking)\s+(?:about|of|to|with|for|around|through|over|into|on|at|from)\s*$/i;
const SUGGESTION_STRUCTURED_JSON_PATTERN = /"(?:replies|text|intent|suggestion)"\s*:/i;
const BOT_PHYSICAL_SUGGESTION_PATTERN = /\b(?:kiss|waist|thigh|lap|neck|body|breath|touch|lick|ride|grind)\b/i;
const USER_ANATOMY_ASSUMPTION_PATTERN = /\b(?:cock|dick|shaft|breasts?|boobs?|tits?|nipples?|pussy|clit|balls?|curves?)\b/i;
const SUGGESTION_SUSPICIOUS_SELF_TARGET_PATTERN = /\b(?:caress|cup|kiss|trace|brush|stroke|press|trail|slide|touch|bring|draw|rest|place|reach|lean|tilt|guide|pull|hold)\b[^.!?]{0,80}\b(?:my\s+(?:chin|cheek|cheeks|face|jawline|cheekbone|cheekbones|ear|ears|neck|throat|lips?|mouth|waist|hip|hips|back|side|chest|collarbone|shoulder|shoulders|arm|arms|protective\s+arm|skin)|small\s+of\s+my\s+back)\b/i;
const SUGGESTION_GENERIC_ACTION_PATTERN = /^(?:change the subject|keep talking|say something nice|say more)$/i;
const SUGGESTION_REFLECTIVE_META_LEAD_PATTERN = /^(?:I\s+(?:can't help but|find myself|appreciate|understand|must admit|suppose)|Well\b|Thank you\b)/i;
const SUGGESTION_MALFORMED_META_LEAD_PATTERN = /^\*?\s*I\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/;
const SUGGESTION_DANGLING_SPEECH_VERB_PATTERN = /\b(?:say|ask|tell|whisper|murmur|reply|answer)\.?$/i;
const SUGGESTION_TRUNCATED_QUOTE_PATTERN = /\b(?:say|ask|tell|whisper|murmur|reply|answer)\s+["“'][^"”']*$/i;
const SUGGESTION_DETACHED_IMPERATIVE_LEAD_PATTERN = /^(?:lean|meet|wrap|spread|press|pull|stand|sit|stay|come|go|take|grab|look|tell|show|move|keep|hold|point|scoot|lay|lie|trust|cut|circle|give|scan|review|describe|elaborate)\b/i;
const SUGGESTION_SENDABLE_IMPERATIVE_PATTERN = /^(?:go on(?: then)?|keep going|continue|proceed|show me|demonstrate|walk me through|take me through|let me see|come closer|lead the way)\b/i;

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

  const sentenceCut = compact.search(/(?:[!?]|(?<!\.)\.)(?=\s|$)/);
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
    .replace(/\b(?:and|or|to|with|in|into|onto|from|for|of|on|at|by|up|down|the|a|an|that|this|there|before|after|about|around|through|over|under|against|between|toward|towards|without|while|as)$/i, '')
    .replace(/['"“”`*:,|.\-\s]+$/, '')
    .trim();

  const endsWithValidObjectTarget = (value) => /\b(?:for|with|to|toward|towards)\s+(?:her|him|them|me|us)\b$/i.test(value);
  const hasIncompleteEnding = (value) => (
    (!endsWithValidObjectTarget(value) && INCOMPLETE_SUGGESTION_ENDING_PATTERN.test(value))
    || INCOMPLETE_SUGGESTION_PROGRESSIVE_ENDING_PATTERN.test(value)
    || INCOMPLETE_SUGGESTION_ADJECTIVE_ENDING_PATTERN.test(value)
    || INCOMPLETE_SUGGESTION_VERB_ENDING_PATTERN.test(value)
    || INCOMPLETE_SUGGESTION_PHRASE_ENDING_PATTERN.test(value)
    || INCOMPLETE_SUGGESTION_TRAILING_PREPOSITION_PATTERN.test(value)
    || INCOMPLETE_SUGGESTION_VERB_PARTICLE_PATTERN.test(value)
  );

  while (hasIncompleteEnding(compact)) {
    const words = compact.split(/\s+/).filter(Boolean);
    if (words.length <= 2) return '';
    words.pop();
    compact = words.join(' ').trim();
  }

  compact = compact
    .replace(/\b(?:and|or|to|with|in|into|onto|from|for|of|on|at|by|up|down|the|a|an|that|this|there|before|after|about|around|through|over|under|against|between|toward|towards|without|while|as)$/i, '')
    .replace(/['"“”`*:,|.\-\s]+$/, '')
    .trim();

  while (hasIncompleteEnding(compact)) {
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
    || (/^(?:touch|take|guide|pull|hold|brush|stroke|tilt|rest|trail|trace|squeeze|cup|kiss|lean|step|move|reach|press|draw|bring|offer|wrap|tuck|lift|caress|slide|thread|graze|nudge|catch|pat|push|open)\b/i.test(trimmed) && !/\b(?:me|us)\b/i.test(trimmed))
    || (/^(?:smile|smiles|nod|nods|glance|glances|look|looks|wait|waits|pause|pauses|lean|leans|reach|reaches|take|takes|give|gives|maintain|maintains|keep|keeps|step|steps|move|moves|bring|brings|touch|touches|guide|guides|pull|pulls|hold|holds|cup|cups|brush|brushes|trace|traces|stroke|strokes|offer|offers|place|places|push|pushes|open|opens)\b/i.test(trimmed) && !/\b(?:me|us)\b/i.test(trimmed));
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
  if (/\b(?:pull|press|draw|bring|guide|lead|move|hold|keep|push|tilt|kiss|touch|brush|trace|stroke|caress|cup|pat|reach|wrap|tuck|place|rest)(?:\s+[A-Za-z']+ly){0,2}\s+me\b/i.test(inner)) return true;
  return SUGGESTION_SUSPICIOUS_SELF_TARGET_PATTERN.test(inner);
}

function looksLikeFirstPersonActionText(text = '') {
  const normalized = String(text || '').trim().replace(/^\*|\*$/g, '');
  return /^I\s+(?:(?:[A-Za-z']+ly|closer)\s+)*(?:hold|reach|guide|pull|bring|move|step|touch|brush|kiss|lean|nod|look|glance|gaze|gesture|beckon|sit|stand|turn|show|take|rest|draw|press|trace|meet|offer|wait|watch|smile|smirk|wrap|tuck|lead|place|keep|go|come|continue|run|adjust|push|open|pat|cup|stroke|caress|graze|nudge|tilt|slide|thread|catch|lift|murmur|whisper)\b/i.test(normalized);
}

function hasEmbodiedUserActionStyle(text = '') {
  const source = String(text || '').trim();
  return /\*[^*]*\bI\b[^*]*\*/i.test(source) || looksLikeFirstPersonActionText(source);
}

function isEmbodiedSuggestionText(text = '') {
  const source = String(text || '').trim();
  return /^\*I\b/i.test(source) || looksLikeFirstPersonActionText(source);
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

  if (SUGGESTION_DANGLING_SPEECH_VERB_PATTERN.test(finalized) || SUGGESTION_TRUNCATED_QUOTE_PATTERN.test(String(rawCandidate || '')) || SUGGESTION_TRUNCATED_QUOTE_PATTERN.test(finalized)) {
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
    const visibleWordCount = finalized.replace(/["“”*]/g, ' ').split(/\s+/).filter(Boolean).length;
    if ((finalized.length > SUGGESTION_MAX_CHARS || visibleWordCount > SUGGESTION_MAX_WORDS) && /^\*[^*]+\*/.test(finalized)) {
      finalized = finalized.match(/^\*[^*]+\*/)?.[0] || finalized;
    }
    if (
      hasSuspiciousFirstPersonSubjectSwitch(finalized)
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
      && looksLikeFirstPersonActionText(finalized)
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
      if (assistMode !== 'bot_conversation' && spokenWordCount > 3 && SUGGESTION_DETACHED_IMPERATIVE_LEAD_PATTERN.test(finalized) && !SUGGESTION_SENDABLE_IMPERATIVE_PATTERN.test(finalized) && !/\b(?:you|your|me|my|us|our)\b/i.test(finalized)) return '';
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

  if (assistMode !== 'bot_conversation' && /^\*I\b/i.test(finalized) && !looksLikeFirstPersonActionText(finalized)) {
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

function normalizeSuggestionIntent(intent = '') {
  const normalized = String(intent || '').trim().toLowerCase();
  if (!normalized) return null;
  if (['reply', 'direct', 'natural', 'stay', 'safe'].includes(normalized)) return 'reply';
  if (['forward', 'progress', 'move', 'advance', 'next'].includes(normalized)) return 'forward';
  if (['different', 'angle', 'clarify', 'question', 'variant', 'alternate'].includes(normalized)) return 'different';
  return null;
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

function pickBetterSuggestionBatch(primary, fallback) {
  const primaryBatch = Array.isArray(primary) ? primary : [];
  const fallbackBatch = Array.isArray(fallback) ? fallback : [];
  const summarize = (batch) => ({
    batch,
    malformedCount: batch.filter(isMalformedSuggestionCandidate).length
  });

  const left = summarize(primaryBatch);
  const right = summarize(fallbackBatch);

  if (right.malformedCount !== left.malformedCount) {
    return right.malformedCount < left.malformedCount ? right.batch : left.batch;
  }

  if (right.batch.length !== left.batch.length) {
    return right.batch.length > left.batch.length ? right.batch : left.batch;
  }

  return left.batch;
}

function pickBestSuggestions(entries = [], options = {}) {
  const normalizedEntries = (Array.isArray(entries) ? entries : [])
    .map((entry, index) => ({
      text: String(entry?.text || '').trim(),
      intent: normalizeSuggestionIntent(entry?.intent),
      index
    }))
    .filter((entry) => entry.text);

  if (normalizedEntries.length === 0) return [];

  const preferEmbodiedAction = options.assistMode !== 'bot_conversation' && hasEmbodiedUserActionStyle(options.lastUserMsg || '');
  const ensureEmbodiedOption = (selected) => {
    if (!preferEmbodiedAction || selected.some((text) => isEmbodiedSuggestionText(text))) {
      return selected;
    }

    const actionMatch = normalizedEntries.find((entry) => (
      isEmbodiedSuggestionText(entry.text)
      && !selected.includes(entry.text)
      && !isTooSimilarToSelected(entry.text, selected)
    ));

    if (!actionMatch) return selected;
    if (selected.length < SUGGESTION_TARGET_COUNT) {
      selected.push(actionMatch.text);
      return selected;
    }

    const replaceIndex = selected.findIndex((text) => !isEmbodiedSuggestionText(text));
    if (replaceIndex !== -1) {
      selected.splice(replaceIndex, 1, actionMatch.text);
    }
    return selected;
  };

  const hasStructuredIntents = normalizedEntries.some((entry) => entry.intent);
  if (!hasStructuredIntents) {
    const ordered = normalizedEntries
      .sort((left, right) => left.index - right.index)
      .map((entry) => entry.text)
      .slice(0, SUGGESTION_TARGET_COUNT);
    return ensureEmbodiedOption(ordered).slice(0, SUGGESTION_TARGET_COUNT);
  }

  const selected = [];
  const buckets = ['reply', 'forward', 'different'];
  for (const bucket of buckets) {
    const match = normalizedEntries
      .filter((entry) => entry.intent === bucket)
      .find((entry) => !isTooSimilarToSelected(entry.text, selected));
    if (match) selected.push(match.text);
  }

  ensureEmbodiedOption(selected);

  normalizedEntries
    .sort((left, right) => left.index - right.index)
    .forEach((entry) => {
      if (selected.length >= SUGGESTION_TARGET_COUNT) return;
      if (selected.includes(entry.text)) return;
      if (isTooSimilarToSelected(entry.text, selected)) return;
      selected.push(entry.text);
    });

  return selected.slice(0, SUGGESTION_TARGET_COUNT);
}

function decodeStructuredSuggestionString(value = '') {
  return String(value || '')
    .replace(/\\n/g, ' ')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .trim();
}

function salvageStructuredRepliesFromPartialJson(raw = '') {
  const source = String(raw || '');
  if (!SUGGESTION_STRUCTURED_JSON_PATTERN.test(source)) return [];

  const partialReplies = [];
  const textPattern = /"text"\s*:\s*"((?:\\.|[^"\\])*)"/g;
  let match;

  while ((match = textPattern.exec(source)) !== null) {
    const text = decodeStructuredSuggestionString(match[1]);
    if (!text) continue;

    const segmentStart = textPattern.lastIndex;
    const nextTextMatch = source.slice(segmentStart).match(/"text"\s*:/);
    const segmentEnd = nextTextMatch ? segmentStart + nextTextMatch.index : source.length;
    const segment = source.slice(segmentStart, segmentEnd);
    const intentMatch = segment.match(/"intent"\s*:\s*"((?:\\.|[^"\\])*)"/);
    partialReplies.push({
      text,
      intent: intentMatch ? decodeStructuredSuggestionString(intentMatch[1]) : null
    });
  }

  return partialReplies;
}

function buildSuggestionSafetyFallback(history = [], runtimeState = null, lastUserMsg = '') {
  const assistantMessages = [...(history || [])].filter((message) => message?.role === 'assistant');
  const lastAssistant = String(assistantMessages.at(-1)?.content || '').trim();
  const lastAssistantLower = lastAssistant.toLowerCase();
  const responseCue = String(runtimeState?.activeScene?.open_thread || '').trim();
  const currentTask = String(runtimeState?.activeScene?.latest_user_action_or_request || lastUserMsg || '').trim();
  const cueText = `${responseCue}\n${currentTask}\n${lastAssistant}`.toLowerCase();
  const assistMode = runtimeState?.compiledRuntimeCard?.runtimeDefaults?.type === 'bot'
    ? 'bot_conversation'
    : (runtimeState?.assistMode || 'sfw_only');
  const isBot = assistMode === 'bot_conversation';

  const templates = isBot
    ? (/\b(?:risk|safe|safest|danger|threat|signal|contact|scan|sensor|anomaly)\b/i.test(lastAssistantLower)
        ? ['Give me the short version.', 'What do you recommend right now?', 'What is the immediate next step?']
        : ['Summarize that for me.', 'What should I do next?', 'What do you recommend?'])
    : /\b(?:show|demonstrate|demonstration|explain|walk me through|step|cleaned|cleaning|polish|buff|inspect|inspection)\b/i.test(cueText)
      ? ['Go on, demonstrate the next step.', 'Come closer and show me.', 'Show me the next step.']
      : /\b(?:approval|acknowledg(?:e|ment)|performed her task correctly|did well|well done|properly)\b/i.test(cueText)
        ? ['You did well.', 'Come here a moment.', 'Show me the next step.']
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
  if (!original) return [];

  const parsedEntries = [];
  const addCandidate = (value, intent = null, rawValue = value) => {
    const cleanedValue = cleanSuggestionCandidate(value);
    const finalized = finalizeSuggestionCandidate(cleanedValue, assistMode, rawValue);
    if (!finalized) return;
    if (assistMode === 'bot_conversation' && BOT_PHYSICAL_SUGGESTION_PATTERN.test(finalized)) return;
    if (USER_ANATOMY_ASSUMPTION_PATTERN.test(finalized) && !USER_ANATOMY_ASSUMPTION_PATTERN.test(lastUserMsg || '')) return;

    const wordCount = finalized.replace(/["“”*]/g, '').split(/\s+/).filter(Boolean).length;
    if (finalized.length < 2 || finalized.length > SUGGESTION_MAX_CHARS || wordCount < 2 || wordCount > SUGGESTION_MAX_WORDS) return;
    if (SUGGESTION_META_PATTERN.test(finalized) || SUGGESTION_NON_ACTION_PATTERN.test(finalized) || (assistMode !== 'bot_conversation' && SUGGESTION_META_DIRECTIVE_LEAD_PATTERN.test(finalized))) return;
    if (!dedupeSuggestionAgainstHistory(finalized, lastUserMsg, previousSuggestions)) return;
    if (isTooSimilarToSelected(finalized, parsedEntries.map((entry) => entry.text))) return;

    const normalizedIntent = normalizeSuggestionIntent(intent);
    parsedEntries.push({ text: finalized, intent: normalizedIntent, raw: rawValue });
  };

  const parseStructuredObject = (obj) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [];

    if (typeof obj?.suggestion === 'string') {
      addCandidate(obj.suggestion, 'reply', obj.suggestion);
      return pickBestSuggestions(parsedEntries, { assistMode, lastUserMsg });
    }

    if (Array.isArray(obj.replies)) {
      obj.replies.forEach((entry) => {
        if (typeof entry === 'string') {
          addCandidate(entry, null, entry);
          return;
        }
        if (entry && typeof entry === 'object') {
          addCandidate(entry.text, entry.intent, entry.text);
        }
      });
      return pickBestSuggestions(parsedEntries, { assistMode, lastUserMsg });
    }

    ['stay', 'progress', 'bold'].forEach((role) => {
      if (typeof obj?.[role] === 'string') {
        const mappedIntent = role === 'stay' ? 'reply' : (role === 'progress' ? 'forward' : 'different');
        addCandidate(obj[role], mappedIntent, obj[role]);
      }
    });

    return pickBestSuggestions(parsedEntries, { assistMode, lastUserMsg });
  };

  try {
    const parsed = JSON.parse(original);
    const structuredSuggestions = parseStructuredObject(parsed);
    if (structuredSuggestions.length > 0) return structuredSuggestions;
  } catch {
    const partialReplySuggestions = parseStructuredObject({ replies: salvageStructuredRepliesFromPartialJson(original) });
    if (partialReplySuggestions.length > 0) return partialReplySuggestions;

    const partialSuggestionMatch = original.match(/"suggestion"\s*:\s*"((?:\\.|[^"\\])*)"/);
    if (partialSuggestionMatch?.[1]) {
      const singleSuggestion = parseStructuredObject({ suggestion: decodeStructuredSuggestionString(partialSuggestionMatch[1]) });
      if (singleSuggestion.length > 0) return singleSuggestion;
    }

    const legacyPartial = {};
    const fieldPattern = /"(stay|progress|bold)"\s*:\s*"((?:\\.|[^"\\])*)"/g;
    let match;
    while ((match = fieldPattern.exec(original)) !== null) {
      legacyPartial[match[1]] = decodeStructuredSuggestionString(match[2]);
    }
    const partialSuggestions = parseStructuredObject(legacyPartial);
    if (partialSuggestions.length > 0) return partialSuggestions;

    if (SUGGESTION_STRUCTURED_JSON_PATTERN.test(original)) {
      return [];
    }
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

  parts.forEach(({ raw: rawPart, cleaned: cleanedPart }) => {
    const detectedRole = detectSuggestionRole(rawPart);
    const mappedIntent = detectedRole === 'stay'
      ? 'reply'
      : (detectedRole === 'progress' ? 'forward' : (detectedRole === 'bold' ? 'different' : null));
    addCandidate(cleanedPart, mappedIntent, rawPart);
  });

  return pickBestSuggestions(parsedEntries, { assistMode, lastUserMsg });
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
      suggestionMode: 'batch',
      suggestionCandidateCount: SUGGESTION_CANDIDATE_COUNT,
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
  const runtimeContext = assembleRuntimeContext({ profile: 'suggestions', runtimeState: baseRuntimeState });
  const suggestionMaxTokens = Math.max(120, Math.min(144, budgetConfig.suggestionMaxTokens + 12));
  const baseChatParams = {
    messages: [{ role: 'user', content: runtimeContext.userPrompt }],
    systemPrompt: runtimeContext.systemPrompt,
    model,
    isOllama: true,
    ollamaUrl,
    temperature: 0.42,
    maxTokens: suggestionMaxTokens,
    num_ctx: suggestionNumCtx,
    top_k: settings.topK ?? profile.topK,
    top_p: settings.topP ?? profile.topP,
    min_p: settings.minP ?? profile.minP,
    repeat_penalty: settings.repeatPenalty ?? profile.repeatPenalty,
    repeat_last_n: settings.repeatLastN ?? profile.repeatLastN,
    penalize_newline: settings.penalizeNewline ?? profile.penalizeNewline,
    format: BATCH_SUGGESTION_JSON_SCHEMA
  };

  try {
    console.log('[API] Suggestions runtime (batch):', runtimeContext.debug);

    let selected = [];
    let primarySelectedCount = 0;
    let retrySelectedCount = 0;
    let shouldTopUpWithFallback = false;
    try {
      const raw = await requestSuggestionContent(baseChatParams, currentRequestId);
      if (currentRequestId !== suggestionRequestId) return;
      selected = parseSuggestionResponse(raw || '', lastUserMsg, previousSuggestions, {
        assistMode: effectiveSuggestionAssistMode
      });
      primarySelectedCount = selected.length;
      console.log(`[API] Suggestions batch: ${selected.length} from "${String(raw || '').trim().slice(0, 200)}"`);

      if (selected.length < MIN_USABLE_SUGGESTIONS || selected.length < 2) {
        const retryRaw = await requestSuggestionContent({
          ...baseChatParams,
          temperature: 0.36,
          messages: [{ role: 'user', content: `${runtimeContext.userPrompt}\n\n${SUGGESTION_RETRY_NOTE}` }]
        }, currentRequestId);
        if (currentRequestId !== suggestionRequestId) return;
        const retrySelected = parseSuggestionResponse(retryRaw || '', lastUserMsg, previousSuggestions, {
          assistMode: effectiveSuggestionAssistMode
        });
        retrySelectedCount = retrySelected.length;
        console.log(`[API] Suggestions batch retry: ${retrySelected.length} from "${String(retryRaw || '').trim().slice(0, 200)}"`);
        const mergedSelected = [...selected];
        retrySelected.forEach((candidate) => {
          if (mergedSelected.length >= SUGGESTION_TARGET_COUNT) return;
          if (!dedupeSuggestionAgainstHistory(candidate, lastUserMsg, [...previousSuggestions, ...mergedSelected])) return;
          if (isTooSimilarToSelected(candidate, mergedSelected)) return;
          mergedSelected.push(candidate);
        });
        shouldTopUpWithFallback = primarySelectedCount <= 1 && retrySelectedCount <= 1;
        selected = pickBetterSuggestionBatch(mergedSelected, selected, effectiveSuggestionAssistMode);
      }
    } catch (err) {
      if (err?.name === 'AbortError' || err?.message === 'aborted') return;
      console.warn('[API] Suggestion batch generation failed:', err?.message);
    }

    if (currentRequestId !== suggestionRequestId) return;

    const fallbackBatch = buildSuggestionSafetyFallback(history, baseRuntimeState, lastUserMsg);
    const finalBatch = [...selected];
    if (finalBatch.length < 2 || (shouldTopUpWithFallback && finalBatch.length < SUGGESTION_TARGET_COUNT)) {
      fallbackBatch.forEach((candidate) => {
        if (finalBatch.length >= SUGGESTION_TARGET_COUNT) return;
        if (!dedupeSuggestionAgainstHistory(candidate, lastUserMsg, [...previousSuggestions, ...finalBatch])) return;
        if (isTooSimilarToSelected(candidate, finalBatch)) return;
        finalBatch.push(candidate);
      });
    }

    callback(finalBatch.length >= MIN_USABLE_SUGGESTIONS ? finalBatch.slice(0, SUGGESTION_TARGET_COUNT) : null);
  } catch (err) {
    if (err?.name === 'AbortError' || err?.message === 'aborted') return;
    console.warn('[API] Suggestion generation failed:', err?.message);
    const fallbackBatch = buildSuggestionSafetyFallback(history, baseRuntimeState, lastUserMsg);
    callback(fallbackBatch.length >= MIN_USABLE_SUGGESTIONS ? fallbackBatch : null);
  }
}
