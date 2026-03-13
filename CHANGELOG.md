# Changelog

## Unreleased (since v0.2.5)

### Features

- **Smart Suggestions v2–v5** — piggyback prompt, background calls, impersonate button with streaming input, SillyTavern techniques, auto-expanding textarea, suggestion pills
- **Streaming Responses** — live token display as they're generated
- **Chat Commands** — `/help` and `/summary` with system message rendering
- **Chat Filter & Bulk Delete** — filter saved chats by character, bulk delete
- **Character Enhancements** — scenario, example dialogues, templates, W++ format for all built-in characters
- **Character Creator Improvements** — instructions field, optional subtitle/description, consistent field labels, passion profile slider
- **Passion System v3** — depth engine replacing keyword scoring, 6-tier system (Surface → Transcendent), one-way ratchet, LLM-based scoring, speed multipliers, unchained mode
- **Passion UI** — tier glow animation, sparkline, presets, popover, ambient vignette, tier events in chat, toast notifications, plateau detection
- **Passion History** — export/import, resume continuity, score breakdown, tier narration, momentum streak
- **Model Auto-Detection** — profiles with per-family sampling defaults
- **Configurable Context Size** — VRAM-based presets with slider
- **Max Response Tokens Setting** — slider control (default raised from 256 to 512)
- **Cross-Platform Tool System** — generic tool manager with download support for Ollama, Piper, Zonos, Stability Matrix
- **Linux & macOS Builds** — AppImage and DMG build targets
- **Cross-Platform Utility Module** — replaces Windows-specific code
- **Character Session Memory** — IPC handlers for persistent memory
- **Chat Export Enhancement** — includes token stats, model name, passion tier, speed, unchained mode
- **Vitest Infrastructure** — test framework setup

### Improvements

- **Prompt System v2.0** — lean character-first prompts, async passion scoring, template-slot builder
- **System Prompt Trimmed** — ~700 tokens → ~400 tokens for faster first-token
- **Unchained Mode** — one-line instruction instead of verbose override block, explicit ban on refusal phrases
- **Language Handling** — simplified to "respond in same language" rule, removed complex detection (kept for CJK/Arabic/Hindi/Russian)
- **Multilingual Passion Vocabulary** — 13 languages × 6 tiers
- **Default Model** — switched from Qwen 3.5 to Mag-Mell R1 12B (`HammerAI/mn-mag-mell-r1:12b-q4_K_M`)
- **Character Format** — all characters converted to W++ for token efficiency
- **Passion Tiers** — expanded from 4 to 6, personality-aware sensory guidance
- **Chat UI Polish** — softer user bubbles, streaming bubble font matching, input during streaming

### Bug Fixes

- **Chat Engine** — prompt injection protection, response cleaning, token accuracy, duplicate user message in history
- **Streaming** — hide partial `[SUGGEST]` tags during token build-up, fix streaming delay, jank fix via requestAnimationFrame batching
- **Smart Suggestions** — dead code removal, silent error handling, stale pills, settings desync, abort lifecycle, input overflow
- **Passion System** — scoring crash fix, NaN guard, regex injection fix, reset leak, float storage, timer cleanup, stale state, memory leak
- **Context Management** — overflow after few messages fixed with proper token budget trimming + retry fallback
- **Ollama Integration** — empty response handling, `num_ctx` flip-flopping, session management, consistent `num_ctx`, abort cleanup
- **IPC** — listener cleanup, passion timer leaks, macOS double registration prevention
- **Navigation** — chat → character select, creative writing → mode select back navigation
- **React Issues** — localStorage render, stale closures, suggestion keys, useMemo TDZ bug
- **Content Filtering** — stop token leak and response corruption from special tokens
- **Language** — broken fallbacks, dead code, `cn→zh` language code fix, missing Hindi/Turkish translations
- **Startup** — 30-second black screen fix (dev cache wipe removal, ready-to-show event, Ollama timeout)
- **Character Creator** — passionProfile falsy edge case, passion speed multiplier for built-ins
- **Console Spam** — removed ~130 debug logs from production
- **Build** — include `tools/` in installer, fix author name

### Security

- **Path Validation & CSP** — security hardening with sandbox and process cleanup
- **PII Scanner** — hash supporter key, credential gitignore patterns
- **Anti-Jailbreak** — rule added to system prompt (model-limited)
- **Ollama Hardening** — dynamic context, timeouts, passion scoring fixes
- **Download Safety** — max redirect guard, always-fire progress, PID validation for killProcess

### Performance

- **Streaming Jank** — batch token updates via requestAnimationFrame
- **Startup Speed** — prevent Vite cache wipe, add fetch timeout, diagnostics
- **Prompt Efficiency** — system prompt trimmed by ~43%, W++ character format
- **Non-Blocking Scoring** — passion LLM scoring via fire-and-forget async

### Refactoring

- **Cross-Platform Migration** — replace Windows-specific code in main.js with tool system
- **Dead Code Removal** — recap, modelTier, filterCharacterContent, dead language functions, old passion code, thinking-model code, environment/state detection
- **Passion System** — keyword scoring engine replaced with LLM scoring, SlowBurn refactored for 6 tiers + personality
- **Prompt Builder** — `generateSystemPrompt` replaced with template-slot `buildSystemPrompt`

### Infrastructure

- **Build Targets** — Linux AppImage, macOS DMG alongside Windows installer
- **Git Hygiene** — CLAUDE.md and docs/plans/ added to .gitignore
- **README** — updated links, install instructions, platform badges
- **Windows Cleanup** — removed .bat scripts and nul artifacts
- **Cross-Platform Detection** — `shutil.which` for espeak-ng, cross-platform paths
- **Translations** — added keys for passion system, chat filter, bulk delete, connection test, scenario/dialogues across all 13 languages
