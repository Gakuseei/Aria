export function escapeRegex(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function deconjugateSimplePresent(verb) {
  const normalized = String(verb || '').toLowerCase();
  if (!normalized) return '';

  const irregular = {
    is: 'am',
    are: 'am',
    has: 'have',
    does: 'do',
    goes: 'go'
  };

  if (irregular[normalized]) return irregular[normalized];
  if (normalized.endsWith('ies') && normalized.length > 3) return `${normalized.slice(0, -3)}y`;
  if (/(ches|shes|sses|xes|zes|oes)$/.test(normalized)) return normalized.slice(0, -2);
  if (normalized.endsWith('s') && normalized.length > 2 && !/(ss|us|is)$/.test(normalized)) return normalized.slice(0, -1);
  return normalized;
}

export function isAdverbishToken(token) {
  const normalized = String(token || '').replace(/^[^A-Za-z']+|[^A-Za-z']+$/g, '').toLowerCase();
  if (!normalized) return false;
  return normalized.endsWith('ly')
    || ['then', 'still', 'just', 'again', 'almost', 'nearly', 'closer'].includes(normalized);
}

export function repairLeadingNarrationSegment(segment, userName) {
  const trimmed = String(segment || '').trim();
  if (!trimmed || /^["“]/.test(trimmed)) return trimmed;
  if (/\b(?:I|me|my|mine|I'm|I've|I'll|I'd)\b/i.test(trimmed)) return trimmed;
  if (/^(?:She|He|Her|His)\b/i.test(trimmed)) return trimmed;

  const escapedUserName = escapeRegex(userName);
  const directReplacements = [
    [new RegExp(`^${escapedUserName}'s\\b`, 'i'), 'My'],
    [new RegExp(`^${escapedUserName}\\b`, 'i'), 'I'],
    [/^You're\b/i, "I'm"],
    [/^You've\b/i, "I've"],
    [/^You'll\b/i, "I'll"],
    [/^You'd\b/i, "I'd"],
    [/^Your\b/i, 'My'],
    [/^You\b/i, 'I']
  ];

  for (const [pattern, replacement] of directReplacements) {
    if (pattern.test(trimmed)) {
      return trimmed.replace(pattern, replacement);
    }
  }

  const tokens = trimmed.split(/\s+/);
  let verbIndex = 0;
  while (verbIndex < tokens.length && verbIndex < 3 && isAdverbishToken(tokens[verbIndex])) {
    verbIndex++;
  }

  if (verbIndex >= tokens.length) return trimmed;

  const originalVerbToken = tokens[verbIndex];
  const bareVerb = originalVerbToken.replace(/^[^A-Za-z']+|[^A-Za-z']+$/g, '');
  if (!bareVerb || bareVerb.length < 3) return trimmed;

  const invalidLeadWords = new Set([
    'well', 'oh', 'ah', 'yes', 'no', 'the', 'a', 'an', 'this', 'that', 'these', 'those',
    'her', 'his', 'their', 'its', 'our', 'my', 'your', 'me', 'mine', 'hers', 'herself', 'himself'
  ]);
  if (invalidLeadWords.has(bareVerb.toLowerCase())) return trimmed;

  const deconjugatedVerb = deconjugateSimplePresent(bareVerb);
  if (!deconjugatedVerb || deconjugatedVerb === bareVerb.toLowerCase()) {
    return `I ${trimmed}`;
  }

  tokens[verbIndex] = originalVerbToken.replace(bareVerb, deconjugatedVerb);
  return `I ${tokens.join(' ')}`
    .replace(/\b(and|then|while|before)\s+([A-Za-z']+)\b/g, (match, prefix, verb) => {
      const repairedVerb = deconjugateSimplePresent(verb);
      return repairedVerb !== verb.toLowerCase() ? `${prefix} ${repairedVerb}` : match;
    });
}

export function repairLeadingActionBlock(text, userName) {
  return String(text || '').replace(/^\*([^*]+)\*/, (match, actionText) => {
    const repairedAction = repairLeadingNarrationSegment(actionText, userName);
    return repairedAction ? `*${repairedAction}*` : match;
  });
}
