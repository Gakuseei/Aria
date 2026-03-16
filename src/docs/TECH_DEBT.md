# Aria — Technical Debt Classification

> Generated: 2026-03-16 | Methodology: Full codebase audit across 21k+ LOC

## Severity Guide

| Severity | Meaning |
|----------|---------|
| **Critical** | Blocks reliability or causes bugs in production |
| **High** | Hurts maintainability, risks subtle bugs |
| **Medium** | Code smell, slows down development |
| **Low** | Cosmetic, no functional impact |

## Effort Guide

| Size | Meaning |
|------|---------|
| **S** | < 30 min, single file |
| **M** | 1-3 hours, 2-3 files |
| **L** | Half day, cross-cutting |
| **XL** | 1-2 days, architectural |

---

## 1. Architecture — Monolithic Files

Large files that mix concerns and are hard to navigate, test, or review.

| File | LOC | Severity | Effort | Recommendation |
|------|-----|----------|--------|----------------|
| `src/lib/translations.js` | 8,279 | Medium | L | Split into per-language JSON files loaded dynamically |
| `src/components/ChatInterface.jsx` | 2,068 | High | XL | Extract hooks: `useSuggestions`, `useStreaming`, `usePassion`, `useChatHistory` |
| `main.js` | 1,890 | High | XL | Group IPC handlers into modules: `ipc/settings.js`, `ipc/ai.js`, `ipc/session.js`, `ipc/voice.js` |
| `src/lib/api.js` | 1,511 | High | L | Split: `promptBuilder.js`, `streamingClient.js`, `passionScoring.js`, `suggestions.js` |
| `src/lib/imageGen.js` | 1,648 | Medium | L | Extract Gradio client, queue manager, and UI helpers |
| `src/components/Settings.jsx` | 982 | Medium | M | Extract tab panels into sub-components |
| `src/components/DebugConsole.jsx` | 792 | Low | M | Acceptable size, but could extract log formatter |

---

## 2. Code Duplication

### 2.1 Settings Path Construction (main.js) — **High / S**

The settings path `path.join(app.getPath('userData'), 'settings.json')` is constructed **6 times**. A `getSettingsPath()` helper exists at line 1820 but only 2 of 6 call sites use it.

**Duplicated at:** lines 21, 514, 1251, 1590
**Already using helper:** lines 1824, 1859

**Fix:** Replace all 4 inline constructions with `getSettingsPath()`.

### 2.2 Sync Settings Read Pattern (main.js) — **High / M**

`JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))` is repeated at lines 23, 518, 1255, 1592. Each has its own try/catch with slightly different error handling.

**Fix:** Create `readSettingsSync()` or better, migrate to async `readSettings()`.

### 2.3 Streaming JSON Parse Loop (api.js) — **Medium / M**

The `for...of lines` streaming parser pattern appears twice (lines ~710-720 and ~1000-1015) with identical structure: split by newline, skip empty, strip `data:` prefix, JSON.parse, extract token.

**Fix:** Extract `parseStreamChunk(line)` utility.

---

## 3. Error Handling

### 3.1 Silent Catch Blocks in Streaming — **Critical / S**

| Location | Issue |
|----------|-------|
| `api.js:717` | `catch { /* skip malformed lines */ }` — hides corrupted stream data |
| `api.js:1006` | `catch { /* skip malformed lines */ }` — same |
| `api.js:1014` | `catch { /* skip */ }` — vague, no context |

Malformed streaming responses are silently dropped. If the model returns garbage, the user sees truncated output with no indication of failure.

**Fix:** Log malformed lines at debug level, count skipped chunks, surface warning if > 3 consecutive failures.

### 3.2 Silent Session File Skipping (main.js) — **High / S**

| Location | Issue |
|----------|-------|
| `main.js:1727` | `catch { /* silently skip corrupt sessions */ }` — user loses chat history with no indication |

**Fix:** Log corrupt session file path + error, optionally surface in DebugConsole.

### 3.3 Retry Without Strategy (api.js) — **Medium / S**

| Location | Issue |
|----------|-------|
| `api.js:1058` | `catch (err) { console.warn(...) }` — warns but doesn't propagate or retry |
| `api.js:1079` | Same pattern |

**Fix:** Either implement exponential backoff or propagate error to caller.

---

## 4. Hardcoded Values

### 4.1 Timeout Constants — **High / M**

Six different timeout values are scattered as magic numbers:

| Location | Value | Purpose |
|----------|-------|---------|
| `api.js:214` | `5000` | Model info fetch timeout |
| `api.js:916` | `120000` | Stream abort timeout |
| `api.js:961` | `120000` | Stream abort timeout (duplicate) |
| `api.js:1051` | `120000` | Stream abort timeout (duplicate) |
| `api.js:1061` | `120000` | Stream abort timeout (duplicate) |
| `api.js:1315` | `3000` | Passion scoring abort |
| `api.js:1351` | `5000` | Suggestion generation abort |

`PASSION_SCORING_TIMEOUT_MS` (line 147) shows the right pattern — extract all others similarly.

**Fix:** Add `STREAM_TIMEOUT_MS`, `MODEL_INFO_TIMEOUT_MS`, `SUGGESTION_TIMEOUT_MS` constants.

### 4.2 Hardcoded Service URLs — **Medium / S**

