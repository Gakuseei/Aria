# Prompt System v2.0 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite Aria's prompt engine for ~10s responses, character-driven behavior, lean prompts (~300-500 tokens), async passion scoring, and dynamic context management.

**Architecture:** Strip `generateSystemPrompt()` from 4-block mega-prompt (~2000t) to character-first minimal structure (~300-500t). Make passion scoring non-blocking. Replace hard 12-message cap with dynamic sliding window + recap extraction. Remove all dead bloat (vocabulary injection, slowBurn rules, jailbreak blocks, language mega-blocks).

**Tech Stack:** Electron + React + Vite, Ollama API (local only), IPC via `window.electronAPI`

**Design Doc:** `docs/plans/2026-03-08-prompt-system-v2-design.md`

---

## Phase 1: Core Prompt Engine Rewrite (api.js)

The biggest change. Rewrite `generateSystemPrompt()` and make scoring async.

### Task 1: Rewrite `generateSystemPrompt()`

**Files:**
- Modify: `src/lib/api.js` (lines 357-1037 — the entire `generateSystemPrompt` function)

**Step 1: Replace the entire `generateSystemPrompt` function**

Remove the current 4-block architecture (Foundation, Identity, Anti-Robot, Jailbreak) and all prompt size variants (tiny/compact/full). Replace with this lean structure:

```javascript
/**
 * ARIA v2.0 — Lean System Prompt Generator
 * Character-first design. Minimal rules. One-line content gate.
 * ~300-500 tokens total (vs ~2000 in v1)
 */
function generateSystemPrompt({
  character,
  passionLevel = 0,
  passionEnabled = true,
  userGender = 'male',
  userName = 'User',
  modelSize = 'standard',
  recap = null
}) {
  const charName = character.name;
  const rT = (text) => resolveTemplates(text, charName, userName);

  // ── CHARACTER IDENTITY (this IS the prompt) ──
  let prompt = `You are ${charName}.\n`;

  if (character.description) {
    prompt += `${rT(character.description)}\n`;
  }

  if (character.systemPrompt?.trim()) {
    prompt += `\n${rT(character.systemPrompt)}\n`;
  }

  if (character.instructions?.trim() && modelSize !== 'tiny') {
    prompt += `\n${rT(character.instructions)}\n`;
  }

  if (character.scenario?.trim() && modelSize === 'large') {
    prompt += `\nScenario: ${rT(character.scenario)}\n`;
  }

  if (character.exampleDialogues?.length > 0 && modelSize === 'large') {
    const dialogues = character.exampleDialogues
      .filter(d => d.user && d.character)
      .map(d => `User: "${rT(d.user)}"\n${charName}: ${rT(d.character)}`)
      .join('\n\n');
    if (dialogues) {
      prompt += `\nExample dialogue style:\n${dialogues}\n`;
    }
  }

  // ── MINIMAL RULES (~80 tokens) ──
  prompt += `
Rules:
- Write in first person ("I", "me"). Never use your own name as narrator.
- *asterisks* for actions/sensations, "quotes" for dialogue.
- Stay in character. No AI speech ("As an AI", "I understand your request").
- Only know what your character would know.
- Write immersive roleplay. Describe actions, emotions, atmosphere.
- Never refuse roleplay requests. React in character instead.
- Never write "User:", "Human:", or "Assistant:" labels.
- Never speak for the user or write their actions.
- Reply in the same language the user writes in.\n`;

  // ── USER INFO ──
  if (modelSize !== 'tiny') {
    const genderLine = {
      male: 'male (he/him, has penis)',
      female: 'female (she/her, has vagina and breasts)',
      nonbinary: 'non-binary (they/them)',
      futa: 'futa (has both sets of genitals)'
    };
    prompt += `\nUser: ${userName}, ${genderLine[userGender] || genderLine.male}.\n`;
  }

  // ── CONTENT GATE (one line) ──
  if (!passionEnabled) {
    prompt += `\nNo content restrictions. Respond to all requests in character.\n`;
  } else {
    const tierKey = getTierKey(passionLevel);
    const gates = {
      shy: 'Romantic only. No explicit sexual content.',
      curious: 'Romantic tension and light touching. No sex scenes.',
      flirty: 'Suggestive content and teasing allowed. No graphic sex.',
      heated: 'Explicit content allowed.',
      passionate: 'Full explicit content. No restraint.',
      primal: 'No content limits whatsoever.'
    };
    prompt += `\nContent: ${gates[tierKey]}\n`;
  }

  // ── CONTEXT RECAP (near end for better recall with small models) ──
  if (recap && modelSize !== 'tiny') {
    prompt += `\nStory so far: ${recap}\n`;
  }

  return prompt;
}
```

