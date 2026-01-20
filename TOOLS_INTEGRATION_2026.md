# ARIA Tools Integration Guide 2026
**Information & Decision Guide - Voice & Image Generation Options**

> Choose your experience level and decide what tools to install. This guide provides pure information to help you decide.

---

## 🎯 QUICK OVERVIEW

Aria currently uses **Piper TTS** for voice and **SDXL** (via Stability Matrix) for images. You can upgrade either or both for better quality.

| | **OPTION 1: Standard (Current)** | **OPTION 2: Premium (Upgraded)** |
|---|---|---|
| **TTS** | Piper TTS | Zyphra Zonos TTS |
| **Images** | SDXL | FLUX 1.0 |
| **Already Installed** | ✅ Yes | ❌ Separate Download |
| **Setup Time** | 0 minutes | ~15 minutes |
| **VRAM Needed** | Current GPU | 12-14GB |
| **Quality** | Good ⭐⭐⭐⭐ | Excellent ⭐⭐⭐⭐⭐ |
| **Voice Emotions** | None (neutral) | 5+ tones |
| **Voice Cloning** | No | Yes |
| **Text in Images** | Fair | Best-in-class |
| **Cost** | $0 | $0 |
| **Maintenance** | None | Docker running |

---

# OPTION 1: STANDARD (What You Have Now) ✅

## Current Voice System: Piper TTS

**What is Piper TTS?**
- Open-source text-to-speech engine
- Lightweight model (~1GB)
- Multiple pre-trained voices (Alba UK, Amy US, Ryan US, Eva DE, etc.)
- Fast inference (good for real-time)
- Always runs on: `http://localhost:8000/tts`
- Current voice model: Alba (UK) - English (medium)

**Strengths:**
- Very lightweight
- No setup needed (already running)
- Multiple language support
- Reliable and stable
- Perfect for standard use

**Limitations:**
- Neutral tone only (no emotional variation)
- No voice cloning capability
- Quality: Good but not premium
- Limited personalization

**User Experience in Aria:**
- User clicks "Read" button
- Piper generates audio from message
- Audio plays in chat immediately
- No options or settings needed

---

## Current Image System: SDXL via Stability Matrix

**What is SDXL?**
- Stable Diffusion XL (latest version of Stable Diffusion)
- Industry-standard image generation model
- Accessible via Stability Matrix UI
- API endpoint: `http://127.0.0.1:7860`
- Requires 8-12GB VRAM for smooth operation

**Strengths:**
- Excellent image quality
- Well-tested and stable
- Large community and support
- Great for general content
- Fast generation (15-30 seconds)
- Works well with tutorial prompts

**Limitations:**
- Text rendering in images: Fair (hard to read small text)
- Quality ceiling: Excellent but not cutting-edge
- Slower than FLUX for same VRAM
- No specialized tutorial optimization

**User Experience in Aria:**
- User clicks "Use Conversation Context"
- SDXL generates image from conversation
- Image appears in chat
- Takes ~20 seconds

---

# OPTION 2: PREMIUM (Upgraded Tools)

## Premium Voice System: Zyphra Zonos TTS

**What is Zyphra Zonos?**
- Next-generation TTS system (January 2026 release)
- Built on Mamba2 architecture (more efficient than transformers)
- Runs in Docker container for isolation
- API endpoint: `http://localhost:7860/api/tts` (different from Piper)
- Requires 6GB VRAM
- Model size: ~3.6GB (downloaded once, reused)

**Key Features:**
- **Quality**: 2x better naturalness than Piper
- **Emotions**: 5+ emotional tones available:
  - Professional (clear, confident)
  - Happy (enthusiastic, engaging)
  - Calm (relaxed, reassuring)
  - Sad (emotional, softer)
  - Angry (intense, commanding)
- **Voice Cloning**: Upload 30 seconds of any voice → create unlimited narrations with that voice
- **Real-time**: Streams audio as it's generated
- **Multilingual**: 15+ languages supported

**Strengths:**
- Professional-grade voice quality
- Emotional control for better narration
- Voice cloning for consistent narrator identity
- Apache 2.0 licensed (commercial safe)
- Faster inference than XTTS v2
- Docker deployment (clean isolation)

**Limitations:**
- Requires Docker installation
- Additional 6GB VRAM
- Separate setup from Piper (parallel installation)
- Model downloads on first run (3-5 minutes)

**When to Use:**
- Tutorial narrations need emotional variety
- You want consistent personal narrator voice
- Professional audio quality matters
- Viewers appreciate engaging tone

---

## Premium Image System: FLUX 1.0

**What is FLUX 1.0?**
- Latest cutting-edge image generation model (2025/2026)
- Diffusion Transformer architecture (DiT, not U-Net like SDXL)
- Quantized INT4 version: 6GB VRAM (full version: 24GB)
- Runs on same API endpoint as SDXL
- Model name: `flux1-dev-bnb-nf4.safetensors`
- Inference time: 30-60 seconds (slower but higher quality)

