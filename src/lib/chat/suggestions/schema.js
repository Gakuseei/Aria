/**
 * Builds the Ollama format-mode JSON schema for Smart Suggestions.
 * Beat field comes first to leverage chain-of-thought field ordering.
 */

/**
 * @param {string} appLanguageName - Display name like "German", "English".
 * @returns {object}
 */
export function buildSuggestionSchema(appLanguageName) {
  const lang = String(appLanguageName || '').trim() || 'English';
  return {
    type: 'object',
    additionalProperties: false,
    required: ['beat', 'pills'],
    properties: {
      beat: {
        type: 'string',
        enum: ['refusal', 'invitation', 'uncertain'],
        description:
          'Read closing-line. refusal = character pulled away / said no / needs space. ' +
          'invitation = character opened door / asked / leaned in. ' +
          'uncertain = neutral or smalltalk.'
      },
      pills: {
        type: 'array',
        minItems: 3,
        maxItems: 3,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['tone', 'text'],
          properties: {
            tone: { type: 'string', enum: ['hold', 'move', 'press'] },
            text: {
              type: 'string',
              maxLength: 200,
              description: `MUST be in ${lang}. Reply text from {{user}}'s perspective. Max 8 words. No leading char-name.`
            }
          }
        }
      }
    }
  };
}