| Location | Value | Purpose |
|----------|-------|---------|
| `api.js:141` | `http://127.0.0.1:7860` | Gradio (image gen) |
| `api.js:143` | `http://127.0.0.1:5000` | Piper (voice) |

These are in a `DEFAULTS` object (good), but the ports themselves should be configurable via settings.

### 4.3 Stop Sequences — **Low / S**

| Location | Issue |
|----------|-------|
| `api.js:906` | 9-element stop sequence array hardcoded inline in request body |

**Fix:** Extract to a `STOP_SEQUENCES` constant or build dynamically from character name.

---

## 5. Dead Code & Outdated References

### 5.1 Dead Parameter — **Low / S**

| Location | Issue |
|----------|-------|
| `api.js:830` | `_skipPassionUpdate` parameter in `sendMessage()` — declared but never read in function body, never passed by any caller |

**Fix:** Remove parameter.

### 5.2 Outdated Version Comments — **Low / M**

20+ comments reference old versions (`v0.2.5`, `v8.1`, `v9.2`, `v9.5`) that no longer correspond to any release or branching scheme. Examples:

| Location | Comment |
|----------|---------|
| `api.js:2` | `// ARIA v2.0 — Lean Roleplay Engine` |
| `api.js:14` | `// v0.2.5: TRANSCRIPT ARTIFACT CLEANING` |
| `api.js:326` | `// v3.0: TEMPLATE-BASED PROMPT SYSTEM` |
| `api.js:839+` | `[v8.1 API]`, `[v8.1 Settings]`, `[v8.1 Session]` in debug strings |
| `StoryEngine.js:80` | `v9.5 AUFGABE 3` (German task reference) |

**Fix:** Remove version prefixes from comments. Use git blame for history.

### 5.3 Outdated Passion Tier References (StoryEngine.js) — **Medium / S**

| Location | Issue |
|----------|-------|
| `StoryEngine.js:139-140` | References `31-60: Flirty` — old tier naming |

Current PassionManager v3 uses: Surface(0-15), Aware(16-35), Vivid(36-55), Immersive(56-75), Consuming(76-90), Transcendent(91-100).

**Fix:** Update StoryEngine passion references to match PassionManager v3 tier names and ranges.

---

## 6. Production Hygiene

### 6.1 Console Logging — **High / L**

**131 `console.log/warn/error` statements** across 14 files in production code.

| File | Count | Notable |
|------|-------|---------|
| `api.js` | 38 | Most verbose — logs every streaming event |
| `ChatInterface.jsx` | 15 | Logs suggestion cycles, passion updates |
| `CreativeWriting.jsx` | 14 | Logs story generation steps |
| `Settings.jsx` | 11 | Logs settings changes |
| `StoryEngine.js` | 10 | Logs passion tier calculations |
| `imageGen.js` | 18 | Logs image generation pipeline |
| Other (8 files) | 25 | Various |

**Fix:** Implement a `debug()` utility that checks a `DEBUG` flag or `localStorage.debug`. Replace all `console.log` with `debug()` calls. Keep `console.error` for actual errors only.

### 6.2 Sync FS in Async Handlers (main.js) — **High / M**

4 IPC handlers use `fs.readFileSync` inside `async` handler functions, blocking the Electron main process event loop:

| Location | Handler |
|----------|---------|
| `main.js:518` | `test-voice` |
| `main.js:1255` | `ai-creative-write` |
| `main.js:1592` | `performHealthCheck()` |
| `main.js:1775` | Memory save |

Meanwhile, session management (lines 1658-1862) correctly uses `fs.promises.*`.

**Fix:** Replace all `readFileSync`/`writeFileSync` in async handlers with `await fs.promises.readFile`/`writeFile`. Keep `loadSettingsSync()` (line 21) as it runs at startup before the event loop matters.

---

## Recommended Fix Phases

### Phase A — Quick Wins (1-2 hours, high impact)

| Item | Ref | Effort |
|------|-----|--------|
| Settings path deduplication | 2.1 | S |
| Extract timeout constants | 4.1 | M |
| Fix silent streaming catches | 3.1 | S |
| Remove `_skipPassionUpdate` dead param | 5.1 | S |
| Update StoryEngine passion tiers | 5.3 | S |

### Phase B — Reliability (half day)

| Item | Ref | Effort |
|------|-----|--------|
| Migrate sync FS to async in handlers | 6.2 | M |
| Unify settings read pattern | 2.2 | M |
| Add debug logging utility | 6.1 | L |
| Fix session skip error handling | 3.2 | S |

### Phase C — Architecture (multi-day, plan first)

| Item | Ref | Effort |
|------|-----|--------|
| Split `api.js` into modules | 1 | L |
| Extract `ChatInterface.jsx` hooks | 1 | XL |
| Modularize `main.js` IPC handlers | 1 | XL |
| Split `translations.js` per-language | 1 | L |

---

## Stats Summary

| Category | Items | Critical | High | Medium | Low |
|----------|-------|----------|------|--------|-----|
| Architecture | 7 | 0 | 3 | 3 | 1 |
| Duplication | 3 | 0 | 2 | 1 | 0 |
| Error Handling | 3 | 1 | 1 | 1 | 0 |
| Hardcoded Values | 3 | 0 | 1 | 1 | 1 |
| Dead Code | 3 | 0 | 0 | 1 | 2 |
| Production Hygiene | 2 | 0 | 2 | 0 | 0 |
| **Total** | **21** | **1** | **9** | **7** | **4** |
