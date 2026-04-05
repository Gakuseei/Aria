import { didUserRequestShortReply, normalizeResponseMode } from '../responseModes.js';
import { buildRuntimeState, renderActiveScene } from '../chatRuntime/index.js';

export function cleanTranscriptArtifacts(text, charName = '') {
  if (!text || typeof text !== 'string') return '';

  let cleaned = text;

  // Strip model special tokens — cut everything from first special token onwards
  const specialTokenIdx = cleaned.search(/<\|(?:endoftext|im_start|im_end|end|eot_id|start_header_id)\|>/i);
  if (specialTokenIdx !== -1) {
    cleaned = cleaned.substring(0, specialTokenIdx).trim();
  }

  // Remove any occurrence of "User:", "Human:", "Assistant:" etc.
  // If found, cut everything from that point onwards
  const stopPatterns = [
    /\n\s*User\s*:/i,
    /\n\s*Human\s*:/i,
    /\n\s*Assistant\s*:/i,
    /\n\s*AI\s*:/i,
    /\n\s*Character\s*:/i
  ];

  for (const pattern of stopPatterns) {
    const match = cleaned.match(pattern);
    if (match) {
      console.info('[Cleaner] Found transcript artifact, cutting at:', match[0]);
      cleaned = cleaned.substring(0, match.index).trim();
    }
  }

  // Remove AI writing-assistant meta-commentary preambles
  cleaned = cleaned.replace(/^(?:Here(?:'s| is) (?:a |the |my )?(?:response|completion|continuation|reply|scene|roleplay|version)[\s\S]*?:\s*\n*)/i, '');

  // Remove "---" separator lines (scene break artifacts)
  cleaned = cleaned.replace(/^\s*---+\s*\n?/gm, '');

  // Remove meta-commentary paragraphs (author notes about the character/scene)
  const metaPatterns = [
    /^This (?:is|keeps|shows|demonstrates|maintains|sets up).*?(?:character|behavior|scene|personality|roleplay|intimacy).*$/gim,
    /^(?:The (?:key|goal|idea|point|breakthrough|problem) (?:is|here|comes)|Remember:).*$/gim,
    /^(?:She|He)'s (?:not |genuinely |actually |really |just )?(?:playing|making|giving|trying|doing|being|setting).*$/gim
  ];

  for (const pattern of metaPatterns) {
    cleaned = cleaned.replace(pattern, '').trim();
  }

  // Strip character name prefixes (e.g. "**Sophia:**", "Alice:", "Sophia said:")
  if (charName) {
    const escapedName = charName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(new RegExp(`^\\*{0,2}${escapedName}\\*{0,2}\\s*:\\s*`, 'gim'), '');
  }

  // Strip markdown headers (e.g. "### The Velvet Room's Signature Surprise")
  cleaned = cleaned.replace(/^#{1,6}\s+\*{0,2}.*\*{0,2}\s*$/gm, '');
  cleaned = cleaned.replace(/^#{1,6}\s+.*$/gm, '');

  // Trim incomplete sentences — if num_predict cuts mid-sentence, trim to last complete one
  // If response was cut off mid-sentence by num_predict, trim to last complete sentence
  const lastChar = cleaned.trim().slice(-1);
  if (lastChar && !['.', '!', '?', '"', '*', '~', ')'].includes(lastChar)) {
    const sentenceEnd = Math.max(
      cleaned.lastIndexOf('*'),
      cleaned.lastIndexOf('"'),
      cleaned.lastIndexOf('.'),
      cleaned.lastIndexOf('!'),
      cleaned.lastIndexOf('?')
    );
    if (sentenceEnd > 0 && sentenceEnd > cleaned.length * 0.5) {
      console.info(`[Cleaner] Trimmed incomplete sentence (cut at ${sentenceEnd}/${cleaned.length})`);
      cleaned = cleaned.substring(0, sentenceEnd + 1);
    }
  }

  // Strip leading dots/slashes before asterisks (model outputs ".*action*" or "/*action*")
  cleaned = cleaned.replace(/^[./]+(?=\*)/gm, '');

  // Clean up excessive blank lines left after removals
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}

function stripStreamingArtifacts(text) {
  if (!text || typeof text !== 'string') return '';

  let cleaned = text
    .replace(/<\|[^|]*\|>/g, '')
    .replace(/\[TOOL_CALLS\]/g, '');

  const stopPatterns = [
    /\n\s*User\s*:/i,
    /\n\s*Human\s*:/i,
    /\n\s*Assistant\s*:/i,
    /\n\s*AI\s*:/i,
    /\n\s*Character\s*:/i
  ];

  for (const pattern of stopPatterns) {
    const match = cleaned.match(pattern);
    if (match) {
      cleaned = cleaned.substring(0, match.index).trimEnd();
      break;
    }
  }

  return cleaned.replace(/^[./]+(?=\*)/gm, '').trimEnd();
}

function countStreamingSentences(text) {
  const normalized = String(text || '')
    .replace(/[*"_~`]/g, ' ');

  return (normalized.match(/[.!?]+/g) || []).length;
}

function hasBalancedFormatting(text) {
  const candidate = String(text || '');
  const markerPairs = ['*', '"', '_', '~', '`'];
  return markerPairs.every((marker) => ((candidate.match(new RegExp(`\\${marker}`, 'g')) || []).length % 2) === 0);
}

export function buildRoleplaySceneContext(history, charName, userName, characterDescription = '', characterScenario = '', characterInstructions = '') {
  const runtimeState = buildRuntimeState({
    character: {
      name: charName,
      systemPrompt: characterDescription || '',
      instructions: characterInstructions || '',
      scenario: characterScenario || ''
    },
    history,
    userName,
    runtimeSteering: {
      profile: 'reply',
      availableContextTokens: 1024,
      responseMode: 'normal',
      passionLevel: 0,
      unchainedMode: false
    }
  });
  const recentHistory = runtimeState.selectedRecentHistory.messages.map((message) => ({
    role: message.role,
    content: message.content
  }));
  const historyText = recentHistory
    .map(m => `${m.role === 'user' ? userName : charName}: ${m.content}`)
    .join('\n');

  const lastUserMsg = recentHistory.filter(m => m.role === 'user').pop()?.content || '';
  const lastAssistantMsg = recentHistory.filter(m => m.role === 'assistant').pop()?.content || '';
  const currentBeat = [
    lastAssistantMsg ? `${charName}: ${lastAssistantMsg}` : '',
    lastUserMsg ? `${userName}: ${lastUserMsg}` : ''
  ].filter(Boolean).join('\n');

  const sceneSummary = renderActiveScene(runtimeState.activeScene, { compact: false });

  return {
    recentHistory,
    historyText,
    lastUserMsg,
    lastAssistantMsg,
    currentBeat,
    sceneSummary
  };
}

export function shouldAutoStopStreamingResponse(text, responseMode = 'normal') {
  if (normalizeResponseMode(responseMode) !== 'short') return false;

  const cleaned = stripStreamingArtifacts(text);
  if (!cleaned) return false;

  const trimmed = cleaned.trimEnd();
  const visibleChars = trimmed.replace(/\s+/g, ' ').trim().length;
  const sentenceCount = countStreamingSentences(trimmed);
  const lastChar = trimmed.slice(-1);
  const endsCleanly = ['.', '!', '?', '"', '*', '~', ')'].includes(lastChar);

  if (!endsCleanly) return false;
  if (!hasBalancedFormatting(trimmed)) return false;

  return sentenceCount >= 2 && visibleChars >= 90;
}

export function isUnderfilledShortReply(text, userMessage = '', responseMode = 'normal') {
  if (normalizeResponseMode(responseMode) !== 'short') return false;
  if (didUserRequestShortReply(userMessage)) return false;

  const cleaned = String(text || '').trim();
  if (!cleaned) return true;

  const sentenceCount = countStreamingSentences(cleaned);
  const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
  const visibleChars = cleaned.replace(/\s+/g, ' ').trim().length;
  const endsCleanly = ['.', '!', '?', '"', '*', '~', ')'].includes(cleaned.slice(-1));

  return sentenceCount < 2 || wordCount < 12 || visibleChars < 80 || !endsCleanly;
}

/**
 * Replaces {{char}} and {{user}} template variables in text.
 * Industry-standard placeholders ({{char}} / {{user}}).
 * @param {string} text - Text containing {{char}} / {{user}} placeholders
 * @param {string} charName - Character's display name
 * @param {string} userName - User's display name (from settings)
 * @returns {string} Text with placeholders replaced
 */
export function resolveTemplates(text, charName, userName) {
  if (!text || typeof text !== 'string') return text || '';
  return text
    .replace(/\{\{char\}\}/gi, charName || 'Character')
    .replace(/\{\{user\}\}/gi, userName || 'User');
}

// ============================================================================
// DEFAULT SETTINGS - OLLAMA ONLY
// ============================================================================
