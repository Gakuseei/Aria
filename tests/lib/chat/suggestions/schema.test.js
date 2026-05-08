import { describe, it, expect } from 'vitest';
import { buildSuggestionSchema } from '../../../../src/lib/chat/suggestions/schema.js';

describe('buildSuggestionSchema', () => {
  it('produces beat-first JSON schema', () => {
    const schema = buildSuggestionSchema('English');
    expect(schema.required).toEqual(['beat', 'pills']);
    expect(schema.properties.beat.enum).toEqual(['refusal', 'invitation', 'uncertain']);
    expect(schema.properties.pills.minItems).toBe(3);
    expect(schema.properties.pills.maxItems).toBe(3);
  });

  it('substitutes language name into pill text description', () => {
    const schema = buildSuggestionSchema('German');
    const desc = schema.properties.pills.items.properties.text.description;
    expect(desc).toContain('MUST be in German');
    expect(desc).toContain("from {{user}}'s perspective");
  });

  it('uses tone enum hold|move|press', () => {
    const schema = buildSuggestionSchema('English');
    const toneSchema = schema.properties.pills.items.properties.tone;
    expect(toneSchema.enum).toEqual(['hold', 'move', 'press']);
  });

  it('caps text length at 200', () => {
    const schema = buildSuggestionSchema('English');
    expect(schema.properties.pills.items.properties.text.maxLength).toBe(200);
  });

  it('falls back to English when language name is empty', () => {
    const schema = buildSuggestionSchema('');
    expect(schema.properties.pills.items.properties.text.description).toContain('English');
  });
});
