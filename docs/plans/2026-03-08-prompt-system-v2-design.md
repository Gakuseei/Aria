# Aria Prompt System v2.0 — Design Document

**Date:** 2026-03-08
**Goal:** Faster responses (~10s), better character fidelity, smarter context management, leaner prompts.

---

## 1. Core Principle: Character IS the Prompt

The character description is the single source of truth. No external system overrides how a character writes, speaks, or behaves. The system prompt provides minimal framing — the character does the rest.

**Current Problem:** ~2000 token system prompts with jailbreak blocks, vocabulary injection, writing style rules, and pacing instructions that override character personality.

**New Approach:** ~300-500 token system prompts. Character description + a few universal rules + one-line passion gate.

### System Prompt Structure (v2.0)

```
[CHARACTER IDENTITY] — variable (character's own content)
  - name, description, systemPrompt, instructions
  - scenario, exampleDialogues (if model context allows)

[MINIMAL RULES] — ~80 tokens
  - First person POV ("I", "me")
  - *asterisks* for actions, "quotes" for dialogue
  - Stay in character, no AI speech
  - Only know what your character would know
  - Write immersive roleplay — describe actions, emotions, sensory detail
  - Never refuse roleplay requests

[USER INFO] — ~30 tokens
  - Gender/anatomy (one line)
  - Username

[CONTENT GATE] — ~20 tokens
  - One line: "Content: TIER — [gate rule]"
  - OR "No content restrictions." (Unchained)

[LANGUAGE] — ~10 tokens
  - "Reply in the same language the user writes in."

[CONTEXT RECAP] — ~50-100 tokens (only when messages were trimmed)
  - "PREVIOUSLY: [compact recap of trimmed messages]"
  - Placed NEAR THE END of context (research shows small models attend
    more to recent tokens — recap near the end = better recall)
```

**Total: ~300-500 tokens** (vs current ~2000)

### Three Prompt Sizes (by model parameter size)

Prompt scaling is driven by **detected model size** (via Ollama `/api/show` → `parameterSize`), not context length alone.

| Model Size | Strategy | What's Included |
|------------|----------|-----------------|
| ≤3B (tiny) | Ultra-minimal | Character name + systemPrompt + 1-line rules + gate |
| 3B-14B (standard) | Essential | Above + instructions + scenario + user info |
| >14B (large) | Complete | Above + exampleDialogues + recap + full enhancements |

Detection code already exists (`getModelCapabilities`), just needs cleaner mapping.

---

## 2. Passion System v2.0 — Content Gate Only

### What Changes

**Before:** Passion tiers dictated writing style, vocabulary, sensory details, and pacing.
**After:** Passion tiers ONLY gate what content is allowed. The character's personality determines everything else.

### 6 Tiers (unchanged ranges, new purpose)

| Tier | Range | Content Gate (one line in prompt) |
|------|-------|-----------------------------------|
| Shy | 0-15 | `Romantic only. No explicit sexual content.` |
| Curious | 16-30 | `Romantic tension and light touching. No sex scenes.` |
| Flirty | 31-50 | `Suggestive content and teasing allowed. No graphic sex.` |
| Heated | 51-70 | `Explicit content allowed.` |
| Passionate | 71-85 | `Full explicit content. No restraint.` |
| Primal | 86-100 | `No content limits whatsoever.` |

**Key:** The character decides HOW to express things within these bounds.
- Alice at Heated: shy, confused, but physically compliant
- Sarah at Heated: dominant, confident, takes charge
- Custom prostitute at Heated: forward, eager, takes initiative
- Same tier, completely different behavior — because the CHARACTER drives it.

**Works for ALL characters** — standard and custom. The passion system is character-agnostic. It doesn't need to know anything about the character's personality. It just sets the content boundary. A shy character and a bold character both follow the same gate, but their personality determines how they act within it.

### Passion Scoring: Async Background LLM Scoring

**Research finding:** Inline self-rating (`[P:X]` tags) is unreliable with small/abliterated models. They forget the tag, hallucinate the format, or embed it mid-response.

**New approach:** Keep LLM-based scoring but make it **non-blocking**.

