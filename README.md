<div align="center">

<br/>

<img src="assets/logo.png" alt="Aria" width="180"/>

<br/>

# Aria

### Local AI Roleplay with a Passion System — 100% Offline, Zero Restrictions

The only AI companion app where conversations **evolve**. Aria's unique Passion System dynamically adjusts prose depth as your relationship deepens — from casual chat to immersive roleplay. Runs entirely on your machine via [Ollama](https://ollama.ai). No cloud. No filters. No subscriptions. Free forever.

<br/>

[![Stars](https://img.shields.io/github/stars/Gakuseei/Aria?style=for-the-badge&logo=github&color=E91E63&labelColor=0d1117)](https://github.com/Gakuseei/Aria/stargazers)
[![License](https://img.shields.io/badge/MIT-FFD700?style=for-the-badge&labelColor=0d1117)](LICENSE.md)
[![Platform](https://img.shields.io/badge/Windows%20•%20Linux-8B5CF6?style=for-the-badge&labelColor=0d1117)](https://github.com/Gakuseei/Aria/releases)
[![Offline](https://img.shields.io/badge/100%25%20Local-10B981?style=for-the-badge&labelColor=0d1117)](https://github.com/Gakuseei/Aria)

<br/>

[![Discord](https://img.shields.io/badge/Join%20Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/h3gVtkw9ja)
[![Ko-fi](https://img.shields.io/badge/Support%20on%20Ko--fi-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/gakuseei)

</div>

<br/>

<!--
  TODO: Replace with actual GIF recording of Aria in action
  Record: 15-30s OBS clip showing chat + streaming + suggestions
  Convert to GIF: ffmpeg -i clip.mp4 -vf "fps=15,scale=800:-1" demo.gif
-->

<p align="center">
  <img src="assets/demo.gif" alt="Aria Demo" width="800"/>
</p>

<br/>

---

<br/>

## What Makes Aria Different

<br/>

<table>
<tr>
<td width="50%" valign="top">

### 🔥 Passion System
No other AI chat app has this. Passion tracks how your conversation evolves — from casual (Surface) through six tiers to peak intensity (Transcendent). The AI doesn't just respond, it **adapts its writing depth** based on your relationship. Configurable speed per character: Slow, Normal, Fast, Extreme.

</td>
<td width="50%" valign="top">

### ✍️ Impersonate
Writer's block? Hit the Impersonate button and Aria writes **your** next message. Tokens stream live into the input field. Edit it or send it as-is. 90% of testers used this as their default input method — it's that good.

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 💡 Smart Suggestions
After every AI response, three context-aware action suggestions appear. They match the scene's intensity, never repeat, and adapt to the conversation language. Click one to send it instantly.

</td>
<td width="50%" valign="top">

### 🔐 100% Local & Private
Everything runs on your machine through Ollama. No API keys, no cloud, no data collection, no content filters. Your conversations never leave your device. Period.

</td>
</tr>
</table>

<br/>

---

<br/>

## Aria vs The Competition

<br/>

<div align="center">

| Feature | **Aria** | SillyTavern | HammerAI |
|:--------|:--------:|:-----------:|:--------:|
| Passion System (dynamic prose depth) | ✅ Unique | ❌ | ❌ |
| Smart Suggestions | ✅ | ❌ | ❌ |
| Impersonate (write-for-me) | ✅ | ✅ | ❌ |
| 100% Local / Offline | ✅ | ✅ | ❌ Cloud-primary |
| Languages | 13 | 1 | 1 |
| Custom Character Builder | ✅ In-app | ❌ JSON files | ❌ |
| Voice Synthesis | ✅ Piper + Zonos | ❌ | ❌ |
| Image Generation | ✅ Stable Diffusion | ✅ | ❌ |
| Desktop App | ✅ Electron | ❌ Browser | ❌ Browser |
| Uncensored NSFW | ✅ | ✅ | Partial |
| Price | Free forever | Free | Freemium |

</div>

<br/>

---

<br/>

## Quick Start

**Get running in 3 steps:**

```bash
# 1. Install Ollama (if you haven't already)
# → https://ollama.ai

# 2. Pull a recommended model
ollama pull HammerAI/mn-mag-mell-r1:12b-q4_K_M

# 3. Download Aria from Releases and launch
```

**[Download Latest Release](https://github.com/Gakuseei/Aria/releases)**

> Aria walks you through everything on first launch: model selection, voice setup, and character creation. No terminal knowledge required.

<br/>

<details>
<summary><strong>Recommended Models by VRAM</strong></summary>

<br/>

| VRAM | Tier | Top Pick | Alternatives |
|:-----|:-----|:---------|:-------------|
| 0-2 GB | Ultra-Low | `gemma3:1b` | `llama3.2:1b`, `llama3.2:3b` |
| 2-6 GB | Low | `HammerAI/smart-lemon-cookie:7b` | `HammerAI/neuraldaredevil-abliterated` |
| **6-12 GB** | **Mid ⭐** | **`HammerAI/mn-mag-mell-r1:12b`** | `vanilj/mistral-nemo-12b-celeste-v1.9` |
| 12-24 GB | High | `HammerAI/cydonia-v3.1` | `HammerAI/omega-darker-gaslight-fever-dream:24b` |
| 24 GB+ | Max | `HammerAI/l3.3-omega-directive-unslop-v2:70b` | `fluffy/magnum-v4-72b` |

> Avoid Qwen 3/3.5 (thinking leaks into output) and DeepSeek R1 (reasoning model, not creative).

</details>

<br/>

<details>
<summary><strong>Build from Source</strong></summary>

<br/>

Requires **Node.js v18+** (v20 recommended).

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

## Features

<br/>

<div align="center">

| | Feature | Description |
|:--|:--------|:------------|
| 🔥 | **Passion System v3** | 6-tier prose depth engine with speed multipliers and unchained mode |
| ✍️ | **Impersonate** | AI writes your next message — streams live into input field |
| 💡 | **Smart Suggestions** | 3 context-aware action options after every response |
| 🎭 | **5 Built-in Characters** | Fully voiced W++ personas with unique personalities |
| 🛠️ | **Custom Character Builder** | Create your own characters with passion speed control |
| 🌍 | **13 Languages** | EN, DE, ES, ZH, FR, IT, PT, RU, JA, KO, AR, HI, TR |
| 🎙️ | **Voice Synthesis** | Piper TTS + Zonos for character voices |
| 🖼️ | **Image Generation** | Stable Diffusion / AUTOMATIC1111 integration |
| 💾 | **Auto-Save** | Conversations saved after every message |
| 📤 | **Export** | Full chat export with model stats and passion data |
| ✨ | **Gold Mode** | Premium visuals for Ko-fi supporters |
| 🔓 | **Unchained Mode** | Remove all behavioral guardrails |

</div>

<br/>

---

<br/>

## Roadmap

<br/>

<div align="center">

*Building the ultimate local AI companion*

</div>

<br/>

- [x] **Phase 1 — Polish & Stabilize** ✅
  - [x] Full manual testing (21 tests, all characters, all speeds)
  - [x] Smart Suggestions (auto-cut, scene anchor, fuzzy dedup)
  - [x] Passion System v3 (6 tiers, unchained mode, speed multipliers)
  - [x] Chat Engine overhaul (W++ characters, streaming, token stats)

- [ ] **Phase 2 — Core Features** 🔥
  - [ ] Premium Personas — enhanced default characters
  - [ ] Chat improvements — auto scroll, edit last message
  - [ ] Profile pictures & AI-assisted character creation
  - [ ] Chat search — find old conversations by content

- [ ] **Phase 3 — Infrastructure** 🏗️
  - [ ] Custom Installer — Ollama included, one-click setup
  - [ ] Tutorial refactoring — model recommendations by VRAM tier
  - [ ] Stats dashboard — token usage, chat statistics

- [ ] **Phase 4 — Visual Overhaul** 🎨
  - [ ] UI upgrade with collapsible persona folders
  - [ ] Proper dark/light mode toggle
  - [ ] New logo

- [ ] **Phase 5 — v1.0 Release** 🚀
  - [ ] Group chats / NPC-to-NPC interactions
  - [ ] Multimodal vision (local image understanding)
  - [ ] Landing page + promo video

- [ ] **Phase 6 — v2.0 Rust Rewrite** 🦀
  - [ ] Full rewrite: Dioxus + Rust backend. One language, one binary. No Chromium.

<br/>

---

<br/>

## Tech Stack

<div align="center">

**Electron** · **React** · **Vite** · **Tailwind CSS** · **Ollama**

</div>

<br/>

---

<br/>

## Contributing

Contributions welcome — bug reports, translations, features, documentation.

```bash
git checkout -b feature/your-feature
git commit -m "Add your feature"
git push origin feature/your-feature
# Open a Pull Request
```

<br/>

---

<br/>

<div align="center">

## Community & Support

[![Discord](https://img.shields.io/badge/Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/h3gVtkw9ja)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/gakuseei)

**Ko-fi supporters unlock Gold Mode** — exclusive visuals and early access.

<br/>

**MIT License** — See [LICENSE.md](LICENSE.md)

<br/>

Made with 🌹 by [Gakuseei](https://github.com/Gakuseei)

</div>
