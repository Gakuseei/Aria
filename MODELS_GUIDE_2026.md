# 🤖 Aria - Optimale Modelle für Ollama (Januar 2026)

## 🎯 Quick Summary für Aria

> **Current Status**: Roadmap erwähnt bereits Modellempfehlungen!  
> Siehe: "Tutorial Update with Model Recommendations" (🔄 In Progress)

### Empfehlungen nach Setup-Level

| Setup | Modell | VRAM | Best Für | Tutorial |
|-------|--------|------|----------|----------|
| 💚 **Anfänger** | Amoral-Gemma 3B | 3 GB | NSFW RP, Alt Hardware | 3 Min |
| 💙 **Standard** | **Nous Hermes 3 8B** | 5-6 GB | Roleplay, Storytelling | 5 Min |
| 💛 **Power-User** | Qwen3 30B A3B | 17-20 GB | Max Quality, Long Context | 10 Min |

---

## 📊 MODELL-ÜBERSICHT

### LOW-END: Amoral-Gemma 3B
```bash
ollama pull amoral-gemma-3b
```
- **VRAM**: 2.5-3.5 GB (Q4_K_M)
- **Spezial**: Uncensored NSFW + Roleplay
- **Speed**: 25-35 tok/s
- **Best für**: Alt-Hardware, Budget-Setups

### MID-END: Nous Hermes 3 8B ⭐ EMPFOHLEN
```bash
ollama pull hermes3
```
- **VRAM**: 5-6 GB (Q4_K_M)
- **Spezial**: Roleplay, 128k Context, Creative Writing
- **Speed**: 35-50 tok/s
- **Best für**: Standard Aria Users (Dein aktueller Standard!)
- **Quantisierung**: Q4_K_M (default), Q5_K_M (high-quality)

### HIGH-END: Qwen3 30B A3B
```bash
ollama run hf.co/bartowski/Qwen3-30B-A3B-Instruct-GGUF:Q4_K_M
```
- **VRAM**: 17-20 GB (Q4_K_M)
- **Spezial**: State-of-the-Art, 128k Context, MOE-Architektur
- **Speed**: 30-50 tok/s
- **Best für**: Premium Users, komplexe Narratives, Passion System

---

## 🔧 QUANTISIERUNG GUIDE

### Q4_K_M ist der Standard ✅

```
Q4_K_M = 4-bit Quantization (K-Means optimiert)
- 75% VRAM-Reduktion vs FP16
- 95%+ Quality retention
- Best Performance/Quality Ratio
- DEFAULT für alle Ollama-Modelle
```

### VRAM-Bedarf nach Quantisierung

| Modell | Q3 | Q4_K_M ⭐ | Q5 | Q6 | Q8 |
|--------|-----|----------|-----|-----|-----|
| Amoral-Gemma 3B | 2.5 GB | 3 GB | 3.8 GB | - | - |
| Hermes 3 8B | 4 GB | 5.5 GB | 6.5 GB | 7.5 GB | 8.5 GB |
| Qwen3 30B | 12 GB | 18 GB | 22 GB | 26 GB | 50 GB |

---

## 🚀 INSTALLATION QUICK-START

### 1. Ollama Installieren
```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.ai/install.sh | sh

# Windows
# Download: https://ollama.ai/download
```

### 2. Hermes 3 (Empfohlen) Laden
```bash
ollama pull hermes3
# ⏳ 5-10 Min (5 GB Download)
```

### 3. In Aria Testen
```bash
# Terminal 1: Ollama starten
ollama serve

# Terminal 2: Hermes 3 testen
curl http://localhost:11434/api/generate \
  -d '{"model":"hermes3","prompt":"Test"}'
```

### 4. VRAM-Optimierung (falls Probleme)
```bash
# Q3_K_M für sehr kleinen VRAM
ollama create hermes3-q3 --quantize q3_k_m hermes3

# Q5_K_M für bessere Qualität
ollama create hermes3-q5 --quantize q5_k_m hermes3
```

---

## 📋 HARDWARE REQUIREMENTS

### LOW-END (3-4 GB VRAM)
| Komponente | Spezifikation |
|-----------|--------------|
| GPU | GTX 1050, RTX 3050, Integrated |
| RAM | 8 GB |
| CPU | i5/Ryzen 5 (4+ cores) |

### MID-END (6-8 GB VRAM)
| Komponente | Spezifikation |
|-----------|--------------|
| GPU | RTX 4060, 4060 Ti, 3060 |
| RAM | 12-16 GB |
| CPU | Ryzen 5 5500+, i7-10700+ |

### HIGH-END (16-24 GB VRAM)
| Komponente | Spezifikation |
|-----------|--------------|
| GPU | RTX 4090, 4080, 3090 Ti |
| RAM | 24-32 GB |
| CPU | Ryzen 7 5800X+, i7-12700+ |

---

## 🎯 FÜR ARIA INTEGRATION

### In main.js oder config:
```javascript
const OLLAMA_MODELS = {
  lowEnd: {
    name: "amoral-gemma-3b",
    vram: "2.5-3.5 GB",
    roleplayScore: 4.5,
    nsfw: true
  },
  standard: {
    name: "hermes3",
    vram: "5-6 GB", 
    roleplayScore: 5,
    nsfw: 4,
    context: "128k"
  },
  premium: {
    name: "qwen3-30b-a3b",
    vram: "17-20 GB",
    roleplayScore: 5,
    nsfw: 5,
    context: "128k",
    reasoning: 5
  }
};

// Auto-detect best model based on hardware
const DEFAULT_MODEL = detectOptimalModel(); // hermes3 default
```

### Tutorial Generator Prompt (für AI Agent):
```markdown
DU BIST: Tutorial-Schreib-Agent für Aria

VERFÜGBARE MODELLE:
- Low: Amoral-Gemma 3B (3GB VRAM)
- Mid: Hermes 3 8B (5-6GB VRAM) ⭐
- High: Qwen3 30B (17-20GB VRAM)

FORMAT:
# Tutorial: [Model] Installation
## Was brauchst du?
## Installation (4 Schritte)
## Test
## Troubleshooting
## Performance-Tipps

SPRACHE: Deutsch | LEVEL: Anfänger | LÄNGE: 5 Min max
```

---

## 📚 RESSOURCEN

- **Ollama Docs**: https://ollama.ai/docs
- **Hugging Face GGUF Models**: https://huggingface.co/search?q=gguf
- **Nous Hermes**: https://nousresearch.com/hermes3/
- **Qwen Models**: https://github.com/QwenLM/Qwen3
- **LocalLLM Community**: https://reddit.com/r/LocalLLaMA

---

## ✅ NÄCHSTE SCHRITTE FÜR ARIA

- [x] Modellempfehlungen dokumentieren
- [ ] In-App Modell-Switcher UI
- [ ] Auto-Quantization Selector (Q4_K_M default)
- [ ] Performance-Monitor (tok/s, VRAM usage)
- [ ] Tutorial Generator mit AI Agent
- [ ] Model-spezifische Prompts für Passion System

---

**Letzte Aktualisierung**: Januar 2026  
**Models**: Hermes 3 8B (Standard), Amoral-Gemma 3B (Budget), Qwen3 30B (Premium)  
**Status**: ✅ Production-Ready für Aria v0.3+