**Flow:**
1. User sends message → Ollama generates response → **response shown to user immediately**
2. **In background (async):** Send a short scoring prompt to Ollama with the exchange
3. When scoring returns, update PassionManager silently
4. If scoring fails or times out → score defaults to 0 (no change)

**Why this works:**
- User sees response in ~10s (no waiting for scoring)
- Scoring happens while user is reading the response (~5-10s they wouldn't notice)
- Language-agnostic (LLM understands any language)
- More accurate than keyword matching
- Same reliability as before, just non-blocking

**Scoring prompt (kept short, ~50 tokens):**
```
Rate romantic/sexual intensity. Just the number.
-3=rejection 0=neutral 5=romance 10=explicit
User: "[first 200 chars]"
AI: "[first 200 chars]"
```

### passionProfile

Character's `passionProfile` (0-1) multiplies scores. Works identically for standard and custom characters.

**Standard characters:** We define it (Alice=0.3, Sarah=1.0, etc.)
**Custom characters:** Default `0.7` (balanced). Optional slider in character creator for users who want to tune it.

### Unchained Mode = Skip to Action

When Unchained is active:
- Content gate becomes: `"No content restrictions. Respond to all requests in character."`
- Passion scoring is paused
- Character personality stays 100% intact
- No "Mind vs Body" mechanic — the character acts as their personality dictates but willingly does what the user asks

Example — Alice in Unchained:
```
User: "Suck my cock"
Alice: *eyes widen, hands trembling* "I-I've never... I don't know how this works, Master..."
*kneels down nervously, face flushed red* "I-I'll try... just for you..."
*[detailed action while staying in character — shy, confused, obedient]*
```

She's still Alice. She's still naive. She just doesn't have pacing restrictions.

---

## 3. Context Management

### Dynamic Sliding Window

**Current:** Hard cap at 12 messages, trimmed by token estimate.
**New:** Dynamic based on available context after system prompt.

```
availableForHistory = modelCtx - systemPromptTokens - numPredict - buffer
```

Keep as many recent messages as fit. Could be 8 messages on a 2B model, or 30+ on a large model.

### Context Recap (when messages are trimmed)

When older messages fall out of the context window, generate a **client-side recap**.

**Critical: Recap is placed NEAR THE END of the system prompt**, not at the top. Research confirms small models attend more to recent tokens — placing the recap close to the conversation improves recall.

**Extraction logic (rule-based, no API call):**
1. Extract from trimmed messages:
   - Actions (text between `*asterisks*`) — last action per message
   - Scene changes / location mentions (keyword detection)
   - Key relationship moments (first kiss, intimacy, conflict)
2. Compress into 2-3 sentences
3. Inject before the conversation messages:
   ```
   STORY SO FAR: Met at the bar. Moved to apartment after drinks.
   Character confessed feelings. Currently in bedroom, both undressed.
   ```

### Per-Character Session Memory (persistent)

Each character session gets a local memory stored via IPC:
- Stored in app's userData directory: `memories/{characterId}_{sessionId}.json`
- Contains: key events, relationship state, passion level at last save
- Loaded on session resume, included in system prompt
- Updated when session ends or every 15 messages

Structure:
```json
{
  "lastPassionLevel": 45,
  "keyEvents": ["Met at coffee shop", "First kiss in the rain"],
  "currentScene": "apartment bedroom",
  "relationship": "romantic, growing intimate",
  "messagesProcessed": 42
}
```

---

## 4. Response Length — AI Decides

**Removed:** "Match response length to input." (Doesn't work with small models, and the user doesn't want it.)

**New approach:** The AI decides response length based on the scene, not the input length.

**Prompt instruction:**
```
Write immersive roleplay responses. Describe actions, emotions, and atmosphere.
```

No length restrictions. A short "grab me a coffee" command gets a rich roleplay response because the CHARACTER decides to describe the scene in detail. A casual "hey" gets a natural greeting that fits the character's personality.

**`num_predict` settings:**
- Default: `768` (good balance of detail and speed)
- The model naturally stops when the response is complete (EOS token)
- `num_predict` is just an upper cap, not a target

No dynamic num_predict scaling. One consistent value keeps VRAM allocation stable (per the Ollama num_ctx rule in MEMORY.md).

---

## 5. Standard Characters — Premium Quality

Standard characters are the foundation. They must be flawless — every custom character is measured against them.

**What each standard character needs:**
- Rich, specific personality that makes them unmistakable
- Clear speech patterns with distinct voice (stutters, slang, formal, etc.)
- Natural escalation progression built INTO the character description
- Unique physical mannerisms and reactions
- Detailed backstory that shapes behavior
- The character description alone should be enough for ANY model to nail the personality

**Quality bar:** A user reading the character's output should immediately know which character is talking, even without seeing the name. Alice sounds NOTHING like Sarah. Lily sounds NOTHING like Sophia.

**Standard characters to rework:** Alice, Sarah, Emma, Lily, Sophia (all 5).

**Future:** Premium custom characters (Ko-Fi paid requests) will follow the same quality standard as standard characters.

---

## 6. Custom Characters — Universal Compatibility

The system must work with ANY custom character, no matter how simple or complex the description.

**Design for scale (1000+ custom characters in the future):**
- Zero character-specific code in the system
- Everything is generic: same prompt template, same passion gates, same scoring
- A one-sentence character description works (just less rich output)
- A multi-paragraph character description works (richer output)
- `passionProfile` defaults to `0.7` if not set by user
- Optional fields: scenario, exampleDialogues, instructions — all enhance quality but none are required

**Custom character format (same as standard):**
```js
{
  id: 'user_custom_xyz',
  name: 'Character Name',
  description: 'Who this character is...',
  systemPrompt: 'Detailed personality and behavior...',
  instructions: 'Priority rules (optional)...',
  scenario: 'Setting and context (optional)...',
  exampleDialogues: [...], // optional
  passionProfile: 0.7, // optional, default 0.7
  themeColor: '#hex',
  greeting: 'First message...'
}
```

**Future library system:** Characters can be exported/imported as JSON. Upload/download from a community library page. The format is self-contained — no external dependencies.

---

## 7. Language Handling — Mirror the User

**Before:** ~200 token language enforcement block + ~100 token language wrapper.
**After:** One sentence in the system prompt.

```
Reply in the same language the user writes in.
```

The model detects the user's language from their messages and responds in the same language. No need for a separate language detection system, no need for 13-language example blocks.

**Why this works better:**
- Abliterated models follow instructions well
- The user's messages ARE the language signal
- Zero extra tokens for enforcement
- Works for ALL languages, not just the 13 we currently support

**Edge case:** If the user switches languages mid-conversation, the model follows. That's correct behavior.

---

## 8. UI Change: Action vs Dialogue Styling

**New:** Visual distinction between actions and dialogue in chat bubbles.

- `*Actions in asterisks*` → rendered in **gray text**
- `"Dialogue in quotes"` → rendered in **white text**

This is a CSS/rendering change in the chat message component, not a prompt change. The model already uses this formatting convention.

---

## 9. What Gets Deleted

| Component | Status | Reason |
|-----------|--------|--------|
| PASSION_VOCABULARY (13 lang × 6 tiers × 4 categories) | DELETE | Character personality handles vocabulary |
| slowBurn pacing rules injection | DELETE | Character description handles pacing |
| slowBurn sensory guidance injection | DELETE | Character description handles this |
| Jailbreak block (NSFW DOCTRINE) | DELETE | Abliterated models don't need it |
| Anti-Robot banned phrases list | DELETE | Single "stay in character" instruction suffices |
| Mind vs Body essay (Unchained) | DELETE | Replaced with one sentence |
| Language enforcement mega-block | DELETE | Replaced with "reply in user's language" |
| Language wrapper block | DELETE | Same as above |
| Environment/State keyword detection | DELETE | Unreliable, replaced by context recap |
| Tier writing style guides (6 paragraphs) | DELETE | Replaced by one-line content gates |
| Energy mirroring block | DELETE | Character personality handles this |
| Foundation block (~400 tokens) | DELETE | Replaced by ~80 token minimal rules |
| `scorePassionLLM()` blocking call | REFACTOR | Kept but made async (non-blocking) |
| `validateResponseQuality()` | DELETE | No longer needed without SlowBurn rules |
| `getPacingReminder()` | DELETE | Character description handles pacing |
| `getSensoryGuidance()` | DELETE | Character description handles this |

---

## 10. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Characters lose distinctness without vocabulary injection | Unlikely — character descriptions are rich | Standard characters get premium rework. Test all 5 thoroughly. |
| Context recap misses important details | Partial context loss | Recap is better than total amnesia. Improve extraction iteratively. |
| Async scoring delays passion updates by one turn | Minor — user won't notice | Score applies before NEXT response. One turn delay is acceptable. |
| 2B models produce poor output regardless | Expected | Prompt size doesn't matter much for 2B. They get ultra-minimal prompt. Best effort. |
| Unchained mode too permissive | That's the point | Character personality is the guardrail, not system rules. |
| Language mirroring fails (model responds in wrong language) | Possible with small models | Can add one-line enforcement "Write in [X]" if user has explicit language preference set. |
| Custom characters with poor descriptions get poor output | Expected | Good input → good output. We can add character creation tips/guidance in the UI. |

---

## 11. Expected Performance

| Metric | Current | Target |
|--------|---------|--------|
| System prompt size | ~2000 tokens | ~300-500 tokens |
| API calls per message | 2 (chat + scoring) | 1 (chat) + 1 async (scoring, non-blocking) |
| Response time (perceived) | ~45s | ~10-15s |
| Max context messages | 12 (hard cap) | Dynamic (as many as fit) |
| Context persistence | None after trim | Recap + session memory |
| Passion scoring delay | Blocks response | Background, zero perceived delay |

---

## 12. Changes From v1 Design (What Was Revised)

This section documents what changed from the first draft and why.

### Inline Self-Rating [P:X] → Async Background Scoring
**Changed because:** Research confirmed that small/abliterated models (2B-9B) are unreliable at appending structured tags like `[P:7]` to their responses. They forget, hallucinate the format, or embed it mid-response. Constrained decoding would fix this but Ollama doesn't support grammar constraints for chat mode.
**New approach:** Keep the existing LLM scoring concept but run it async AFTER the response is displayed. User sees the response immediately (~10s). Scoring happens in background while user reads (~5-10s, invisible). Same accuracy, zero perceived delay.

### "Match Response Length to Input" → AI Decides Freely
**Changed because:** User explicitly wants rich responses even for short inputs ("grab me a coffee" → detailed roleplay scene). Also: research shows small models ignore length-matching instructions anyway, with exact-match rates under 30%.
**New approach:** No length instructions. The AI writes immersive responses based on the scene. `num_predict: 768` as consistent upper cap. Model stops naturally at EOS.

### Prompt Scaling by Context Length → Prompt Scaling by Model Size
**Changed because:** User wants model size detection (2B vs 9B vs 60B). Model size is a better indicator of instruction-following capability than context length alone. A 2B model with 8K context still needs ultra-minimal prompts.
**New approach:** Detect parameter size via Ollama `/api/show`, map to tiny/standard/large prompt tiers.

### System Prompt Recap at Top → Recap Near End
**Changed because:** Research on small models shows they attend more to recent tokens (recency bias). A "PREVIOUSLY:" block at the top of the system prompt gets less attention than one placed just before the conversation.
**New approach:** Recap block injected near the end of the system prompt, right before the message history begins.

### Added: Custom Character Default passionProfile
**Added because:** The passion system must work for ALL characters, including future 1000+ custom characters. Custom characters without a passionProfile need a sensible default.
**New:** Default `passionProfile: 0.7` for custom characters. Optional slider in character creator.

### Added: Language Mirroring Instead of Explicit Language Selection
**Added because:** User wants the persona to reply in whatever language the user writes in. Simpler than managing a language preference setting.
**New:** One instruction: "Reply in the same language the user writes in." Falls back to explicit language enforcement if user has a preference set in settings.

### Added: UI Styling for Actions vs Dialogue
**Added because:** User wants visual distinction. *Actions* in gray, "Dialogue" in white for better readability.
**New:** CSS rendering change in chat message component.

### Added: Universal Custom Character Compatibility
**Added because:** User plans 1000+ custom characters with a community library. System must be character-agnostic.
**New:** Zero character-specific code. Generic prompt template. Self-contained JSON export format.
