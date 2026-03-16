<div align="center">

<br/>

<img src="assets/logo.png" alt="Aria" width="160"/>

<br/><br/>

# Aria

**Local-only AI roleplay with a Passion System. No cloud. No censorship. No limits.**

<br/>

[![Stars](https://img.shields.io/github/stars/Gakuseei/Aria?style=for-the-badge&logo=github&color=E91E63&labelColor=0d1117)](https://github.com/Gakuseei/Aria/stargazers)
[![License](https://img.shields.io/badge/MIT-FFD700?style=for-the-badge&labelColor=0d1117)](LICENSE.md)
[![Platform](https://img.shields.io/badge/Windows%20·%20Linux-8B5CF6?style=for-the-badge&labelColor=0d1117)](https://github.com/Gakuseei/Aria)
[![Languages](https://img.shields.io/badge/13%20Languages-10B981?style=for-the-badge&labelColor=0d1117)](https://github.com/Gakuseei/Aria)

<br/>

<!-- TODO: Add demo.gif — 15-30s screen recording showing chat + streaming + suggestions -->
<!-- ffmpeg -i clip.mp4 -vf "fps=15,scale=800:-1" assets/demo.gif -->
<img src="assets/demo.gif" alt="Aria Demo" width="800"/>

</div>

<br/>

---

<br/>

## Why Aria

- 🔥 **Passion System** — The AI adapts its writing depth as your conversation evolves. Six tiers from casual to transcendent. No other app does this.
- ✍️ **Impersonate** — AI writes your next message. Tokens stream live into the input field. Edit or send as-is.
- 💡 **Smart Suggestions** — Three context-aware actions after every response. Match scene intensity, never repeat.
- 🔐 **100% Offline** — Runs on [Ollama](https://ollama.ai). Nothing leaves your device. Ever.
- 🎭 **Custom Characters** — Build your own with passion speed control, or use the 5 built-in personas.
- 🌍 **13 Languages** — EN, DE, ES, ZH, FR, IT, PT, RU, JA, KO, AR, HI, TR
- 🎙️ **Voice & Image** — Piper TTS, Zonos voice synthesis, Stable Diffusion image generation.

<br/>

---

<br/>

## Quick Start

```bash
# 1. Install Ollama → https://ollama.ai
# 2. Pull a model
ollama pull HammerAI/mn-mag-mell-r1:12b-q4_K_M
# 3. Launch Aria
```

> First launch walks you through everything — no terminal knowledge required.

<br/>

<details>
<summary><strong>Models by VRAM</strong></summary>

<br/>

| VRAM | Top Pick | Alternatives |
|:-----|:---------|:-------------|
| 0-2 GB | `gemma3:1b` | `llama3.2:3b` |
| 2-6 GB | `HammerAI/smart-lemon-cookie:7b` | `HammerAI/neuraldaredevil-abliterated` |
| **6-12 GB ⭐** | **`HammerAI/mn-mag-mell-r1:12b`** | `vanilj/mistral-nemo-12b-celeste-v1.9` |
| 12-24 GB | `HammerAI/cydonia-v3.1` | `huihui_ai/gemma3-abliterated:27b` |
| 24 GB+ | `HammerAI/l3.3-omega-directive-unslop-v2:70b` | `fluffy/magnum-v4-72b` |

</details>

<details>
<summary><strong>Build from Source</strong></summary>

<br/>

```bash
git clone https://github.com/Gakuseei/Aria.git
cd Aria
npm install
npm run dev
```

</details>

<br/>

---

<br/>

## Roadmap

- [x] **Phase 1** — Passion System v3, chat engine overhaul, smart suggestions, full manual testing
- [ ] **Phase 2** — Premium personas, chat improvements, profile pictures, chat search
- [ ] **Phase 3** — Custom installer (Ollama included), tutorial refactoring, stats dashboard
- [ ] **Phase 4** — UI overhaul, dark/light mode, new logo
- [ ] **Phase 5** — v1.0: group chats, multimodal vision, landing page
- [ ] **Phase 6** — v2.0: Full Rust rewrite with Dioxus. One binary, no Chromium.

<br/>

---

<br/>

<div align="center">

[![Discord](https://img.shields.io/badge/Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/h3gVtkw9ja)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/gakuseei)

Ko-fi supporters unlock **Gold Mode** — exclusive visuals and early access.

<br/>

MIT License — [LICENSE.md](LICENSE.md)

Made with 🌹 by [Gakuseei](https://github.com/Gakuseei)

</div>
