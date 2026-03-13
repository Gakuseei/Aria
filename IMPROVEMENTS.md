# Aria — Improvement Ideas

Prioritized improvement ideas based on codebase analysis. Each item includes affected files, estimated effort, and rationale.

---

## Priority 1: Quick Wins (< 1 hour each)

### 1.1 Delete `slowBurn.js`

- **Files:** `src/lib/slowBurn.js`
- **Effort:** 5 minutes
- **Rationale:** File contains only a placeholder comment ("Reserved for future pacing features"). No imports reference it anywhere. Dead code that adds confusion.
- **Action:** Delete the file.

### 1.2 Add `aria-label` to Icon Buttons

- **Files:** All `.jsx` components (13 files), especially `ChatInterface.jsx`, `Settings.jsx`, `TitleBar.jsx`
- **Effort:** 30 minutes
- **Rationale:** Only 4 `aria-label` attributes exist across 2 files. Icon-only buttons (send, regenerate, settings gear, close, minimize) are invisible to screen readers. Low effort, high accessibility impact.
- **Action:** Audit every `<button>` with only an icon child and add descriptive `aria-label` via `t()`.

### 1.3 Add `aria-live` Regions for Streaming Messages

- **Files:** `src/components/ChatInterface.jsx`
- **Effort:** 30 minutes
- **Rationale:** Streaming AI responses update the DOM continuously but screen readers have no announcement mechanism. Adding `aria-live="polite"` to the message container and `aria-live="assertive"` to error toasts makes chat usable with assistive tech.

---

## Priority 2: Medium Effort (1-4 hours each)

### 2.1 ChatInterface Decomposition

- **Files:** `src/components/ChatInterface.jsx` (2,046 lines)
- **Effort:** 4 hours
- **Rationale:** Single 2,046-line component handles message rendering, voice/audio, passion scoring, smart suggestions, input handling, and scroll management. Extracting focused hooks and sub-components improves maintainability and testability.
- **Suggested extractions:**
  - `useVoiceAudio()` — TTS playback, audio queue, voice state
  - `usePassionScoring()` — passion manager integration, score display
  - `useSuggestions()` — smart suggestion fetching, pill rendering, selection
  - `useMessageFormatting()` — markdown parsing, action/dialogue formatting
  - `<MessageBubble />` — single message rendering component
  - `<ChatInput />` — textarea, send button, command handling

### 2.2 Error Handling Consolidation

- **Files:** 19 files with 118 `try-catch` blocks total; heaviest: `main.js` (44), `api.js` (21), `ChatInterface.jsx` (14)
- **Effort:** 3 hours
- **Rationale:** Error handling is inconsistent — some blocks log to console, some show toasts, some silently swallow. A centralized approach reduces duplication and ensures users always see meaningful feedback.
- **Suggested approach:**
  - Create `src/lib/errorHandler.js` with error-to-toast mapping
  - Create `useErrorHandler()` hook for React components
  - Categorize errors: network (Ollama down), model (OOM, context overflow), filesystem, user input
  - Map each category to a user-friendly `t()` translation key

### 2.3 IPC Client Abstraction

- **Files:** 6 files with 27 `window.electronAPI.*` calls scattered across components
- **Effort:** 2 hours
- **Rationale:** Components call `window.electronAPI` directly with inconsistent error handling and no type safety. A thin wrapper centralizes the interface, simplifies mocking for tests, and provides consistent error handling.
- **Suggested approach:**
  - Create `src/lib/ipcClient.js` exporting typed functions per IPC channel
  - Each function wraps the `window.electronAPI` call with error handling
  - Components import from `ipcClient` instead of using `window.electronAPI` directly

### 2.4 Keyboard Navigation for Custom Dropdowns

- **Files:** `src/components/CustomDropdown.jsx`, any component using custom selects
- **Effort:** 1 hour
- **Rationale:** Custom dropdown components lack keyboard support (arrow keys, Enter to select, Escape to close). Native `<select>` elements get this for free; custom implementations need explicit handling.

---

## Priority 3: Larger Efforts (4+ hours each)

### 3.1 i18n Modularization

- **Files:** `src/lib/translations.js` (8,162 lines)
- **Effort:** 6 hours
- **Rationale:** Single 8,162-line file with all 13 languages is hard to maintain, causes large bundle size, and makes it painful to add/update translations. Splitting per-language allows lazy loading and easier contributor onboarding.
- **Suggested approach:**
  - Split into `src/lib/i18n/en.js`, `src/lib/i18n/de.js`, etc.
  - Keep `src/lib/i18n/index.js` as the loader that imports only the active language
  - Lazy-load non-default languages on settings change
  - Add a script to validate all languages have the same keys

### 3.2 Performance: Virtual Scrolling for Long Chats

- **Files:** `src/components/ChatInterface.jsx`
- **Effort:** 4 hours
- **Rationale:** Long conversations (100+ messages) render all messages in the DOM, causing scroll lag and high memory usage. Virtual scrolling (e.g., `react-window` or custom implementation) renders only visible messages.
- **Trade-off:** Adds complexity to scroll-to-bottom and message search. Consider only if users report lag in long sessions.

### 3.3 Performance: Memoize Message Formatting and Handlers

- **Files:** `src/components/ChatInterface.jsx`
- **Effort:** 2 hours
- **Rationale:** Message formatting functions and event handlers are recreated on every render. Wrapping stable handlers in `useCallback` and expensive computations in `useMemo` prevents unnecessary child re-renders, especially relevant with 100+ message lists.

### 3.4 Test Foundation

- **Files:** New `tests/unit/` directory
- **Effort:** 6 hours
- **Rationale:** Zero automated tests currently. Critical pure-logic modules are ideal candidates for a test foundation without needing DOM or Electron mocking.
- **Suggested first targets:**
  - `PassionManager.js` — tier boundaries, score calculation, speed multipliers, revertLastScore
  - `api.js:cleanTranscriptArtifacts()` — regex-based text cleaning, easy to unit test
  - `api.js:buildSystemPrompt()` — prompt assembly logic with various character configs
  - `translations.js` — key completeness validation across all 13 languages

---

## Not Recommended (Considered but Rejected)

| Idea | Reason Rejected |
|------|----------------|
| Migrate to TypeScript | Too large for current team size; JSDoc provides adequate type hints |
| Replace Tailwind with CSS modules | Tailwind is working well, no pain points reported |
| Add Redux/Zustand for state | Current prop drilling + context is sufficient for app complexity |
| Server-side rendering | Electron app, no SSR benefit |
