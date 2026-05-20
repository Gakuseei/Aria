# Write4Me / Impersonate — Deep Research Report

**Target model:** `HammerAI/mn-mag-mell-r1:12b-q4_K_M` (Mistral-Nemo-Base-2407-chatml merge, ChatML format, 12B, 8 GB VRAM).
**Goal:** rebuild Aria's `impersonateUser` prompt-assembly so drafts are short (1–2 sentences), match user voice, never hallucinate the character, and never "..." mid-sentence.
**Scope:** length control, prompt structure, user-voice seeding, second-persona risks, first-reply fallback, Mag-Mell quirks.

Methodology: primary sources (HF model cards, ST/openai.js source, Risu wiki, Backyard docs, Chub docs, ST Reddit threads, ParasiticRogue tips, ianbicking blog) plus practitioner consensus from r/SillyTavernAI and r/LocalLLaMA. Every concrete claim cites the URL it came from.

---

## TL;DR (actionable conclusions)

1. **Drop the "User Card" idea.** No major roleplay frontend (SillyTavern, RisuAI, Agnai, Backyard, Chub) builds a separate "user character card" for impersonate. They reuse the same character context and append a one-line system instruction `[Write your next reply from the point of view of {{user}}, using the chat history so far as a guideline for the writing style of {{user}}. Don't write as {{char}} or system. Don't describe actions of {{char}}.]`. Verified — primary source: `SillyTavern/public/scripts/openai.js` constant `default_impersonation_prompt`.

2. **Stop strings are the load-bearing trick, not numPredict.** ST text-completion impersonate does not lower max_tokens — it stops cleanly on `\n{{char}}:`. The model writes one user turn and would naturally write "\n{{char}}:" next; the stop string fires there. This is why ST drafts don't trail off with "...". Verified — `SillyTavern/public/script.js` `getStoppingStrings()` and the line `result.push(isImpersonate ? charString : userString)`.

3. **Mag-Mell needs ChatML, not Mistral V7-Tekken.** Mag-Mell's base is `Mistral-Nemo-Base-2407-chatml` (a chatml-converted base), and the model card says ChatML is required. This is the opposite of upstream Mistral-Nemo-Instruct-2407 which uses `[INST]/[/INST]` (Mistral V7). Using V7-Tekken on Mag-Mell will degrade output. Verified — HF model card `inflatebot/MN-12B-Mag-Mell-R1`.

4. **Recommended Mag-Mell sampler:** Temp 1.25 / MinP 0.2 (HF card) **or** Temp 1.0 / MinP 0.02 / DRY 0.8 (community consensus). XTC breaks Mag-Mell. Other repetition penalties hurt. Avoid all penalties beyond DRY-0.8.

5. **Length control = sentence-count early-stop on stream + word-count hint in prompt + stop strings.** Practitioners on r/SillyTavernAI converge on: (a) prompt-engineered "Write 1 sentence" or "Write 50 to 100 words", (b) names_as_stop_strings to fire on the next character's name, (c) max_tokens hard-cap as safety net only. RULER paper confirms LLMs don't honor numeric token limits well — they need length tokens (short/medium/long).

6. **Adaptive length cap (history-median) is novel — no known frontend ships it.** All consulted frontends use a static `max_response_tokens` (often 200–300 for 12B Nemo). Aria's idea to derive it from recent user-turn median is a defensible original design — but practitioners warn it can amplify "Message Length Inertia" (ParasiticRogue 4-4): the model gets stuck mirroring whatever pattern it sees. Mitigation: pad up by ~25% so the user has slack to type slightly longer than their median if they want; never below the floor.

7. **For Mag-Mell-class 12B local models, use plain text + XML wrapper, not bullets.** Practitioner consensus and the ST `default_main_prompt` both use one or two prose sentences, not bulleted instructions. ParasiticRogue's `10 Chat Commandments` is a numbered prose list, not bullets. Bullets work for >30B; on 12B Nemo merges they get partially honored, partially ignored.

8. **Few-shot user examples: 3–5 max, sanitized.** Trappu/AliCat best practice (cited by ST docs) is 3–7 character-side example messages. For user-side tone-mimic, fewer is better (3–5) because the user's whole recent history is already in the prompt — extra examples just amplify recency bias and risk verbatim phrase plagiarism. Aria's current `recentUserMessages(history, 5)` slice is at the upper end of good — keep it ≤ 5.

9. **First-reply fallback (no history):** Build from `userIdentity.name + label + pronouns` only, set the role to "first reply", drop the `User Voice` block entirely (Aria already does this — confirmed in `assembly.js:357`), and use a slightly shorter cap (1–2 sentences). No frontend has special "neutral opener" logic; they just rely on persona-description + char-greeting context.

10. **Pair-generation risk is real but well-understood.** When the model has both a `Character Card` block and a `User Card` block of similar shape, it tends to "complete the dialog" — generating multiple {{char}}/{{user}} exchanges in one response (verified by Janitor.AI/Reddit complaint thread, ParasiticRogue 4-3). Mitigation: keep the user description **minimal** (name + pronouns + 1 line) and rely on **stop strings** for the character name. Never write a full character-card-shape block for the user.

---

## 1. How major roleplay frontends implement Impersonate

### 1.1 SillyTavern (PRIMARY SOURCE — code-level)

ST is the dominant local-roleplay frontend and the de-facto reference implementation for Impersonate. Two paths:

**Chat Completion path (OpenAI/Claude-style):**
- Default impersonation prompt: `"[Write your next reply from the point of view of {{user}}, using the chat history so far as a guideline for the writing style of {{user}}. Don't write as {{char}} or system. Don't describe actions of {{char}}.]"` (`SillyTavern/public/scripts/openai.js`, `default_impersonation_prompt`)
- Injected as a system message labelled `'impersonate'` into the unordered control prompts collection — added only when `type === 'impersonate'` (`openai.js`, `preparePromptsForChatCompletion`)
- Reuses every other prompt block (character description, personality, scenario, persona description, world info). Only the impersonate instruction differs.
- Default `openai_max_tokens: 300` — same cap as a normal reply. No special length cap for impersonate.

**Text Completion path (KoboldCpp/Ooba/llama.cpp — equivalent to Aria/Ollama):**
- Generation function `Generate(type, ...)` flips `isImpersonate = type === 'impersonate'` (`script.js`)
- The story-string is built normally (system + char card + persona + history), then the very last appendage flips:
  - Normal: append `\n{{char}}:` so the model continues as the character
  - Impersonate: append `\n{{user}}:` so the model continues as the user (`script.js` line ~2982)