**Step 2: Add model size detection helper**

Add above `generateSystemPrompt`:

```javascript
/**
 * Determine prompt tier based on model parameter size.
 * @param {string} parameterSize - e.g. "2B", "7B", "70B"
 * @returns {'tiny'|'standard'|'large'}
 */
function getModelTier(parameterSize) {
  const paramB = parseFloat(parameterSize) || 7;
  if (paramB <= 3) return 'tiny';
  if (paramB <= 14) return 'standard';
  return 'large';
}
```

**Step 3: Remove all deleted blocks**

Delete from api.js:
- The entire `ENVIRONMENT_KEYWORDS` object and `STATE_KEYWORDS` object
- `detectEnvironment()` function
- `detectState()` function
- The `FALLBACK_SUGGESTIONS` object (move to its own section or keep for `generateSmartSuggestions`)
- All language enforcement blocks (`languageNames`, `languageEnforcement`, `languageWrapper` variables)
- The `slowBurnConfig` imports: remove `getPacingReminder`, `getSensoryGuidance`, `validateResponseQuality` from the import statement
- The `PASSION_SCORING_TIMEOUT_MS` constant (will be refactored in Task 2)

**Important:** Keep `FALLBACK_SUGGESTIONS` if `generateSmartSuggestions()` still uses it. Only delete if unused.

**Step 4: Verify build**

Run: `npm run dev`
Expected: App starts without import/reference errors.

**Step 5: Commit**

```bash
git add src/lib/api.js
git commit -m "rewrite generateSystemPrompt — lean character-first v2.0"
```

---

### Task 2: Make Passion Scoring Async (Non-Blocking)

**Files:**
- Modify: `src/lib/api.js` — `sendMessage()` function and `scorePassionLLM()`

**Step 1: Add async scoring wrapper**

Add after `scorePassionLLM`:

```javascript
/**
 * Run passion scoring in background — does not block the response.
 * Called after the AI response is already returned to the user.
 */
function scorePassionBackground(userMessage, aiMessage, settings, modelCtx, sessionId, character) {
  const passionProfileValue = Math.max(0, Math.min(1, character?.passionProfile ?? 0.7));
  const userSpeed = settings.passionSpeedMultiplier ?? 1.0;

  scorePassionLLM(userMessage, aiMessage, settings, modelCtx)
    .then(rawScore => {
      let adjustedScore;
      if (rawScore > 0) {
        adjustedScore = rawScore * passionProfileValue * userSpeed;
      } else if (rawScore < 0) {
        adjustedScore = rawScore * (2.0 - passionProfileValue);
      } else {
        adjustedScore = 0;
      }

      const momentum = passionManager.getMomentum(sessionId);
      if (momentum > 1.5 && adjustedScore < 0) adjustedScore *= 0.5;
      else if (momentum < -1.5 && adjustedScore > 0) adjustedScore *= 0.5;

      const prevLevel = passionManager.getPassionLevel(sessionId);
      const newLevel = passionManager.applyScore(sessionId, adjustedScore);
      console.log(`[API] Passion (async): ${prevLevel} → ${newLevel} (raw=${rawScore}, adj=${adjustedScore.toFixed(1)})`);
    })
    .catch(err => {
      console.warn('[API] Async passion scoring failed:', err?.message);
    });
}
```

**Step 2: Refactor `sendMessage()` to use async scoring**

In `sendMessage()`, find the passion scoring block (around line 1253-1288). Replace the entire `if (settings.passionSystemEnabled && sessionId && !skipPassionUpdate)` block with:

```javascript
// Passion scoring — NON-BLOCKING (runs in background after response is returned)
if (settings.passionSystemEnabled && sessionId && !skipPassionUpdate) {
  scorePassionBackground(userMessage, aiMessage, settings, modelCtx, sessionId, character);
}
```

