# Aria v2.0 Bug Fix Design

**Date:** 2026-03-08
**Scope:** Fix 6 confirmed bugs from v2.0 prompt system rewrite (untested release)
**Test Data:** ~/Downloads/Test/Test1-5.json (Alice, Sarah, Lily)

## Bugs Addressed

| # | Bug | Severity | Root Cause |
|---|-----|----------|------------|
| 1 | Content Gate ignores passion tier | CRITICAL | Character prompts contain `### INTIMATE BEHAVIOR ###` sections (~300 words) that override the one-line `Content: Romantic only.` gate |
| 2 | Passion Scoring always returns 0 | CRITICAL | `scorePassionBackground()` fire-and-forget async races with `generateSmartSuggestions()` — Ollama can only handle 1 request at a time → timeout/abort |
| 3 | Language detection broken | HIGH | `Reply in the same language the user writes in.` too weak in a large system prompt |
| 4 | Smart Suggestions not displayed | HIGH | Race condition with passion scoring (same Ollama conflict as Bug 2) |
| 5 | Repetitive responses | MEDIUM | No cross-turn anti-repetition — `repeat_penalty` only works within a single output |
| 6 | Model hallucinates context | MEDIUM | No grounding rules — model invents scenes/events not in conversation history |

## Research: Industry Patterns

Research into SillyTavern, Stab's EDH, Agnai, KoboldAI, and Janitor AI reveals:

- **Structural grounding > verbal prohibition.** No tool uses "do not hallucinate." They pack context with authoritative facts.
- **Positive framing > negative framing.** "Move the scene forward" beats "don't repeat yourself."
- **Sampler-level anti-repetition** (DRY sampler, frequency/presence penalty) is more effective than prompt-level instructions for local models.
- **Post-history position** has strongest influence on generation.
- **NPC knowledge firewall** (Stab's EDH): "NPCs act only on information they could realistically possess."

## Design

### Fix 1+6: Content Gate + Anti-Hallucination (Combined)

**A) Character-Prompt Filtering**

New function `filterCharacterContent(text, tierKey)` in `api.js`:

```js
function filterCharacterContent(text, tierKey) {
  if (['heated', 'passionate', 'primal'].includes(tierKey)) {
    return text; // Full content at Heated+
  }
  // Remove ### INTIMATE BEHAVIOR ### sections at Shy/Curious/Flirty
  return text.replace(/### INTIMATE BEHAVIOR ###[\s\S]*?(?=###|$)/gi, '');
}
```

Applied to `character.systemPrompt` and `character.instructions` in `generateSystemPrompt()`.

**B) Grounding Rules (replace current "Rules:" section)**

```
Rules:
- Write in first person ("I", "me").
- *asterisks* for actions, "quotes" for dialogue.
- Stay in character. No AI speech.
- Only describe what your character can perceive right now.
- React to what the user actually said or did.
- Move the scene forward. Never revisit completed beats.
- Never speak for the user or write their actions.
```

Removes old `Reply in the same language the user writes in.` (replaced by Language fix).

### Fix 2+4: Passion Scoring Flow (Sequential)

**Current (broken):**
```
sendMessage() → Response → scorePassionBackground() ─┐ (parallel)
                         → generateSmartSuggestions() ─┘ → Ollama conflict
```

**New:**
```
sendMessage() → Response (no scoring inside)
ChatInterface: → generateSmartSuggestions() (exclusive Ollama)
               → scorePassionBackground() (after suggestions complete)
```

Changes:
1. Remove `scorePassionBackground()` call from `sendMessage()` — export it instead
2. In `ChatInterface.jsx`: after `sendMessage()` returns, await `generateSmartSuggestions()`, then call `scorePassionBackground()`
3. Increase `PASSION_SCORING_TIMEOUT_MS` from 15s to 30s

### Fix 3: Language Detection

**First line of system prompt** (before character name):

```js
// In generateSystemPrompt(), new parameter: lastUserMessage
const detectedLang = detectLanguage(lastUserMessage);
if (detectedLang.confidence > 30 && detectedLang.language !== 'en') {
  prompt = `RESPOND ONLY IN ${langNames[detectedLang.language]}.\n\n` + prompt;
}
```

Only injected for non-English — character prompts are in English, so English is the default.

New parameter for `generateSystemPrompt()`: `lastUserMessage`.

### Fix 5: Anti-Repetition (Sampler-Level)

Add to Ollama request options in `sendMessage()`:

```js
options: {
  temperature: settings.temperature ?? 0.8,
  num_predict: numPredict,
  num_ctx: modelCtx,
  repeat_penalty: 1.2,
  frequency_penalty: 0.3,
  presence_penalty: 0.3,
  top_p: 0.9,
  top_k: 40
}
```

`frequency_penalty` and `presence_penalty` work across the full context (all messages), not just within the current output.

## Files Modified

| File | Changes |
|------|---------|
| `src/lib/api.js` | `filterCharacterContent()`, updated `generateSystemPrompt()`, updated Rules section, scoring removed from `sendMessage()`, `scorePassionBackground` exported, timeout 30s, frequency/presence penalty, language detection |
| `src/components/ChatInterface.jsx` | Sequential flow: suggestions → scoring after response |

## Files NOT Modified

- `src/config/characters.js` — Character prompts stay as-is. Filtering is dynamic at prompt generation time.
- `src/lib/PassionManager.js` — No changes needed. Scoring logic is fine, just the call timing was wrong.