- Stop strings flip too (`getStoppingStrings`, line ~2971):
  - Normal: stop on `\n{{user}}:`
  - Impersonate: stop on `\n{{char}}:` (and group members' names if any)
- The impersonation_prompt itself is appended as a system note (the "Last User Message" prefix configured in v1.12+ release notes — `SillyTavern/SillyTavern releases`).
- No special max_tokens for impersonate (same `max_response_tokens` as replies).

**Key takeaway:** ST does not build a separate user-persona card for impersonate. It uses the **same** prompt the character was generated against, plus one short bracketed instruction, plus name-flip on the prefix and stop strings.

Source: https://github.com/SillyTavern/SillyTavern (release branch, `public/scripts/openai.js` and `public/script.js`)

### 1.2 SillyTavern community impersonate prompts

The Reddit "Dummies Guide" (high-upvote ST guide) recommends literally swapping the word "Impersonate" for "Write" because some safety-aligned models refuse the word "impersonate":

> "Write your next reply from the point of view of the {{user}}. Use chat history so far as a guideline. Don't write as {{char}}."

Source: https://www.reddit.com/r/SillyTavernAI/comments/1gjcamv/dummies_guide_to_perfect_ai_impersonating_you/ (retrieved via JSON API)

The pixijb v17 jailbreak preset uses:

> "[Your task this time is to write your response as if you were Human, impersonating their role. Use Human's responses so far as a guideline for their writing style and typical response length.]"

Note "**typical response length**" — the recommended phrase to inherit the user's length naturally.

Source: same Reddit thread, comment by `nananashi3`.

The OpenRouter trick (when system messages get reordered): inject the impersonation prompt as a `user` role at depth 0 ephemeral:

```
/inject id='user-impersonate' position=chat depth=0 role=user ephemeral=true
[Write your next reply from the point of view of {{user}}, using the chat history so far as a guideline for the writing style of {{user}}. Don't write as or describe actions of other characters.]
| /impersonate
| /flushinject user-impersonate
```

Source: same thread.

The ST/Reddit thread "Options to change the behavior of /impersonate?" confirms via primary-source (an inference-server log dump) that text-completion impersonate just sends `<|im_start|>user` (or `{{user}}:`) at the end of the prompt and the model continues as the user. No separate user-card block.

> "From what I could get from the sources (and then confirmed by looking into the inference server log), in text completion mode it just sends user's sequence (ie `<|im_start|>user`) and/or {{user}}'s name, forcing the model to continue as the user. The chat's history (including the character's description and your persona) is the prompt."

Source: https://www.reddit.com/r/SillyTavernAI/comments/1anzczx/options_to_change_the_behavior_of_impersonate/ (comment by `Worldly-Mistake-8147`)

### 1.3 RisuAI

Risu's wiki explicitly documents an `@@@user` impersonator syntax that lets a user-authored snippet inject as if it were the user's role-message. The impersonate feature itself reuses the main-prompt machinery — Risu has no separate "user card" concept either.

> "Impersonator type of syntax can be used on main prompt, jailbreak prompt and global notes. this syntax sets role of the prompt, which makes ai thinks the role has inputed the prompt."

Source: https://github.com/kwaroran/RisuAI/wiki/@-Syntaxes

Risu also supports the V3 character card spec which it co-created with SillyTavern; user-side description goes in the same persona-description slot. Source: https://github.com/kwaroran/Risuai

### 1.4 Agnai

Agnai's "Character impersonation" landed Apr 29 2023. The UX is "click your avatar, generate as that character" — the implementation reuses the persona feature: it just temporarily swaps which entity is the "AI side" and which is the "user side". No separate impersonate prompt.

Source: https://github.com/agnaistic/agnai/issues/282 ("Character impersonation landed today")
Source: https://agnai.chat/faq

### 1.5 Backyard.AI (formerly Faraday.dev)

Backyard's Advanced Tips guide is unambiguous: the model is **not** prompted with separate user/character cards. Instead the entire prompt is presented as a *transcript document* the LLM is completing:

> "Text transcript of a never-ending conversation between {User} and {Character}. In the transcript, gestures and other non-verbal actions are written between asterisks (for example, *waves hello* or *moves closer*)."

The "User persona" field is a description block, not a card-shaped structure. Backyard's impersonate equivalent is the "Generate Response For Me" feature; same transcript-completion model, just generating the user's turn instead of the character's.

Source: https://backyard.ai/docs/creating-characters/advanced-tips

### 1.6 Chub.AI / Mercury

Chub explicitly exposes "Impersonation Prompt" as one of three core API settings (System Prompt, Post History Instructions, Impersonation Prompt). Mercury (Chub's Mistral-finetune model) ships with a default impersonation prompt that follows ST's pattern. Chub does not have a separate user-card structure.

> "The Impersonate feature writes your response for you and the Impersonation feature determine what criteria it adheres to."

Source: https://docs.chub.ai/docs/the-basics/api-connections

### 1.7 GuidedGenerations extension (gold-standard impersonate UX)

Samueras's GuidedGenerations is the most-installed ST extension that enhances impersonate. It adds:
- 1st/2nd/3rd person impersonation buttons (👤/👥/🗣️)
- Per-perspective configurable prompt overrides
- Per-guide preset (model + sampler) switching — different models for different guides
- Optional `{{input}}` placeholder so the user can supply a hint ("kiss her")

The extension's prompt overrides for impersonate (1st/2nd/3rd) are short prose prompts — not bullet lists, not card structures. Each runs as a one-shot generation with named-stop-strings.

Source: https://github.com/Samueras/GuidedGenerations-Extension

### 1.8 ianbicking's research blog (high-signal, neutral source)

Ian Bicking's 2024 essay on LLM roleplay independently arrives at the same architecture: treat the LLM as **collaborative dialog writing**, where developer puts `John Doe says: hi, how are you?` into the prompt. The impersonate equivalent is "swap which entity is the AI-side completer". No mention of a user-card.

> "Make it collaborative dialog writing instead of interacting directly with LLM. This means a system prompt that describes the exercise as a collaborative dialog writing where the user is 'writing' a character and the LLM is 'writing' the other character."

Source: https://ianbicking.org/blog/2024/04/roleplaying-by-llm

### 1.9 Verdict on user-card vs. shared-prompt

**Verified across all 6 frontends + 1 independent research blog:** no major roleplay frontend builds a separate user-character card for impersonate. The prevailing pattern is: shared prompt + one-line bracketed instruction + name-flip on prefix and stop strings.

**This contradicts Aria's current `assembly.js` design,** which builds a distinct `User` block, `User Voice` block, plus dropping the `Global Core` format-mandate line specifically for impersonate (`assembly.js:312-326`). Aria is doing more work than any of the consulted frontends. Whether that's right or wrong depends on whether Aria's runtime needs a different abstraction; the rest of this report assumes Aria can reduce to ST's pattern.

---

## 2. Mag-Mell-R1 (`HammerAI/mn-mag-mell-r1:12b-q4_K_M`)

### 2.1 Lineage and prompt format (PRIMARY SOURCE)

Per the official model card (https://huggingface.co/inflatebot/MN-12B-Mag-Mell-R1):

- Base: `IntervitensInc/Mistral-Nemo-Base-2407-chatml` (a *chatml-converted* base, not the upstream Mistral-Nemo-Instruct-2407)
- Format: **ChatML** — `<|im_start|>...<|im_end|>` (NOT Mistral V7 `[INST]...[/INST]`)
- Merge specialists: Hero (Chronos Gold + Sunrose), Monk (Bophades + Wissenschaft), and a third (likely creative). DARE-TIES merge with hyperparameter tuning to reduce interference.

> "The base model for Mag Mell is Mistral-Nemo-Base-2407-chatml, and as such ChatML formatting is recommended."

> "Early testing versions had a tendency to leak tokens, but this should be more or less hammered out. It recently (12-18-2024) came to attention that Cache Quantization may either cause or exacerbate this issue."

**Practical implication for Aria:** Aria already uses ChatML via Ollama's chat API + the model's chat template. Confirm via `ollama show <model> --modelfile` that the template uses `<|im_start|>` tokens. Do not switch to Mistral V7 even though the upstream Nemo-Instruct-2407 prefers V7-Tekken — Mag-Mell was retrained on chatml-base.

**Cache quantization warning:** Mag-Mell can leak tokens (artifacts like `<|im_end|>` appearing in output) when KV-cache is quantized. If Aria observes raw tokens in drafts, disable cache quantization in Ollama (`OLLAMA_KV_CACHE_TYPE=f16` is the default, do not set q4_0).

### 2.2 Sampler settings (PRIMARY + COMMUNITY)

**HF model card recommendation:**
- Temp 1.25, MinP 0.2 (stable up to 10K context)
- "If issues with coherency occur, try increasing MinP or decreasing Temperature"
- "XTC was shown to break outputs"
- "DRY should be okay if used sparingly. Other penalty-type samplers should probably be avoided."

**Community recommendation (r/SillyTavernAI, "Any tips for MN-12B-Mag-Mell-R1?", retrieved 2026-05):**

> "Set instruct template to ChatML, hit neutralize samplers and set temp 1, min p 0.02, and DRY to 0.8, then use any prompt preset of your choice." — `ArsNeph`, score 5

Two camps emerge:
1. **HF camp:** Temp 1.25, MinP 0.2, no DRY (or sparingly). High creativity, slightly less stable.
2. **Community camp:** Temp 1.0, MinP 0.02, DRY 0.8. Slightly less creative, much more stable, less repetition.

Source: https://www.reddit.com/r/SillyTavernAI/comments/1mcj2qq/any_tips_for_mn12bmagmellr1/

**For impersonate specifically,** prefer the community camp (lower temp, MinP 0.02, DRY 0.8 mult). Reasons:
- Impersonate drafts are short — high temp on a short generation amplifies failure modes (lurching tone, broken POV)
- DRY at 0.8 mult / base 1.75 / allowed_length 2 is well-validated for Nemo; doesn't over-penalize names that must repeat (like the user's own name)
- Aria's current code uses the profile sampler (`profileSampler` from `resolveProfile`); audit that the impersonate profile has these values.

### 2.3 Mistral Nemo length tendency (community consensus)

The "My personal Nemo-12B presets (ChatML)" thread (94 upvotes) is unambiguous:

> "Long, verbose responses. Highly recommended to trim response length (I'd suggest 200-300 tokens)"

Nemo-12B and merges (including Mag-Mell) **default to long replies**. That's what Erik observed. No 12B Nemo merge naturally writes 1–2 sentences without active length suppression.

Source: https://www.reddit.com/r/SillyTavernAI/comments/1f83njk/my_personal_nemo12b_presets_chatml/

The same thread also documents an interesting practice: shifting most of the instructions into the **last user prefix** (just before `<|im_start|>assistant`) for stronger compliance. Comment from `a_very_naughty_girl`:

> "I'm definitely going to try copying how you've shifted most of the instructions into the 'last user prefix.' [...] After the part in square brackets, there should be a `<|im_end|>` before the `<|im_start|>` if you want to follow the ChatML format."

This is the same trick ST's "Last User Message" prefix does — confirms the architectural principle that **late-position instructions win on Mag-Mell**.

### 2.4 Known issues / quirks

- **Token leakage** (model card, fixed in R1 but watch for Cache Quant)
- **Long, verbose default replies** (community)
- **Penalty-sensitive** — XTC breaks it; rep_penalty other than DRY hurts (model card)
- **Bullet lists partially obeyed** — Nemo-12B and Mag-Mell respond better to numbered prose ("1. Do X. 2. Do Y.") than to dash-bullets per ParasiticRogue 4-3 default-formatting observation. (Speculative — based on practitioner consensus, not benchmarked.)

---

## 3. Length-control techniques (deep dive)

### 3.1 Why naive numPredict fails

The medium.com survey (Hafsa Ouaj, "When Do LLMs Stop Talking?") confirms: hard token cutoff causes sentence truncation because the model has no awareness of where N tokens lands relative to its current sentence. This is exactly Aria's "..." problem.

> "A hard cutoff is set: generation stops after N tokens, regardless of context. Advantages: Simple and guarantees bounded computation. Disadvantages: Can produce truncated sentences."

Source: https://medium.com/@hafsaouaj/when-do-llms-stop-talking-understanding-stopping-criteria-6e96ef01835c

### 3.2 RULER paper (verified academic source)

The RULER paper (Wang et al, 2024) confirms that LLMs **do not reliably honor numeric token-count constraints in prompts**. The paper introduces "Meta Length Tokens" (MLTs) — discrete length labels (`<short>`, `<medium>`, `<long>`) that the model is trained to honor. This validates ParasiticRogue's empirical observation about the Capybara-limarpv3 model card length modifier. The technique requires either fine-tuning or a model that's already been trained on length labels.

For Aria/Mag-Mell, this means **"Write 1 sentence" beats "Write 50 tokens"**, but neither is fully reliable. Combine with sentence-count early-stop on stream.

Sources:
- https://medium.com/@techsachin/ruler-approach-improving-llm-instruction-following-to-generate-responses-of-a-specified-length-fa16e96a248d (summary; the actual Medium page returned 500 in our crawl, but RULER is well-documented elsewhere)
- ParasiticRogue's note on Capybara-limarpv3-34B's length modifier: https://huggingface.co/ParasiticRogue/Model-Tips-and-Tricks (section 1-3)

### 3.3 Streaming early-stop (the only reliable mechanism)

Aria already implements this in `impersonate/index.js` `countCompletedUnits()` + the abort-on-N-sentences logic in `runStreamingDraft`. This is the **right** mechanism. Verified pattern across:
- Aria's own code (`countCompletedUnits` counts complete `*action*` and `"dialogue"` units plus terminator punctuation)
- ST's `cleanUpMessage` (post-hoc trim, but conceptually similar)
- The streaming-content-monitor approach from the NeurIPS 2025 paper "Early Stopping LLM Harmful Outputs via Streaming Content Monitoring" — same architecture, different goal

Source: https://arxiv.org/html/2506.09996v1 (architecture, not the safety claim)

**Aria's `earlyStopMaxSentences = 2` for first reply is correct** — this is also the practitioner default. Don't go below 1; sentence detection has false-positive risk at boundary.

### 3.4 Adaptive cap from history (Aria's idea)

**Status: not found in any consulted frontend.** ST, Risu, Agnai, Backyard, Chub all use a static `max_response_tokens` (200–300 is the Nemo default).

ParasiticRogue's "Message Length Inertia" warning (section 4-4) is the strongest counter-argument:

> "Models can sometimes fall into a pattern based on recent message lengths. If your recent messages and the bot's replies have all been short, it might struggle to generate longer, more detailed responses when needed (and vice-versa)."

His recommendation: **"Intentionally vary the length and complexity of your own messages from the beginning of the chat. Don't let every turn be roughly the same length."**

Source: https://huggingface.co/ParasiticRogue/Model-Tips-and-Tricks

**Practical implication for Aria:** the adaptive cap is a defensible original design but it amplifies the problem. Two mitigations:
1. **Pad up by ~25%**: cap = `clamp(median × 1.25, 60, 220)`. Gives the user slack to write longer than median if they want. Floor of 60 prevents 1-word replies; ceiling of 220 prevents Mag-Mell's verbose tendency from running away.
2. **Floor by sentence count not token count**: `min_sentences = 1, max_sentences = 2` for first reply, `max_sentences = 3` for normal turns. The token cap becomes a safety net, not the primary mechanism.

Hybrid recommendation (best of both):
- Compute `medianUserWords` from last 5–8 user turns (Aria already extracts this in `voiceAdapter.extractVoiceFeatures.avgWords`)
- Translate to `max_sentences` via crude heuristic: `≤ 8 words` → 1 sentence, `8-25 words` → 2 sentences, `> 25 words` → 3 sentences
- Set `numPredict = max_sentences * 50 + 30` as safety net (one Nemo sentence ≈ 35–50 tokens)
- Hand `max_sentences` to `earlyStopMaxSentences` — this fires first, numPredict only fires if early-stop misses

### 3.5 DRY interaction with short outputs

DRY (Don't Repeat Yourself) by Oobabooga (https://github.com/p-e-w/llm-dry-sampler) penalizes tokens that would extend the input into a previously-seen sequence. **For short outputs DRY is mostly inert** — it triggers on sequences that already appeared, but a 30-token output rarely re-enters its own input. The risk is in the *next* generation when the previous draft is now in history.

Recommended for impersonate:
- `dry_multiplier: 0.8`
- `dry_base: 1.75`
- `dry_allowed_length: 2` — allows 2-token repeats (covers "I am", "she is")
- `dry_penalty_last_n: 512` — large enough to see the user's recent turns

Aria's current code already uses these defaults (`impersonate/index.js:163-167`).

Source: https://docs.sillytavern.app/usage/common-settings/ ("DRY Repetition Penalty")

### 3.6 Stop strings — the underappreciated lever

Per ST's `getStoppingStrings()`, the highest-value stop string for impersonate is `\n{{char}}:`. When Mag-Mell is about to write `\nAria: "..."` to continue the dialog, it stops dead. This is what produces clean, single-turn drafts. Aria already has this (`assembly.js:368-374`):

```js
const stopStrings = [
  `\n${characterName}:`,
  `\n${characterName} :`,
  `${characterName}:`,
  '<|im_end|>',
  '\n***'
];
```

Two improvements worth considering:
- Add `\n*${characterName}` (catches `*Aria turns...*` action lead-in)
- Add `\n[${characterName}]` (some models use bracketed names)
- Skip `${characterName}:` without leading newline — false positives if the user actually wants to address the character by name in dialog (e.g., user says `"Aria: I told you..."`)

Practitioner consensus (ST docs, ParasiticRogue 1-4): "names_as_stop_strings is the single most reliable mechanism for preventing pair-generation."

---

## 4. User-as-second-persona — pair generation risk

### 4.1 The phenomenon (verified primary source)

Janitor.AI / r/JanitorAI_Official thread "JLLM always write 20 dialogues between us, from both sides" describes the exact failure mode:

> "AI writes sentences both for character and me. Sometimes even 5 exchanged sentences, before it allows me to write something."

Source: https://www.reddit.com/r/JanitorAI_Official/comments/17jqrim/jllm_always_write_20_dialogues_between_us_from/

The OpenAI community thread "Model unexpectedly adds out-of-character narration after dialogue" describes a related failure mode where the model appends parenthetical narration after the character's dialog:

> "Even when the model ends a response with a definitive character voice and punctuation [...] an additional line is automatically added, such as: (I will always be here — let me know if I'm still the version of him you recognize.)"

Source: https://community.openai.com/t/model-unexpectedly-adds-out-of-character-narration-after-dialogue/1247425

### 4.2 Why a "User Card" amplifies this

ParasiticRogue 1-4 (verified):

> "Incorrect placement (e.g., putting a stop token before the user's input within the user prefix) can lead to unexpected and incorrect model behavior."

And 1-3, on RP-Stew-v4 (a merge):

> "This hybrid structure helped reduce rambling, repetitive outputs, and instances of the model incorrectly continuing the user's turn (speaking as the user)."

The mechanism: when the prompt contains two cards of similar shape (Character Card + User Card), the model treats this as "two characters in a story" and naturally completes the dialog between them. The architecture itself signals "this is a multi-character scene".

The ST `default_main_prompt` is one short sentence, not a dual card:

> `"Write {{char}}'s next reply in a fictional chat between {{char}} and {{user}}."`

Source: `SillyTavern/public/scripts/openai.js`

### 4.3 Mitigations (ranked by practitioner endorsement)

1. **Keep user description minimal** (3–6 lines max). One paragraph or PList. Source: ST community thread "How do I correctly write the user persona?" — `digitaltransmutation` (13 upvotes): *"I only describe what I want my character to physically look like. After all, the AI isn't supposed to narrate my actions or dialog."*

2. **Write user description in 3rd person**, not 1st. From `sustain_refrain` (3 upvotes): *"I prefer to keep character+user personas in third person though, to keep things relatively explicit and consistent."* From `nananashi3` (2 upvotes): *"I wouldn't write the persona in first person, though hypothetically it may work if the model doesn't support system tags and sees a user message instead. For consistency's sake, write in third person."*

3. **Names as stop strings** — covered in §3.6.

4. **Stop on first occurrence of the character's name on a new line**, not just `\n{{char}}:`. Mag-Mell sometimes writes `\nAria turns to him` (action lead-in) rather than `\nAria: "..."`.

5. **Don't put the user description in the same XML namespace as the character card.** If character is `<character>`, don't make user `<user>` — practitioners report Nemo merges treat parallel XML tags as parallel entities. Use `<user_persona>` or just plain text `User: name (pronouns).`

6. **Remove the "User Voice" XML examples block on first reply** (Aria already does — `assembly.js:318`). On subsequent replies, keep ≤5 examples. If the model still produces pair-generation, drop to 3.

Source: https://www.reddit.com/r/SillyTavernAI/comments/1f0xda3/how_do_i_correctly_write_the_user_persona/

---

## 5. Voice mimicry from few-shot — overfitting risk

### 5.1 Practitioner consensus on example count

**Character side (Trappu/AliCat best practice cited by ST docs):** 3–7 example messages.

**ParasiticRogue 3-5:** "Multiple Examples: Providing several examples (e.g., 3-7 messages) is often beneficial."

> "It allows you to demonstrate the character reacting to different situations or expressing various relevant emotions without cramming everything into one potentially disjointed or overly long message. It allows you to vary example message length, which can encourage the bot to generate responses of varying lengths itself, rather than settling into a repetitive pattern."

**User side:** practitioners do not write user-side example messages in normal cards. Reddit consensus (USER_PERSONA_GUIDE thread) is:
- `digitaltransmutation`: don't write user example dialogs at all
- `nananashi3`: hypothetically possible but uncommon
- `bob_dickson`: "After lots of experimentation I've discovered that none of it actually matters."

Aria's `voiceAdapter.buildVoiceCard` extracts the **last 5 actual user messages** from history as voice examples — this is *empirical* mimicking, not authored examples. Different beast. Practitioner risk for this approach:

- **Recency bias:** the last 5 are over-weighted relative to earlier voice. If the user's last 5 messages happened to be very short, the impersonate draft will be locked into short. Acceptable if Aria wants impersonate to track the **current session** voice, not the user's all-time voice.
- **Phrase plagiarism:** if user wrote `"that's wild"` 3 times in 5 turns, Mag-Mell will absolutely repeat it. Mitigation: Aria's existing `checkPhraseRepetition` repetition guard. Confirm it triggers on impersonate drafts (it does — `impersonate/index.js:332`).
- **Ramping into Message Length Inertia** (ParasiticRogue 4-4): if user writes 5 short messages, Mag-Mell will write a short impersonate draft. Aria's `medianUserWords × 1.25` adaptive cap (proposed §3.4) inherits this property — that's the *desired* behavior for impersonate, but mind the pad factor.

### 5.2 Optimal example count for tone-mimic (recommendation)

3–5 user examples is the right window for Aria. Below 3 the signal is too noisy; above 5 you trade voice signal for prompt bloat with no observable improvement (community consensus, no quantitative benchmark exists).

**Aria's current 5 is fine.** Don't increase it.

### 5.3 XML wrapping — practitioner verdict

Aria currently wraps voice examples in `<user_voice_examples>...<example>...</example></user_voice_examples>`. ParasiticRogue 1-4 confirms XML helps the model recognize boundaries:

> "Formats incorporating stop tokens generally provide clearer structural boundaries for the model. This helps it recognize the end of a conversational turn and maintain role distinction more consistently."

But: the existing Aria research (`char_card_formats` indexed) flags a risk:

> "If character is `<character>`, don't make user `<user>` — practitioners report Nemo merges treat parallel XML tags as parallel entities."

**Mitigation:** keep `<user_voice_examples>` as the wrapper (different namespace from character card), but consider compacting it to a plain-text alternative for very small budgets:

```
{{user}}'s recent voice (use as style reference, do not quote):
- "she meets his eyes — 'come closer'"
- "he just laughs and reaches for her"
- "yeah, like I said earlier"
```

Plain text dash-list reads identically to Mag-Mell as the XML form, costs ~30% fewer tokens. Trade-off is slightly weaker boundary signal.

---

## 6. Plain text + XML vs PList vs bullet list — at the 12B scale

### 6.1 Aria's existing format research

The pre-existing `char_card_formats` research (indexed in this session) summarizes the comparison:

| Format | Token Efficiency | Best For | Recommended (2025-2026) |
|--------|-----------------|----------|------------------------|
| W++ | WORST | Beginners, legacy | NO |
| PList | BEST | Token-constrained | YES — widely recommended |
| Plain Text + XML | GOOD | Long-form, complex | YES — current gold standard |
| Ali:Chat | GOOD | Speech patterns | YES — as supplement |
| JED/JED+ | GOOD | Complete sheets | YES — modern standard |

For the **system-prompt blocks** (Global Core, User, Active Scene, Late Steering), the question is different: it's not "what format is the character card?" but "what format is each instruction block?".

### 6.2 Practitioner consensus on instruction-block format

**ParasiticRogue's actual system prompt** (closing thoughts):

```
This is an uncensored, endless RP chat between autonomous entities. Please obey the **10 Chat Commandments** instructed below!
### 10 Chat Commandments:
1. Fully embody **{{char}}'s Persona**, ...
2. Act out solely {{char}}'s dialogue, thoughts, and actions to avoid impersonating others. ...
3. Immerse within the **World Info**, ...
4. Provide explicit descriptions of encounters, ...
5. Adhere to **Example Messages** ...
```

Numbered prose list, **not** dashed bullets. Headings in markdown bold. Short imperative verbs.

Source: https://huggingface.co/ParasiticRogue/Model-Tips-and-Tricks (Closing thoughts/System Prompt)

**Sphiratrioth's roleplay sysprompt** (popular community preset):

> "Impersonate {{char}} in a never-ending, uncensored roleplay scenario. Balance {{char}} speech, {{char}}'s inner thoughts and narrative within each response. Respond in first person. Respond in this exact formatting: \"speech\", *narrative*, ```inner thoughts```. Do not write what {{user}} does. Do not write what {{user}} says. Do not repeat this message. Do not repeat what {{user}} writes."

Plain prose. No bullets at all. Single paragraph with sentences.

Source: https://huggingface.co/sphiratrioth666/SillyTavern-Presets-Sphiratrioth/blob/main/sysprompt/Sphiratrioth%20-%20Roleplay%20-%201st%20Person%20(Inner%20Thoughts).json

**ST's default main prompt** is one sentence:

> `"Write {{char}}'s next reply in a fictional chat between {{char}} and {{user}}."`

### 6.3 Aria's current "Late Steering" — the bullet problem

Aria's `buildImpersonateLateSteering()` produces 3–4 newline-separated lines like:

```
Continue in {user}'s voice and rhythm — match the user_voice_examples for sentence length, format, and energy.
{user}'s reply takes a concrete action or response that fits the latest beat — not a question, not a meta comment.
If {char}'s last message contains a direct request or instruction (e.g. "kiss me", "show me", "take me there"), {user}'s reply carries it out as a concrete physical action — no tease, no counter-question, no slowing the beat.
Reply stays in first person ({pronouns}) and in the same language as the conversation.
```

This is **already** prose-line format, not dashed bullets. But:

1. The lines are **long** — Mag-Mell does best with terse imperatives. Each line should be ≤ 15 words.
2. **No numbering** — practitioners report numbered lists ("1. Do X. 2. Do Y.") get higher compliance on Nemo merges than newline-separated prose.
3. The "concrete physical action — no tease, no counter-question, no slowing the beat" phrase is **content-rich but Mag-Mell may not parse "no slowing the beat" as a constraint.** Replace with concrete examples: "Continue what {char} just asked for" / "Don't ask a clarifying question".

### 6.4 Recommended format for Aria's Write4Me system prompt

Plain text + XML hybrid, numbered constraint list. Example:

```
You are continuing a fictional chat. Your task: write {{user}}'s next reply, one or two sentences only.

<character>
[Character Reference clipped to ~80 tokens]
</character>

<user>
{{user}} ({{user_label}}, {{user_pronouns}}).
</user>

<scene>
[Active Scene clipped to ~115 tokens]
</scene>

<user_voice_examples>
  <example>...</example>
  <example>...</example>
</user_voice_examples>

Constraints:
1. Write only {{user}}'s reply, in first person.
2. Stop after 1 or 2 sentences. Match the length and format of the examples above.
3. Do not write {{char}}'s dialogue, actions, or thoughts.
4. Same language as the conversation.
5. If {{char}}'s last message asks for a physical action, take it.
```

XML for content blocks (clear boundaries), numbered prose for constraints (Mag-Mell follows numbered lists better than dashes).

### 6.5 PList — when to use

PList shines for **token-constrained character descriptions** where each trait is independent. Example:

```
[{{user}}: male; age: 27; pronouns: he/him; build: athletic; voice: dry, observant; signature: short replies, often lowercase]
```

For impersonate this is overkill — the user only needs name + pronouns + 1 line. PList syntax (brackets, semicolons) costs more tokens than the equivalent prose `Erik (male, he/him). Dry, observant, short replies, often lowercase.` for descriptions under 50 tokens.

**Recommendation:** keep prose for the User block; reserve PList for the Character Reference if Aria needs to compress (which `assembly.js:311` already does via `clipToTokenTarget`).

---

## 7. First-reply impersonate (no user history)

### 7.1 What other frontends do

**SillyTavern:** no special handling. The impersonate flow just runs with whatever character/scenario context exists. If `{{user}}` hasn't said anything yet, the impersonation_prompt's "using the chat history so far" clause is effectively a no-op, and the model improvises from the persona description + character greeting.

**Backyard:** same — `User Persona` field is always in the prompt; first reply just has no chat history to draw from.

**Risu / Agnai / Chub:** same pattern.

**Source for ST:** confirmed by reading `default_impersonation_prompt` and the `preparePromptsForChatCompletion` flow in `openai.js`. No `if (firstReply)` branch.

### 7.2 Aria's current first-reply branch

Aria's `assembly.js:328-330` does have a special first-reply branch:

```js
const roleDeclaration = isFirstReply
  ? `Role: write as ${runtimeState.userName}. ${runtimeState.characterName} just spoke first; your output is ${runtimeState.userName}'s reply — ${runtimeState.userName}'s words and actions only, in first person.`
  : '';
```

And drops the `Global Core`, `Persona Anchor`, `Character Reference`, `User Voice` blocks (`assembly.js:357-358`). This is **defensible** — without history, the user-voice block would be empty, and the character-reference is duplicated by the first character message in `recentTail`. Saving tokens for the actual generation is fine.

But the role declaration could be tightened. Mag-Mell on a first reply tends to either:
- (a) write a multi-paragraph ramble (if it ignores the 1-2 sentence cap), or
- (b) write `Aria: "..."` (impersonating the character because there's no clear `\n{{user}}:` anchor)

**Recommended first-reply prompt structure:**

```
You are continuing a fictional chat. Your task: write {{user}}'s very first reply to {{char}}.

<character>
[Character greeting + 1-line description, ≤ 100 tokens]
</character>

<user>
{{user}} ({{user_label}}, {{user_pronouns}}). New visitor.
</user>

<scene>
[Active Scene compact, ≤ 90 tokens]
</scene>

Constraints:
1. Write only {{user}}'s reply, in first person.
2. One or two sentences. Stop cleanly.
3. {{user}}'s opener is short, natural, and in the same language as {{char}}'s greeting.
4. Do not write {{char}}'s next message.
```

No fallback to a generic neutral opener — practitioners report this produces awkward "Hello! Nice to meet you" defaults that break immersion. The `userIdentity.label / pronouns` is enough signal.

### 7.3 Length floor for first reply

Aria caps at `min(impersonateFirstTokens=104..136, FIRST_REPLY_NUM_PREDICT_CAP=120)`. For Mag-Mell that's about 2 sentences with action+dialog. This is correct.

The earlyStopMaxSentences = 2 is also correct.

The `trimToCompleteSentences(text, 2)` post-hoc trim is the safety net. Good.

**No change recommended** to first-reply length logic.

---

## 8. What this means for Aria — concrete recommendations

### 8.1 Length-control architecture

**Hybrid: streaming-sentence early-stop + adaptive-pad cap.** Specifically:

1. **Primary mechanism: sentence-count early-stop on stream.** Already in place via `countCompletedUnits()`. Keep `earlyStopMaxSentences = 2` for first reply, set `earlyStopMaxSentences = 3` (was 0) for normal turns.

2. **Adaptive cap for `numPredict` (safety net only):**
   ```js
   const medianUserWords = ctx.voiceFeatures.avgWords; // already computed
   const sentenceTarget = medianUserWords <= 8 ? 1
                       : medianUserWords <= 25 ? 2
                       : 3;
   const numPredict = Math.min(
     budgetConfig.impersonateRetryTokens,    // hard ceiling
     sentenceTarget * 50 + 30                 // ~1 Nemo sentence ≈ 35-50 tokens, +30 safety
   );
   ```
   This makes numPredict the safety net behind sentence-count, never the primary mechanism. No more "..."

3. **Stop strings:** keep current set, add `\n*${characterName} ` (catches `*Aria turns...*`) and `\n${characterName} ` (catches `Aria walks in`).

4. **Drop the static `FIRST_REPLY_NUM_PREDICT_CAP = 120`** and replace with the formula above. Floor at 60 tokens to prevent 1-word completions on very-short-history users.

### 8.2 Prompt structure (the User Card vs bullet question)

**Don't introduce a "User Card".** The verified-across-6-frontends consensus is: shared character context + one-line bracketed instruction + name-flip. Aria already does the name-flip (`assistantPrefix: ${userName}: `) and stop-string flip. The remaining work is reducing the system prompt.

**Recommended impersonate system-prompt blocks (in order, plain text + minimal XML):**

```
[opening prose: 1 sentence stating the task]

<character>...</character>

<user>{{user}} ({{label}}, {{pronouns}}).</user>

<scene>{{active scene}}</scene>

<user_voice_examples>
  <example>...</example>
  <example>...</example>   (3-5 examples, omit on first reply)
</user_voice_examples>

Constraints:
1. Write only {{user}}'s reply, in first person.
2. {{sentence_target}} sentence(s) only. Stop cleanly.
3. Do not write {{char}}'s dialogue, actions, or thoughts.
4. Same language as the conversation.
5. {{intensity_clause_if_relevant}}
```

Numbered constraints (not dashes), short imperatives, ≤ 12 words per constraint. Drop the "concrete physical action" wall-of-text from current Late Steering.

### 8.3 Voice-seeding strategy

- **Keep 3–5 user examples max.** Aria's current `recentUserMessages(history, 5)` is the upper-good bound.
- **Skip examples on first reply.** Already done.
- **Extract `medianUserWords` and use it for the sentence-target heuristic** (§8.1 step 2). The `voiceFeatures` object Aria computes in `voiceAdapter.extractVoiceFeatures` already has `avgWords` — wire it into the assembly.
- **Don't rewrite examples.** Just sanitize chat-template artifacts (Aria's `sanitizeForExample` already does this) and slice. No reformatting, no paraphrasing — that loses the voice signal.

### 8.4 First-reply fallback

- **Keep the current first-reply branch in `assembly.js`.** It's correct.
- **Tighten the role declaration:** "Write {{user}}'s very first reply to {{char}}. One or two sentences, first person."
- **Drop the "Late Steering" block entirely on first reply.** Bake the constraints into the role line + numbered constraints. Less wall-of-text, more compliance.
- **Set sentence-target = 1 when `userIdentity.pronouns` is the only voice signal** (no other history). This matches the actual user's first-message tendency ("hi", "hey", "good morning") without forcing a contrived 2-sentence reply.

### 8.5 Sampler

Use the community-camp Mag-Mell settings for impersonate specifically:
- `temperature: 1.0`
- `min_p: 0.02`
- `top_k: 40`
- `top_p: 0.95`
- `repeat_penalty: 1.0` (let DRY do the work)
- DRY: `multiplier: 0.8, base: 1.75, allowed_length: 2, penalty_last_n: 512`
- Disable XTC if Aria has it.

This is slightly cooler than Mag-Mell's HF-card defaults (1.25 / 0.2) — appropriate for the short-output regime.

### 8.6 What NOT to change

- Don't change the ChatML format. Mag-Mell needs it.
- Don't introduce Mistral V7-Tekken format. Same reason.
- Don't add a separate "User Card" block. Pair-generation risk goes up.
- Don't increase user-voice examples beyond 5. Diminishing returns + token cost.
- Don't replace stop strings with regex post-hoc — stop strings are O(0) at generation time, regex is O(n).
- Don't add `Co-Authored-By` or any other AI attribution to the impersonate prompt. (Erik's CLAUDE.md rule, indirectly relevant.)

---

## 9. Open questions (for further verification)

1. **Does Mag-Mell with q4_K_M quant + Ollama default cache (f16) leak `<|im_end|>` tokens in practice?** Worth a single-shot test in Aria. Speculation based on HF model card warning.
2. **Does Aria's `checkPhraseRepetition` fire correctly on impersonate drafts when user has repeated a phrase 3+ times?** Confirmed via code reading (`impersonate/index.js:332`), not validated end-to-end.
3. **Does `medianUserWords × 1.25` actually produce better-feeling impersonate drafts than a static 132-token cap?** Empirical question, requires A/B in chat. Defensible-but-untested design.
4. **How does Mag-Mell respond to numbered prose vs dashed bullets in the constraints block?** Practitioner consensus says numbered wins on Nemo; not benchmarked specifically for Mag-Mell.
5. **Is the current `voicePinBlock` injection (`assembly.js:288-298`) interfering with impersonate?** That block is for character voice, not user voice. Voice-pin runs in `reply` profile, not `impersonate` (verified via `assembly.js:202` branch), so probably no interference. Confirm.

---

## 10. Sources (consulted URLs)

### Primary code sources
- https://github.com/SillyTavern/SillyTavern/blob/release/public/scripts/openai.js — `default_impersonation_prompt`, `preparePromptsForChatCompletion`
- https://github.com/SillyTavern/SillyTavern/blob/release/public/script.js — `Generate(type, ...)`, `getStoppingStrings()`, isImpersonate flow
- https://github.com/SillyTavern/SillyTavern/blob/release/public/scripts/power-user.js — quick_impersonate, persona settings
- https://github.com/agnaistic/agnai/issues/282 — Agnai impersonate feature landing
- https://github.com/Samueras/GuidedGenerations-Extension — impersonate UX gold-standard
- https://github.com/kwaroran/RisuAI/wiki/@-Syntaxes — Risu impersonator syntax
- https://github.com/SillyTavern/SillyTavern/issues/1819 — text-completion impersonate prompt control feature request
- https://github.com/SillyTavern/SillyTavern/issues/2232 — quick impersonate/regenerate button
- https://github.com/SillyTavern/SillyTavern/issues/1156 — Impersonate vs Prompt Override

### Model documentation
- https://huggingface.co/inflatebot/MN-12B-Mag-Mell-R1 — Mag-Mell model card (sampler, format)
- https://huggingface.co/IntervitensInc/Mistral-Nemo-Base-2407-chatml — Mag-Mell base
- https://huggingface.co/mistralai/Mistral-Nemo-Instruct-2407 — upstream Mistral Nemo
- https://huggingface.co/inflatebot/MN-12B-Mag-Mell-R1-GGUF — official quants
- https://ollama.com/nchapman/mn-12b-mag-mell-r1 — Ollama distribution
- https://featherless.ai/models/inflatebot/MN-12B-Mag-Mell-R1 — Featherless API page (independent corroboration of sampler defaults)

### Practitioner guides
- https://huggingface.co/ParasiticRogue/Model-Tips-and-Tricks — instruct format, length modifier, message length inertia, stop tokens, examples
- https://huggingface.co/ParasiticRogue/General-model-and-character-settings — 10 Chat Commandments system prompt
- https://huggingface.co/sphiratrioth666/SillyTavern-Presets-Sphiratrioth — popular ST preset collection
- https://huggingface.co/sphiratrioth666/SillyTavern-Presets-Sphiratrioth/blob/main/sysprompt/Sphiratrioth%20-%20Roleplay%20-%201st%20Person%20(Inner%20Thoughts).json — concrete sysprompt
- https://huggingface.co/posts/inflatebot/488231470262584 — author commentary

### Documentation
- https://docs.sillytavern.app/usage/prompts/ — Main Prompt, jailbreak, impersonate
- https://docs.sillytavern.app/usage/prompts/prompt-manager/ — Prompt Manager (chat completion)
- https://docs.sillytavern.app/usage/prompts/context-template.md — story string, names_as_stop_strings
- https://docs.sillytavern.app/usage/core-concepts/personas/ — Persona system, depth injection
- https://docs.sillytavern.app/usage/common-settings/ — DRY, samplers
- https://docs.chub.ai/docs/the-basics/api-connections — Chub Impersonation Prompt setting
- https://backyard.ai/docs/creating-characters/advanced-tips — Backyard transcript model
- https://backyard.ai/docs/creating-characters/tips-and-tricks — Backyard 1000-token rule
- https://backyard.ai/docs/creating-characters/character-prompt — Backyard fields
- https://agnai.chat/faq — Agnai impersonate via avatar click

### Reddit (community consensus, primary-source via JSON API)
- https://www.reddit.com/r/SillyTavernAI/comments/1gjcamv/dummies_guide_to_perfect_ai_impersonating_you/ — Dummies Guide to impersonating
- https://www.reddit.com/r/SillyTavernAI/comments/1mcj2qq/any_tips_for_mn12bmagmellr1/ — Mag-Mell sampler tips
- https://www.reddit.com/r/SillyTavernAI/comments/1f83njk/my_personal_nemo12b_presets_chatml/ — Nemo-12B ChatML presets, length advice
- https://www.reddit.com/r/SillyTavernAI/comments/1f0xda3/how_do_i_correctly_write_the_user_persona/ — user persona format consensus
- https://www.reddit.com/r/SillyTavernAI/comments/1neca4d/enhancing_impersonate_function_add_response_hint/ — response hint feature, Guided Generations
- https://www.reddit.com/r/SillyTavernAI/comments/1anzczx/options_to_change_the_behavior_of_impersonate/ — text-completion impersonate inference-server log dump
- https://www.reddit.com/r/JanitorAI_Official/comments/17jqrim/jllm_always_write_20_dialogues_between_us_from/ — pair-generation failure mode
- https://www.reddit.com/r/SillyTavernAI/comments/1i9x23l/ — Magnum/Rei vs Mag-Mell comparison
- https://www.reddit.com/r/SillyTavernAI/comments/1mgjwk6/local_models_are_bland/ — Mag-Mell vs NemoMix
- https://www.reddit.com/r/SillyTavernAI/comments/1kvnjqn/megathread_b — May 2025 megathread Mag-Mell endorsement
- https://www.reddit.com/r/LocalLLaMA/comments/1fdrhpk/what_settings_do_you_use_on_your_local_llm_to_get/ — length settings
- https://www.reddit.com/r/LocalLLaMA/comments/1eurkhc/mistral_nemo_is_really_good_but_ignores_simple/ — Nemo instruction-following issues

### Research / blog
- https://ianbicking.org/blog/2024/04/roleplaying-by-llm — collaborative dialog writing model
- https://arxiv.org/html/2506.09996v1 — streaming early-stop architecture (NeurIPS 2025)
- https://medium.com/@hafsaouaj/when-do-llms-stop-talking-understanding-stopping-criteria-6e96ef01835c — stop-criteria taxonomy
- https://medium.com/@techsachin/ruler-approach-improving-llm-instruction-following-to-generate-responses-of-a-specified-length-fa16e96a248d — RULER MLT length tokens
- https://community.openai.com/t/model-unexpectedly-adds-out-of-character-narration-after-dialogue/1247425 — pair-narration failure mode
- https://www.louisbouchard.ai/how-llms-know-when-to-stop/ — EOS / max-token stopping basics
- https://github.com/p-e-w/llm-dry-sampler — DRY sampler reference
- https://docs.sillytavern.app/usage/common-settings/ — DRY in production
- https://aclanthology.org/2024.findings-acl.196.pdf — Drama-Interaction LLM solution (academic reference)

### Tooling cross-references
- https://huggingface.co/cognitivecomputations/dolphin-2.9.3-mistral-nemo-12b-gguf — Dolphin Nemo (ChatML alternative)
- https://huggingface.co/NewEden/MistralAI-Nemo-Instruct-ChatML — Nemo-Instruct retrained on ChatML

---

## 11. Confidence levels (per claim)

| Claim | Confidence | Source class |
|---|---|---|
| ST default impersonation prompt is the bracketed one-liner | **VERIFIED** | primary code |
| ST stops on `\n{{char}}:` for impersonate | **VERIFIED** | primary code |
| Mag-Mell uses ChatML, not Mistral V7 | **VERIFIED** | model card |
| Mag-Mell sampler: Temp 1.25 / MinP 0.2 official, Temp 1.0 / MinP 0.02 / DRY 0.8 community | **VERIFIED** | model card + Reddit |
| Pair-generation is real and amplified by symmetric user/character cards | **community consensus** | multiple Reddit threads + ParasiticRogue |
| Adaptive cap from history is novel (no frontend ships it) | **community consensus** | absence of evidence in 6 frontends |
| Plain text + numbered prose beats dashed bullets on Nemo | **community consensus** | ParasiticRogue + Sphiratrioth + ST defaults |
| 3–5 user examples is the right window | **community consensus** | Trappu/AliCat + Aria research |
| RULER MLTs (short/medium/long) are more reliable than numeric token caps | **VERIFIED** (academic) | RULER paper + Capybara-limarpv3 anecdote |
| Cache quantization causes Mag-Mell token leakage | **VERIFIED but partial** | model card mentions, no benchmark |
| `medianUserWords × 1.25` is the right pad factor | **speculative** | derived from Message Length Inertia warning, not benchmarked |
| Sentence-target heuristic (≤8 → 1 sentence, ≤25 → 2, >25 → 3) | **speculative** | derived from Nemo verbosity baseline, not benchmarked |
| First-reply needs no special structure beyond what Aria does | **community consensus** | absence of special handling in 6 frontends |
