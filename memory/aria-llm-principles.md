# Aria LLM Principles (2026-04-05)

This is the practical Aria-specific translation of `memory/model-research.md`.

Goal:
Use what we learned about LLMs to make Aria feel more consistent, immersive, and premium in real roleplay use, especially on smaller local models.

## Core truth

Aria will not become great by one better prompt alone.

Aria quality is mostly determined by:
1. model choice and finetune
2. prompt assembly quality
3. memory design
4. token-budget discipline
5. decoding defaults
6. UX that helps the model stay coherent

If one of those is weak, the others can only partially compensate.

## What Aria should believe by default

### 1. Long context is not memory
A huge transcript is not a memory system.
Older turns get clipped, middle turns lose salience, and nuance gets washed out.

Aria implication:
- do not trust raw history alone for continuity
- keep active scene state separate
- keep episodic memory separate
- keep stable canon separate

### 2. Small local models need simpler targets
7B to 14B local models are much more sensitive to:
- prompt clutter
- weak persona signal
- output complexity
- long noisy histories
- bad chat formatting

Aria implication:
- use fewer, clearer rules
- keep prompts compact
- prefer simple hidden schemas
- avoid asking the model to do too many jobs at once

### 3. Persona quality sets a hard ceiling
A muddy persona cannot reliably produce premium output.

Aria implication:
- strong built-in personas matter
- custom personas need a minimum quality floor
- compact, high-signal character identity is better than bloated prose

### 4. The model does not preserve subtle emotional state on its own
Without help, emotional continuity fades fast.

Aria implication:
- track emotional afterstate explicitly
- track relationship delta explicitly
- retrieve those states when relevant

### 5. POV integrity is a top-tier product requirement
If Aria confuses who is acting or speaking, immersion breaks immediately.

Aria implication:
- treat user-action narration and ownership confusion as severe failures
- keep POV constraints close to generation time
- do not let malformed outputs become future context

## The Aria memory model

Aria should treat memory as 4 layers.

### Layer 1: Canon memory
Persistent, stable facts.

Examples:
- character identity
- world rules
- long-term relationship facts
- user pronouns and persistent preferences
- hard scenario facts

Rules:
- compact
- curated
- editable
- never filled with loose chatter

### Layer 2: Episodic memory
What happened in important scenes or chapters.

Examples:
- major confessions
- arguments
- promises
- betrayals
- injuries
- plot reveals
- relationship shifts

Rules:
- summarize scenes, not every message
- keep causality and emotional tone
- store unresolved threads

### Layer 3: Active scene state
What matters right now.

Examples:
- location
- who is present
- current emotional temperature
- current physical state
- unresolved actions
- what just happened
- what the character is trying to do

Rules:
- very compact
- very recent
- injected close to generation
- updated often

### Layer 4: Retrieval layer
A selector, not a dump.

Rules:
- inject only a few relevant memories
- prefer relevance over quantity
- prefer current-scene fit over broad lore spam
- if two memories conflict, resolve before injection

## Recommended prompt assembly priorities for Aria

Best practical order:

1. system non-negotiables
2. app behavior rules
3. compact character identity
4. stable relationship facts
5. relevant canon / retrieved long-term memory
6. active scene state
7. latest user turn
8. final response rules

Important notes:
- stable rules should not be buried under chat history
- active scene state should be near the end
- latest user turn should stay late
- the app must preserve clear role formatting

## What prompt instructions should focus on

Good Aria instructions are:
- short
- concrete
- prioritized
- testable

Best kinds of rules:
- preserve scene continuity
- preserve relationship continuity
- stay in character
- do not narrate user actions unless already committed
- keep tone natural and grounded in the latest beat
- write only the character's next reply

Bad kinds of rules:
- dozens of tiny style nags
- vague phrases like "be amazing" or "be immersive"
- contradictory instructions across layers
- giant persona dumps with weak priorities

## What decoding should do in Aria

Decoding should support the product goal, not just maximize randomness.

### Roleplay default intent
Aria should feel:
- expressive
- natural
- emotionally alive
- but still stable

Good starting shape:
- moderate temperature
- moderately open top-p
- mild repetition penalty
- moderate max tokens
- stop strings enabled