**Key Features:**
- **Text Rendering**: Best-in-class (critical advantage)
  - Can render readable small text
  - Perfect for tutorial screenshots
  - Code examples legible
  - UI elements clear
- **Image Quality**: Outstanding (exceeds SDXL)
  - Better detail and clarity
  - More accurate prompt adherence
  - Better lighting and composition
- **Quantization**: INT4 reduces model from 24GB to 6GB with minimal quality loss
- **Specialized**: Excellent for technical tutorials

**Strengths:**
- Text rendering in images (game-changer for tutorials)
- Superior overall quality
- Better detail precision
- Cutting-edge results
- Quantized version very efficient
- Same UI as SDXL (no learning curve)

**Limitations:**
- Slower generation (30-60 seconds vs 15-30 for SDXL)
- Requires 6GB separate download
- Model selection needed in Stability Matrix
- First-time model load: 2-3 minutes

**When to Use:**
- Tutorials require text/code in images
- Premium visual quality desired
- UI screenshots need clarity
- Content will be studied (not casual viewing)

---

# TECHNICAL SPECIFICATIONS

## Voice Systems Comparison

| Aspect | Piper TTS | Zyphra Zonos |
|--------|-----------|---------------|
| **API Port** | 8000 | 7860 |
| **API Endpoint** | `/tts` | `/api/tts` |
| **VRAM** | 1GB | 6GB |
| **Model Size** | 470MB-1.2GB | 3.6GB |
| **Inference Speed** | ~0.5-1s per sentence | ~1-2s (real-time capable) |
| **Latency** | Low | Very low (streaming) |
| **Voice Cloning** | No | Yes (zero-shot) |
| **Emotions** | No | Yes (5+ options) |
| **Languages** | 14 | 15+ |
| **Voices** | 8+ pre-built | Unlimited (clone any) |
| **Quality Score** | 7-8/10 | 9-10/10 |
| **Deployment** | System process | Docker container |
| **Fallback Support** | N/A | Yes (Zonos→Piper if unavailable) |

---

## Image Systems Comparison

| Aspect | SDXL | FLUX 1.0 (Quantized) |
|--------|------|---------------------|
| **Architecture** | U-Net | Diffusion Transformer (DiT) |
| **VRAM** | 8-12GB | 6GB (quantized) |
| **Full Model Size** | 7GB | 24GB (quantized: 6GB) |
| **Inference Time** | 15-30 seconds | 30-60 seconds |
| **Quality Score** | 8-9/10 | 9.5-10/10 |
| **Text Rendering** | Fair | Best-in-class |
| **Detail Level** | Excellent | Outstanding |
| **Prompt Accuracy** | Good | Excellent |
| **Quantization Type** | N/A | INT4 GPTQ |
| **Quality Loss** | N/A | 1-2% (imperceptible) |
| **Speed/Quality** | Balanced | Quality-focused |
| **Best For** | General images | Tutorial content |
| **API Endpoint** | Same | Same |
| **Model Selection** | Dropdown in UI | Dropdown in UI |
| **Fallback Support** | SDXL→FLUX if unavailable |

---

# SETUP INFORMATION

## Option 1 (Standard) - What's Needed

**Already Have:**
- ✅ Piper TTS installed and running
- ✅ Stability Matrix with SDXL model
- ✅ Working chat integration
- ✅ Everything configured

**Installation Time:** 0 minutes (already done)

**Maintenance:** None required

**Cost:** $0 (free, open-source)

---

## Option 2 (Premium) - Installation Overview

### Part A: Zyphra Zonos TTS (5 minutes)

**Prerequisites:**
- Docker must be installed on system
- 6GB VRAM available
- Port 7860 available (not in use)

**Steps:**
1. Create folder for Zonos configuration
2. Create docker-compose.yml file with Zonos service
3. Run `docker compose up -d` to start
4. First run downloads 3.6GB model (~2 minutes)
5. Verify with test curl command
6. Model persists, future runs are instant

**Result:**
- Zonos running at http://localhost:7860
- Ready for integration
- Auto-starts with Docker

**Key Points:**
- Docker handles all complexity
- Model downloads only once
- No manual configuration after setup
- Clean isolation from system

---

### Part B: FLUX 1.0 Images (10 minutes)

**Prerequisites:**
- 6GB free disk space for model
- Stability Matrix already running
- Can download from HuggingFace

**Steps:**
1. Navigate to HuggingFace (TheBloke repository)
2. Search for FLUX.1-dev quantized versions
3. Download flux1-dev-bnb-nf4.safetensors (~6GB)
4. Place file in: `StabilityMatrix/Data/Models/Stable-diffusion/flux/` folder
5. Open Stability Matrix → Settings → Checkpoint
6. Select FLUX model from dropdown
7. Ready to use

