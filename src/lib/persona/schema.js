export const PERSONA_SCHEMA = {
  id:               { type: 'string',  auto: true },
  name:             { type: 'string',  default: '', required: true },
  subtitle:         { type: 'string',  default: '' },
  themeColor:       { type: 'hex',     default: '#ef4444' },
  avatarBase64:     { type: 'string',  default: '' },
  type:             { enum: ['character', 'bot'], default: 'character' },
  isCustom:         { type: 'bool',    default: true },

  description:      { type: 'string',  default: '' },
  personality:      { type: 'string',  default: '' },
  scenario:         { type: 'string',  default: '' },
  systemPrompt:     { type: 'string',  default: '', required: true },
  instructions:     { type: 'string',  default: '' },
  exampleDialogues: { type: 'array',   default: [] },
  startingMessage:  { type: 'string',  default: '', required: true },

  voicePin:         { type: 'string',  default: '' },
  voicePinNsfw:     { type: 'string',  default: '' },
  voiceAvoid:       { type: 'string',  default: '' },

  category:         { enum: ['sfw', 'nsfw'], default: 'sfw' },
  intimacyContract: { type: 'string',  default: '' },
  responseMode:     { type: 'string',  default: 'normal' },
  passionEnabled:   { type: 'bool',    default: true },
  passionSpeed:     { enum: ['slow', 'normal', 'fast', 'extreme'], default: 'normal' },

  createdAt:        { type: 'iso',     auto: true },
  updatedAt:        { type: 'iso',     auto: true },
};

export function generateId() {
  return `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function resolveDefault(field) {
  if (Array.isArray(field.default)) return [...field.default];
  return field.default;
}

export function buildEmptyPersona() {
  const persona = {};
  const now = new Date().toISOString();
  for (const [key, field] of Object.entries(PERSONA_SCHEMA)) {
    if (field.auto) {
      if (key === 'id') persona[key] = generateId();
      else if (key === 'createdAt' || key === 'updatedAt') persona[key] = now;
      else persona[key] = '';
      continue;
    }
    persona[key] = resolveDefault(field);
  }
  return persona;
}
