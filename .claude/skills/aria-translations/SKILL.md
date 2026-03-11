---
name: aria-translations
description: Add or update UI translations in src/lib/translations.js. Use when adding new UI text, modifying existing labels, or working with the t() function. Covers all 13 language keys and the required structure.
---

# Aria Translations

All user-facing text **must** go through `src/lib/translations.js` and the `t()` helper. Hardcoded UI strings are never acceptable.

## Language Keys (13 total)

Every new key must be added to **all** of these top-level objects:

```
en, de, es, cn, fr, it, pt, ru, ja, ko, ar, hi, tr
```

## Structure

Translations are nested by section:

```js
export const translations = {
  en: {
    meta: { label: "English", flag: "🇺🇸" },
    mainMenu: { newGame: "New Game", ... },
    settings: { title: "Settings", ... },
    chat: { ... },
    // ...more sections
  },
  de: { /* same shape */ },
  // ...all 13 languages
};
```

## Adding a New Key

1. Choose or create the correct section (e.g. `chat`, `settings`, `mainMenu`).
2. Add the English value under `en`.
3. Add translated values for all 12 remaining languages. Use accurate translations — do not leave English placeholders.
4. Use the key via `t('section.keyName')` in JSX.

## Rules

- Never use raw strings in JSX for user-visible text.
- The `cn` key is Chinese (Simplified). Do not rename it to `zh`.
- Keep keys in camelCase.
- Section names match UI areas (`mainMenu`, `settings`, `chat`, `story`, etc.).
- Interpolation uses `{variable}` syntax: `"Found {count} models"`.
