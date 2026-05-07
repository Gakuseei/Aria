import { describe, it, expect } from 'vitest';
import { applySanityFilters, SANITY_CONSTANTS } from '../../src/lib/chat/suggestions/sanity.js';

describe('applySanityFilters', () => {
  const valid = { stay: 'Sure thing.', forward: 'Lead the way.', push: 'Heading there now.' };

  it('passes a valid pill set through', () => {
    expect(applySanityFilters(valid, { previousPills: [] })).toEqual(valid);
  });

  it('returns null when input is null', () => {
    expect(applySanityFilters(null, { previousPills: [] })).toBeNull();
  });

  it('returns null when any pill text is empty after trim', () => {
    expect(applySanityFilters({ stay: '   ', forward: 'a', push: 'b' }, { previousPills: [] })).toBeNull();
  });

  it('returns null when any pill exceeds pillMaxChars', () => {
    const long = 'x'.repeat(SANITY_CONSTANTS.pillMaxChars + 1);
    expect(applySanityFilters({ stay: long, forward: 'a', push: 'b' }, { previousPills: [] })).toBeNull();
  });

  it('returns null when all three pills are identical', () => {
    expect(applySanityFilters({ stay: 'go', forward: 'go', push: 'go' }, { previousPills: [] })).toBeNull();
  });

  it('returns null when entire set duplicates a recent prior pill (any pill exact match)', () => {
    const previous = ['Sure thing.', 'Other line.'];
    const dupe = { stay: 'Sure thing.', forward: 'Lead the way.', push: 'Heading there.' };
    expect(applySanityFilters(dupe, { previousPills: previous })).toBeNull();
  });

  it('passes when previous pills do not match', () => {
    expect(applySanityFilters(valid, { previousPills: ['Totally unrelated.'] })).toEqual(valid);
  });

  it('exposes pillMaxChars and dedupeAgainst', () => {
    expect(SANITY_CONSTANTS.pillMaxChars).toBe(120);
    expect(SANITY_CONSTANTS.dedupeAgainst).toBe(5);
  });
});
