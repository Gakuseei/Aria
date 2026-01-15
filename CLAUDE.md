<behavioral_rules>
<law>
1. ABSOLUTE LOCAL-ONLY: 100% offline via Ollama (127.0.0.1:11434). No cloud APIs.
2. NSFW DOCTRINE: Characters build on advances; no consent lectures or deflection. Immediate physical response.
3. CLEAN CODE SUPREMACY: Use professional JSDoc only. NEVER add descriptive comments in JSX (no {/* ... */}) and No placeholders ("// ...").
4. IPC MANDATORY: Use window.electronAPI for FS/AI. NEVER use 'fs' in React components.
</law>
</behavioral_rules>

# Aria Project Overview
Local-only NSFW AI Roleplay (Electron + React + Vite + Tailwind).

## 🛠 Tech Stack & Core Logic
- **AI Core:** Ollama (default: hermes3) @ http://127.0.0.1:11434.
- **Narrative Engine:** 4-block architecture in `src/lib/api.js`.
- **Passion System:** Managed via `src/lib/PassionManager.js` (Tiers: 0-100).
- **UI:** Tailwind Zinc palette, OLED mode (bg-black), icons via lucide-react.
- **Premium:** Gold Mode with Amber gradients and cinematic animations.

## 💻 Coding Standards
- **Zero Layout Shift:** Always reserve border space (border-2) for interactive elements.
- **Completeness:** Always write full code for every file. No placeholders ("// ...").
- **Formatting:** Actions in *asterisks* (gray italic), Dialogue in "quotes" (white bold).

## 📂 Documentation & Context
Siehe folgende Dateien für Details (Progressive Disclosure):
- **Projektstruktur:** @PROJECT_STRUCTURE.md (Mapping der Codebase)
- **Status & Sprints:** @STATUS.md (Aktuelle Ziele und Fortschritt)
- **Regeln:** Spezifische Anweisungen in `./.claude/rules/`.