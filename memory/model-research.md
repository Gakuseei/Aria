# Model Research for Roleplay Chat Apps (2026-04-05)

Practical research on how modern LLMs actually behave in a roleplay-oriented chat product, and what most strongly determines quality, immersion, consistency, and long-term coherence.

## Executive Summary

The biggest determinants of roleplay quality are usually not one magic prompt or one sampler knob.

In practice, quality is mostly set by this stack, in roughly this order:

1. Base model and finetune quality
   - The model family, size, training mix, chat template, and finetune style set the ceiling.
   - A weak or badly matched model cannot be fully rescued by prompting.

2. Prompt packing and role formatting
   - How system, developer/app rules, persona, scene state, retrieved memories, and the latest user turn are assembled matters a lot.
   - Bad ordering or flattened role separation causes POV drift, weak obedience, and generic assistant leakage.

3. Memory architecture
   - Long-term coherence does not come from a giant raw transcript alone.
   - Good apps separate stable canon, relationship memory, episodic summaries, and current scene state.

4. Token budget management
   - Context window size is a hard budget, not free intelligence.
   - Old turns get clipped, middle content gets ignored, and overly fat prompts reduce output quality.

5. Decoding settings
   - Temperature, top-p, repetition penalty, and max tokens strongly affect creativity, obedience, repetition, and drift.
   - These settings can noticeably improve or damage output, but they do not replace a good model and good memory design.

6. UX scaffolding
   - Pinned facts, chapter summaries, reroll modes, branch points, short-turn defaults, and explicit scene state can make imperfect models feel far better.

Practical bottom line:
- A roleplay app gets the best results from a hybrid design.
- Use structured hidden state for memory and control.
- Use plain text for the final visible reply.
- Keep the active scene compact.
- Retrieve only the most relevant memories.
- Assume long conversations degrade unless the app actively repairs continuity.

## 1. How tokenization works, and why tokens matter

LLMs do not process words directly. They process tokens: chunks of text created by a model-specific tokenizer.

In practice:
- Common words may be one token or a few tokens.
- Rare names, stylized formatting, emoji, repeated punctuation, and mixed-language text may split into many tokens.
- Different model families tokenize the same text differently.

Why this matters in a roleplay app:
- Cost: more tokens means more compute and, for cloud models, more money.
- Context use: tokens spent on wrappers, logs, labels, or bloated persona text are tokens not spent on actual conversation.
- Style: heavily formatted prompts, excessive markdown, long speaker headers, and repetitive transcript framing waste budget.
- Failure modes: awkward token boundaries, overlong names, repetitive formatting, and giant cards can increase clipping and weaken continuity.

Practical examples:
- A rich but concise character description can help immersion.
- A bloated card full of decorative syntax, repeated headings, or redundant trait lists mostly burns budget.
- Repeating `Character:`, `User:`, long timestamps, and tool traces in every turn silently eats context.

Product implications:
- Measure token counts for the full assembled prompt, not just visible chat text.
- Keep stable character data compact and high-signal.
- Avoid token-wasteful syntax when the model does not benefit from it.
- Expect different token footprints across Llama, Mistral, Qwen, Gemma, GPT-family, and Claude-family models.

What tokens strongly affect:
- Cost and latency
- How much history fits
- How much room remains for reply generation
- Whether instructions or scene facts get clipped
- Whether style guidance is strong enough to survive long chats

## 2. How context windows work in practice

A context window is the model's temporary working text buffer for one generation.

Important practical reality:
- The window is shared by everything: system prompt, app instructions, persona, memory snippets, chat history, retrieved lore, and the model's own reply budget.
- If the assembled prompt is too large, something is clipped or compressed.
- Bigger windows help, but quality inside them is uneven.

What actually happens in long chats:
- Primacy effect: some models are good at using content near the beginning.
- Recency bias: most models strongly favor the most recent turns.
- Lost-in-the-middle: important information buried in the middle is often used worst.
- Clipping: oldest turns can fall out completely.
- Context rot: even when text still fits, the model may stop using it reliably.

This means:
- An app can technically keep 50k or 100k tokens in context and still get weak continuity.
- "Fits in the window" is not the same as "the model will use it well."

