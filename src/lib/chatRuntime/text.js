export function resolveTemplates(text, charName, userName) {
  if (!text || typeof text !== 'string') return text || '';
  return text
    .replace(/\{\{char\}\}/gi, charName || 'Character')
    .replace(/\{\{user\}\}/gi, userName || 'User');
}

export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(String(text).length / 3.5);
}

export function normalizeWhitespace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

export function splitParagraphs(text) {
  return String(text || '')
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function splitSentences(text) {
  return normalizeWhitespace(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function buildPlainTextBlock(title, lines) {
  const content = []
    .concat(lines || [])
    .map((line) => String(line || '').trim())
    .filter(Boolean)
    .join('\n');

  if (!content) return '';
  return `${title}:\n${content}`;
}

export function trimPromptSnippet(text, maxLength = 240) {
  const cleaned = normalizeWhitespace(text);
  if (!cleaned) return '';
  if (cleaned.length <= maxLength) return cleaned;

  const clipped = cleaned.slice(0, maxLength);
  const sentenceEnd = Math.max(clipped.lastIndexOf('. '), clipped.lastIndexOf('! '), clipped.lastIndexOf('? '));
  if (sentenceEnd > maxLength * 0.45) {
    return clipped.slice(0, sentenceEnd + 1).trim();
  }

  const wordEnd = clipped.lastIndexOf(' ');
  if (wordEnd > maxLength * 0.65) {
    return `${clipped.slice(0, wordEnd).trim()}...`;
  }

  return `${clipped.trim()}...`;
}

export function truncateMiddle(text, maxLength = 320, headChars = 120, tailChars = 160) {
  const cleaned = normalizeWhitespace(text);
  if (!cleaned || cleaned.length <= maxLength) return cleaned;

  const head = cleaned.slice(0, Math.min(headChars, Math.max(40, Math.floor(maxLength * 0.4)))).trim();
  const tail = cleaned.slice(-Math.min(tailChars, Math.max(60, Math.floor(maxLength * 0.45)))).trim();
  return `${head} [...] ${tail}`;
}

export function clipToTokenTarget(text, tokenTarget) {
  const cleaned = normalizeWhitespace(text);
  if (!cleaned) return '';

  const targetChars = Math.max(80, Math.floor(tokenTarget * 3.5));
  if (cleaned.length <= targetChars) return cleaned;

  const candidate = cleaned.slice(0, targetChars);
  const sentenceEnd = Math.max(candidate.lastIndexOf('. '), candidate.lastIndexOf('! '), candidate.lastIndexOf('? '));
  if (sentenceEnd > targetChars * 0.45) {
    return candidate.slice(0, sentenceEnd + 1).trim();
  }

  const wordEnd = candidate.lastIndexOf(' ');
  if (wordEnd > targetChars * 0.7) {
    return `${candidate.slice(0, wordEnd).trim()}...`;
  }

  return `${candidate.trim()}...`;
}

export function pickSentenceByKeywords(text, keywords = [], maxLength = 180) {
  const sentences = splitSentences(text);
  const loweredKeywords = keywords.map((keyword) => keyword.toLowerCase());
  const match = sentences.find((sentence) => loweredKeywords.some((keyword) => sentence.toLowerCase().includes(keyword)));
  return trimPromptSnippet(match || sentences[0] || '', maxLength);
}
