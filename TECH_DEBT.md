# Tech Debt Registry

Last audited: 2026-03-12

## Priority: High (Runtime Failures / Bugs)

### TD-01 — Empty `handleAutoImageGen` stub
- **File:** `src/components/ChatInterface.jsx:690-703`
- **Impact:** Function is called but does nothing — auto image generation silently fails
- **Fix:** Implement the function or remove the call site + feature flag

### TD-11 — Language code `cn` instead of ISO `zh`
- **File:** `src/lib/translations.js:2004`
- **Impact:** Chinese locale uses non-standard code `cn`; any library expecting ISO 639-1 `zh` will fail to match
- **Fix:** Rename `cn` key to `zh` across translations + language selector

### TD-20 — `impersonateUser` null body crash
- **File:** `src/lib/api.js:459`
- **Impact:** `res.body.getReader()` called without null check — crashes on error responses with no body
- **Fix:** Guard `res.body` before calling `.getReader()`

### TD-21 — Unhandled async promise in `handleAutoImageGen`
- **File:** `src/components/ChatInterface.jsx:863`
- **Impact:** Async function called without `await` or `.catch()` — unhandled promise rejection
- **Fix:** Add `.catch()` handler or `await` with try/catch

---

## Priority: Medium (Maintainability / Correctness)

### TD-02 — Dead `parseSuggestions` function
- **File:** `src/lib/api.js:543`
- **Impact:** 24-line function defined but never imported or called anywhere
- **Fix:** Delete the function

### TD-03 — Unused `languageEngine.js`
- **File:** `src/lib/languageEngine.js` (183 lines)
- **Impact:** Complete language detection system with zero imports — abandoned module
- **Fix:** Delete the file (language mirroring is now a single system prompt rule)

### TD-07 — Dual `passionSpeed` / `passionProfile` fields
- **Files:** `src/config/characters.js:17,54,92,130,168` / `src/lib/PassionManager.js:71` / `src/lib/api.js:296`
- **Impact:** Built-in characters use `passionProfile` (numeric 0-1), runtime expects `passionSpeed` (string). Works only via fallback chain `character?.passionSpeed || character?.passionProfile`
- **Fix:** Migrate all characters to `passionSpeed` string field, remove `passionProfile`

### TD-08 — Settings duplication: IPC + localStorage
- **Files:** `src/App.jsx:106,242` / `src/lib/api.js:866` / `main.js:1558-1589`
- **Impact:** Settings persisted to both localStorage (React) and disk (IPC handler) independently — sync issues possible
- **Fix:** Single source of truth — either IPC-only or localStorage-only

### TD-09 — StoryEngine uses legacy `/api/generate`
- **File:** `src/lib/StoryEngine.js:211`
- **Impact:** Uses deprecated Ollama endpoint while main chat uses `/api/chat`
- **Fix:** Migrate to `/api/chat` endpoint with message format

### TD-10 — Inconsistent default model fallbacks
- **Files:** `src/lib/api.js:180,253,343,426,608` / `src/lib/StoryEngine.js:71`
- **Impact:** `sendMessage` defaults to `HammerAI/mn-mag-mell-r1:12b-q4_K_M`, but `generateSuggestions` and others default to `llama3`
- **Fix:** Single `DEFAULT_MODEL` constant imported everywhere

### TD-15 — Duplicated suggestion-after-response block
- **File:** `src/components/ChatInterface.jsx:830-847` and `1177-1194`
- **Impact:** Identical 17-line blocks for suggestion generation after send vs regenerate
- **Fix:** Extract to `triggerSuggestionGeneration()` helper

### TD-16 — Duplicated streaming buffer setup
- **File:** `src/components/ChatInterface.jsx:774` and `1122`
- **Impact:** Identical streaming buffer + RAF flushing pattern in send and regenerate paths
- **Fix:** Extract to `initStreamBuffer()` helper or shared hook

---

## Priority: Low (Cleanup / Refactoring)

### TD-04 — Dead `adjustPassion` function
- **File:** `src/lib/PassionManager.js:193`
- **Impact:** Never called — `setPassion()` is used instead
- **Fix:** Delete the method

