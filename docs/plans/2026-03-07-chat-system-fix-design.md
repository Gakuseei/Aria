# Chat System Fix — Design Doc

**Date:** 2026-03-07
**Problem:** After the Passion Rework, all characters respond generically. Passion meter stuck at 0. Character instructions get overridden by passion tier rules.

## Root Causes

1. **Passion scoring always returns 0** — `scorePassionLLM` sends requests without `num_ctx`, causing Ollama VRAM re-allocation and timeouts
2. **Passion tiers override character identity** — Shy tier (0-15) tells ALL characters to "refuse advances" regardless of their instructions (e.g., a Sex Slave persona told to refuse)
3. **All 3 personality branches shown** — Model sees SHY + BALANCED + BOLD instructions for every tier, gets confused about which to follow
4. **System prompt too verbose** — 6 tiers × 3 personalities × detailed examples = model loses focus

## Design: "Character First, Passion Second"

### Core Principle
**Character instructions are sacred.** The user's creative vision defines WHAT the character does. Passion only controls HOW EXPLICITLY the writing describes it.

### Passion as Intensity Dial

The passion system controls **writing intensity** — not character behavior.

| Level | Tier | Writing Style | Example (same obedient character) |
|---|---|---|---|
| 0-15 | Shy | Subtle, hinted, innocent framing | *her cheeks warm as she does as told* |
| 16-35 | Curious | More physical awareness, building tension | *a shiver runs through her as she complies, skin tingling* |
| 36-55 | Flirty | Open sensuality, deliberate detail | *bites her lip, a soft sound escaping as she follows the command* |
| 56-75 | Heated | Explicit descriptions, heavy breathing | *moans softly, body responding eagerly, heat pooling between her thighs* |
| 76-85 | Passionate | Full graphic detail, raw and visceral | *cries out, trembling with need, every nerve on fire* |
| 86-100 | Primal | No holds barred, guttural, animalistic | (unrestricted — match or exceed user's energy) |

### What Changes in Block 4

**Before (broken):**
```
IF SHY CHARACTER:
- Refuse advances with shock
- Redirect to innocent activities
- Physical contact makes you flinch
```

**After (fixed):**
```
PASSION INTENSITY: SHY (0-15)
Writing style: Subtle, gentle, suggestive rather than explicit.
- Use soft language: hints, blushes, warmth, gentle sensations
- Describe reactions through small physical tells (trembling hands, catch of breath)
- Keep explicit vocabulary minimal — let subtext carry the tension
- NEVER override the character's personality or instructions
```

### Personality Branch — Simplified

Instead of 3 full branches per tier, add ONE line based on character's passionProfile:
- Profile ≤ 0.5: "This character's persona is reserved — their intensity builds slowly"
- Profile ≤ 0.8: "This character's persona is balanced — they match the user's energy"
- Profile > 0.8: "This character's persona is forward — they lead with confident energy"

### Priority Chain (explicit in prompt)

```
1. CHARACTER INSTRUCTIONS (user-created persona) — HIGHEST PRIORITY
2. CHARACTER SYSTEM PROMPT (personality, speech patterns)
3. PASSION INTENSITY (writing explicitness level)
4. UNIVERSAL RULES (first person, formatting, no AI speech)
```

### Scoring Fix

- Add `num_ctx` to `scorePassionLLM` matching the main chat's context
- Keep scoring timeout at 15s (adequate given main response is ~11s)
- Ensure scoring prompt is concise for reliable number extraction

### Prompt Size Reduction

- Each passion tier: 5-8 lines max (down from 20-30)
- Remove all behavior dictation from tiers
- Remove redundant examples (model doesn't need 3 examples per tier)
- Single personality hint line (not 3 full branches)
- Estimated savings: ~60% of Block 4 size

## Model-Size-Aware Prompt Scaling

The system prompt adapts to the model's context window:

| Context Window | Prompt Budget | Strategy |
|---|---|---|
| ≤ 2048 (0.9B) | ~400 tokens | Character systemPrompt + 3-line rules + 1-line passion |
| ≤ 4096 (2B-3B) | ~800 tokens | Character full + compact rules + 1-line passion |
| ≤ 8192 (7B) | ~1500 tokens | Character full + medium rules + short passion tier |
| > 8192 (9B+) | ~2500 tokens | Full 4-block system (current, but slimmed) |

**Key rule:** Character instructions ALWAYS get priority token budget. Universal rules shrink first.

## Persona Library Compatibility

Any persona with standard fields works automatically:
- `name`, `description`, `systemPrompt`, `instructions`, `passionProfile`
- No hard-coded character behavior in the system
- System is genre-agnostic (NSFW, clean RP, fantasy, detective, etc.)

## Files Changed

- `src/lib/api.js` — Rewrite Block 4, fix `scorePassionLLM`, add priority chain, add model-size scaling
- No other files need changes (PassionManager.js scoring logic is fine, ChatInterface.jsx flow is fine)

## Success Criteria

1. Characters respond exactly as their instructions define — a maid is a maid, a slave is a slave
2. Passion meter actually moves (scoring works)
3. As passion rises, writing becomes more explicit — but character stays in persona
4. Custom user-created characters work identically to built-in ones
