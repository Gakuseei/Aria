# Passion Scoring Engine Rewrite — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the broken keyword-based passion scoring with synchronous LLM scoring, bidirectional (-5 to +10), with meaningful passionProfile impact.

**Architecture:** Remove ~165 lines of keyword matching from PassionManager.js, add a new `applyScore()` method that takes a pre-calculated score. In api.js, add a synchronous `scorePassionLLM()` function called after each AI response, apply profile multipliers, then feed the result to `applyScore()`. Delete fire-and-forget async scoring block and `aiPassionScoringEnabled` toggle.

**Tech Stack:** Electron + React 18, Ollama API (`/api/chat`), localStorage persistence

---

### Task 1: Delete keyword engine from PassionManager.js

**Files:**
- Modify: `src/lib/PassionManager.js:556-587` (delete keyword utilities)
- Modify: `src/lib/PassionManager.js:592` (delete `_lastBreakdown`)
- Modify: `src/lib/PassionManager.js:749-872` (delete `calculatePassionPoints`)
- Modify: `src/lib/PassionManager.js:896-902` (delete `getLastBreakdown`)

**Step 1: Delete keyword utility functions and constants**

Delete these lines from PassionManager.js (lines 556-587):
```js
// DELETE: keywordRegexCache, CJK_RANGE, escapeRegex(), matchesKeyword()
// Lines 556-587 — the entire block from "/** Regex cache" to the closing brace of matchesKeyword
```

**Step 2: Delete `_lastBreakdown` from constructor**

In the constructor (line 592), delete:
```js
this._lastBreakdown = null;
```

**Step 3: Delete `calculatePassionPoints()` method**

Delete the entire method at lines 749-872 — from the JSDoc comment `/** Calculate passion points...` through the closing brace and the `return Math.max(0, points);` line. This includes all keyword arrays (romanticKeywords, intimateKeywords, explicitKeywords, emotionalWords) and all scoring logic.

**Step 4: Delete `getLastBreakdown()` method**

Delete lines 896-902:
```js
  getLastBreakdown() {
    return this._lastBreakdown || null;
  }
```

**Step 5: Also delete `COOLDOWN_THRESHOLD` constant**

Delete line 15:
```js
const COOLDOWN_THRESHOLD = 3;
```

And remove `'_cooldown'` from `KNOWN_SUFFIXES` array (line 20). New value:
```js
const KNOWN_SUFFIXES = ['_history', '_streak', '_transition', '_transition_down', '_lastUpdate'];
```

**Step 6: Verify file still parses**

Run: `node -e "require('./src/lib/PassionManager.js')"` — should fail because `updatePassion` still calls `calculatePassionPoints`. That's expected; Task 2 fixes it.

**Step 7: Commit**
```
Delete keyword scoring engine from PassionManager
```

---

### Task 2: Replace `updatePassion()` with `applyScore()` in PassionManager.js

**Files:**
- Modify: `src/lib/PassionManager.js:670-741` (replace `updatePassion` with `applyScore`)

**Step 1: Replace the `updatePassion` method**

Replace the entire `updatePassion` method (lines 670-741) with:

```js
  /**
   * Apply an externally-calculated passion score to a session.
   * Handles decay, streak tracking, tier transitions, and persistence.
   * @param {string} sessionId - Session identifier
   * @param {number} score - Pre-calculated score (negative = de-escalation, positive = escalation)
   * @returns {number} New passion level (rounded integer 0-100)
   */
  applyScore(sessionId, score) {
    const currentLevel = this.passionData[sessionId] || 0;

    // Decay from idle time (unchanged logic)
    const lastUpdateKey = `${sessionId}_lastUpdate`;
    const now = Date.now();
    const lastUpdate = this.passionData[lastUpdateKey] || now;
    const elapsed = now - lastUpdate;
    let decayPoints = 0;
    if (elapsed > DECAY_INTERVAL_MS) {
      const intervals = Math.floor(elapsed / DECAY_INTERVAL_MS);
      decayPoints = Math.min(intervals * DECAY_POINTS_PER_INTERVAL, DECAY_MAX_POINTS);
    }
    this.passionData[lastUpdateKey] = now;
    let decayedLevel = Math.max(0, currentLevel - decayPoints);
    if (decayPoints > 0) {
      const currentTierKey = getTierKey(currentLevel);
      const decayedTierKey = getTierKey(decayedLevel);
      if (currentTierKey !== decayedTierKey) {
        decayedLevel = PASSION_TIERS[currentTierKey].min;
      }
    }

    // Streak tracking (positive scores only)
    const streakKey = `${sessionId}_streak`;
    let finalScore = score;

    if (score > 0) {
      this.passionData[streakKey] = (this.passionData[streakKey] || 0) + 1;
      const streak = this.passionData[streakKey];
      if (streak >= 3) {
        finalScore *= 1.0 + Math.min((streak - 2) * 0.1, 0.5);
      }
    } else {
      this.passionData[streakKey] = 0;
    }

    const newLevel = Math.round(Math.max(0, Math.min(100, decayedLevel + finalScore)));

    // Tier transition detection (unchanged)
    const oldTier = getTierKey(decayedLevel);
    const newTier = getTierKey(newLevel);
    const tierOrder = ['shy', 'curious', 'flirty', 'heated', 'passionate', 'primal'];
    if (oldTier !== newTier && tierOrder.indexOf(newTier) > tierOrder.indexOf(oldTier)) {
      this.passionData[`${sessionId}_transition`] = newTier;
    }
    if (oldTier !== newTier && tierOrder.indexOf(newTier) < tierOrder.indexOf(oldTier)) {
      this.passionData[`${sessionId}_transition_down`] = newTier;
    }

    this.passionData[sessionId] = newLevel;
    this.trackHistory(sessionId, newLevel);
    this.savePassionData();

    return newLevel;
  }
```