### TD-05 — Empty CreativeWriting cleanup
- **File:** `src/components/CreativeWriting.jsx:61-78`
- **Impact:** useEffect cleanup contains only comments, no actual cleanup logic
- **Fix:** Implement cleanup (abort controllers, timers) or remove the empty block

### TD-06 — Unused `showOnboarding` state
- **File:** `src/App.jsx:46,515`
- **Impact:** State declared, never set to `true` — dead code path
- **Fix:** Remove state + conditional render block

### TD-12 — `sendMessage` is 268 lines
- **File:** `src/lib/api.js:573-840`
- **Impact:** Single function handles streaming, retries, passion scoring, token counting — hard to maintain
- **Fix:** Extract sub-functions: `handleStreaming()`, `scorePassion()`, `countTokens()`

### TD-13 — `ChatInterface.jsx` is 2079 lines
- **File:** `src/components/ChatInterface.jsx`
- **Impact:** God component handling chat, passion transitions, suggestions, voice, export, streaming
- **Fix:** Extract to sub-components: `ChatMessages`, `ChatInput`, `PassionOverlay`, `SuggestionBar`

### TD-17 — Repeated file cleanup pattern in `main.js`
- **File:** `main.js:68-70,82-83,105-107,125-127,137-139`
- **Impact:** `fs.existsSync()` → `fs.unlinkSync()` repeated 6+ times in `downloadWithRedirects()`
- **Fix:** Extract `safeUnlink(path)` utility

### TD-18 — Deprecated `substr()` usage
- **Files:** `src/components/CharacterCreator.jsx:112` / `src/lib/api.js:1165,1200`
- **Impact:** `.substr()` is deprecated per MDN
- **Fix:** Replace with `.slice()` — e.g. `.substr(2, 9)` → `.slice(2, 11)`

### TD-19 — `findLast()` ES2023 compatibility
- **File:** `src/components/ChatInterface.jsx:841,1188`
- **Impact:** `Array.findLast()` requires ES2023 — may break on older Electron versions
- **Fix:** Verify Electron's V8 version supports it, or use `.slice().reverse().find()` polyfill

### TD-22 — Empty `autoDetect` success branch
- **File:** `src/lib/api.js:1123-1125`
- **Impact:** When model already matches, returns `{ success: true, changed: false }` with no logging — minor clarity issue
- **Fix:** Add debug log for transparency

### TD-23 — Unguarded `localStorage.getItem` calls
- **File:** `src/App.jsx:106,143,355`
- **Impact:** localStorage can throw in edge cases (quota exceeded, private browsing)
- **Fix:** Wrap in try-catch or use a safe getter utility

### TD-24 — Hardcoded Ollama port `127.0.0.1:11434`
- **Files:** `src/App.jsx`, `src/lib/api.js` (10+ locations), `src/lib/StoryEngine.js:70`, `src/components/Settings.jsx:312`, `src/components/CreativeWriting.jsx:178,223`, `src/components/ChatInterface.jsx:233`
- **Impact:** 16+ hardcoded URL strings — changing the port requires editing every file
- **Fix:** Single `OLLAMA_BASE_URL` constant or settings-driven value

### TD-25 — Magic timing numbers
- **Files:** `src/components/ChatInterface.jsx:319,511,521,593,630,857` / `src/lib/api.js:199,246,648,755`
- **Impact:** Timeouts like `100`, `600`, `3000`, `120000` scattered without named constants
- **Fix:** Extract to named constants: `FADE_IN_DELAY`, `TIER_TRANSITION_MS`, `FETCH_TIMEOUT_MS`

### TD-26 — Hardcoded image gen parameters
- **File:** `src/lib/imageGen.js:9-30`
- **Impact:** Steps (20/28), samplers, CFG scales, dimensions, negative prompts all hardcoded
- **Fix:** Move to config object or settings

### TD-27 — Magic truncation / slice lengths
- **File:** `src/lib/PassionManager.js:316`
- **Impact:** Magic slice logic tied to `KNOWN_SUFFIXES` without named constant
- **Fix:** Use descriptive variable name for the slice offset

### TD-28 — Hardcoded version in export
- **File:** `src/components/ChatInterface.jsx:1022`
- **Impact:** `version: '0.2.6'` hardcoded — will drift from `package.json`
- **Fix:** Import version from `package.json` or inject via build-time env variable