Practical examples:
- Early canon says the character is terrified of fire.
- Mid-chat, that fact sits buried inside thousands of tokens.
- The latest few turns are flirtatious banter.
- The model suddenly has the character casually light a candle because the fire fact is no longer salient.

Another example:
- The user says 20 turns ago, "My left arm is injured."
- The app never re-surfaces that fact.
- The model later writes, "You grab her with both hands and pull her close."
- That is not random stupidity. It is exactly what weak long-context salience looks like.

Context-budget tradeoffs:
- More history gives continuity, but reduces output headroom.
- More lore gives world richness, but can drown the current scene.
- More instructions can improve control, but too many rules can make the model wooden or confused.

Best practical pattern:
- Keep a compact active scene state near generation time.
- Compress older history into episodic summaries.
- Retrieve only the few relevant long-term memories for the current turn.
- Reserve room for a full reply.

## 3. How memory works and does not work

LLMs do not have stable human-like memory between calls unless the app gives them memory.

There are several different things people call "memory":

### 3.1 In-context memory
This is whatever is literally inside the current prompt.

Strengths:
- Strong for immediate scene facts if placed recently and clearly.
- Cheap and simple.

Weaknesses:
- Disappears when clipped.
- Vulnerable to recency bias and lost-in-the-middle effects.
- Not persistent across sessions unless re-injected.

### 3.2 Summarized memory
This is a compact summary of older conversation history.

Strengths:
- Much more token-efficient than raw transcript replay.
- Good for preserving major events, promises, relationship shifts, and open plot threads.

Weaknesses:
- Summaries lose nuance.
- They often erase uncertainty, subtext, emotional texture, and exactly who knows what.
- Bad summaries can permanently distort future chats.

Example:
- Raw reality: "She forgave him publicly, but privately still does not trust him."
- Bad summary: "They reconciled."
- Result: later emotional beats feel fake and too cheerful.

### 3.3 Retrieved memory
This is a memory system that stores facts, summaries, or scenes outside the prompt and selectively injects the most relevant ones each turn.

Strengths:
- Much better scaling than raw long transcripts.
- Lets the app re-surface relevant lore, emotional context, and unresolved threads only when needed.

Weaknesses:
- Retrieval quality is everything.
- If the wrong memory is retrieved, or the right one is missing, the model acts on bad evidence.
- Similar memories can conflict unless the app resolves them.

### 3.4 Persistent app-level memory
This is durable storage at the application layer: database records, memory cards, relationship state, scene summaries, pinned facts, character canon, etc.

Strengths:
- This is the real source of long-term continuity in a production app.
- It can survive sessions, restarts, and long gaps.
- It allows editing, moderation, validation, and conflict resolution.

Weaknesses:
- The model still only sees what the app chooses to inject.
- Persistent memory that is never retrieved is functionally forgotten.
- Badly stored or overly noisy memory becomes another source of drift.

Best practical mental model:
- The model itself has short working memory.
- The app must provide the long-term memory system.

Recommended memory stack for roleplay:
- Stable canon memory
  - character identity, world rules, relationship facts, hard constraints
- Episodic memory
  - what happened in scene/chapter terms
- Current scene state
  - where we are, who is here, emotional temperature, unresolved actions, current goals
- Retrieval layer
  - inject only a few high-relevance memories per turn

## 4. Prompt hierarchy, and why later instructions are sometimes ignored

Modern chat APIs usually distinguish at least these layers:
- System instructions
- Developer or app instructions
- User instructions
- Tool output or retrieved text
- Assistant prior messages

Typical hierarchy in practice:
- System is strongest.
- Developer/app instructions are next.
- User instructions come after that.
- Retrieved memories and old assistant text are context, not automatically higher-authority instructions.

Why models still ignore later instructions sometimes:

1. Clipping
- The instruction may no longer be in the prompt at all.

2. Salience competition
- The instruction exists, but is buried under too much text.
- Strong recent dialogue patterns can outweigh weakly phrased rules.

3. Same-level conflict
- Later content at the same authority level can override earlier content.
- This is useful when intentional, but dangerous if the app accidentally duplicates or contradicts itself.

