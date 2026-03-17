# Character Card Format Research (2026-03-17)

Comprehensive comparison of character card formats across all major AI roleplay platforms.

---

## FORMAT COMPARISON TABLE

| Format | Token Efficiency | Best For | Still Recommended (2025-2026)? |
|--------|-----------------|----------|-------------------------------|
| W++ | WORST (~60% wasted on syntax) | Beginners, legacy Pygmalion | NO — universally deprecated |
| PList | BEST (minimal overhead) | Token-constrained cards, lorebooks | YES — widely recommended |
| Plain Text + XML | GOOD (near zero waste) | Long-form characters, complex lore | YES — current gold standard |
| Ali:Chat | GOOD (dialogue = efficient) | Speech patterns, personality demos | YES — as supplement to other formats |
| JED/JED+ | GOOD (structured plain text) | Complete character sheets | YES — modern standard template |
| Square Brackets | GOOD (minimal syntax) | NovelAI, quick definitions | NICHE — NovelAI-specific |
| ATTG | GOOD | NovelAI story initialization | NICHE — NovelAI only |

---

## 1. W++ FORMAT

### Syntax
```
[character("Alice")
{
Species("Human")
Mind("curious" + "playful" + "intelligent")
Personality("cheerful" + "witty" + "caring")
Body("petite" + "blonde hair" + "blue eyes")
Loves("books" + "coffee" + "stargazing")
Description("A university student who studies astronomy")
}]
```

### Token Efficiency
- WORST of all formats. ~60% of tokens wasted on syntax characters (`{`, `}`, `(`, `)`, `"`, `+`)
- A 900-token W++ card contains ~360 tokens of actual content and ~540 tokens of formatting junk

### Pros
- Easy to learn, fill-in-the-blank structure
- Clear visual separation of categories
- Mind + Personality double-biasing can strengthen traits

### Cons
- Massive token waste — the brackets/quotes/plus signs mean nothing to LLMs
- LLMs don't understand pseudocode better than prose — this was a myth from early Pygmalion days
- Limits description depth due to wasted space
- Output quality rated "Average/Worst" by multiple guides

### Platform Usage
- Originally from Pygmalion community (2023)
- SillyTavern: NOT recommended (all 3 official guides discourage it)
- Chub.ai: Legacy cards still use it, new cards mostly don't
- Still used by beginners who find old tutorials

### Verdict: DEPRECATED. Every modern guide recommends against it.

---

## 2. PList (Property List) FORMAT

### Syntax
```
[Alice: female human; age: 21; height: 165cm; hair: blonde, wavy, shoulder-length; eyes: sapphire blue; body: petite, athletic; personality: curious, playful, intelligent, witty; likes: astronomy, coffee, old books; dislikes: small talk, dishonesty; occupation: university student; quirks: adjusts glasses when nervous, hums while thinking]
```

### Token Efficiency
- BEST format. Minimal overhead (just brackets, colons, semicolons, commas)
- Same character in W++ = ~900 tokens, in PList = ~350-400 tokens (55-60% reduction)
- kingbri's guide: reduced a character from 1,300 to 599 tokens using PList + optimization

### Pros
- Extremely token-efficient
- Clean, scannable structure
- Prevents bracket leakage into AI output (unlike W++)
- Works well combined with Ali:Chat examples
- Easy to fit in Author's Notes / Character Notes for injection

### Cons
- Less readable for non-technical creators
- Trait-list style can feel limiting for nuanced characters
- No room for behavioral context (pair with Ali:Chat for that)

### Platform Usage
- SillyTavern: Officially recommended (Trappu's guide, kingbri's guide)
- Chub.ai: Top-rated cards frequently use PList or PList+Ali:Chat
- RisuAI: Supported
- KoboldAI/KoboldCpp: Works well with story mode

### Verdict: ACTIVELY RECOMMENDED. Top choice for token-efficient cards.

---

## 3. PLAIN TEXT + XML TAGS