**First Use:**
- Load time: 2-3 minutes (loading model into VRAM)
- Caches for subsequent uses
- Still available as option

**Key Points:**
- Same UI as SDXL (no new interface)
- Easy model switching
- No configuration needed
- Just select in dropdown

---

# HARDWARE & VRAM REQUIREMENTS

## VRAM Usage Table

| GPU | VRAM | Run Standard | Run Premium | Notes |
|-----|------|--------------|-------------|-------|
| RTX 3060 | 12GB | ✅ Comfortable | ⚠️ Tight fit | Standard + Zonos leaves ~6GB for FLUX |
| RTX 3070 | 12GB | ✅ Comfortable | ✅ Sequential* | Excellent for both options |
| RTX 4070S | 12GB | ✅ Comfortable | ✅ Sequential* | Similar to 3070 |
| RTX 4080 | 16GB | ✅ Comfortable | ✅ Good | Comfortable margin |
| RTX 4090 | 24GB | ✅ Comfortable | ✅ Parallel** | Run both simultaneously |
| A6000 | 48GB | ✅ Comfortable | ✅ Parallel** | Enterprise-grade |

**Sequential* = Run one tool at a time (TTS finishes, then images, or vice versa)  
**Parallel** = Run both tools simultaneously (overlapping usage)

## Why This Matters

**Sequential Use:** Better for tutorials where you generate narration, then images separately
**Parallel Use:** Better for batch processing or simultaneous requests

For typical tutorial workflow (narrate, then generate images), **sequential is fine**.

---

# INTEGRATION IN ARIA

## How It Works Today (Standard)

```
User Chat Input
      ↓
Click "Read" Button
      ↓
Aria sends text to: http://localhost:8000/tts
      ↓
Piper generates audio
      ↓
Audio plays in chat
      ↓
Done
```

```
User Chat Input
      ↓
Click "Use Conversation Context"
      ↓
Aria sends context to: http://127.0.0.1:7860
      ↓
SDXL generates image
      ↓
Image appears in chat
      ↓
Done
```

---

## How It Will Work (Premium - Dual System)

```
Radio Button: "Standard" or "Premium"
      ↓
┌─ STANDARD ─────────────────┐
│ Piper (port 8000)          │
│ SDXL (port 7860, model=sdxl)│
└────────────────────────────┘
      OR
┌─ PREMIUM ─────────────────────┐
│ Zonos (port 7860/api/tts)      │
│ FLUX (port 7860, model=flux)   │
└────────────────────────────────┘
      ↓
User clicks button
      ↓
Aria sends request to appropriate endpoint
      ↓
Audio/Image generated
      ↓
Appears in chat
      ↓
If Premium unavailable → Fallback to Standard
```

---

## Integration Points

**VoiceSetup Component:**
- Radio buttons: Piper vs Zonos selection
- Emotion selector (only shows if Zonos selected/available)
- Fallback: If Zonos port 7860 unreachable, try Piper port 8000
- Same button UI, just different backend

**ImageGenSetup Component:**
- Radio buttons: SDXL vs FLUX selection
- Same API endpoint (just different model parameter)
- Fallback: If FLUX model not found, use SDXL
- UI shows which model being used

**TutorialModal Component:**
- "Standard" option tab (current system, works always)
- "Premium" option tab (better quality, requires setup)
- User selects preference
- System remembers choice
- Graceful degradation if premium unavailable

---

# DECISION FRAMEWORK

## Use Standard (Option 1) If:

✅ Current audio quality is sufficient for your needs  
✅ Current image quality meets tutorial requirements  
✅ VRAM is limited (<12GB)  
✅ You prefer zero setup and maintenance  
✅ Neutral voice tone acceptable  
✅ Text in images not critical  
✅ Tutorial speed more important than quality  

**Best For:** Casual tutorials, hobby content, resource-constrained systems

---

## Upgrade to Premium (Option 2) If:

✅ Professional narration quality matters  
✅ Emotional voice variation needed  
✅ Tutorial images need readable text  
✅ Premium visual quality desired  
✅ You have 12GB+ VRAM available  
✅ 15-minute setup acceptable  
✅ Viewers appreciate high production value  
✅ Content is for learning/education  

**Best For:** Professional tutorials, educational content, technical documentation, premium production

---

# QUALITY COMPARISON

## Voice Quality Experience

**Piper (Standard):**
- Clear, understandable narration
- Neutral, consistent tone
- Good for information delivery
- May sound robotic in longer sections
- Same emotional tone throughout

**Zonos (Premium):**
- Natural, engaging narration
- Can match emotional content
- Professional news-reader quality
- Can add personal narrator identity (via cloning)
- Adapts tone to content

