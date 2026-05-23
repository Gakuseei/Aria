/**
 * Builds the Ollama format-mode JSON schema for Smart Suggestions.
 * Beat field comes first to leverage chain-of-thought field ordering.
 */

/**
 * @param {string} appLanguageName - Display name like "German", "English".
 * @param {string} userName - The user's display name.
 * @param {string} characterName - The character's display name.
 * @returns {object}
 */
export function buildSuggestionSchema(appLanguageName, userName, characterName) {
  const lang = String(appLanguageName || '').trim() || 'English';
  const user = String(userName || '').trim() || 'User';
  const character = String(characterName || '').trim() || 'Character';
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
              description:
                `MUST be in ${lang}. Spoken by ${user} in first person ("I", "me", "my"), addressing ${character}.\n` +
                `NEVER start with "She", "He", "They", or "${character}".\n` +
                `NEVER describe ${character}'s actions or thoughts.\n` +
                `May include one short ${user} action in *asterisks* before or after the dialogue.\n` +
                `Max 18 words.`
            }
          }
        }
      }
    }
  };
}
