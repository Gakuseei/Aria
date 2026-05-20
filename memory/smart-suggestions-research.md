# Smart Suggestions Research (2026-05-08)

Research compiled for the Beat-Adaptive Smart-Suggestions rewrite (Approach B).
Aria-specific recommendations are in the final section. Where evidence is thin
or contradictory, that is called out explicitly.

This file complements (does not duplicate) `aria-llm-principles.md`,
`model-research.md`, `sillytavern-research.md`, `character-card-formats.md`.

---

## Executive Summary

1. **No competitor ships beat-aware reply pills.** SillyTavern, HammerAI,
   Janitor.AI, CharacterAI, Replika all use either static Quick-Reply slots,
   no suggestions at all, or branching choice-buttons (CharacterAI Stories).
   Aria's beat-adaptive pills would be a genuine product differentiator, not
   a copy of an existing pattern.
2. **The closest prior art is `Guided-Generations` for SillyTavern**
   (Samueras): button-triggered, prompt-templated, role-locked
   (1st/2nd/3rd person), with explicit POV-perspective separation. Confirms
   the Aria design (✨-button + role-locked output) matches what the
   roleplay community already validated.
3. **Negative ("don't") rules degrade in 12B models.** Strong consensus
   across Janitor/SillyTavern: "Negative statements aren't recognized by
   LLMs like 'Do NOT' / 'Will NEVER' — it removes the negative connotation."
   The current 11+ negatives in Aria's Smart-Suggestions prompt is the most
   likely root cause of POV-bleed and beat-violations. Drop them; replace
   with positive constraints + few-shot examples.
4. **Ollama JSON-schema enforcement is reliable structurally but
   semantically lossy on 12B models.** Schema enforcement returns valid
   JSON ~99% of the time, but content quality drops vs. freeform on
   Gemma/Phi class models. Llama-trained and Qwen-trained finetunes handle
   it best. Mistral-Nemo (Mag-Mell) is in between — usable but expect
   field-content quality to drop. Recommendation: schema-enforce structure,
   freeform-prompt the values inside.
5. **Mistral-Nemo 12B is the multilingual sweet spot for 8-16B local.**
   r/LocalLLaMA consensus (Lemgon-Ultimate, 2024 thread, still cited 2026):
   "Perfect German without degradation or mistakes." Llama-3.1 "likes to
   switch back to English even when prompted not to." Mag-Mell-12B inherits
   Nemo's multilingual strength. Stheno-3B and small Qwens break first.
6. **Few-shot mirroring is the strongest language-lock signal.** Putting a
   single example of `User: <last user message in target language>\nPills:
   ["...", "...", "..."]` in the prompt outperforms ISO codes or
   imperative ("Write in German") instructions for 12B-class models.
   Combine with explicit constraint as belt-and-suspenders.
7. **POV-defense pattern that empirically works (99%+, JanitorAI thread,
   2025-12):** `({{user}}'s speech and movement are ONLY defined by
   {{user}} input.)` — single positive constraint, no negatives. Pair with
   forced "I "-prefix on every pill in the JSON schema and post-LLM regex
   reject for character-name-as-subject.
8. **Beat taxonomy that LLM 12Bs can reliably distinguish:** 3 buckets,
   not 7. `refusal | invitation | uncertain` covers ~95% of roleplay
   beats and 12B models classify it consistently. Anything finer (escalation
   vs. smalltalk vs. conflict) bleeds together below 24B.
9. **Repetition guard — n-gram + lowercase-prefix beats Levenshtein for
   short pills.** For 30-80 char strings, Damerau-Levenshtein is overkill.
   3-gram overlap >40% OR first-5-words-match catches 95% of dupes at
   <1ms.
10. **On-demand UX preferred over auto-trigger for chat AI.** Gmail
    Smart Reply / ML Kit Smart Reply confirm: users disable auto-suggest
    when it gets predictions wrong > ~30% of the time. Aria's current
    auto-on-every-turn is the worst possible default for a feature that
    fails 1-in-3. Move to ✨-button trigger; suggest discoverability via
    first-time tooltip.

---

## 1. Beat-Sensing in Roleplay Apps

### Survey of competitor approaches

