# Aria Test Gap Report

## Current Coverage

### Tested (12 test files)

| File | Test File | What's Tested |
|------|-----------|---------------|
| `lib/platform.js` | `tests/lib/platform.test.js` | `isWindows`, `isLinux`, `isMac`, `getPythonCommand`, `getVenvBinDir`, `getBinaryName`, `isPortInUse` |
| `lib/toolManager.js` | `tests/lib/toolManager.test.js` | Core exports |
| `lib/tools/ollama.js` | `tests/lib/tools/ollama.test.js` | Tool definition, download URLs, `detect()` |
| `lib/tools/piper.js` | `tests/lib/tools/piper.test.js` | Tool definition, download URLs, `detect()` |
| `lib/tools/stability.js` | `tests/lib/tools/stability.test.js` | Tool definition, download URLs, `detect()` |
| `lib/tools/zonos.js` | `tests/lib/tools/zonos.test.js` | Tool definition, server exports, `detect()` |
| `src/lib/modelProfiles.js` | `tests/lib/modelProfiles.test.js` | `detectModelFamily()`, `getModelProfile()` |
| `src/lib/PassionManager.js` | `tests/lib/PassionManager.test.js` | `getTierKey()`, `getDepthInstruction()`, `getSpeedMultiplier()`, `PASSION_TIERS` |
| `src/lib/commandHandler.js` | `tests/lib/commandHandler.test.js` | `isCommand()`, `executeCommand()` |
| `src/lib/api.js` | `tests/lib/api.test.js` | `resolveTemplates()`, `cleanTranscriptArtifacts()` |
| `src/config/characters.js` | `tests/lib/characters.test.js` | Schema validation, required fields, W++ format, unique IDs |
| `src/lib/translations.js` | `tests/lib/translations.test.js` | 13 languages, key parity with English, no empty values |

## Remaining Gaps

### src/lib/ — Untested Functions

| File | Functions | Blocker |
|------|-----------|---------|
| `src/lib/api.js` (network) | `sendMessage`, `scorePassionBackground`, `generateSuggestionsBackground`, `impersonateUser` | Requires Ollama / fetch mocking |
| `src/lib/api.js` (IPC) | `loadSettings`, `saveSession`, `loadSession`, `deleteSession`, `listSessions` | Requires `window.electronAPI` mock |
| `src/lib/api.js` (private) | `buildSystemPrompt`, `parseSuggestions` | Not exported, internal only |
| `src/lib/PassionManager.js` (class) | `PassionManager` instance methods (`applyScore`, `revertLastScore`, `resetPassion`) | Requires `localStorage` mock (jsdom) |
| `src/lib/StoryEngine.js` | Creative writing generation | Requires Ollama fetch mocking |
| `src/lib/imageGen.js` | Image generation API calls | Requires fetch mocking |
| `src/lib/slowBurn.js` | Slow burn narrative logic | Needs review for pure functions |

### React Components — Untested

| File | Blocker |
|------|---------|
| `src/components/ChatInterface.jsx` | Needs jsdom + React Testing Library |
| `src/components/CreativeWriting.jsx` | Needs jsdom + React Testing Library |
| `src/components/Settings.jsx` | Needs jsdom + React Testing Library |
| All other `.jsx` files | Needs jsdom + React Testing Library |

### Electron Layer — Untested

| File | Blocker |
|------|---------|
| `main.js` | Electron main process, IPC handlers |
| `preload.js` | Context bridge definitions |

## Prioritized Recommendations

1. **High**: Add `jsdom` test environment + `localStorage` mock to test `PassionManager` class methods
2. **High**: Mock `fetch` to test `sendMessage`, `scorePassionBackground`, and suggestion generation
3. **Medium**: Add React Testing Library for `ChatInterface` component tests
4. **Medium**: Export `buildSystemPrompt` for direct testing (currently private)
5. **Low**: Integration tests with real Ollama for end-to-end chat flow