4. Learned priors
- The model has strong training priors for "helpful assistant" behavior, common dialogue patterns, or dominant finetune style.
- If the persona signal is weak, those priors leak through.

5. Role/template weakness
- Local models are especially sensitive to exact chat formatting.
- If the app flattens system, user, and assistant roles too loosely, instruction hierarchy gets weaker.

6. Over-constraint
- Too many micro-rules can reduce clarity.
- The model may satisfy the easiest rules and silently fail the important ones.

Practical example:
- Early developer prompt: "Always write from the character's perspective only."
- Later retrieved memory: a raw transcript line where the assistant previously narrated the user's action incorrectly.
- The model copies the recent pattern and drifts again.
- This is not because the hierarchy vanished. It is because recent evidence and local pattern continuation often dominate weak control.

Best practice:
- Put true non-negotiables high in the hierarchy.
- Put current-scene steering late and close to generation.
- Keep stable rules separate from transient scene updates.
- Do not accidentally restate contradictory instructions across layers.

## 5. What plain-text instructions influence best, and how to write them effectively

Plain-text prompting absolutely matters, but it works best when it is clear, prioritized, and compact.

What plain-text instructions influence well:
- Role and tone
- Reply style and length
- POV and narration mode
- Whether the model asks questions or takes initiative
- Output constraints like "1-3 short paragraphs" or "no bullet points"
- What kinds of facts to preserve or avoid inventing

What plain-text instructions influence less reliably:
- Deep long-term consistency by themselves
- High-quality memory retrieval without a memory system
- Emotional realism across very long sessions
- Major weaknesses of a small model

Most effective instruction-writing patterns for chat and roleplay:

1. State the role clearly
- Example: "Write the next reply as Ava. Stay fully in character."

2. State the most important priorities explicitly
- Example:
  - preserve scene continuity
  - preserve relationship continuity
  - do not narrate the user's actions unless the user already committed them

3. Separate stable rules from current scene state
- Stable: persona, relationship baseline, canon facts
- Current: location, emotional state, open actions, what just happened

4. Use concrete constraints instead of vague vibe language
- Better: "Write in close first-person, sensual but natural, 1-2 paragraphs, grounded in the latest beat."
- Worse: "Be immersive and amazing and deep and emotional and perfect."

5. Keep instruction order meaningful
- Put critical rules first.
- Put the actual user turn near the end.

6. Use lightweight structure
- Sections or XML-like tags often help.
- Example sections:
  - CHARACTER
  - WORLD
  - CURRENT SCENE
  - MEMORY
  - RESPONSE RULES

7. Use examples carefully
- Example dialogue is often the strongest way to teach voice.
- But too many examples can overfit phrasing and cause repetition.

8. Avoid stacking dozens of tiny negatives
- Too many "don't do X" rules can make text stiff.
- Prefer a few high-value prohibitions plus clear positive guidance.

A practical prompt shape for roleplay:
- App rules
- Character identity
- Relationship facts
- Current scene state
- Relevant memories
- Latest user turn
- Response rules

## 6. Sampling and decoding: what the main settings actually do

These settings do not change what the model knows. They change how it chooses among likely next tokens.

### 6.1 Temperature
Lower temperature:
- More stable
- More obedient
- More repetitive or bland
- Less emotionally alive

Higher temperature:
- More creative
- More varied
- More likely to hallucinate, drift, contradict, or overwrite tone

Practical guidance:
- Too low feels sterile.
- Too high feels sloppy.
- Roleplay usually wants moderate sampling, not near-greedy decoding.

Useful practical ranges:
- Utility or extraction tasks: lower
- Roleplay and expressive chat: moderate
- Very high values are risky unless the model is strong and the turn is short

### 6.2 Top-p
Top-p limits sampling to the most likely cumulative probability mass.

Lower top-p:
- Tighter
- Cleaner
- More obedient
- Less spark

Higher top-p:
- More varied
- More spontaneous
- More likely to pull in low-confidence tokens and unstable continuations

In practice:
- Temperature and top-p interact.
- High temperature plus very loose top-p often causes drift.

### 6.3 Repetition penalty
This discourages reusing already generated tokens.

Helpful when:
- The model loops phrases
- The character keeps repeating identical sentence openings

