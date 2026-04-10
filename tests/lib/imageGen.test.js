import { describe, expect, it } from 'vitest';
import { extractConversationContext } from '../../src/lib/imageGen.js';

const lilyOpening = '*already set up at the study table, textbooks spread in a careful semicircle, sticky notes arranged by color* *looks up with a bright smile and waves you over* "Hey! I saved you a spot." *pushes a bag of trail mix across the table* "Fuel first, knowledge second — that\'s my policy." *flips open a notebook covered in neat, color-coded sections* "So I was reviewing the material and I think I figured out why chapter seven is so confusing — the textbook explains it backwards." *adjusts her glasses, leaning forward eagerly* "But I found a way better way to think about it. What section are you struggling with most? Let\'s start there." *uncaps a highlighter with a determined click* "We\'ve got two weeks. That\'s plenty of time. We\'ve got this."';

describe('extractConversationContext', () => {
  it('does not crash on ordinary school-scene openings', () => {
    let prompt;

    expect(() => {
      prompt = extractConversationContext(
        [{ role: 'assistant', content: lilyOpening }],
        { name: 'Lily', systemPrompt: '' }
      );
    }).not.toThrow();

    expect(typeof prompt).toBe('string');
  });
});