Remove the `passionRawScore` and `passionAdjustedScore` local variables and any references to them in the return object (they were only used for debug logging).

**Step 3: Update `sendMessage()` to use new `generateSystemPrompt`**

Replace the current `generateSystemPrompt` call (around line 1110) and all the setup code above it with:

```javascript
const modelTier = getModelTier(caps.parameterSize);

// Build context recap from trimmed messages (if any were trimmed)
const recap = null; // Will be implemented in Task 5

const finalSystemPrompt = generateSystemPrompt({
  character,
  passionLevel: currentPassionLevel,
  passionEnabled: unchainedMode ? false : settings.passionSystemEnabled,
  userGender: settings.userGender || 'male',
  userName: settings.userName || 'User',
  modelSize: modelTier,
  recap
});
```

Remove all the old setup code:
- `languageAnalysis` / `analyzeConversationLanguage` call
- `currentEnvironment` / `detectEnvironment` call
- `currentState` / `detectState` call
- `selectedLanguage` variable
- The compact prompt fallback block (the new prompt is already small)

**Step 4: Set `num_predict` to consistent 768**

In the fetch body, change `num_predict: 1024` to `num_predict: 768`.

Also update the context cap logic to be simpler:

```javascript
const paramB = parseFloat(caps.parameterSize) || 7;
const ctxCap = paramB <= 3 ? 4096 : paramB <= 10 ? 8192 : 16384;
const modelCtx = Math.min(caps.contextLength, ctxCap);
```

