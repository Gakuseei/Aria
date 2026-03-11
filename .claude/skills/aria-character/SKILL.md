---
name: aria-character
description: Create or edit character profiles in src/config/characters.js. Use when adding new characters, modifying existing ones, or working with W++ format, example dialogues, or passion settings.
---

# Aria Character Format

Characters live in `src/config/characters.js` as objects in the `characters` array.

## Required Fields

```js
{
  id: 'snake_case_id',          // unique identifier
  name: 'Name',                 // display name
  subtitle: 'Short Role',       // shown under name
  role: 'Short Role',           // same as subtitle
  description: '...',           // prose paragraph for UI card
  themeColor: '#hex',           // rose/pink family preferred
  passionProfile: 0.0-1.0,     // base passion multiplier

  systemPrompt: `[Character("Name") ...]`,  // W++ format (see below)
  instructions: `...`,          // behavioral rules paragraph
  scenario: `...`,              // scene setting
  exampleDialogue: `[Instructions: ...]`,   // NSFW behavior instructions
  authorsNote: '',              // optional inline note

  exampleDialogues: [           // array of sample exchanges
    { user: '...', character: `*action* "dialogue"` }
  ],

  startingMessage: `...`,       // first message when chat opens
  greeting: `...`,              // same as startingMessage
}
```

## W++ systemPrompt Format

```
[Character("Name")
Gender("...")
Age("...")
Personality("trait" + "trait" + "trait")
Appearance("detail" + "detail")
Clothing("item" + "item")
Speech("pattern" + "pattern")
Quirks("habit" + "habit")
Tone("descriptor" + "descriptor")
Likes("thing" + "thing")
Hates("thing" + "thing")
Backstory("detail" + "detail")]
```

- Use `+` to separate multiple values within a field.
- Wrap each value in quotes.
- Keep the entire block inside backticks as a template literal.

## Dialogue Format

Actions in `*asterisks*`, speech in `"quotes"`:

```
*leans against the counter* "Hey there." *smirks*
```

Use `{{char}}` and `{{user}}` as placeholders in `exampleDialogue`.

## Passion Settings (Custom Characters)

Custom characters may include:

```js
passionEnabled: true,           // boolean — enable passion system
passionSpeed: 'normal',         // 'slow' | 'normal' | 'fast' | 'extreme'
```

Built-in characters use `passionProfile` (0.0–1.0) instead.
