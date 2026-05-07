/**
 * Pure parser for the Smart Suggestions feature output.
 * Returns { stay, forward, push } on success, null on any failure.
 */

const REQUIRED_ROLES = ['stay', 'forward', 'push'];
const FENCE_PATTERN = /^```(?:json)?\s*([\s\S]*?)\s*```\s*$/i;

function unfence(raw) {
  const text = String(raw || '').trim();
  const match = text.match(FENCE_PATTERN);
  return match ? match[1].trim() : text;
}

/**
 * Parse a Smart Suggestions LLM response.
 *
 * @param {string|null|undefined} raw - the raw LLM output, optionally fenced.
 * @returns {{ stay: string, forward: string, push: string }|null}
 *   the three pill texts on success, null if parsing or schema validation fails.
 */
export function parseSuggestionJson(raw) {
  const text = unfence(raw);
  if (!text) return null;

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  const pills = parsed?.pills;
  if (!Array.isArray(pills) || pills.length < 3) return null;

  const byRole = {};
  for (const entry of pills) {
    if (!entry || typeof entry !== 'object') return null;
    const role = String(entry.role || '').trim().toLowerCase();
    const pillText = String(entry.text || '').trim();
    if (!REQUIRED_ROLES.includes(role)) return null;
    if (!pillText) return null;
    if (byRole[role]) continue;
    byRole[role] = pillText;
  }

  for (const role of REQUIRED_ROLES) {
    if (!byRole[role]) return null;
  }

  return { stay: byRole.stay, forward: byRole.forward, push: byRole.push };
}