**Step 2: Clean up cooldown references in other methods**

In `resetPassion()` (around line 1001-1011 after deletions), remove:
```js
delete this.passionData[`${sessionId}_cooldown`];
```

In `setPassion()` (around line 910-928 after deletions), remove:
```js
delete this.passionData[`${sessionId}_cooldown`];
```

In `deleteCharacterPassion()` (around line 1032-1041 after deletions), remove:
```js
delete this.passionData[`${sessionId}_cooldown`];
```

In `getAllPassionLevels()` (around line 1017-1026 after deletions), remove `key.endsWith('_cooldown') ||` from the filter condition.

**Step 3: Verify PassionManager parses**

Run: `node -e "require('./src/lib/PassionManager.js')"` — should succeed now (no more reference to deleted `calculatePassionPoints`).

**Step 4: Commit**
```
Replace updatePassion with applyScore in PassionManager
```

---

### Task 3: Add `scorePassionLLM()` and rewrite scoring flow in api.js

**Files:**
- Modify: `src/lib/api.js:170` (delete `aiPassionScoringEnabled`)
- Modify: `src/lib/api.js:181-182` (delete `LLM_BLEND_RATIO`, `LLM_SCORING_TIMEOUT_MS`)
- Modify: `src/lib/api.js` (add `scorePassionLLM` function after constants)
- Modify: `src/lib/api.js:1153-1209` (rewrite passion update block)

**Step 1: Delete obsolete constants and settings**

In `DEFAULT_SETTINGS` (line 170), delete:
```js
  aiPassionScoringEnabled: false,
```

Delete lines 181-182:
```js
const LLM_BLEND_RATIO = { keyword: 0.7, llm: 0.3 };
const LLM_SCORING_TIMEOUT_MS = 10000;
```

Add new constant in the same area:
```js
const PASSION_SCORING_TIMEOUT_MS = 3000;
```

**Step 2: Add `scorePassionLLM()` function**

Add this function after the constants section (around line 183):

```js
/**
 * Score romantic/sexual intensity of a message exchange using the LLM.
 * Returns a bidirectional score: negative = de-escalation, positive = escalation.
 * @param {string} userMessage - User message text
 * @param {string} aiMessage - AI response text
 * @param {Object} settings - App settings (ollamaUrl, ollamaModel)
 * @returns {Promise<number>} Score from -5 to 10, or 0 on failure
 */
async function scorePassionLLM(userMessage, aiMessage, settings) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), PASSION_SCORING_TIMEOUT_MS);
  try {
    const response = await fetch(`${settings.ollamaUrl || 'http://127.0.0.1:11434'}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: abort.signal,
      body: JSON.stringify({
        model: settings.ollamaModel || 'hermes3',
        messages: [{
          role: 'user',
          content: `Rate romantic/sexual intensity change. Reply with ONLY one integer from -5 to 10.\n-5=strong rejection, 0=neutral, 5=moderate romance, 10=explicit.\n\nUser: "${userMessage.substring(0, 200)}"\nAI: "${aiMessage.substring(0, 200)}"`
        }],
        stream: false,
        options: { temperature: 0.1, num_predict: 5, num_ctx: 512 }
      })
    });
    if (!response.ok) return 0;
    const data = await response.json();
    const match = data.message?.content?.trim().match(/^(-?\d+)$/);
    if (!match) return 0;
    const score = parseInt(match[1], 10);
    if (score < -5 || score > 10) return 0;
    return score;
  } catch {
    return 0;
  } finally {
    clearTimeout(timer);
  }
}
```

**Step 3: Rewrite the passion update block in sendMessage()**

Replace the entire block from line 1153 (`// PASSION UPDATE`) through line 1209 (end of fire-and-forget async block) with:

```js
    // PASSION SCORING (synchronous LLM-based)
    if (settings.passionSystemEnabled && sessionId && !skipPassionUpdate) {
      const rawScore = await scorePassionLLM(userMessage, aiMessage, settings);

      const profileValue = character?.passionProfile || 0.7;
      const userSpeed = settings.passionSpeedMultiplier || 1.0;
      let adjustedScore;

      if (rawScore > 0) {
        const warmupMultiplier = profileValue;
        adjustedScore = rawScore * warmupMultiplier * userSpeed;
      } else if (rawScore < 0) {
        const cooldownMultiplier = 2.0 - profileValue;
        adjustedScore = rawScore * cooldownMultiplier;
      } else {
        adjustedScore = 0;
      }

      const newPassionLevel = passionManager.applyScore(sessionId, adjustedScore);
      console.log(`[API] Passion: ${currentPassionLevel} → ${newPassionLevel} (raw=${rawScore}, adjusted=${adjustedScore.toFixed(1)})`);
      currentPassionLevel = newPassionLevel;
    }
```

**Step 4: Remove old breakdown logging**

The old lines that referenced `getLastBreakdown()` and `PassionDebug` are deleted as part of Step 3 (they were inside the replaced block).

**Step 5: Verify api.js parses**

Run: `node -e "require('./src/lib/api.js')"` — may fail in Node due to browser APIs, but at minimum check syntax: `node --check src/lib/api.js`

**Step 6: Commit**
```
Add synchronous LLM passion scoring with profile multipliers
```

---

### Task 4: Clean up Settings UI and translations for removed toggle

**Files:**
- Modify: `src/components/Settings.jsx` (remove aiPassionScoring toggle if present)
- Modify: `src/lib/translations.js` (remove `aiPassionScoring` keys from all 13 languages)
- Modify: `src/App.jsx` (remove `aiPassionScoringEnabled` from settings state if present)

**Step 1: Check Settings.jsx for aiPassionScoring toggle**

Search for `aiPassionScoring` in Settings.jsx. If a toggle exists, delete it. If it's only in DEFAULT_SETTINGS (api.js, already deleted in Task 3), skip this file.

**Step 2: Remove translation keys**

In `src/lib/translations.js`, delete all 13 `aiPassionScoring` entries (one per language block):
- Line 98 (en), 741 (de), 1382 (es), 1981 (cn), 2579 (fr), 3177 (it), 3769 (pt), 4367 (ru), 4965 (ja), 5563 (ko), 6156 (ar), 6755 (hi), 7354 (tr)

**Step 3: Check App.jsx for aiPassionScoringEnabled**

Search App.jsx for `aiPassionScoringEnabled`. If it's in the settings state initialization, remove it. If it's only in DEFAULT_SETTINGS (already deleted), skip.

**Step 4: Commit**
```
Remove aiPassionScoring toggle and translation keys
```

---

### Task 5: Manual testing and verification

**Files:** None (testing only)

**Step 1: Start dev mode**

Run: `npm run dev`

**Step 2: Test normal conversation**

Start a chat with any built-in character. Send innocent messages like:
- "Tell me about your day"
- "I love pizza, what's your favorite food?"
- "Hold on, let me think about that"

Verify: Passion stays at 0 or very low. No false positives.

**Step 3: Test romantic escalation**

Send progressively romantic messages:
- Light flirting → passion should rise slowly
- Direct romantic/sexual content → passion should rise faster

Verify: Passion rises with appropriate speed. Tier transitions trigger toast notifications.

**Step 4: Test de-escalation**

After building passion to 30+, send de-escalation messages:
- "Let's slow down"
- "I want to talk about something else"
- "Stop, that's enough"

Verify: Passion decreases. This is the CRITICAL fix — previously impossible.

**Step 5: Test passionProfile differences**

Test with Alice (reserved, 0.5) vs Sophia (bold, 1.5):
- Same romantic message should raise Alice's passion much less than Sophia's
- Same rejection should drop Alice's passion much more than Sophia's

**Step 6: Test Custom Character**

Create a custom character with passionProfile slider at different positions. Verify scoring behaves differently.

**Step 7: Test Unchained Mode**

Toggle Unchained Mode. Verify passion system still works (scoring still runs, just no gatekeeping prompts).

**Step 8: Test edge cases**

- Send empty message → no crash
- Very long message (1000+ chars) → truncated to 200 chars in scoring prompt
- Ollama slow/unresponsive → 3s timeout, passion unchanged, no crash

**Step 9: Commit if any fixes were needed**
```
Fix issues found during manual testing
```