Dangerous when too strong:
- It can damage voice consistency.
- It can make natural repeated words, names, pet names, or speech habits feel unnatural.
- It can create thesaurus-like wording instead of authentic character voice.

Practical rule:
- Mild penalty helps.
- Aggressive penalty often harms roleplay.

### 6.4 Max tokens
This caps how long the reply can be.

Too low:
- Emotional beats get clipped
- Replies end awkwardly
- JSON or structured output truncates

Too high:
- Monologues
- Scene hijacking
- User action narration
- Perspective drift
- Repetition and degeneration

For roleplay, long output is not always better.
- A model often feels smarter and more in-character when kept to a natural scene length.

### 6.5 Stop strings and end conditions
These help prevent spillover into the next speaker or unwanted wrappers.

Useful for:
- Preventing the model from writing both sides of the conversation
- Cutting off after the character's turn
- Avoiding prompt-template leakage

### 6.6 Practical starter presets
These are practical starting points, not universal laws.
Tune from here per model family.

Roleplay default:
- temperature: about 0.75 to 0.95
- top_p: about 0.90 to 0.97
- repetition_penalty: about 1.03 to 1.10
- max_new_tokens: about 120 to 250
- stop strings: yes

Balanced chat:
- temperature: about 0.45 to 0.75
- top_p: about 0.85 to 0.95
- repetition_penalty: about 1.00 to 1.07
- max_new_tokens: about 80 to 180

Precision or extraction:
- lower temperature
- tighter top-p
- structured output preferred
- shorter max token cap

## 7. Structured output vs plain text

Structured output is best when the app needs reliability.
Plain text is best when the user needs immersion.

### Structured output is better for:
- Memory extraction
- Scene-state updates
- Emotion/state tagging
- Tool calls
- Classifiers
- Safety checks
- Suggestion generation when a parser must consume the result

### Plain text is better for:
- Final character replies
- Emotional dialogue
- Natural pacing
- Subtext
- Tone and voice fidelity
- Sensory description

Why structured output helps:
- It narrows the task.
- It reduces parser ambiguity.
- It gives smaller local models a clearer target.

Why structured output hurts visible roleplay if overused:
- It can flatten rhythm and voice.
- It encourages the model to think in slots rather than lived dialogue.
- Rigid schemas can make output feel mechanical.

Best product pattern:
- Hidden structured pass for memory/control
- Visible plain-text pass for the final reply

Good hybrid example:
1. Hidden pass extracts:
   - current mood
   - relationship delta
   - scene facts
   - unresolved threads
2. App stores or updates memory.
3. Final generation uses plain text and those compact state anchors.

For smaller local models:
- Use tiny schemas, not giant nested ones.
- Prefer a few stable fields over complex JSON with many optional keys.
- Be prepared to salvage partial output if truncation happens.

## 8. Why common failure modes happen

### 8.1 Hallucinations
Why they happen:
- The model predicts plausible continuations, not truth.
- If facts are missing, weak, contradictory, or buried, the model fills gaps with likely text.

Roleplay-specific version:
- Some invention is desirable.
- Bad hallucination is invention that breaks canon, scene logic, or user agency.

Examples:
- Good: adding a fitting sensory detail not previously stated
- Bad: inventing a sibling, injury, relationship milestone, or user action

### 8.2 Repetition
Why it happens:
- Open-ended text generation naturally falls into high-probability loops.
- Long generations worsen this.
- Low-diversity decoding can trap the model in repeated phrasing.

### 8.3 Blandness
Why it happens:
- Safe decoding favors generic tokens.
- Overly constrained prompts flatten style.
- Helpful-assistant priors overpower character voice.

### 8.4 Perspective drift
Why it happens:
- The model loses track of speaker boundaries, narration mode, or ownership of actions.
- Multi-character scenes, long contexts, and weak role formatting make this worse.
- The model also conditions on its own previous mistakes.

### 8.5 Style collapse
Why it happens:
- Voice examples are weak or diluted.
- Too much safety or formatting pressure overrides character rhythm.
- Long chats push the model back toward generic assistant prose.

