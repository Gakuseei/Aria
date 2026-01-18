<p align="center">
  <img src="assets/logo.png" alt="Aria Logo" width="120">
</p>

<h1 align="center">Aria</h1>

<p align="center">
  <strong>🌹 High-End Interactive Fiction & AI Companion Suite</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-rose?style=for-the-badge" alt="Version">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-purple?style=for-the-badge" alt="Platform">
  <img src="https://img.shields.io/badge/license-MIT-gold?style=for-the-badge" alt="License">
  <img src="https://img.shields.io/badge/100%25-Offline-green?style=for-the-badge" alt="Offline">
</p>

<p align="center">
  <em>A premium, fully local AI chatbot application for immersive storytelling and character interactions.</em>
</p>

---

## 🚀 Early Access / Beta

> **Aria is in active development.** Features and UI may change. See the roadmap below for upcoming updates.

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 🔒 **100% Private & Offline**

Your conversations never leave your device. Aria runs entirely on your local machine using [Ollama](https://ollama.ai), ensuring complete privacy.

### 🎭 **Custom Characters**

Create unique AI companions with custom personalities, backgrounds, and traits. Save and manage multiple characters.

### 🌍 **13 Languages**

Full localization support including English, German, Spanish, French, Italian, Portuguese, Russian, Japanese, Korean, Chinese, Arabic, Hindi, and Turkish.

### 📦 **Easy Import & Export**

Share your custom characters with the community or back them up. One-click import and export for seamless character management.

</td>
<td width="50%">

### 📚 **Easy Tutorials**

Interactive, built-in tutorials for quick onboarding of all features – Voice, Image Generation, and Ollama setup included.

### 🎨 **Stunning UI**

Rose-noir aesthetic with smooth animations, glassmorphism effects, and optional OLED dark mode. Gold mode available for supporters.

### 🔥 **Passion System**

A hidden relationship engine that evolves based on your choices. Unlock deeper emotional tiers, new dialogue styles, and... discover what lies beyond.

### 💡 **Smart Suggestions**

Context-aware response suggestions that adapt to the conversation flow and selected language.

</td>
</tr>
</table>

---

## 🚀 Getting Started

Aria includes **built-in tutorials** for Voice, Image Generation, and Ollama setup. Simply start the app and follow the interactive guides – no manual configuration required.

### Prerequisites

| Requirement | Details                              |
| ----------- | ------------------------------------ |
| **Node.js** | v18 or higher                        |
| **Ollama**  | [Download here](https://ollama.ai)   |
| **RAM**     | 8GB minimum (16GB recommended)       |
| **GPU**     | Optional, but speeds up AI responses |

### Quick Start

1. **Download & Extract** the project (or clone via Git)
2. **Open a terminal** in the project folder
   - Windows: Right-click in folder → "Open in Terminal"
   - macOS/Linux: Open Terminal and `cd` to the folder
3. **Install dependencies:**
   ```bash
   npm install
   ```
4. **Start Aria:**
   ```bash
   npm run dev
   ```
5. **Follow the in-app tutorials** to set up Ollama and your first AI model

> 💡 **Tip**: On first launch, Aria will guide you through pulling an AI model and setting everything up.

---

## 🗺️ Roadmap

### ✅ Completed

- [x] Voice System Repair / Settings Storage Fix
- [x] Ko-Fi / Gold Mode Visuals / Premium Start Animation
- [x] Language System (i18n with 13 languages, AI mirrors UI language)

### 🔜 In Progress

- [ ] Image Generation Polish / Context Cleaner Tuner
- [ ] Tutorial Update / Model Recommendations
  - Low-End: Amoral-Gemma 3B
  - Mid-End: Nous Hermes 3 8B
  - High-End: Qwen3-30B-A3B (Josefied)
  - Quantization Guide (GGUF Q4_K_M for larger models)

### 📋 Planned

- [ ] OLED Mode Button (Moon/Sun toggle)
- [ ] ChatBot Improve (Story Personas / Auto Scroll / Edit Last Message)
- [ ] Smart Suggestions Improve (Auto-Cut + Assemble for better flow)
- [ ] Passion System 2.0 (Expanded tiers, vocabulary refinement, slowBurn optimization)
- [ ] Auto Backup Chat (AutoSave after each message, locally)
- [ ] Profile Pictures / Better Info Tab / Backgrounds
- [ ] Sound Effects (Subtle Rose-Noir UI audio feedbacks)
- [ ] Code Description Removal (Filter AI-slop / code snippets from dialogs)
- [ ] Onboarding Tour (Interactive setup walkthrough)
- [ ] Logo Update (Final logo + deeper rose palette)
- [ ] Gold Mode Easter Eggs (Secret supporter reactions/UI surprises)
- [ ] Group Chats / NPC-to-NPC (Characters interact via Passion System)
- [ ] Multimodal Vision (Image uploads: AI reacts with local model like Qwen 2.5-VL)
- [ ] Index TTS 2.0 (Improved local voice engine for emotional performance)
- [ ] AI Girlfriend vs NSFW Roleplay Balance Toggle

### 🎯 Major Milestones

| Version         | Description                                              | Platforms             |
| --------------- | -------------------------------------------------------- | --------------------- |
| **v0.5 Alpha**  | First standalone installer release – no Node.js required | Windows, Linux, macOS |
| **v1.0 Stable** | Full release with all core features polished             | Windows, Linux, macOS |

---

## 🛠️ Tech Stack

| Technology       | Purpose                    |
| ---------------- | -------------------------- |
| **Electron**     | Cross-platform desktop app |
| **React 18**     | UI components              |
| **Vite**         | Build tooling              |
| **Tailwind CSS** | Styling                    |
| **Ollama**       | Local AI inference         |
| **Lucide React** | Icons                      |

---

## 🤝 Contributing

Contributions are welcome! Here are some ways to get involved:

**🐛 Bug Fixes** – Found something broken? PRs are always appreciated.

**🌐 Translations** – Help bring Aria to more languages.

**🎨 UI/UX Ideas** – Suggestions for the rose-noir aesthetic welcome.

**📝 Documentation** – Improve guides, add examples, clarify features.

### How to Contribute

1. Fork the project
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

> 💡 **Tip**: Check the [Roadmap](#%EF%B8%8F-roadmap) for planned features – helping with those is a great way to contribute!

---

## 💬 Feedback

Have ideas, suggestions, or found a bug? Feel free to reach out!

> **Before submitting feedback**, please check the [Roadmap](#%EF%B8%8F-roadmap) to see if your idea is already planned.

<p align="center">
  <a href="https://discord.com/users/gakuseei">
    <img src="https://img.shields.io/badge/Discord-gakuseei-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord">
  </a>
</p>

---

## 💖 Support

If you enjoy Aria, consider supporting development:

<p align="center">
  <a href="https://ko-fi.com/gakuseei">
    <img src="https://img.shields.io/badge/Ko--fi-Support%20Development-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white" alt="Ko-fi">
  </a>
</p>

---

## 📜 License

This project is licensed under the **MIT License** - see the [LICENSE.md](LICENSE.md) file for details.

---

<p align="center">
  Made with 🌹 by <a href="https://github.com/Gakuseei">Gakuseei</a>
</p>
