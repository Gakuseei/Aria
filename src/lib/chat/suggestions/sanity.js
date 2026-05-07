/**
 * Four sanity filters for parsed suggestion output.
 * Returns the input pills if all pass, null on any failure.
 */

export const SANITY_CONSTANTS = Object.freeze({
  pillMaxChars: 120,
  dedupeAgainst: 5
});

function isNonEmptyText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function withinLength(value) {
  return typeof value === 'string' && value.length <= SANITY_CONSTANTS.pillMaxChars;
}

/**
 * Apply minimal sanity filters to parsed suggestion pills.
 *
 * @param {{ stay: string, forward: string, push: string }|null} pills - parsed pills.
 * @param {Object} [options]
 * @param {string[]} [options.previousPills] - recent prior pills to dedupe against.
 * @returns {{ stay: string, forward: string, push: string }|null}
 *   trimmed pills on pass, null if any filter rejects.
 */
export function applySanityFilters(pills, options = {}) {
  if (!pills || typeof pills !== 'object') return null;
  const { stay, forward, push } = pills;
  const triplet = [stay, forward, push];

  if (!triplet.every(isNonEmptyText)) return null;
  if (!triplet.every(withinLength)) return null;

  const lower = triplet.map((t) => t.trim().toLowerCase());
  if (new Set(lower).size === 1) return null;

  const previous = (Array.isArray(options.previousPills) ? options.previousPills : [])
    .slice(-SANITY_CONSTANTS.dedupeAgainst)
    .map((t) => String(t || '').trim().toLowerCase());

  for (const pillLower of lower) {
    if (previous.includes(pillLower)) return null;
  }

  return { stay: stay.trim(), forward: forward.trim(), push: push.trim() };
}