### 8.6 Character inconsistency
Why it happens:
- Persona is not a durable internal object.
- Each turn the model reconstructs the character from prompt, history, and retrieved memory.
- Weak cards, bad summaries, and poor retrieval produce contradictory behavior.

### 8.7 Emotional discontinuity
Why it happens:
- Emotional state is rarely tracked explicitly.
- Summaries often preserve events but not affect.
- The latest practical user message can override deeper emotional context.

Example:
- After a betrayal scene, the next user message is logistical.
- Without emotional state carryover, the model replies in cheerful neutral mode.

## 9. What makes roleplay quality good or bad

Good roleplay usually has all of these:

### Character consistency
- Stable values, goals, fears, preferences, and boundaries
- Consistent speech rhythm, not just repeated catchphrases

### Tone and voice
- Distinct sentence structure, vocabulary, pacing, and emotional register
- No sudden collapse into generic assistant language

### Scene continuity
- Correct location, objects, injuries, weather, time, who is present, and what just happened

### Relationship continuity
- Trust, attraction, resentment, dependence, familiarity, and unresolved tension carry forward

### Emotional realism
- Emotions evolve for reasons
- Reactions match prior events and relationship state

### Pacing
- Not too fast, not too stalled
- The model moves the scene without speedrunning emotional beats

### Initiative
- The model contributes meaningful next beats
- It does not only mirror or agree

### Natural dialogue flow
- Turns feel like a person responding, not an instruction-following template
- Dialogue and narration balance feel organic

Bad roleplay usually looks like:
- Generic flirty filler
- Overexplanation
- The model writing the user's actions
- Forgetting scene facts
- Contradicting established personality
- Emotional resets with no cause
- Same sentence rhythm every turn
- Therapist voice, safety voice, or assistant voice breaking through

## 10. How multi-turn conversations degrade over time

Roleplay degrades because multiple weak effects compound together:

1. Important facts sink into the middle of context.
2. Old turns get clipped.
3. Summaries lose nuance.
4. Retrieved memory becomes noisy or stale.
5. The model conditions on its own prior errors.
6. Sampling noise compounds across turns.
7. Helpful-assistant priors reassert themselves when persona signal weakens.

Why roleplay apps are especially vulnerable:
- Roleplay depends on continuity more than ordinary Q&A.
- Users notice tiny breaks in tone and emotion immediately.
- The app must track identity, scene, relationship, knowledge boundaries, and pacing at the same time.
- Long sessions are common, so drift is inevitable without active memory repair.

The practical consequence:
- Raw transcript replay alone is not enough.
- Roleplay apps need ongoing scene-state maintenance and memory curation.

## 11. Smaller local models vs larger cloud models

### Smaller local models
Typical strengths:
- Cheap and private
- Can be fast enough on consumer hardware
- Often very good at short-form vibe if the prompt is clean

Typical weaknesses:
- More prompt-sensitive
- Weaker long-context use
- More likely to flatten tone
- More likely to repeat or drift under long scenes
- More fragile on complex instructions and larger schemas
- Less robust at subtle emotional continuity and initiative

### Larger cloud models
Typical strengths:
- Better instruction following
- Better long-range coherence on average
- Better emotional nuance and subtext
- More resilient to imperfect prompts

Typical weaknesses:
- Still drift in long roleplay without memory scaffolding
- Still hallucinate and break character
- Higher cost and lower privacy
- May have stronger safety style leakage depending on provider

Practical product takeaway:
- Small local models need simpler prompts, cleaner memory injection, shorter outputs, and stronger app scaffolding.
- Larger cloud models give more headroom, but they do not remove the need for memory systems and good UX.

A useful rule:
- Prompting can narrow the gap.
- Good retrieval can narrow the gap.
- Better UX can narrow the gap.
- But model size and finetune still set the upper bound for long-horizon nuance.

## 12. What can realistically be improved, and what is a true model limitation

### Usually improvable through product design
- Better prompt ordering
- Cleaner role separation
- Better character cards
- Pinned canon facts
- Relationship memory
- Scene-state tracking
- Better retrieval ranking
- Better summarization
- Hidden structured state updates
- Shorter and smarter default reply lengths
- Better reroll options
- Better failure recovery UX