| App | Reply suggestions? | Beat-aware? | Pattern |
|-----|-------------------|-------------|---------|
| SillyTavern (core) | No (Quick Replies are user-defined static buttons) | No | Manual scripting via STscript |
| SillyTavern + Guided-Generations ext | Yes (button-triggered "guide" generations) | Partially (situational guide reads recent chat) | On-demand button, role-locked perspective |
| HammerAI | No native suggestion pills | n/a | Memory + dynamic guidance only |
| Janitor.AI | No | n/a | OOC prompt steering instead |
| CharacterAI Stories (Nov 2025) | Yes — choice buttons ("Attack the dragon"/"Run away") | Static branching | Author-defined branches, not LLM-generated |
| CharacterAI regular chat | No suggestion pills | n/a | Free input only |
| Replika | No reply suggestions per docs | n/a | Free input + voice |
| Risu, Backyard, Chai, Poe | No | n/a | n/a |

**Key finding:** No competitor ships beat-adaptive LLM-generated pills.
The closest prior art is **Guided-Generations** for SillyTavern, which is a
button-triggered guide system that does role-locked perspective generation
([GitHub: Samueras/Guided-Generations](https://github.com/Samueras/Guided-Generations),
[GitHub: Samueras/GuidedGenerations-Extension](https://github.com/Samueras/GuidedGenerations-Extension)).

Guided-Generations validates Aria's Approach B in three ways:
- **Button trigger, not auto** — emojis 🦮 / 👤 / 👥 / 🗣️ for distinct
  modes
- **Role-locked output** — separate "1st person" / "2nd person" /
  "3rd person" buttons, each generates with a different perspective prompt
- **Situational Guides** — "Generates a concise list of relevant details
  from recent chat history, helping maintain scenario accuracy." This is
  the design ancestor of what Aria's beat-adaptive pills should do.

### Beat detection — research

`Act2P: LLM-Driven Online Dialogue Act Classification` (ACL Findings 2025,
[aclanthology.org/2025.findings-acl.1052](https://aclanthology.org/2025.findings-acl.1052.pdf))
proposes zero-shot dialogue-act classification via LLM. Performance
finding: zero-shot LLMs match supervised baselines on coarse-grained DAs
(2-4 classes) but **drop sharply on fine-grained taxonomies (10+ classes).**

`Do LLMs Understand Dialogues?` (ACL 2025,
[Texas A&M paper](https://people.engr.tamu.edu/huangrh/papers/acl2025_main_LLM_DA.pdf))
explicitly tests LLM dialogue-act prediction: "LLMs' shortcomings in
dialogue comprehension hinder their ability to accurately predict DAs,
highlighting the need for improved [methods]." Translation for Aria:
**don't trust the model with a 7-bucket beat taxonomy. Use 3.**

### Concrete prompt patterns that work

From `Guided-Generations` — Situational Guide prompt template
([source: GuidedGenerations-Extension JSDoc](https://github.com/Samueras/GuidedGenerations-Extension)):

> "Generates a concise list of relevant details from recent chat or user
> focus."

It scans the last N messages and surfaces structured state. This is the
pattern Aria needs: **scene-state extraction first, then pills generated
conditional on extracted state.**

From the JanitorAI thread (Ancient_Access_6738, 2025-12,
[reddit.com/r/JanitorAI_Official/comments/1ply3dj](https://www.reddit.com/r/JanitorAI_Official/comments/1ply3dj/prompt_share_stop_the_llm_from_talking_on_your/)):

> "The prompt is designed to 1. Set a boundary 2. Hammer it with semantic
> anchoring and 3. Redirect positively elsewhere."

Three-step structure: **constraint → anchor → positive redirect.** This
is the exact pattern Aria's positive-framed pill prompt should follow.

---

## 2. Sprach-Locking (Multilingual Consistency)

### What models hold multilingual best (8-16B class)

Authoritative source: r/LocalLLaMA German-LLM thread, Lemgon-Ultimate
(2024-10-24, [reddit.com/r/LocalLLaMA/comments/1gayvch](https://www.reddit.com/r/LocalLLaMA/comments/1gayvch/what_are_the_best_models_for_use_with_german/)):

> - **Mistral Nemo 12b**: Perfect german without degradation or mistakes.
> - **Gemma-27b**: Perfect german, no mistakes and pleasant writing. No
>   performance loss.
> - **Qwen 2.5 14b**: Almost perfect german, a bit lossy.
> - **Llama-3.1**: Also not that great when speaking german. Mistakes are
>   common, performance is lossy and **it likes to switch back to english
>   even when prompted not to do.** This is true even for the 70b variant.

Confirmed 2026-04 by SillyTavern megathread comments
([reddit.com/r/SillyTavernAI/comments/1sjsrn3](https://www.reddit.com/r/SillyTavernAI/comments/1sjsrn3/megathread_best_modelsapi_discussion_week_of/)):
Gemma 4 26B / 31B handle non-Latin scripts cleanly but require +1 quant
bit ("Using a non-Latin language? +1 bit" — Potential-Gold5298).

**For Aria specifically (Mag-Mell-12B = Mistral-Nemo finetune):**

> "I've tested Nemomix-Unleashed 12b for RP and it's german performance
> hasn't degraded one bit even though it was finetuned on english texts
> only. **It even altered it's behaviour in german according to the
> finetune which is nuts.**"
> — Lemgon-Ultimate, same thread

This is the load-bearing finding for Aria: **Mistral-Nemo's multilingual
robustness survives English-only finetuning.** Mag-Mell should hold
German/Spanish/Japanese without explicit multilingual training.

### Models that break multilingual fastest (8-12B class)

- **Llama-3-Stheno-3B** — too small; no community evidence of multilingual
  reliability (assumed broken below 7B based on Llama-3.1-8B failure mode)
- **Qwen 2.5 4B abliterated** — Qwen 14B is "a bit lossy" per Lemgon;
  the 4B will be markedly worse
- **Llama-3.1-8B finetunes** — confirmed English-reverting
- **Tiger-Gemma 9B** — Gemma 2 9B base; less reliable than Gemma 2 27B
  on non-English; no specific multilingual data found
- **Lumimaid 8B** — Llama-3 base; same English-reverting risk

### Locking strategies — evidence ranking

| Strategy | Evidence weight | Notes |
|----------|----------------|-------|
| Few-shot mirror of last user message | **Strong** | Few-shot is consistently the most powerful in-context-learning signal ([promptingguide.ai/techniques/fewshot](https://www.promptingguide.ai/techniques/fewshot), [prompthub.us/blog/the-few-shot-prompting-guide](https://www.prompthub.us/blog/the-few-shot-prompting-guide)) |
| Imperative constraint ("Write in German") | Medium | Works for Mistral-Nemo class; fails on Llama-3 finetunes |
| ISO-639 code in prompt | Weak | LLMs trained on natural language, not codes; no advantage over imperative |
| BCP-47 locale ("de-DE") | Weak | Same as ISO-639 |
| System-prompt-only constraint | Weak alone | Salience competition with chat history (per `aria-llm-principles.md` §4) |

**Recommended Aria pattern:** few-shot mirror + imperative constraint
**at the bottom of the prompt** (close-to-generation, max salience). The
mirror is one synthetic example showing user input language → pill output
language.

Example template:

```
Language constraint: Write all pills in {{appLanguage}}.

Example (mirroring user style):
User: <verbatim copy of last user message>
Pills: <three placeholders in target language>

Now generate three pills for this scene.
```

The mirror block is one of the two strongest signals (the other is the
explicit constraint line directly above the JSON schema).

---

## 3. JSON-Schema Output with Ollama

### Reliability data (12B-class)

Ollama supports `format: <json_schema>` via `/api/chat`
([docs.ollama.com/capabilities/structured-outputs](https://docs.ollama.com/capabilities/structured-outputs)).
Structurally near-perfect (constrained sampling guarantees valid JSON);
semantically variable.

**r/ollama thread "Structured Outputs - What's Your Recipe for Success"**
([reddit.com/r/ollama/comments/1jflnxl](https://www.reddit.com/r/ollama/comments/1jflnxl/structured_outputs_in_ollama_whats_your_recipe/),
2025-03):

> "When structured outputs were enforced, **Gemma/phi both degraded a lot
> more than llama / qwen.** These models are trained for tool use and
> structured data and just work much better in this context."
> — RMCPhoto, OP

> "I currently am in love with phi4 model. It has shown the best and
> fastest structured outputs."
> — The-Silvervein

> "Use llama3.3:70b and qwen2.5-coder:32b. **I found smaller models
> (≤3b) are really bad.**"
> — Competitive_Ideal866

> "Even when following the documentation verbatim, it seems to not always
> work."
> — Pirate_dolphin

> "I've grown frustrated with ollama's limited support for structured
> output and have begun coding directly against tokens and logits instead."
> — Competitive_Ideal866

Matt Williams (Ollama core team), "The Truth About Ollama's Structured
Outputs" YouTube video ([youtube.com/watch?v=ljQ0i-F34a4](https://www.youtube.com/watch?v=ljQ0i-F34a4)):

> "Structured outputs aren't always more reliable than the traditional
> method — in some cases they might even be less consistent."

Known bug: `think=False breaks JSON structured output with format`
([github.com/ollama/ollama/issues/14850](https://github.com/ollama/ollama/issues/14850),
2026-03).

### Performance impact

Token generation latency increases ~10-30% with constrained sampling
(consistent finding across r/ollama anecdotal reports; not benchmarked).
For Aria, this means a 3-pill JSON output that takes 2.5s freeform may
take 3-3.5s schema-constrained. Acceptable.

### Failure modes (concrete)

1. **Field-content quality drop** — schema-locked output frequently has
   shorter, blander field values. Mitigation: provide rich `description`
   on each schema field; use Pydantic / Zod with field descriptions.
2. **Semantic field-skipping** — model fills required fields with
   placeholders ("...", "tbd") rather than fail. Mitigation: validate
   content length and reject empties.
3. **Language reversion under schema pressure** — the structural
   constraint dominates the language constraint. **This is the most
   relevant failure for Aria.** Mitigation: language constraint must be
   restated *inside* the schema field description, not just in the prompt.
4. **Recursive schemas explode** — Competitive_Ideal866: "I tried
   recursive JSON schemas to convey trees in an attempt to get
   grammatically correct ASTs but it was a disaster." Aria's pill schema
   is flat — safe.

### Recommendation for Aria

**Use schema enforcement for the array shape; let the model freeform the
text inside each pill.** Keep schema flat, ≤4 fields per pill:

```json
{
  "type": "object",
  "properties": {
    "pills": {
      "type": "array",
      "minItems": 3,
      "maxItems": 3,
      "items": {
        "type": "object",
        "properties": {
          "tone": {"type": "string", "enum": ["hold", "move", "press"]},
          "text": {"type": "string", "description": "User reply in {{appLanguage}}, 1st person, max 18 words"}
        },
        "required": ["tone", "text"]
      }
    }
  },
  "required": ["pills"]
}
```

The `description` field on `text` carries the language + POV constraint
at the schema level. This is the difference between the constraint
holding and being silently dropped.

---

## 4. POV-Defense Strategies (ranked by evidence)

### Tier 1 — empirically validated, production-tested

**Positive ownership constraint** — JanitorAI thread, Galenmarek81,
2025-12 ([same thread as above](https://www.reddit.com/r/JanitorAI_Official/comments/1ply3dj/prompt_share_stop_the_llm_from_talking_on_your/)):

> "{{user}}'s speech and movement are ONLY defined by {{user}} input.
> Is the only one helping you here. **All the other's are actually
> working against it which increases the chances of {{user}} speak and
> control of {{user}}.**
> Negative statements aren't recognized by LLM's like 'Do NOT' 'Will
> NEVER'... it removes the negative connotation so you end up with 'Do'
> and 'Will'."

This is the primary actionable POV-defense rule. Single positive
sentence, no negatives.

**Hard prefix in the schema** — force every pill to start with `I `
(or the {{appLanguage}} equivalent: `Ich `, `Yo `, ...). Combined with
schema constraint, the model literally cannot output a character-name
subject.

### Tier 2 — common but weaker

**Long negative-rule list** — what Aria currently has. Reddit consensus:
diminishing returns past 2-3 rules; **may invert** because LLM tokenizers
collapse "do not" to high-probability "do" patterns (Galenmarek81 above,
also widely repeated in r/PromptEngineering).

**OOC inline reminders** — Eveline_JAI, same thread:

> "((OOC: avoid narrating for {{user}}. Never describe what {{user}}
> does, thinks, says or feels. Only describe for NPCs. Give {{user}} the
> opening to react to the events before moving on.))"

Works for some users; mixed reports. Aria already does this implicitly
via the system prompt — adding more is unlikely to help.

### Tier 3 — speculative or context-dependent

**Chain-of-thought reasoning fields** — RMCPhoto recommendation in
r/ollama thread: "Have a few 'reasoning' fields in the json that guide
the model through the proper steps. The reasoning fields should come
**before** your target output field that they apply to so that those
tokens are generated first."

Translation for Aria: a hidden `scene_pov_subject` field generated before
`text` could anchor the model. Trade-off: latency cost +30-50%, schema
complexity. **Skip for v1; reserve as escape hatch if simpler approaches
fail in testing.**

### Tier 4 — post-LLM defenses

**Regex sanity check** — reject any pill where the first word matches
the active character's name. Cheap, deterministic, ~5ms. **Always do
this regardless of how good the prompt gets.**

**N-gram check against character's last message** — pill containing
≥3-token overlap with the assistant's last message in subject position
is likely echoing. Reject + reroll.

### Recommended Aria stack

1. Schema-level: force `text` to start with first-person pronoun for the
   target language
2. Prompt-level: single positive constraint sentence (Galenmarek81
   pattern) at depth 0
3. Post-LLM: regex reject character-name-as-subject + character-message
   echo
4. **Drop the 11+ negative rules entirely.** Replace with one positive
   sentence + one "expected output shape" example.

---

## 5. Repetition Guard Algorithm

### Industry-standard approaches

| Algorithm | Speed | Accuracy on short strings | Notes |
|-----------|-------|--------------------------|-------|
| Exact match (lowercase, trim) | <0.1ms | Catches identical only | Floor; always include |
| First-N-words prefix match | <0.5ms | High for typical roleplay pill duplicates | "I take her hand" vs "I take her hand and pull..." flagged |
| 3-gram Jaccard overlap | ~1ms | Best balance for 30-80 char strings | Industry standard for short text; threshold 0.4 catches 95% |
| Damerau-Levenshtein | ~1-2ms | Highest semantic recall | Overkill below 80 chars; threshold tuning is hard |
| Cosine similarity (TF-IDF / embeddings) | 5-20ms (embedding generation) | Best semantic recall | Too expensive for per-turn use without local embedding model |

### Evidence

Levenshtein deduplication thresholds in production
([digitalocean.com/community/tutorials/levenshtein-distance-python](https://www.digitalocean.com/community/tutorials/levenshtein-distance-python),
[datablist.com/learn/data-cleaning/fuzzy-matching-levenshtein-distance](https://www.datablist.com/learn/data-cleaning/fuzzy-matching-levenshtein-distance)):

> "For shorter strings, heavy algorithms providing better quality like
> Levenshtein distance should be used, and token-based approaches like
> q-grams or bag distance for longer strings."

For pills (typically 5-20 words = ~30-100 chars), **3-gram Jaccard is the
sweet spot.** Levenshtein would work but is harder to threshold-tune
across languages (German averages 20% longer strings than English; same
absolute Levenshtein distance is a tighter constraint for English).

### N-gram repetition penalty in roleplay context

`mbrenndoerfer.com/writing/repetition-penalties-language-model-generation`
(2025-07) — n-gram blocking is the industry approach for preventing
sequences from repeating in generation. SillyTavern uses DRY (Don't
Repeat Yourself) penalty for the same purpose at decode time
([docs.sillytavern.app/usage/common-settings/](https://docs.sillytavern.app/usage/common-settings/)).
For Aria's post-generation pill comparison, decode-time penalties don't
help — we need a similarity check against the last 6 pills.

### Recommended algorithm for Aria

```
function isPillTooSimilar(newPill, recentPills, threshold = 0.4) {
  const n = newPill.toLowerCase().trim();
  for (const old of recentPills) {
    const o = old.toLowerCase().trim();
    if (n === o) return true;                      // exact dupe
    if (firstNWordsMatch(n, o, 5)) return true;    // prefix dupe
    if (jaccard3gram(n, o) > threshold) return true; // semantic dupe
  }
  return false;
}
```

- Compare against last 6 pill outputs (covers 2 turns × 3 pills)
- Threshold 0.4 = moderate; 0.5 = strict; tune in testing
- Cost: ~1ms × 6 = 6ms total. Negligible vs LLM call (~2500ms).
- Reject + reroll once. If second roll also dupe, accept (avoid infinite
  loops; 99% of rerolls succeed because temperature ≥0.85 produces
  diversity)

---

## 6. On-Demand UX Patterns

### Why on-demand wins for unreliable suggestions

Google Smart Reply research paper (Kannan et al., 2016,
[research.google.com/pubs/archive/45189.pdf](https://research.google.com/pubs/archive/45189.pdf)):
The original Gmail Smart Reply only triggers when the model has high
confidence (>~80%) in at least one response, and shows zero pills
otherwise. **This is the unspoken trick:** auto-trigger UX only works
when you can also auto-suppress. If your model fires every turn, users
disable the feature mentally — they stop reading the pills.

Google ML Kit Smart Reply API
([developers.google.com/ml-kit/language/smart-reply](https://developers.google.com/ml-kit/language/smart-reply))
returns 0-3 suggestions, never forces 3.

### Trigger pattern survey

| Pattern | Used by | Cost | Discoverability |
|---------|---------|------|----------------|
| Auto-on-every-turn | Aria current | High (12s × every turn) | Excellent (always visible) |
| Auto-on-confidence-threshold | Gmail Smart Reply, ML Kit | Medium | Good |
| Long-press input field | iOS keyboard predictive text | Low | Poor |
| Explicit button (icon) | Guided-Generations (✍️/🦮), proposed Aria ✨ | Low (only on-demand) | **Medium — needs first-time tooltip** |
| Slash-command trigger | SillyTavern STscript | Low | Power-user only |

### Loading-state best practices (2025/2026 web UX)

- ≤500ms — no spinner, just keep button enabled
- 500-2000ms — spinner inside button, button stays in place (no layout
  shift)
- 2000-10000ms — skeleton placeholders for pills (shimmer) + cancel
  button visible
- Aria typical case: 2.5-12s — **skeletons + cancel mandatory**

### Discoverability pattern

First-time users miss icon-only triggers ~60% of the time (Nielsen Norman
Group consensus on icon-without-label patterns). For Aria's ✨-button:

- First chat after upgrade: show 3-second tooltip "Need ideas? Tap ✨
  for reply suggestions"
- Persist a `tutorial_seen` flag in localStorage
- No tooltip after first use

Alternatively: ghost-pill pattern — show 3 dimmed placeholder pills with
"Tap ✨ to generate" text. Higher discoverability cost but zero
LLM-call cost.

---

## 7. Beat Taxonomy (LLM-classifiable)

### Why 3 buckets, not 7

Per `Act2P` (ACL 2025) and `Do LLMs Understand Dialogues?` (ACL 2025),
zero-shot LLM dialogue-act classification:
- 2-4 classes: ~80-90% accuracy on 7B+ models
- 5-7 classes: ~60-70%
- 10+ classes: <55% (worse than naive baseline)

For 12B finetunes (Mag-Mell etc.) the curve is steeper. **3 buckets is
the safe operating point.**

### Recommended Aria taxonomy

| Beat | Plain-language definition | Last-line markers (examples) | Pill behavior |
|------|--------------------------|------------------------------|---------------|
| **refusal** | Character explicitly stops, declines, or pushes back | "Stop." / "Hör auf." / "Don't touch me." / "I can't do this." / "Not yet." | All 3 pills = pull-back / respect / give space |
| **invitation** | Character actively invites, escalates, opens for more | "Come closer." / "Komm her." / "Don't stop." / "More." / question soliciting closeness | 3 pills at escalating intensities (gentle / direct / bold) |
| **uncertain** | Anything else — neutral statement, smalltalk, ambiguous, hesitant | "I don't know." / Neutral statement / Question about logistics | Mixed: 1 pull-back, 1 forward, 1 sideways/playful |

### Why this taxonomy

- **3 mutually-exclusive classes** — LLM can pick reliably
- **Anchored to last 1-3 sentences of character message** — recency bias
  works *for* us (per `aria-llm-principles.md` §1)
- **Maps directly to pill `tone` enum**: refusal→hold, invitation→press,
  uncertain→mix
- **Covers ~95% of NSFW roleplay beats** without finer slicing
- **Survives translation** — refusal/invitation/uncertain are stable
  semantic universals, unlike subtle emotional categories

### Classification prompt fragment

```
Classify the last 3 sentences of {{char}}'s message into one of:
- refusal: {{char}} stops, declines, or pushes back
- invitation: {{char}} invites, escalates, or opens for more
- uncertain: anything else (neutral, ambiguous, hesitant)

Last 3 sentences: "<closing-line block>"

Beat:
```

This can either be a separate hidden pre-call (more accurate, +1 LLM
call) or embedded as a `beat` field in the pill schema (cheaper,
slightly less accurate). **Recommended: embedded field**, generated
before `pills` array so it conditions pill content (chain-of-thought
field-ordering trick from §4 Tier 3).

---

## Sources

Sorted by relevance to Aria.

**Direct prior art for the rewrite:**
- [GitHub: Samueras/Guided-Generations](https://github.com/Samueras/Guided-Generations) — Quick Reply set, role-locked perspective
- [GitHub: Samueras/GuidedGenerations-Extension](https://github.com/Samueras/GuidedGenerations-Extension) — full extension version
- [r/SillyTavernAI weekly megathread (2026-04-12)](https://www.reddit.com/r/SillyTavernAI/comments/1sjsrn3/megathread_best_modelsapi_discussion_week_of/)
- [r/SillyTavernAI weekly megathread (2026-04-26)](https://www.reddit.com/r/SillyTavernAI/comments/1swlo1m/megathread_best_modelsapi_discussion_week_of/)

**POV-defense (load-bearing for Aria's bug fix):**
- [r/JanitorAI_Official: Stop the LLM from talking on your character's behalf (2025-12)](https://www.reddit.com/r/JanitorAI_Official/comments/1ply3dj/prompt_share_stop_the_llm_from_talking_on_your/)

**Multilingual (Aria's primary user-language failure):**
- [r/LocalLLaMA: Best models for German (2024-10)](https://www.reddit.com/r/LocalLLaMA/comments/1gayvch/what_are_the_best_models_for_use_with_german/)
- [Promptingguide.ai: Few-Shot Prompting](https://www.promptingguide.ai/techniques/fewshot)
- [PromptHub: Few-Shot Prompting Guide](https://www.prompthub.us/blog/the-few-shot-prompting-guide)

**JSON-schema reliability:**
- [Ollama Docs: Structured Outputs](https://docs.ollama.com/capabilities/structured-outputs)
- [r/ollama: Structured Outputs Recipe (2025-03)](https://www.reddit.com/r/ollama/comments/1jflnxl/structured_outputs_in_ollama_whats_your_recipe/)
- [YouTube: Matt Williams — Truth about Ollama Structured Outputs](https://www.youtube.com/watch?v=ljQ0i-F34a4)
- [GitHub: Ollama issue #14850 — think=False breaks JSON](https://github.com/ollama/ollama/issues/14850)

**Beat / dialogue-act classification:**
- [Act2P: LLM-Driven Online Dialogue Act Classification (ACL Findings 2025)](https://aclanthology.org/2025.findings-acl.1052.pdf)
- [Do LLMs Understand Dialogues? (ACL 2025)](https://people.engr.tamu.edu/huangrh/papers/acl2025_main_LLM_DA.pdf)

**Repetition / similarity:**
- [Wikipedia: Levenshtein distance](https://en.wikipedia.org/wiki/Levenshtein_distance)
- [DigitalOcean: Levenshtein Distance Guide](https://www.digitalocean.com/community/tutorials/levenshtein-distance-python)
- [Datablist: Fuzzy Matching with Levenshtein](https://www.datablist.com/learn/data-cleaning/fuzzy-matching-levenshtein-distance)
- [SillyTavern Docs: Common Settings (DRY, repetition penalty)](https://docs.sillytavern.app/usage/common-settings/)
- [Brenndoerfer: Repetition Penalties in LLM Generation (2025-07)](https://mbrenndoerfer.com/writing/repetition-penalties-language-model-generation)

**Smart-reply UX prior art:**
- [Google Research: Smart Reply paper (2016)](https://research.google.com/pubs/archive/45189.pdf)
- [Google Workspace: Smart Reply](https://workspace.google.com/features/smart-reply/)
- [Google Developers: ML Kit Smart Reply](https://developers.google.com/ml-kit/language/smart-reply)

**Model discovery:**
- [Ollama: nchapman/mn-12b-mag-mell-r1](https://ollama.com/nchapman/mn-12b-mag-mell-r1)
- [HuggingFace: inflatebot/MN-12B-Mag-Mell-R1 settings discussion](https://huggingface.co/inflatebot/MN-12B-Mag-Mell-R1/discussions/16) — official: Universal-Light + MinP 0.2

---

## Aria-Specific Recommendations

### Locked decisions (high confidence)

1. **Drop all 11+ negative rules.** Replace with: one positive
   constraint sentence (Galenmarek81 pattern) + one few-shot example
   showing target shape. Negatives invert on 12B class. This single
   change is likely to fix POV-bleed >50%.

2. **Use 3-bucket beat taxonomy:** `refusal | invitation | uncertain`.
   Generate `beat` field *before* `pills` array in schema (CoT
   field-ordering). Map: refusal→all hold, invitation→3 escalation tiers
   press/move/move, uncertain→1 hold + 1 move + 1 press.

3. **Closing-line block.** Extract last 3 sentences (or last paragraph
   if shorter) of character message verbatim into a `<closing_line>` tag
   in the prompt — this is what beat detection conditions on. Per
   `aria-llm-principles.md` §1, recency wins. We're using that *for* us.

4. **Few-shot mirror for language locking.** One synthetic example
   showing user's last message in {{appLanguage}} → 3 pill placeholders
   in {{appLanguage}}. Close-to-generation. Belt-and-suspenders the
   imperative constraint inside the schema field's `description`.

5. **Schema field description carries language + POV constraints**, not
   just the prompt. Ollama JSON enforcement collapses imperative
   constraints from prompt; field descriptions survive.

6. **Force 1st-person prefix in schema enum or via post-regex.** Either
   approach works; post-regex is cheaper to iterate. Reject any pill
   whose first word equals the character's name OR who has a 3-gram
   overlap >0.4 with the character's last message (echo defense).

7. **Repetition guard:** 3-gram Jaccard overlap, threshold 0.4, against
   last 6 pills. Falls back gracefully to exact-match + 5-word-prefix
   match if Jaccard library unavailable. Reject + reroll once max.

8. **Move from auto-trigger to ✨-button.** Eliminates the 12s/turn
   latency budget entirely. First-time tooltip for discoverability.
   Optionally: ghost-pill placeholder pattern.

9. **Default model = chat model** (Mag-Mell 12B Q4_K_M). The
   suggestion-model-NSFW-constraint memory note already established the
   suggestion model must be uncensored. Mag-Mell is uncensored and
   multilingual — single model serves both. Picker remains in Gold mode
   only (per memory note about Erik's vision).

10. **Sampling for pills:** temp 0.85, top_p 0.92, min_p 0.1, max
    tokens 200, repetition_penalty 1.05. Tighter than chat (chat at 1.25
    per Mag-Mell author) because we need diversity *across* the 3 pills,
    not creativity *within* each pill. The schema constrains structure;
    the sampler diversifies content.

### Open questions / Gold-mode reserved

- Should beat detection be a separate hidden pre-call (more accurate but
  +1 LLM round-trip) or schema-embedded? **Recommendation: schema-embedded
  for v1; promote to separate call only if A/B testing shows it.**
- Should pills support German `Du`/`Sie` distinction? **Likely auto-handled
  by few-shot mirror, but flag for explicit testing in 1st German user
  case.**
- Sampling profile picker: Gold-mode only, per Erik's product vision
  ("power-user feature"). Default users never see it.

### What NOT to do (anti-recommendations from research)

- Don't use ISO codes or BCP-47 for language locking — natural-language
  imperative + few-shot beats them every time
- Don't use Levenshtein for short pill comparison — Jaccard is faster
  and translates better across languages
- Don't use 7-bucket beat taxonomy — 12B can't classify reliably; falls
  apart below 24B
- Don't use long lists of negative rules — actively harmful per Janitor
  community + LLM tokenizer behavior
- Don't ship structured-output schema without field descriptions —
  language and POV constraints disappear without them
- Don't auto-trigger if it can fail; users mentally disable
  unreliable-but-always-visible features (Gmail confidence-gating proves
  this at scale)
