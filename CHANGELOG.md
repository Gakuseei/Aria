# Changelog

## Smart Suggestions v5 — 2026-03-13

Five commits (`49e4974`→`66364eb`) overhaul the Smart Suggestions and Impersonate systems.
Files changed: `ChatInterface.jsx`, `api.js`, `index.css`, `translations.js` (4 files, +95 −249 lines).

### What changed and why

#### 1. Input field: `<input>` → `<textarea>` with auto-expand
**Commit:** `66364eb` — `ChatInterface.jsx`, `index.css`

The chat input was a single-line `<input>` element. Impersonate responses that exceeded one line were invisible. Replaced with a `<textarea rows={1}>` that auto-grows to its content height (capped at 120px). CSS selectors updated from `input.chat-input` to also match `textarea.chat-input` in both default and OLED modes.

**Semantic impact:** Users can now see and edit multi-line impersonate output before sending. Shift+Enter works naturally for manual multi-line input.

#### 2. SillyTavern-style impersonate prompt
**Commit:** `ab0fc3f` — `api.js`

The impersonate prompt (used by "Write for me") was rewritten to use SillyTavern's bracket-instruction technique: `[Write the next reply from the point of view of ${userName}...]`. This is a known-effective format for making LLMs role-switch without identity confusion.

**Semantic impact:** Reduces instances of the model writing as the character instead of the user. The bracket format is a community-proven technique from SillyTavern's codebase.

#### 3. Suggestion parsing: pipe-delimited → XML `<s>` tags with fallback chain
**Commit:** `ab0fc3f` — `api.js`

Suggestions were parsed by splitting on `|`, which broke when the model included pipes in its output. Now the prompt asks for `<s>tag</s>` wrapped suggestions. The parser tries XML tags first, then falls back to pipe split, then numbered list (`1. ...`), then newlines.

Stop sequences (`charName:`) were added to prevent the model from appending in-character dialogue after the suggestions.

**Semantic impact:** More reliable suggestion extraction across different model output formats. The cascading parser handles edge cases where the model ignores the requested format.

#### 4. Stale suggestion fallback cache removed
**Commit:** `2368d69` — `ChatInterface.jsx`

A `lastGoodSuggestionsRef` cached the last successful suggestions and displayed them when new generation failed. This caused stale pills to persist across topic changes. Removed entirely — failed generations now clear suggestions instead of showing outdated ones.

**Semantic impact:** Suggestions always reflect the current conversation state. No more misleading pills from 5 messages ago.

#### 5. Dynamic context sizing via `getModelCtx()`
**Commit:** `2cae00f` — `api.js`

Both `generateSuggestionsBackground()` and `impersonateUser()` had a hardcoded `num_ctx: 2048`. Replaced with `Math.min(await getModelCtx(ollamaUrl, model, settings.contextSize), 2048)` to respect the user's context size setting while capping at 2048 to keep suggestion generation fast.

`generateSuggestionsBackground` changed from sync to `async` to support the `await`.

**Semantic impact:** Context window now adapts to the model's actual capabilities instead of assuming 2048. Models with smaller context windows no longer waste memory.

#### 6. Impersonate output post-processing pipeline
**Commits:** `ab0fc3f`, `66364eb` — `api.js`, `ChatInterface.jsx`

`impersonateUser()` now returns a cleaned string instead of relying solely on streaming tokens. Three cleaning steps:
1. If the response starts with `charName:`, discard entirely (model wrote as the character)
2. If `charName:` appears mid-text, truncate at that point (model switched mid-response)
3. Strip leading `userName:` prefix (model added unnecessary attribution)

`handleImpersonate` in ChatInterface clears the input first, streams tokens visually, then replaces with the final cleaned result.

**Semantic impact:** The user never sees character-perspective bleed-through in the impersonate field. Streaming still provides visual feedback, but the final text is always clean.

#### 7. Accessibility: `prefers-reduced-motion` support
**Commit:** `2cae00f` — `index.css`

Added a `@media (prefers-reduced-motion: reduce)` block that near-zeroes all animation durations, iteration counts, and transition durations. Also forces `scroll-behavior: auto`.

**Semantic impact:** Users with motion sensitivity or vestibular disorders get a motion-free experience automatically, without needing to toggle the app's built-in "no animations" setting.

#### 8. Dead translation strings removed (208 lines)
**Commit:** `49e4974` — `translations.js`

Removed `smartSuggestions` objects from all 13 language blocks (hardcoded strings like "Good morning", "Du bist süß", etc.). These were replaced by AI-generated suggestions in earlier versions and were no longer referenced anywhere.

**Semantic impact:** 208 lines of dead code removed. The translation file is cleaner, and there's no risk of accidentally falling back to hardcoded suggestions.

#### 9. Minor fixes
**Commit:** `49e4974` — `ChatInterface.jsx`

- Suggestion click now clears pills immediately (`setSmartSuggestions([])`) instead of pre-filling input (the suggestion is sent directly)
- Impersonate errors now show a toast notification instead of failing silently
- Gold mode: suggestion pill sparkle icon respects gold theme (`text-amber-400/70` vs `text-rose-400/70`)

**Commit:** `2368d69` — `api.js`

- Suggestion and impersonate prompts tightened: "ROLE SWITCH" prefix, explicit anti-repetition rules, varied suggestion types (action/dialogue/bold move)

**Commit:** `ab0fc3f` — `api.js`

- Impersonate `num_predict` raised from 60 to 150 tokens, temperature from 0.8 to 0.85 (richer, longer responses)