### Syntax
```xml
<character>
Alice is a 21-year-old astronomy student with wavy blonde hair and sapphire blue eyes. She's curious and playful, always chasing the next discovery.

She speaks with enthusiasm about celestial phenomena, often trailing off mid-sentence when a new thought strikes her. She adjusts her glasses when nervous and hums constellations under her breath.
</character>

<personality>
Cheerful and witty with genuine warmth. Fiercely independent but secretly craves connection. Hides vulnerability behind humor.
</personality>

<appearance>
Petite and athletic. Wavy blonde hair to her shoulders, often tucked behind one ear. Sapphire eyes behind round glasses. Usually in oversized sweaters and jeans.
</appearance>
```

### Token Efficiency
- Near-zero waste. XML tags cost only a few tokens each
- Natural language = maximum information density per token
- Paragraphs of ~100 words recommended for best LLM comprehension

### Pros
- LLMs understand natural language best — this is what they're trained on
- Maximum expressiveness and nuance
- XML tags provide clean section separation without confusing the model
- Can express complex personality dynamics, contradictions, behavioral triggers
- Scales well for detailed characters (800-2000+ tokens)
- Different bracket types for different purposes: () general, [] AI directions, {} emphasis

### Cons
- Harder to write well — requires actual writing skill
- Can become bloated without discipline
- No fill-in-the-blank structure for beginners

### Platform Usage
- SillyTavern: RECOMMENDED by CharacterProvider guide (current gold standard)
- Chub.ai: Increasingly dominant for high-quality cards
- RisuAI: Supported
- Backyard.AI: Native format (persona descriptions in plain text)
- All platforms: Universal compatibility

### Verdict: CURRENT GOLD STANDARD. Best for quality-focused cards.

---

## 4. ALI:CHAT FORMAT

### Syntax
```
{{char}}: *adjusts her round glasses nervously* Oh! You're in Professor Kane's class too? I thought I was the only one who actually liked the 8 AM lectures. *laughs softly* The sunrise through the observatory windows makes it worth it, you know?

{{user}}: What are you studying?

{{char}}: *eyes light up* Astrophysics! Specifically exoplanet atmospheres. *leans forward excitedly* Did you know we found biosignatures on Kepler-442b last month? Sorry, I get carried away. *tucks hair behind ear* Most people stop listening after "astrophysics."
```

### Token Efficiency
- Good. Dialogue is naturally token-efficient
- Shows personality through behavior rather than listing traits
- Each exchange demonstrates multiple traits simultaneously (speech pattern + personality + mannerisms)

### Pros
- BEST for establishing speech patterns and voice
- Shows rather than tells — LLMs learn by example
- Implicit characterization through action and dialogue
- Works across all models and platforms
- Can be combined with any other format
- `<START>` separators between blocks improve consistency

### Cons
- Requires strong creative writing skills
- Labor-intensive to write well
- Can cause repetitiveness if examples are too similar
- Relies on pattern reinforcement — may not hold over long conversations
- Takes permanent token space when in Description field