### Only partly improvable
- Emotional realism over very long arcs
- Initiative that feels surprising but still in-character
- Delicate subtext
- Robust continuity through messy or contradictory user input

### Mostly true model limitations
- Deep long-horizon character development without strong external scaffolding
- Very stable subtle voice over many sessions
- Reliable multi-party scene management in weaker models
- Elegant memory use from huge raw contexts without retrieval help
- Strong coherence when the persona itself is vague or badly written

Important product truth:
- You cannot make a weak model produce premium output for every low-quality character card just by adding more instructions.
- Persona signal quality sets a hard ceiling.

## 13. Product and UX patterns that help roleplay apps get better results

These patterns consistently help imperfect models:

### 13.1 Pinned canon and editable memory
Let the user view and edit:
- names and pronouns
- relationship facts
- world rules
- known injuries or conditions
- current scene facts
- what the character knows vs does not know

### 13.2 Explicit scene cards or chapter state
Track:
- location
- time
- who is present
- emotional temperature
- scene goal
- unresolved actions

### 13.3 Episodic summaries
After significant scene transitions, store a compact summary with:
- what changed
- what remains unresolved
- relationship shift
- emotional afterstate

### 13.4 Memory provenance
Show whether a fact came from:
- character card
- world lore
- prior chat
- summary
- user-edited memory

This makes corrections easier and helps debug drift.

### 13.5 Reroll modes tied to real failure modes
Useful rerolls:
- more in character
- shorter and punchier
- more emotionally grounded
- advance the scene
- preserve canon
- do not narrate my actions

### 13.6 Context reset without identity reset
Allow restarting a scene while keeping:
- persona
- relationship memory
- stable canon

This is valuable when the scene gets messy but the user does not want to lose continuity.

### 13.7 Branches and checkpoints
Roleplay users often want to preserve a good path and try alternatives.
This also reduces frustration from one bad drift event.

### 13.8 Hidden state extraction
Use structured hidden passes to maintain:
- emotional state
- relationship delta
- unresolved promises
- physical scene state
- who knows what

### 13.9 Short-turn defaults with optional expansion
Weaker models often stay coherent longer with moderate reply length.
Let the user expand when they want more.

### 13.10 Model-aware presets
Do not use one universal preset for every model.
Smaller models need:
- shorter prompts
- simpler response targets
- tighter memory curation
- lower complexity per turn

## 14. Practical recommendations for Aria

For a local-first roleplay product, the most practical improvements are:

1. Treat memory as a product system, not as a longer prompt
- Separate canon, relationship memory, episodic summary, and active scene state.

2. Keep the active scene state compact and recent
- Current location, emotional state, unresolved actions, and user POV constraints should be near generation time.

3. Use hidden structured passes behind the scenes
- Update memory and state in a parser-friendly format.
- Keep the visible reply plain text.

4. Keep persona signal high and compact
- Clear identity, dynamics, and current scenario matter more than bloated prose.

5. Prefer a few strong instructions over many weak ones
- Especially for 7B to 14B local models.

6. Reserve output headroom
- Do not let prompt bloat eat the reply.
- A clipped roleplay reply feels much worse than a slightly shorter memory block.

7. Offer rerolls that target actual pain points
- More in character
- More emotionally grounded
- Preserve scene continuity
- Shorter
- Bolder

8. Assume summaries lose nuance, and design for correction
- Let users inspect and edit important remembered facts.

9. Validate POV integrity aggressively
- User-action narration and ownership confusion are high-severity failures in roleplay UX.

10. Maintain a model support matrix
- Different local models need different presets.
- One-size-fits-all decoding and prompt design is usually a mistake.

## 15. High-confidence practical heuristics

These are useful defaults, not universal laws:

- Keep critical instructions early and current scene state late.
- Keep long-term canon separate from rolling transcript.
- Retrieve a small number of high-relevance memories, not everything.
- Prefer moderate reply length over giant monologues.
- Use sampling for visible roleplay, structure for hidden control.
- Change decoding knobs one at a time when tuning.
- If a model keeps drifting, inspect prompt packing and memory injection before adding more style rules.
- If the character feels bland, check whether decoding is too conservative or the persona signal is too weak.
- If long-term continuity is failing, the first suspect should be memory architecture, not just temperature.

