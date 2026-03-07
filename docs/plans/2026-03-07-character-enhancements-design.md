# Character Enhancements — Design Doc

**Date:** 2026-03-07
**Problem:** Aria lacks 3 key features that competitors like HammerAI have: Example Dialogues, {{char}}/{{user}} template variables, and a Scenario field. These directly impact output quality, especially on small local models.

## Features

### 1. Example Dialogues (optional)

**What:** Structured user/character message pairs that teach the model the character's exact speech patterns, mannerisms, and response style.

**Why:** Small local models (2B-9B) struggle to infer speech patterns from system prompt descriptions alone. Concrete examples dramatically improve consistency.

**Data model:**
```js
exampleDialogues: [
  { user: "Kiss me", character: "*leans in slowly* \"Like this...?\"" },
  { user: "Tell me about yourself", character: "*fidgets* \"W-well...\"" }
]
```

**UI:** Structured pairs with "Add Example" button. Each pair has User/Character text fields with descriptive placeholders. Delete button per pair. Max 5 pairs.

**Prompt injection:** After systemPrompt, before instructions. Formatted as:
```
━━━ EXAMPLE DIALOGUES (mimic this style) ━━━
User: "Kiss me"
Alice: *leans in slowly* "Like this...?"
```

**Model scaling:**
- ≤2048 ctx: Skip entirely
- ≤4096 ctx: Skip entirely (not enough budget)
- >4096 ctx: Include all pairs

### 2. {{char}}/{{user}} Template Variables

**What:** `{{char}}` is replaced with the character's name, `{{user}}` is replaced with the user's name (from Settings, default "User").

**Why:** Industry standard (SillyTavern, HammerAI, TavernAI all use this). Enables copy-paste persona import. Makes prompts more readable.

**Implementation:** Single function `resolveTemplates(text, charName, userName)` that replaces both placeholders. Applied at prompt assembly time to: systemPrompt, instructions, scenario, exampleDialogues (both user and character text), startingMessage.

**userName source:** Already exists in settings as `settings.userName` (default: `'User'`). Already in Settings UI.

### 3. Scenario Field (optional)

**What:** Dedicated field for scene setup — where, when, what's happening when the story starts.

**Why:** Separating "who the character is" (systemPrompt) from "where the scene takes place" (scenario) helps models distinguish identity from context. Better scene continuity.

**Data model:**
```js
scenario: "Late evening at The Velvet Room. {{char}} is cleaning glasses. Only {{user}} remains."
```

**UI:** Textarea between systemPrompt and exampleDialogues. Descriptive placeholder with example. Tip mentioning {{char}}/{{user}} support.

**Prompt injection:** After systemPrompt, before exampleDialogues:
```
━━━ SCENARIO ━━━
Late evening at The Velvet Room. Alice is cleaning glasses. Only User remains.
```

**Model scaling:**
- ≤2048 ctx: Skip entirely
- ≤4096 ctx: Include as single line
- >4096 ctx: Full section

## Prompt Assembly Order (Block 2 — Identity)

```
1. CHARACTER NAME: [name]
2. CHARACTER DESCRIPTION: [description]
3. DETAILED CHARACTER PERSONA: [systemPrompt]     ← existing
4. SCENARIO: [scenario]                           ← NEW (optional)
5. EXAMPLE DIALOGUES: [formatted pairs]           ← NEW (optional)
6. CRITICAL CHARACTER INSTRUCTIONS: [instructions] ← existing (highest priority)
7. PRIORITY CHAIN                                  ← existing
```

## UI Improvements — Full Placeholder Polish

All fields get descriptive, example-rich placeholders (ghost text that disappears on type) plus helpful tip lines underneath.

### Basic Information
- **Name**: `e.g., Luna, Commander Rex, Dr. Noir`
- **Subtitle**: `e.g., Mysterious Witch, Shy Librarian`
- **Description**: Multi-line placeholder with concrete example

### AI Behavior
- **System Prompt**: Multi-line placeholder listing what to include (personality, speech patterns, backstory, mannerisms) with a concrete example
- **Scenario**: Multi-line placeholder with scene-setting example, mentions {{char}}/{{user}}
- **Example Dialogues**: Structured pairs with per-field placeholders
- **Instructions**: Multi-line placeholder with concrete rule examples
- **Starting Message**: Placeholder with formatting example

### Template Variables Info Box
Small hint box near Scenario field:
```
Use {{char}} for character name, {{user}} for player name.
These auto-replace: {{char}} → Luna, {{user}} → [your name]
```

## Translation Requirements

All new UI text goes through `translations.js` and `t()`. New keys needed in all 13 languages:
- `characterCreator.scenario` / `scenarioPlaceholder` / `scenarioTip`
- `characterCreator.exampleDialogues` / `exampleDialoguesPlaceholder` / etc.
- `characterCreator.addExample` / `removeExample`
- `characterCreator.userSays` / `characterResponds`
- `characterCreator.templateHint`
- Updated placeholders for existing fields

## Files Changed

1. **`src/lib/api.js`** — Add `resolveTemplates()`, inject scenario + exampleDialogues into Block 2, handle model-size scaling for new fields
2. **`src/components/CharacterCreator.jsx`** — Add scenario textarea, example dialogue pairs UI, improved placeholders, template variable hint
3. **`src/lib/translations.js`** — New translation keys for all 13 languages
4. **`src/config/characters.js`** — Phase 2 only (add scenario + exampleDialogues to standard personas AFTER everything works)

## Success Criteria

1. Custom characters with scenario + example dialogues produce noticeably better, more in-character responses
2. {{char}} and {{user}} are replaced correctly in all text fields
3. Scenario and example dialogues are optional — omitting them works exactly as before
4. All 13 languages have proper translations for new UI elements
5. Model-size scaling respects token budgets (tiny models don't get bloated prompts)
6. Existing characters (standard + previously saved custom) work without changes