### Platform Usage
- SillyTavern: Officially recommended (AliCat's guide)
- Chub.ai: Very common as supplement to PList or Plain Text
- All Tavern-compatible platforms: Supported via {{char}}/{{user}} macros

### Verdict: ACTIVELY RECOMMENDED as supplement. Best combined with PList or Plain Text for trait definitions.

---

## 5. JED / JED+ TEMPLATE

### Structure
```markdown
## Setting
Time Period, World Details, Main Characters

## Overview
One-paragraph character summary

## Appearance
Race | Height | Age | Hair | Eyes | Body | Face | Features

## Starting Outfit
Head | Accessories | Top | Bottom | Shoes

## Personality
Archetype | Tags | Likes | Dislikes | Deep-Rooted Fears
- When Safe: ...
- When Alone: ...
- When Cornered: ...
- With {{user}}: ...

## Speech
Style | Quirks | Ticks
[Speech Examples: greetings, pleas, embarrassment, etc.]

## Sexuality (optional)
Orientation | Kinks | Preferences | Quirks

## Notes
[AI behavior instructions in brackets]

## Scenario Memo
[Elements the AI tends to forget]
```

### Token Efficiency
- Good. Uses markdown headings (cheap) + concise attribute lists
- Recommended size: 800-1800 tokens
- Delete unused sections to save tokens

### Pros
- Most complete template available — covers everything
- Blend of Plain Text, Ali:Chat, XML, Markdown, and Character Sheet
- Context-based personality (When Safe / When Cornered / etc.) is powerful
- Character Synonyms section prevents name repetition
- Scenario Memo for elements AI tends to drop
- Premise `<details>` for hidden background context

### Cons
- Complex — many sections to fill out
- Can easily exceed token budgets if not pruned
- Designed for experienced card makers

### Platform Usage
- SillyTavern: Recommended by CharacterProvider (creator community)
- Chub.ai: Used by top card creators
- Available as .md and .png templates

### Verdict: MODERN STANDARD for serious card creators. Best as starting template, then prune.

---

## 6. SQUARE BRACKET FORMAT

### Syntax
```
[ Name: Alice | Age: 21 | Occupation: Student ]
[ Personality: curious, playful, intelligent ]
[ Appearance: petite, blonde, blue eyes, glasses ]
[ Setting: University campus, modern day ]
```

### Token Efficiency
- Good. Similar to PList but with different delimiter style
- Spaced brackets `[ ]` have special meaning in NovelAI models

### Platform Usage
- NovelAI: Primary format (spaced brackets = special tokens for Kayra/Erato)
- Other platforms: Works but no special treatment

### Verdict: NICHE. Use only with NovelAI models.

---

## PLATFORM-SPECIFIC DETAILS

### SillyTavern
- **Fields:** Name (required), Description, Personality, Scenario, First Message, Alternate Greetings, Example Dialogues, Character Note, System Prompt override, Post-History Instructions
- **Format:** No single recommendation — points to 3 community guides (Trappu/PList+Ali:Chat, AliCat/Ali:Chat, kingbri/Minimalist)
- **Community consensus:** Plain Text + XML for description, PList for Author's Notes, Ali:Chat for examples
- **Macros:** {{char}}, {{user}}, `<START>` separators
- **Supports:** Character Card V2, V3 import/export

### Chub.ai / Venus
- **Uses:** Character Card V2 spec (PNG embedded metadata)
- **Top cards:** Mix of PList, Plain Text, and Ali:Chat. W++ is declining
- **Community:** Largest character card repository alongside CharacterHub
- **NSFW:** Explicit trait sections, uncensored scenario descriptions, kink lists

### JanitorAI
- **Fields:** Name, Description, Personality, Scenario, First Message, Example Dialogues
- **Format:** Mirrors Tavern-style fields. W++ still common but declining
- **Community:** More casual, simpler cards. Many beginner-friendly W++ templates
- **NSFW:** Heavily NSFW-focused platform, explicit personality traits common

### Character.AI
- **Fields:** Name, Greeting, Short Description, Long Description (~32K char limit), Definition (hidden)
- **Format:** Plain text only — no special syntax support
- **No macros:** No {{char}}/{{user}} — uses natural language
- **Limitations:** No lorebook, no system prompt, no Author's Note. Heavily filtered
- **Definition field:** Hidden from users, acts as system prompt. Natural language instructions

### NovelAI
- **ATTG Format:** `[ Author: X; Title: Y; Tags: tag1, tag2; Genre: genre1, genre2 ]`
- **Memory:** Persistent context block, placed before story. ATTG goes here
- **Author's Note:** Injected 1-3 lines before latest output. Style/mood instructions
- **Lorebook:** Keyword-triggered context entries. Attribute-list format recommended
- **Character switching:** `[ CharacterName ]` with spaced brackets
- **Style control:** `[ S: X ]` (1-5 stars) on Erato model
- **Special symbols:** `*` for sounds, `<>` for telepathy, `***` for scene breaks, `{ }` for direct instructions

### KoboldAI / KoboldCpp
- **Supports:** Tavern Character Card import (PNG metadata)
- **Native features:** Memory, World Info, Author's Note, Scenarios
- **Format:** Flexible — accepts W++, PList, Plain Text
- **Focus:** Story generation mode, not just chat
- **KoboldCpp:** Lightweight C++ inference backend, Lite UI has full card support

### HammerAI
- **Format:** Simple character cards with W++ style (Name, Personality, Description fields)
- **Lorebook:** Built-in lorebook integration for world building
- **Focus:** Quick setup, local Ollama inference
- **Key insight:** Uses ~400-token system prompts for efficiency (Aria already matches this)

### CrushOn.AI
- **Fields:** Name, Description, Personality, Scenario, First Message, Example Dialogues
- **Format:** Tavern-compatible. Mix of W++, PList, plain text
- **NSFW:** Primary platform purpose. Explicit character traits, kinks, NSFW scenarios built in
- **No special format requirements** — standard card fields

### SpicyChat.AI
- **Fields:** Name, Persona, Scenario, Greeting, Example Dialogues
- **Format:** Tavern-compatible card structure
- **NSFW:** Platform-native NSFW support. Explicit personality definitions
- **Import:** Supports Tavern card import (PNG + JSON)

### RisuAI
- **Format:** Character Card V2/V3 spec, full support
- **Features:** Emotion images, custom prompt templates, inlayed images, prompt injection, long-term memory
- **Modules:** Custom plugin system for extended functionality
- **Backend:** Can use multiple AI providers (local + cloud)
- **Open source:** Svelte + TypeScript + WebGPU

### Backyard.AI
- **Format:** Persona-based plain text system
- **Fields:** Persona (description + traits), Scenario, Character Config (metadata)
- **Variables:** `{user}` and `{_cfg}` template variables
- **Style:** Natural language instructions embedded in persona text
- **Features:** Multi-image support, community hub for sharing

### AIDungeon
- **Story Cards:** Character-level context injection system
- **Fields:** Name, Description, Plot Essentials, Story-specific context
- **Format:** Natural language descriptions
- **Focus:** Story/adventure mode rather than chat roleplay

### Moescape
- **Format:** Simple character definitions (name, description, personality)
- **Focus:** Anime-style characters, casual chat
- **Limited customization** compared to Tavern-based platforms

### Chai AI
- **Format:** Simple text fields (name, description, personality)
- **Focus:** Mobile-first casual chat
- **Limited:** No lorebook, no advanced formatting, no card import

### Poe
- **Format:** System prompt based — bot creation via prompt engineering
- **Fields:** System prompt, greeting, model selection
- **No card standard** — each bot is a system prompt + model combo
- **Focus:** Multi-model access, not dedicated roleplay

---

## NSFW vs SFW FORMAT DIFFERENCES

### Do NSFW cards need special structure?
**No fundamental structural difference.** The same formats (PList, Plain Text, Ali:Chat) work for both. The differences are in CONTENT:

1. **Sexuality section** — Orientation, kinks, preferences, physical response descriptions
2. **Behavioral instructions** — How character responds to advances, escalation patterns
3. **Explicit example dialogues** — Ali:Chat examples showing NSFW scenarios
4. **Unchained/NSFW prompt injection** — System-level instructions to bypass model refusals
5. **Passion/arousal systems** — Depth instructions that scale prose detail (like Aria's system)

### NSFW-specific best practices:
- Define physical response patterns in personality (blushing, breathing, etc.)
- Use Ali:Chat examples to demonstrate NSFW voice without being gratuitous
- Separate SFW personality from NSFW behavior (context-dependent)
- `[Notes]` section for explicit AI behavior instructions
- JED+ template has dedicated Sexuality section with kinks, quirks, preferences

---

## CHARACTER CARD SPEC STANDARDS

### V1 (Original Tavern)
- **Fields:** name, description, personality, scenario, first_mes, mes_example
- **Storage:** Base64-encoded JSON in PNG tEXt chunk
- **Supported by:** All Tavern-based platforms

### V2 (Current Standard)
- **New fields:** creator_notes, system_prompt, post_history_instructions, alternate_greetings, tags, creator, character_version, character_book (embedded lorebook), extensions
- **Structure:** Wraps V1 in `data` object with `spec: 'chara_card_v2'`
- **Supported by:** SillyTavern, RisuAI, CharacterHub, Agnai, ZoltanAI
- **Status:** Current dominant standard

### V3 (Latest, Living Standard)
- **New fields:** assets (images, backgrounds, emotions), nickname, source, creation_date, modification_date, group_only_greetings, creator_notes_multilingual (i18n support)
- **Assets:** Support for embedded images via `embeded://` URIs, HTTP URLs, base64
- **File formats:** PNG/APNG (ccv3 tEXt chunk), JSON, CHARX (ZIP archive)
- **Lorebook:** Enhanced decorator system with `@@` syntax, use_regex, conditional activation
- **Supported by:** RisuAI (creator), early SillyTavern support
- **Status:** Living standard, actively evolving

---

## TOKEN EFFICIENCY COMPARISON (Same Character)

Approximate token counts for identical character content:

| Format | Tokens | Waste vs Plain Text |
|--------|--------|-------------------|
| W++ | ~900 | +125% (worst) |
| Square Brackets | ~450 | +12% |
| PList | ~400 | +5% |
| Plain Text + XML | ~400 | ~0% (baseline) |
| Plain Text (no tags) | ~380 | -5% (most efficient) |
| Ali:Chat (equivalent) | ~500 | +25% (but serves different purpose) |

Note: Ali:Chat "waste" isn't really waste — it provides behavioral examples that trait lists can't match. Best used as supplement, not replacement.

---

## COMMUNITY CONSENSUS (2025-2026)

### What the community recommends NOW:
1. **Description:** Plain Text with XML tags OR PList for compact cards
2. **Examples:** Ali:Chat format for speech patterns and behavior
3. **Author's Notes:** PList for trait reinforcement
4. **Lorebook:** Attribute-list format (keyword: value)
5. **Template:** JED+ as starting point, prune unused sections
6. **W++:** AVOID. Universally considered outdated and wasteful

### The "optimal stack" for a modern character card:
```
Description: Plain Text + XML tags (personality, appearance, background)
Character Note: PList (trait reinforcement, injected at depth)
Example Dialogues: Ali:Chat (3-5 exchanges showing voice)
Lorebook: Attribute lists for world info, triggered by keywords
System Prompt: Natural language instructions
```

### Key insight from research:
> "Well-structured plain text is much more informative for LLM than W++ pseudocode. The brackets and quotes are noise — LLMs were trained on natural language, not programming syntax." — CharacterProvider Guide

---

## MIGRATION IMPLICATIONS FOR ARIA

### Current state: W++ format in `characters.js`
### Recommended migration: Plain Text + PList hybrid

**Why:**
1. W++ wastes ~60% of tokens on syntax — directly reduces available context for chat
2. Aria runs on 12B local models where every token counts
3. Plain Text is what LLMs understand best
4. PList provides compact trait reinforcement without W++ overhead
5. Ali:Chat examples would improve character voice consistency
6. XML tags help the model distinguish personality from appearance from background

**Suggested new format for Aria characters:**
```
<description>
[Character short overview in 1-2 sentences]
</description>

<personality>
[Natural language personality description, 2-3 sentences]
</personality>

<appearance>
[PList: trait1, trait2, trait3; body: details; hair: details; eyes: details]
</appearance>

<speech>
[How they talk, verbal quirks, typical phrases]
</speech>

<example_dialogue>
{{char}}: [Ali:Chat style example showing voice]
{{user}}: [Typical user input]
{{char}}: [Response demonstrating personality + speech patterns]
</example_dialogue>
```

**Expected benefits:**
- ~40-50% token reduction in character definitions
- Better personality consistency from natural language
- Stronger voice from Ali:Chat examples
- More context window available for actual conversation