## 16. Sources consulted

Official docs and technical references:
- OpenAI tiktoken README
  - https://github.com/openai/tiktoken
- OpenAI Model Spec
  - https://github.com/openai/model_spec
  - https://raw.githubusercontent.com/openai/model_spec/main/model_spec.md
- Anthropic context windows
  - https://docs.anthropic.com/en/docs/build-with-claude/context-windows
- Anthropic compaction
  - https://docs.anthropic.com/en/docs/build-with-claude/compaction
- Anthropic context editing
  - https://docs.anthropic.com/en/docs/build-with-claude/context-editing
- Anthropic system prompts and prompt engineering
  - https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/system-prompts
  - https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/be-clear-and-direct
  - https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/use-xml-tags
- Anthropic memory tool
  - https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/memory-tool
- Mistral tokenization and control tokens
  - https://docs.mistral.ai/guides/tokenization/
  - https://docs.mistral.ai/cookbooks/concept-deep-dive-tokenization-control_tokens
- Hugging Face generation and decoding docs
  - https://huggingface.co/docs/transformers/en/main_classes/text_generation
  - https://huggingface.co/blog/how-to-generate
- vLLM structured outputs docs
  - https://docs.vllm.ai/en/latest/features/structured_outputs.html

Research papers and benchmarks:
- Lost in the Middle: How Language Models Use Long Contexts
  - https://arxiv.org/abs/2307.03172
- RULER: What's the Real Context Size of Your Long-Context Language Models?
  - https://arxiv.org/abs/2404.06654
- MemGPT: Towards LLMs as Operating Systems
  - https://arxiv.org/abs/2310.08560
- Recursively Summarizing Enables Long-Term Dialogue Memory in Large Language Models
  - https://arxiv.org/abs/2308.15022
- Generative Agents: Interactive Simulacra of Human Behavior
  - https://arxiv.org/abs/2304.03442
- The Curious Case of Neural Text Degeneration
  - https://arxiv.org/abs/1904.09751
- Neural Text Generation with Unlikelihood Training
  - https://arxiv.org/abs/1908.04319
- A Persona-Based Neural Conversation Model
  - https://arxiv.org/abs/1603.06155
- Generating Persona Consistent Dialogues by Exploiting Natural Language Inference
  - https://arxiv.org/abs/1911.05889
- RoleLLM: Benchmarking, Eliciting, and Enhancing Role-Playing Abilities of Large Language Models
  - https://arxiv.org/abs/2310.00746
- Quantifying and Optimizing Global Faithfulness in Persona-driven Role-playing
  - https://arxiv.org/abs/2405.07726
- CharacterGPT: A Persona Reconstruction Framework for Role-Playing Agents
  - https://arxiv.org/abs/2405.19778
- TimeChara: Evaluating Point-in-Time Character Hallucination of Role-Playing Large Language Models
  - https://arxiv.org/abs/2405.18027
- Role-Playing Evaluation for Large Language Models
  - https://arxiv.org/abs/2505.13157
- Memory-Driven Role-Playing: Evaluation and Enhancement of Persona Knowledge Utilization in LLMs
  - https://arxiv.org/abs/2603.19313
- RoleRAG: Enhancing LLM Role-Playing via Graph Guided Retrieval
  - https://arxiv.org/abs/2505.18541
- Long Time No See! Open-Domain Conversation with Long-Term Persona Memory
  - https://arxiv.org/abs/2203.05797
- Exploring the Factual Consistency in Dialogue Comprehension of Large Language Models
  - https://arxiv.org/abs/2311.07194
- Scalable and Transferable Black-Box Jailbreaks for Language Models via Persona Modulation
  - https://arxiv.org/abs/2311.03348
- Stay in Character, Stay Safe: Dual-Cycle Adversarial Self-Evolution for Safety Role-Playing Agents
  - https://arxiv.org/abs/2602.13234

## Final takeaway

For a roleplay app, the best results come from combining:
- a strong model
- compact high-signal persona design
- clean prompt hierarchy
- active scene-state management
- retrieval-backed memory
- moderate sampling
- visible UX tools for continuity repair

Long-term coherence is not something the model simply has.
It is something the product has to build.