Why:
- too low temperature becomes bland
- too high temperature causes drift and hallucination
- too much repetition penalty harms voice
- too many output tokens increases monologues and scene hijacking

### Aria product rule
Do not use one global preset for every model.

Aria should maintain per-model-family guidance for:
- weaker small local models
- balanced mid-tier models
- stronger large models

## Structured output vs visible reply in Aria

Best pattern:
- hidden structured control
- visible plain-text roleplay

Structured hidden tasks:
- scene-state update
- memory extraction
- relationship delta
- emotion tagging
- quick suggestions
- safety / parser tasks

Plain-text visible tasks:
- the actual in-character reply
- emotional beats
- sensual or dramatic rhythm
- dialogue flow
- subtext

Aria rule:
- never over-structure the visible reply just to make parsing easier
- instead, structure the hidden control layer

## The main Aria failure modes to guard against

### 1. User POV drift
Signs:
- the reply narrates the user's actions
- suggestions sound like the character instead of the user
- ownership gets swapped

Likely causes:
- weak role formatting
- late or weak POV rule
- history contamination from prior malformed output

### 2. Character blandness
Signs:
- generic assistant tone
- no distinct rhythm or attitude
- emotionally flat flirtation or filler

Likely causes:
- weak persona signal
- overly conservative decoding
- too many control rules flattening the style

### 3. Emotional discontinuity
Signs:
- the character's feelings reset between turns
- major scenes have no emotional aftereffect

Likely causes:
- no explicit emotional state tracking
- summaries that preserve event but not affect
- overreliance on latest user turn

### 4. Scene amnesia
Signs:
- wrong location details
- forgotten injuries or positions
- continuity breaks in objects and actions

Likely causes:
- active scene state not maintained
- too much raw history, not enough compact current state

### 5. Style collapse over time
Signs:
- replies start strong but become generic after several turns
- distinct voice washes into neutral prose

Likely causes:
- weak examples or persona anchor
- long noisy transcript
- model self-conditioning on its own weaker later outputs

## What Aria can realistically improve

Aria can improve a lot through product work.

High-confidence product wins:
- better persona compaction
- better scene-state tracking
- better episodic memory
- better prompt ordering
- per-model decoding presets
- rerolls tied to real failure modes
- better POV validation
- visible memory correction tools

## What Aria probably cannot fully fix with prompting alone

These are mostly model-ceiling problems:
- subtle long-horizon emotional arcs
- premium-quality initiative on weak models
- very stable voice over long sessions without memory help
- highly nuanced multi-character scenes on weaker models
- making bad custom personas always perform well

## Product patterns Aria should prefer

### Strong patterns
- pinned memory facts
- editable relationship memory
- compact chapter summaries
- visible scene state when needed
- checkpointing / branching
- rerolls like:
  - more in character
  - more emotionally grounded
  - shorter
  - bolder
  - preserve scene continuity
  - do not narrate my actions
- context reset without identity reset
- model-aware defaults

### Weak patterns
- giant raw transcript replay
- giant lore dumps every turn
- one universal preset for all models
- huge visible JSON-like reply constraints
- assuming the model remembers without retrieval

## Quality bar for Aria

A good Aria reply should satisfy all of these at once:
- correct POV
- in-character tone
- continuity with the latest scene
- continuity with relationship state
- emotionally plausible response
- natural pacing
- no obvious repetition
- no generic assistant leakage

If a reply is stylish but fails continuity, it is not good enough.
If a reply is coherent but bland and assistant-like, it is not good enough.
For Aria, premium means both immersion and control.

## Practical near-term rule set for Aria work

When improving any chat behavior, ask:
1. is this a model limitation or a prompt/memory/UX issue?
2. what token budget is this consuming?
3. what exact state must stay recent?
4. what can be summarized safely?
5. what should be retrieved only when relevant?
6. is the visible output plain text and the hidden control structured?
7. does this help weaker local models, not just stronger ones?

## Final principle

Aria becomes better when the app carries more of the continuity burden.

Do not expect the model alone to remember everything, preserve every emotional thread, and stay perfect over long chats.
Build the product so the model gets the right identity, the right scene state, the right memories, and the right output target at the right time.
