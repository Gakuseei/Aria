# Passion Scoring Engine Rewrite — Design

## Problem

The keyword-based scoring engine in PassionManager.js is fundamentally broken:

1. **Sentiment-blind**: "I don't want to touch you" scores identically to "I want to touch you"
2. **Massive false positives**: Common words (love, hold, hot, please, yes) trigger passion in normal conversation
3. **No de-escalation**: "stop", "wait", "no" have zero negative effect on passion
4. **AI Scoring is async and broken**: Fire-and-forget — UI shows wrong value until next message
5. **passionProfile is a placebo**: Reserved vs Bold = only 22% speed difference (0.9x vs 1.1x)

## Solution

Replace the keyword engine entirely with synchronous LLM-based scoring. The app already requires Ollama for all functionality — no fallback needed.

## Scoring Flow

```
Current (broken):
  sendMessage() → AI Response → calculatePassionPoints(keywords) → update
                              → fire-and-forget async LLM scoring (optional)

New:
  sendMessage() → AI Response → await scoreLLM(msg, resp)
                              → applyProfileMultiplier(score, profile)
                              → passionManager.applyScore(sessionId, score)
                              → return { passionLevel: newLevel }
```

## LLM Scoring Prompt

```
Rate romantic/sexual intensity change. Reply with ONLY one integer from -5 to 10.
-5=strong rejection, 0=neutral, 5=moderate romance, 10=explicit.

User: "{first 200 chars}"
AI: "{first 200 chars}"
```

- temperature: 0.1 (consistent output)
- num_predict: 5 (only 1-3 chars needed)
- num_ctx: 512 (minimal context for speed)
- Timeout: 3 seconds (on timeout → score 0, passion unchanged)

## Bidirectional Profile Multiplier

The passionProfile value (0.0-1.5) generates two multipliers:

| Profile | Warmup (positive scores) | Cooldown (negative scores) |
|---------|--------------------------|----------------------------|
| Reserved (0.5) | 0.5x — slow to warm up | 1.5x — quick to cool down |
| Balanced (0.7) | 0.7x | 1.3x |
| Neutral (1.0) | 1.0x | 1.0x |
| Bold (1.5) | 1.5x — fast to warm up | 0.5x — hard to discourage |

```js
warmupMultiplier = profileValue          // 0.5 → 1.5
cooldownMultiplier = 2.0 - profileValue  // 1.5 → 0.5
```

User speed slider (passionSpeedMultiplier 0.5x-2.0x) applies only to positive scores.

## PassionManager.js Changes

### Deleted (~165 lines)
- `matchesKeyword()`, `escapeRegex()`, `keywordRegexCache`, `CJK_RANGE`
- `calculatePassionPoints()` (entire keyword engine with 200+ keywords)
- `_lastBreakdown`, `getLastBreakdown()`

### Kept
- `PASSION_VOCABULARY` — still used for vocabulary injection in system prompts
- `getVocabulary()` — called in api.js for tier-specific word suggestions
- Decay logic, history, tier transitions, memory — unchanged

### New method: `applyScore(sessionId, adjustedScore)`
- Calculates decay from idle time (unchanged)
- Applies the pre-calculated score directly (no internal keyword calculation)
- Streak: positive scores increment streak, score ≤ 0 resets it
- Streak bonus at 3+ consecutive positive scores (unchanged multiplier)
- Cooldown logic removed (de-escalation comes directly from LLM negative scores)
- Tier transition detection (unchanged)
- Save to localStorage (unchanged)

## api.js Changes

### Deleted
- Fire-and-forget async scoring block (lines 1173-1209)
- `aiPassionScoringEnabled` setting check (always active now)
- `LLM_BLEND_RATIO` constant

### New function: `scorePassionLLM(userMessage, aiMessage, settings)`
- Synchronous `await fetch()` call to Ollama
- 3-second timeout via AbortController
- Parses integer from response, validates range -5 to +10
- On error: returns 0 (passion unchanged for this message)

### Modified sendMessage() flow
- After AI response: `await scorePassionLLM()`
- Calculate profile multipliers (warmup/cooldown from passionProfile)
- Apply user speed multiplier (only on positive scores)
- Call `passionManager.applyScore()`
- Set `currentPassionLevel` BEFORE return (UI always shows correct value)

## What Does NOT Change

- Gatekeeping prompts in api.js (6-tier × 3 personality branches)
- slowBurn.js (separate issue)
- Vocabulary injection in system prompts
- ChatInterface.jsx UI (reads passionLevel as before)
- Unchained Mode logic
- Decay, history, tier transitions, character memory
- Settings UI (passionSpeedMultiplier slider stays)
- PASSION_VOCABULARY and getVocabulary()

## Scope

Fixes 5 issues from the brutal-honest review:
- CRITICAL #1: Sentiment-blind scoring → LLM understands context
- CRITICAL #2: False positives → LLM doesn't trigger on "I love pizza"
- CRITICAL #3: No de-escalation → Bidirectional scoring (-5 to +10)
- MAJOR #4: Async UI mismatch → Synchronous scoring before return
- MAJOR #5: passionProfile placebo → Bidirectional multiplier with real impact
