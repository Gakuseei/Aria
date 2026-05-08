/**
 * Pure JSON parser for Smart Suggestions v2 output.
 * Accepts beat-first schema: { beat: enum, pills: [ {tone, text} x3 ] }.
 */

const VALID_BEATS = new Set(['refusal', 'invitation', 'uncertain']);
const VALID_TONES = new Set(['hold', 'move', 'press']);

function stripFences(raw) {
  const t = String(raw || '').trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return fenced[1].trim();
  return t;
}

/**
 * Parses raw model output into a validated suggestion payload.
 * @param {string} raw
 * @returns {{beat:string, pills:Array<{tone:string, text:string}>}|null}
 */
export function parseSuggestionJson(raw) {
  const inner = stripFences(raw);
  if (!inner) return null;
  let obj;
  try {
    obj = JSON.parse(inner);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;
  if (!VALID_BEATS.has(obj.beat)) return null;
  if (!Array.isArray(obj.pills) || obj.pills.length !== 3) return null;
  const pills = [];
  for (const p of obj.pills) {
    if (!p || typeof p !== 'object') return null;
    if (!VALID_TONES.has(p.tone)) return null;
    const text = String(p.text || '').trim();
    if (!text) return null;
    pills.push({ tone: p.tone, text });
  }
  return { beat: obj.beat, pills };
}