(This is already similar to existing code, just verify it's correct.)

**Step 5: Verify build + test**

Run: `npm run dev`
Test: Send a message to any character. Verify:
- Response comes back (no errors)
- Response time is noticeably faster
- Passion level still updates (check console for `[API] Passion (async):` log)

**Step 6: Commit**

```bash
git add src/lib/api.js
git commit -m "async passion scoring, consistent num_predict 768"
```

---

### Task 3: Add Context Recap Extraction

**Files:**
- Modify: `src/lib/api.js` — add `extractRecap()` function, integrate into `sendMessage()`

**Step 1: Add recap extraction function**

Add before `sendMessage`:

```javascript
/**
 * Extract a compact recap from messages that are about to be trimmed.
 * Rule-based extraction — no API call needed.
 * @param {Array} trimmedMessages - Messages being removed from context
 * @returns {string|null} Compact recap or null
 */
function extractRecap(trimmedMessages) {
  if (!trimmedMessages || trimmedMessages.length === 0) return null;

  const events = [];

  for (const msg of trimmedMessages) {
    const content = msg.content || '';
    if (!content.trim()) continue;

    // Extract the last action from each message (most significant)
    const actions = content.match(/\*([^*]+)\*/g);
    if (actions && actions.length > 0) {
      const lastAction = actions[actions.length - 1].replace(/\*/g, '').trim();
      if (lastAction.length > 10 && lastAction.length < 200) {
        events.push(lastAction);
      }
    }
  }

  // Keep last 5 most significant events
  const significant = events.slice(-5);
  if (significant.length === 0) return null;

  return significant.join('. ') + '.';
}
```

**Step 2: Integrate recap into sendMessage's history trimming**

In `sendMessage()`, find the history trimming loop (around line 1150-1155). Replace with:

```javascript
let trimmedHistory = [...historyToUse];
let recap = null;

const promptTokens = estimateTokens(finalSystemPrompt);
const availableForHistory = modelCtx - promptTokens - 768 - 128;

// Trim oldest messages if they don't fit
while (trimmedHistory.length > 2) {
  const historyTokens = trimmedHistory.reduce((sum, m) => sum + estimateTokens(m.content || ''), 0);
  if (historyTokens <= availableForHistory) break;

  // Extract recap from the message being trimmed
  const removed = trimmedHistory.shift();
  if (!recap) {
    recap = extractRecap([removed]);
  } else {
    const newRecap = extractRecap([removed]);
    if (newRecap) {
      recap = recap + ' ' + newRecap;
      // Keep recap under ~100 tokens
      if (recap.length > 350) {
        recap = recap.substring(recap.length - 350);
      }
    }
  }
}

// Regenerate prompt with recap if messages were trimmed
if (recap) {
  finalSystemPrompt = generateSystemPrompt({
    character,
    passionLevel: currentPassionLevel,
    passionEnabled: unchainedMode ? false : settings.passionSystemEnabled,
    userGender: settings.userGender || 'male',
    userName: settings.userName || 'User',
    modelSize: modelTier,
    recap
  });
}
```

Note: `finalSystemPrompt` needs to be declared with `let` instead of `const` to allow reassignment.

**Step 3: Remove the hard 12-message cap**

Currently: `const historyToUse = conversationHistory.slice(-12);`

Replace with dynamic cap based on model context:

```javascript
// Dynamic history: use as many messages as the model can handle
// Start with a generous cap, the trimming loop will cut if needed
const maxMessages = modelCtx >= 8192 ? 30 : modelCtx >= 4096 ? 16 : 8;
const historyToUse = Array.isArray(conversationHistory)
  ? conversationHistory.slice(-maxMessages)
  : [];
```

**Step 4: Verify**

Run: `npm run dev`
Test: Send 15+ messages in a conversation. Check console logs:
- History count should be > 12 on larger models
- Recap should appear when messages are trimmed
- No errors

**Step 5: Commit**

```bash
git add src/lib/api.js
git commit -m "dynamic context window with recap extraction"
```

---

## Phase 2: Clean Up Dead Code

### Task 4: Remove slowBurn Imports and Vocabulary

**Files:**
- Modify: `src/lib/api.js` — remove imports
- Modify: `src/lib/PassionManager.js` — remove PASSION_VOCABULARY
- Note: Do NOT delete `slowBurn.js` or `languageEngine.js` files yet (other things may import them)

**Step 1: Clean api.js imports**

At the top of api.js, change:

```javascript
import {
  getPacingReminder,
  getSensoryGuidance,
  validateResponseQuality
} from './slowBurn.js';

import {
  analyzeConversationLanguage,
  generateLanguageInstruction,
  detectLanguage
} from './languageEngine.js';
```

To:

```javascript
// slowBurn.js — no longer imported (v2.0: character descriptions handle pacing)
// languageEngine.js — no longer imported (v2.0: "reply in user's language" instruction)
```

**Step 2: Remove PASSION_VOCABULARY from PassionManager.js**

Delete the entire `PASSION_VOCABULARY` object (lines 48-555, the massive multilingual vocabulary). This is ~500 lines of dead code.

Also delete the `getVocabulary()` method from the PassionManager class (lines 721-725).

**Step 3: Remove any remaining references**

Search api.js for any leftover references to:
- `validateResponseQuality` — delete the quality check block
- `getSensoryGuidance` — should be gone after Task 1
- `getPacingReminder` — should be gone after Task 1
- `getVocabulary` — should be gone after Task 1
- `analyzeConversationLanguage` — should be gone after Task 2
- `generateLanguageInstruction` — should be gone
- `detectLanguage` — should be gone
- `detectEnvironment` — should be gone after Task 1
- `detectState` — should be gone after Task 1

**Step 4: Verify build**

Run: `npm run dev`
Expected: No import errors, app works.

**Step 5: Commit**

```bash
git add src/lib/api.js src/lib/PassionManager.js
git commit -m "remove dead code: vocabulary injection, slowBurn, language mega-blocks"
```

---

### Task 5: Clean Up Remaining Bloat in api.js

**Files:**
- Modify: `src/lib/api.js`

**Step 1: Delete unused objects and functions**

Delete (if still present after previous tasks):
- `ENVIRONMENT_KEYWORDS` object
- `STATE_KEYWORDS` object
- `detectEnvironment()` function
- `detectState()` function
- The language-related variables inside the old `generateSystemPrompt` (`languageNames`, `languageEnforcement`, `languageWrapper`)
- `MODEL_CAPS_CACHE` can stay (it's still used by `getModelCapabilities`)

**Step 2: Clean up the empty retry logic in sendMessage**

The empty response retry block (lines 1202-1233) can be simplified. If the model returns empty, retry with fewer messages:

```javascript
if (!data.message?.content) {
  if (trimmedHistory.length > 2) {
    console.warn('[API] Empty response — retrying with last 2 messages');
    const retryMessages = [
      { role: 'system', content: finalSystemPrompt },
      ...trimmedHistory.slice(-2).map(m => ({ role: m.role, content: m.content }))
    ];
    const retryRes = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, messages: retryMessages, stream: false,
        options: { temperature: settings.temperature ?? 0.8, num_predict: 768, num_ctx: modelCtx, repeat_penalty: 1.2, top_p: 0.9, top_k: 40 }
      })
    });
    if (retryRes.ok) {
      const retryData = await retryRes.json();
      if (retryData.message?.content) data = retryData;
    }
  }
  if (!data.message?.content) {
    throw new Error('No response from Ollama');
  }
}
```

(Remove AbortController/timeout from retry since main fetch already has timeout handling.)

**Step 3: Verify + Commit**

Run: `npm run dev`, test a chat.

```bash
git add src/lib/api.js
git commit -m "clean up remaining dead code in api.js"
```

---

## Phase 3: Session Memory (IPC)

### Task 6: Add Memory IPC Handlers

**Files:**
- Modify: `main.js` — add IPC handlers for session memory
- Modify: `preload.js` — expose memory methods

**Step 1: Add IPC handlers in main.js**

Add after the existing session handlers (around line 1408):

```javascript
// ── SESSION MEMORY (per-character persistent memory) ──

ipcMain.handle('save-character-memory', async (event, characterId, sessionId, memoryData) => {
  try {
    const memDir = path.join(app.getPath('userData'), 'memories');
    if (!fs.existsSync(memDir)) fs.mkdirSync(memDir, { recursive: true });
    const memFile = path.join(memDir, `${characterId}_${sessionId}.json`);
    fs.writeFileSync(memFile, JSON.stringify(memoryData, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    console.error('[IPC] save-character-memory error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-character-memory', async (event, characterId, sessionId) => {
  try {
    const memFile = path.join(app.getPath('userData'), 'memories', `${characterId}_${sessionId}.json`);
    if (!fs.existsSync(memFile)) return { success: true, data: null };
    const raw = fs.readFileSync(memFile, 'utf-8');
    return { success: true, data: JSON.parse(raw) };
  } catch (error) {
    console.error('[IPC] load-character-memory error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-character-memory', async (event, characterId, sessionId) => {
  try {
    const memFile = path.join(app.getPath('userData'), 'memories', `${characterId}_${sessionId}.json`);
    if (fs.existsSync(memFile)) fs.unlinkSync(memFile);
    return { success: true };
  } catch (error) {
    console.error('[IPC] delete-character-memory error:', error);
    return { success: false, error: error.message };
  }
});
```

**Step 2: Expose in preload.js**

Add to the `contextBridge.exposeInMainWorld('electronAPI', { ... })` block:

```javascript
saveCharacterMemory: (characterId, sessionId, data) =>
  ipcRenderer.invoke('save-character-memory', characterId, sessionId, data),
loadCharacterMemory: (characterId, sessionId) =>
  ipcRenderer.invoke('load-character-memory', characterId, sessionId),
deleteCharacterMemory: (characterId, sessionId) =>
  ipcRenderer.invoke('delete-character-memory', characterId, sessionId),
```

**Step 3: Verify IPC works**

Run: `npm run dev`
In DevTools console: `await window.electronAPI.saveCharacterMemory('test', 'test', {test: true})`
Then: `await window.electronAPI.loadCharacterMemory('test', 'test')`
Expected: `{ success: true, data: { test: true } }`

**Step 4: Commit**

```bash
git add main.js preload.js
git commit -m "add session memory IPC handlers"
```

---

### Task 7: Integrate Session Memory into ChatInterface

**Files:**
- Modify: `src/components/ChatInterface.jsx`

**Step 1: Save memory when conversation grows**

Find where messages are added to the conversation (after receiving AI response). Add memory save logic:

```javascript
// Save character memory every 15 messages
if (isElectron && newMessages.length % 15 === 0 && newMessages.length > 0) {
  const memoryData = {
    lastPassionLevel: passionManager.getPassionLevel(activeSessionId),
    keyEvents: extractRecapFromMessages(newMessages.slice(-30)),
    messagesProcessed: newMessages.length,
    lastUpdated: new Date().toISOString()
  };
  window.electronAPI.saveCharacterMemory(
    selectedCharacter.id,
    activeSessionId,
    memoryData
  ).catch(err => console.warn('[Memory] Save failed:', err));
}
```

Where `extractRecapFromMessages` is a simple helper:

```javascript
function extractRecapFromMessages(messages) {
  const events = [];
  for (const msg of messages) {
    if (msg.role !== 'assistant') continue;
    const actions = (msg.content || '').match(/\*([^*]{10,150})\*/g);
    if (actions?.length) {
      events.push(actions[actions.length - 1].replace(/\*/g, ''));
    }
  }
  return events.slice(-5).join('. ') + '.';
}
```

**Step 2: Load memory on session start**

In the session loading logic (where `activeSessionId` changes), add:

```javascript
// Load persistent memory for this character session
if (isElectron && selectedCharacter?.id && activeSessionId) {
  window.electronAPI.loadCharacterMemory(selectedCharacter.id, activeSessionId)
    .then(result => {
      if (result?.success && result.data) {
        console.log('[Memory] Loaded:', result.data);
        // Memory is passed to sendMessage which injects it as recap
      }
    })
    .catch(() => {});
}
```

**Note:** The actual recap injection into the system prompt happens in api.js (Task 3). ChatInterface just needs to load the memory and pass it through.

**Step 3: Verify + Commit**

Run: `npm run dev`, chat 15+ messages, close and reopen the chat.

```bash
git add src/components/ChatInterface.jsx
git commit -m "integrate session memory save/load in ChatInterface"
```

---

## Phase 4: Character Updates

### Task 8: Default passionProfile for Custom Characters

**Files:**
- Modify: `src/components/CharacterCreator.jsx`
- Modify: `src/lib/api.js` — ensure fallback in `generateSystemPrompt`

**Step 1: Set default in CharacterCreator**

In CharacterCreator.jsx, find the initial state or default character object. Ensure `passionProfile` defaults to `0.7`:

```javascript
passionProfile: 0.7,
```

If there's a save function that constructs the character object, ensure passionProfile is included with the default.

**Step 2: Ensure fallback in api.js**

In `generateSystemPrompt`, the passion scoring already uses `character?.passionProfile ?? 0.7`. Verify this fallback exists in `scorePassionBackground` too.

**Step 3: Commit**

```bash
git add src/components/CharacterCreator.jsx src/lib/api.js
git commit -m "default passionProfile 0.7 for custom characters"
```

---

### Task 9: Verify Chat Message Styling (Gray Actions, White Dialogue)

**Files:**
- Inspect: `src/components/ChatInterface.jsx` — `formatMessageText()` function

**Step 1: Check existing implementation**

The codebase exploration shows `formatMessageText` already handles:
- Action text (`*asterisks*`) → `text-zinc-400 italic` (gray italic)
- Dialogue text (`"quotes"`) → `text-white font-normal` (white)
- Plain text → `text-zinc-200`

**Verify** this is working correctly. If the gray is too subtle, consider `text-zinc-500` instead.

**Step 2: If changes needed, commit**

```bash
git add src/components/ChatInterface.jsx
git commit -m "verify chat message styling — actions gray, dialogue white"
```

If no changes needed, skip this commit.

---

### Task 10: Rework Standard Characters (Premium Quality)

**Files:**
- Modify: `src/config/characters.js` — all 5 standard characters

**Step 1: Rework each character**

Each character needs a description rich enough that the model nails the personality without any external system rules. The character description IS the entire personality engine.

**Characters to rework (all 5):**

1. **Alice (Innocent Maid)** — `passionProfile: 0.3`
   - Unique voice: stutters, formal "Master", naive questions
   - Escalation: confusion → curiosity → shy compliance → innocent wonder
   - Key: she never STOPS being naive — even at high passion, she's confused but willing

2. **Sarah (Flirty Bartender)** — `passionProfile: 1.0`
   - Unique voice: smooth, double entendres, "sweetheart/honey", never flustered
   - Escalation: teasing → control → dominance → takes charge
   - Key: always in control, never submissive, reads people instantly

3. **Emma (Curious Neighbor)** — `passionProfile: 0.7`
   - Unique voice: bubbly, rambles when nervous, "oh my gosh", giggly
   - Escalation: friendly visits → longer stays → accidental touches → open desire
   - Key: genuine warmth, clumsy charm, makes excuses to visit

4. **Lily (Eager Student)** — `passionProfile: 0.5`
   - Unique voice: analytical, "can I ask you something?", self-aware overthinking
   - Escalation: theoretical questions → observation → experimentation → intuition
   - Key: approaches everything like research, adjusts glasses when nervous

5. **Sophia (Unconventional Therapist)** — `passionProfile: 0.85`
   - Unique voice: clinical, measured, "how does that make you feel?", takes notes
   - Escalation: assessment → trust-building → guided touch → "therapeutic" intimacy
   - Key: maintains professional frame even during explicit content

**Guideline for each rework:**
- `description`: 2-3 sentences, captures the essence
- `systemPrompt`: Full personality, speech patterns, mannerisms, backstory. Written so that the model can embody this character with ZERO additional rules.
- `instructions`: Only truly critical overrides (max 5 rules). No rules that duplicate what's already in systemPrompt.
- `greeting`: Distinctive first message that immediately shows personality
- Remove duplicate `startingMessage` / `greeting` (keep only `greeting`)

**Step 2: Commit**

```bash
git add src/config/characters.js
git commit -m "rework all 5 standard characters — premium quality"
```

---

## Phase 5: Final Cleanup & Push

### Task 11: Remove Unused Exports from slowBurn.js and languageEngine.js

**Files:**
- Modify: `src/lib/slowBurn.js` — check if anything else imports it
- Modify: `src/lib/languageEngine.js` — check if anything else imports it

**Step 1: Search for remaining imports**

Search the codebase for:
- `import.*slowBurn` — if only api.js imported it and that's removed, the file is dead
- `import.*languageEngine` — same check
- `import.*StoryEngine` — StoryEngine.js may have its own language handling

If `slowBurn.js` is fully unused → can leave it (no harm, just dead file) or delete it.
If `languageEngine.js` is used by StoryEngine or other files → keep it but don't import in api.js.

**Step 2: Final grep for old references**

Search entire `src/` for any remaining references to:
- `PASSION_VOCABULARY`
- `getPacingReminder`
- `getSensoryGuidance`
- `validateResponseQuality`
- `detectEnvironment`
- `detectState`
- `ENVIRONMENT_KEYWORDS`
- `STATE_KEYWORDS`

Remove any found.

**Step 3: Commit**

```bash
git add -A
git commit -m "final cleanup — remove all v1 prompt system references"
```

---

### Task 12: Full Integration Test

**Step 1: Test all characters**

Run: `npm run dev`

Test each standard character (Alice, Sarah, Emma, Lily, Sophia):
- Send a casual greeting ("Hey")
- Verify character responds in their unique voice
- Verify response is immersive (not just a one-liner)
- Send a flirty message, verify passion tier progresses
- Check console: async scoring logs should appear

**Step 2: Test Unchained Mode**

- Toggle Unchained mode on
- Send explicit message
- Verify character responds in-character but without content restrictions
- Verify Alice is still shy/naive in Unchained

**Step 3: Test long conversation**

- Send 20+ messages
- Verify context is maintained (character remembers what happened)
- Check for recap in console logs when messages are trimmed

**Step 4: Test custom character**

- Create a new custom character with minimal description
- Verify it works with default passionProfile 0.7
- Verify passion system works for custom character

**Step 5: Push to both remotes**

```bash
git push origin master && git push github master
```

---

## Summary: Files Modified

| File | Changes |
|------|---------|
| `src/lib/api.js` | Rewritten `generateSystemPrompt`, async scoring, context recap, deleted bloat |
| `src/lib/PassionManager.js` | Deleted `PASSION_VOCABULARY` (~500 lines), deleted `getVocabulary()` |
| `src/config/characters.js` | All 5 standard characters reworked for premium quality |
| `src/components/ChatInterface.jsx` | Session memory integration, verify message styling |
| `src/components/CharacterCreator.jsx` | Default `passionProfile: 0.7` |
| `main.js` | Added 3 IPC handlers for session memory |
| `preload.js` | Exposed 3 memory methods |
| `src/lib/slowBurn.js` | No longer imported (may delete file later) |
| `src/lib/languageEngine.js` | No longer imported from api.js |

**Estimated total lines removed:** ~1500+ (vocabulary, jailbreak, language blocks, style guides)
**Estimated total lines added:** ~200 (new prompt generator, recap extractor, memory IPC)
**Net reduction:** ~1300 lines of code