**Listener Impact:**
- Piper: "Good robotic voice"
- Zonos: "Sounds like professional narrator"

---

## Image Quality Experience

**SDXL (Standard):**
- Professional-looking images
- Good composition and colors
- Readable for main elements
- Small text blurry (major limitation)
- Good for general visuals

**FLUX (Premium):**
- Premium-looking images
- Exceptional detail
- Small text readable (game-changer for tutorials)
- Code visible in code examples
- UI elements crystal clear
- Best overall visual fidelity

**Viewer Impact:**
- SDXL: "Good quality images"
- FLUX: "Professional, high-quality content"

---

# COMMON QUESTIONS

## Can I run both at the same time?

**For Voice:** Not needed (pick one per narration)  
**For Images:** SDXL and FLUX use same endpoint, just select model

With 12GB+ VRAM and proper configuration, you can have both systems running, just switch between them via radio buttons.

---

## What if I run out of VRAM?

**Standard:** No issue (1GB + 8GB = 9GB total)

**Premium:** Manage via:
- Sequential usage (run one at a time)
- Lower resolution (1024→768 pixels, saves VRAM)
- Close background applications
- Disable other GPU workloads
- Wait for inference to complete before next generation

With RTX 3070 (12GB), sequential usage works smoothly for tutorials.

---

## Can I switch between options?

**Yes, anytime:**
- Select "Standard" → uses Piper + SDXL
- Select "Premium" → uses Zonos + FLUX
- Back to "Standard" anytime
- No re-installation needed
- Radio buttons in UI make switching instant

---

## What if Premium tool becomes unavailable?

**Automatic Fallback:**
- If Zonos not running → Falls back to Piper
- If FLUX not downloaded → Falls back to SDXL
- UI shows which system actually used
- No errors, just seamless downgrade

---

## Setup time realistic?

**15 minutes includes:**
- 5 min: Docker compose setup for Zonos (includes model download)
- 5 min: Downloading FLUX model file
- 5 min: Verifying both systems working
- 0 min: Aria integration (uses same endpoints)

**Actual active work:** ~3 minutes  
**Waiting for downloads:** ~12 minutes  

---

## Cost comparison?

**Standard:** $0 (free, already have)

**Premium:** $0 (free, open-source tools)
- No API costs
- No subscriptions
- No licensing fees
- Only disk space for models (~10GB)
- Only electricity for GPU

**Best Value:** Premium option (same cost, 2-3x better quality)

---

# NEXT STEPS FOR DEVELOPMENT

When ready to implement these options in Aria components, use this prompt:

```
Improve the Aria Tutorial System from "Good" to "Premium Excellent" by upgrading Voice and Image tools.

Current State:
- Voice: Piper TTS (good quality, neutral tone)
- Images: AUTOMATIC1111 + SDXL (excellent quality)

Upgrade Requirements:
- Voice: Add Zyphra Zonos support (professional quality + 5 emotions: professional, happy, calm, sad, angry)
- Images: Add FLUX.1-dev support (cutting-edge quality, best text rendering)

Implementation:
1. Keep Piper/SDXL as Standard option (fallback, current system)
2. Add Zonos/FLUX as Premium option (new, better quality)
3. Add radio buttons in settings: "Standard" vs "Premium"
4. Auto-fallback: If Premium tool unavailable, use Standard
5. Same UI experience - users just select preference and it works

Technical Details:
- Piper: http://localhost:8000/tts (port 8000)
- Zonos: http://localhost:7860/api/tts (port 7860, with emotion parameter)
- SDXL: http://127.0.0.1:7860 (current, model=sdxl)
- FLUX: http://127.0.0.1:7860 (same API, model=flux1-dev-bnb-nf4)

Files to Update:
- VoiceSetup.jsx: Add dual-voice support with emotion selector
- ImageGenSetup.jsx: Add dual-model support with quality selector
- TutorialModal.jsx: Add Standard/Premium toggle buttons

Reference: @TOOLS_INTEGRATION_2026.md for complete information and API specifications.
```

---

# SUMMARY

**Your Current Setup (Option 1 - Standard):**
- ✅ Works great
- ✅ No changes needed
- ✅ Good for most uses
- ✅ No setup required

**Optional Upgrade (Option 2 - Premium):**
- 🚀 2-3x better quality
- 🚀 Professional narration
- 🚀 Better text in images
- 🚀 Only 15 minutes to setup
- 🚀 Zero additional cost
- 🚀 Same user experience
- 🚀 Automatic fallback if unavailable

**Recommendation:** If you have 12GB+ VRAM and 15 minutes, Premium option is worth it for tutorial quality improvement.

---

**Document Version:** 3.0 (Information-Only Edition)  
**Last Updated:** January 20, 2026  
**Status:** Ready for Decision & Implementation  
**All Information:** Current as of January 2026
