# Passion System — Fix & Feature Design

**Date:** 2026-03-02
**Scope:** All fixes from brutal-honest review + 5 new features
**IPC Migration:** Deferred to separate ticket

---

## Part 1: CRITICAL + MAJOR Fixes

### Fix 1 — Remove Projected Passion Level
**File:** `api.js:857-863`
Remove speculative pre-calculation. Pass the real stored passion level to `generateSystemPrompt()`.

### Fix 2 — New `adjustPassion()` Method
**File:** `PassionManager.js`
Add `adjustPassion(sessionId, level)` that updates level WITHOUT resetting streak/cooldown. Used only by LLM scoring (`api.js:999`). `setPassion()` stays unchanged for presets.

### Fix 3 — Remove Dead Import
**File:** `api.js:12`
Delete `enhanceSystemPromptWithPacing` import. Never called.

### Fix 4 — Defensive Settings Copy
**File:** `api.js:828-830`
Create shallow copy before unchained mode mutation: `const settings = { ...(settingsOverride || await loadSettings()) };`

### Fix 5 — Tier Transition in `setPassion()`
**File:** `PassionManager.js:293-300`
Add same transition detection logic as `updatePassion()`. Presets now trigger "EMOTIONAL SHIFT" enhancements.

### Fix 6 — Robust Suffix Stripping
**File:** `PassionManager.js:381`
Replace sequential `.replace()` chain with `endsWith()` check + `slice()`.

### Fix 7 — parseInt Radix
**File:** `api.js:994`
Add radix: `parseInt(..., 10)`.

### Fix 8 — LLM Scoring Timeout
**File:** `api.js:982`
Add `AbortController` with 10s timeout to scoring fetch.

---

## Part 2: MEDIUM + MINOR Fixes

### Fix 9 — Multi-Language Keywords
**File:** `PassionManager.js:218-235`
Add keyword lists for ES, FR, RU, JA, PT, IT, KO. ~5-8 keywords per category per language.

### Fix 10 — Sparkline Memoization
**File:** `ChatInterface.jsx:255`
Wrap `PassionSparkline` in `React.memo()`. Cache history with `useMemo`.

### Fix 11 — Streak Display Extraction
**File:** `ChatInterface.jsx:1288`
Replace IIFE with memoized variable computed once per passionLevel change.

### Fix 12 — Named Constants
Extract magic numbers across files:
- `COOLDOWN_THRESHOLD = 3`
- `HISTORY_LIMIT = 50`
- `CONTEXT_WINDOW = 12`
- `LLM_BLEND_RATIO = { keyword: 0.7, llm: 0.3 }`
- `LLM_SCORING_TIMEOUT_MS = 10000`

### Fix 13 — Duplicate Banned Phrases
Resolved by Fix 3 (dead code removal). `api.js` keeps the sole copy.

---

## Part 3: Features

### Feature 1 — Per-Character Passion Memory
**Storage:** `aria_passion_memory` in localStorage → `{ characterId: { lastLevel, lastSessionId, timestamp } }`
**Save trigger:** When leaving chat or starting new chat, store current passion for that character.
**Load trigger:** When starting new chat with known character, show modal: "Last level was X%. Resume or start fresh?"
**API:** `passionManager.saveCharacterMemory(characterId, level)` + `passionManager.getCharacterMemory(characterId)`
**UI:** Small glass-style modal with two buttons.

### Feature 2 — Passion Speed Slider
**Settings UI:** Slider in Settings, range 0.25x–3.0x, step 0.25, default 1.0.
**Storage:** `settings.passionSpeedMultiplier`
**Logic:** Final multiplier = `character.passionProfile * settings.passionSpeedMultiplier`. Both stack.
**Label:** Shows value as "1.0x" / "Slow (0.5x)" / "Fast (2.0x)".

### Feature 3 — Contextual Time-Based Decay
**Mechanic:** `updatePassion()` checks `${sessionId}_lastUpdate` timestamp. If >5 min gap: -2 points per 5-min interval, max -10 per gap.
**Evaluation:** Lazy — only calculated when next `updatePassion()` fires.
**Cleanup:** `resetPassion()` and `deleteCharacterPassion()` also delete `_lastUpdate`.

### Feature 4 — Multi-Language Keyword Scoring
Covered by Fix 9 (static keywords for all supported languages).

### Feature 5 — Passion Momentum Indicator
**Calculation:** Linear regression on last 5 history values → slope.
**UI:** Arrow next to tier label: ↑ green (slope > 1), → orange (stable), ↓ red (slope < -1).
**Location:** Next to sparkline in ChatInterface header.
