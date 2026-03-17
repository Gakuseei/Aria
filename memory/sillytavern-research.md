# SillyTavern Deep Research (2026-03-17)

## 1. Character Card Format & Fields

### File Formats
- **PNG with embedded metadata**: Primary format. Character data stored in PNG `tEXt` chunk (base64-encoded JSON). Users share a single image file that contains both the avatar and all character data.
- **JSON**: Raw character data without image. Used for import/export and editing.
- **CHARX**: Newer archive format (ZIP-based) for larger cards with multiple assets.

### V2 Spec (Standard: `chara_card_v2`)
```json
{
  "spec": "chara_card_v2",
  "spec_version": "2.0",
  "data": {
    // V1 inherited fields
    "name": "string",
    "description": "string",           // Main character definition
    "personality": "string",            // Summary personality traits
    "scenario": "string",              // Current situation/setting
    "first_mes": "string",            // Opening message
    "mes_example": "string",          // Example dialogues with <START> markers

    // V2 additions
    "creator_notes": "string",        // Notes for users, NEVER in prompts
    "system_prompt": "string",        // Overrides user's system prompt
    "post_history_instructions": "string", // Overrides jailbreak/UJB
    "alternate_greetings": ["string"], // Multiple first messages
    "tags": ["string"],               // UI filtering only
    "creator": "string",
    "character_version": "string",
    "extensions": {},                  // Required, must preserve unknown keys
    "character_book": CharacterBook    // Embedded lorebook (optional)
  }
}
```

### Prompt Token Categories
- **Permanent tokens** (always sent): name, description, personality, scenario
- **Temporary tokens**: first_mes (only at start), mes_example (dropped when context fills)
- **Override tokens**: system_prompt, post_history_instructions (replace user defaults)

### Character's Note
Special per-character injection with:
- **@Depth**: How many messages deep to inject (0 = after last message)
- **Role**: System, User, or Assistant
- Stays at fixed depth — used to reinforce traits that the model keeps "forgetting"

### Description Format Options

**W++ Format** (legacy, token-wasteful ~60% overhead from symbols):
```
[character("Name")
{
Mind("Cute" + "Shy" + "Loving")
Personality("Cute" + "Shy" + "Loving")
Body("160cm tall" + "blue eyes")
Species("Human")
}]
```

**PList Format** (modern, compressed, recommended):
```
[Character's persona: intelligent, sarcastic, caring; Character's clothes: leather jacket, jeans; Character's body: tall, athletic, brown hair; Genre: romance; Tags: slow-burn, drama; Scenario: coffee shop meeting]
```
- Semicolons separate categories
- Traits listed with most important LAST (reverse priority)
- Group everything into one PList to reduce variability

**Ali:Chat Format** (dialogue-driven, most effective):
- Uses example dialogues as the primary character definition
- Traits expressed through speech patterns and actions, not explicit lists
- 2-3 examples, 5-8 lines each
- Can combine with PList header for physical traits
- Token-efficient, works universally across models

**Plain Text** (medium difficulty, good output):
- Narrative prose with XML tags for structure
- `[bracketed instructions]` for AI guidance
- Requires writing skill to avoid style bleed

**Recommended approach (2025-2026 meta)**: PList in Author's Note + Ali:Chat examples in description. Keeps permanent tokens under 600.

### Example Dialogue Format
```
<START>
{{user}}: How are you feeling today?
{{char}}: *crosses arms and looks away* "Fine. Whatever." *but a slight smile tugs at her lips*
<START>
{{user}}: Tell me about yourself.
{{char}}: *leans against the wall* "What's there to tell? I'm just a girl who likes trouble."
```
- `<START>` separates example blocks (replaced by Example Separator in prompt)
- `{{char}}` and `{{user}}` are macros resolved at runtime
- Actions in asterisks, dialogue in quotes

---

## 2. Story Mode vs Chat Mode

SillyTavern does NOT have a dedicated "story mode" separate from chat. Instead:

### Display Modes
- **Flat**: Standard chat log
- **Bubbles**: Messenger-style rounded bubbles
- **Document**: Compact, text-focused layout. Hides avatars, timestamps, message controls. Best for narrative/story-style sessions.
- **Visual Novel Mode**: Shows character sprites/expressions with chat overlay

### The "story" experience is created by:
1. Setting Document chat style
2. Using a system prompt focused on narrative writing
3. Using Author's Notes to set genre/style/pacing
4. Adjusting sampling parameters for creative writing (higher temp, more top-p)
5. Using World Info for dynamic world-building

### Group Chats (multi-character stories)
- Multiple characters in one conversation
- Reply order: Manual, Natural (talkativeness-based), List Order, Pooled
- Card joining modes: Swap (one card per turn) vs Join (all cards combined — risky for personality bleed)
- Scenario Override: Replace individual scenarios for group-wide setting

---

## 3. World Info / Lorebook System

The most powerful feature in SillyTavern. Dynamic prompt injection triggered by keywords in chat.

### Entry Structure
- **Keys (Keywords)**: Trigger words (non-case-sensitive default). Support regex (`/pattern/flags`). Multiple keys per entry.
- **Content**: The actual text injected into prompt. ONLY content is sent — keys, titles, metadata are never in the prompt.
- **Optional Filter (Secondary Keys)**: AND ANY, AND ALL, NOT ANY, NOT ALL logic
- **Insertion Order**: Higher number = closer to context end = more influence
- **Probability (Trigger %)**: 0-100 chance of insertion when triggered

### Insertion Positions
- Before Char Defs
- After Char Defs
- Before/After Example Messages
- Top/Bottom of Author's Note
- **@Depth**: Specific chat depth with role assignment (system/user/assistant)
- **Outlet**: Named containers placed via `{{outlet::Name}}` macro

### Strategy Types
- Constant (always present, blue)
- Keyword-triggered (green)
- Vector similarity (chain link — semantic matching via embeddings)

### Inclusion Groups
- Multiple entries share a group label
- Only ONE entry from each group activates per generation
- **Group Weight**: Random selection probability (default 100)
- **Prioritize Inclusion**: Override random, pick highest Order
- **Use Group Scoring**: Count matched keys, highest wins

### Timed Effects
- **Sticky**: Entry stays active N messages after triggering
- **Cooldown**: Cannot activate for N messages post-trigger
- **Delay**: Requires minimum N messages before first activation
- Combine for complex patterns: sticky=3, cooldown=2, delay=2

### Recursive Scanning
Entries can trigger other entries by mentioning keywords in their content.
- Max Recursion Steps controls nesting depth
- Per-entry: non-recursable, prevent further recursion, delay until recursion
- Mutually exclusive with Min Activations

### Token Budget
- Context % defines max tokens for World Info
- Priority: Constant entries first, then by Order number
- Alert on overflow notification

### Scanning Settings
- **Scan Depth**: How many messages to check for keywords
- **Include Names**: Whether character names count for matching
- **Case-Sensitive**: Per-entry toggle
- **Match Whole Words**: Single-word keys match complete words only

### Lorebook Sources
- **Character Lore**: Bound to character, exports with card
- **Global Lore**: Available in all chats
- **Persona Lore**: Bound to user persona
- **Chat Lore**: Specific to one chat session

### Embedded Character Book (V2 spec)
```json
{
  "character_book": {
    "name": "string",
    "scan_depth": 2,
    "token_budget": 500,
    "recursive_scanning": false,
    "entries": [{
      "keys": ["keyword1", "keyword2"],
      "content": "Lore text injected into prompt",
      "enabled": true,
      "insertion_order": 100,
      "case_sensitive": false,
      "selective": false,
      "secondary_keys": [],
      "constant": false,
      "position": "before_char" | "after_char",
      "priority": 10,
      "extensions": {}
    }]
  }
}
```

---

## 4. Author's Notes

A persistent text injection at a configurable depth in the chat context.

### How It Works
- Text always injected at specified depth (number of messages from bottom)
- Depth 0 = after last message (highest influence)
- Depth 4 = 4 messages back (moderate influence)
- Can set Role: System, User, or Assistant

### Common Uses
- Genre/style instructions: `[Genre: dark fantasy; Style: verbose, poetic; Mood: tense]`
- Pacing control: `[Write 2-3 paragraphs. Focus on sensory details.]`
- Scene setting: `[Current location: abandoned warehouse. Time: midnight.]`
- PList character traits (the modern meta — put PLists in AN, not description)

### Integration Points
- World Info can inject at Top/Bottom of Author's Note
- Persona description can inject at Top/Bottom of Author's Note
- STscript `/inject` command adds unlimited custom Author's Notes

### Injection Template
Uses `{{summary}}` or similar macros. Position options mirror World Info positions.

---

## 5. System Prompts for Creative Writing

### Default Main Prompt
```
Write {{char}}'s next reply in a fictional chat between {{char}} and {{user}}.
```

### Prompt Assembly Order (Chat Completion API)
Controlled by Prompt Manager drag-and-drop. Default order:
1. Main Prompt (system role)
2. World Info (Before)
3. Persona Description
4. Character Description
5. Character Personality
6. Scenario
7. Enhance Definitions
8. World Info (After)
9. Auxiliary Prompt
10. Chat Examples
11. Chat History (with in-chat injections at various depths)
12. Post-History Instructions (last thing before generation)

### Post-History Instructions (Jailbreak/UJB)
- Sent AFTER chat history = highest priority/influence
- Used for style enforcement, NSFW permissions, output format instructions
- Character cards can override with `post_history_instructions` field
- `{{original}}` macro includes default PHI when character overrides

### Character Prompt Overrides
- `system_prompt` field overrides Main Prompt
- `post_history_instructions` overrides Jailbreak/UJB
- Both support `{{original}}` to include defaults
- Controlled by "Prefer Char. Prompt" / "Prefer Char. Instructions" toggles

---

## 6. Prompt Templates & Instruct Mode

### Text Completion (Story String)
Template for local models. Handlebars syntax:
```
{{system}}
{{wiBefore}}
{{description}}
{{personality}}
{{scenario}}
{{wiAfter}}
{{persona}}
{{mesExamples}}
```
Missing variables = not sent. Order matters.

### Instruct Mode (for instruction-tuned models)
Wraps messages with model-specific tokens. Common presets:
- **Llama 3**: `<|start_header_id|>system<|end_header_id|>`, `<|eot_id|>`
- **ChatML**: `<|im_start|>system\n`, `<|im_end|>`
- **Mistral V7**: `[INST]`, `[/INST]`
- **Alpaca**: `### Instruction:`, `### Response:`
- **Gemma**: `<start_of_turn>user`, `<end_of_turn>`

Each preset defines: system prefix/suffix, user prefix/suffix, assistant prefix/suffix, separators, stop strings.

Auto-detection: SillyTavern hashes `tokenizer_config.json` to match known templates automatically.

### Chat Completion API (Prompt Manager)
Uses role-based messages (system/user/assistant). No wrapping needed — the API handles it. Prompt Manager controls order and content of each role message.

### Utility Prompts
- Group Nudge (group chats)
- New Chat / New Group Chat / New Example Chat (delimiters)
- Continue Nudge (continuation instruction)
- Replace Empty Message

---

## 7. Character Card Ecosystem

### Sharing Platforms
- **Chub.ai** (formerly venus.chub.ai): Largest platform. Tags, ratings, downloads. SFW and NSFW sections.
- **Character Hub**: Alternative platform
- **Rentry**: Text-based guides and card definitions
- **Discord communities**: Direct sharing of PNG cards
- **CivitAI**: Some crossover with image generation community

### How Sharing Works
1. Creator builds card in SillyTavern or external editor
2. Exports as PNG (with embedded JSON in tEXt chunk) or JSON
3. Uploads to Chub.ai with tags, description, sample images
4. Users download PNG, drag into SillyTavern to import
5. Cards often include embedded Character Books (lorebooks)

### Popular Card Characteristics
- High download counts correlate with: good first messages, detailed personality, multiple greetings
- Tags drive discoverability
- Creator reputation matters (recurring uploaders build followings)

---

## 8. Advanced Features

### Token Budget & Context Management
- Context size configurable per model (2K-200K+)
- Story String + World Info + Chat History must fit within context
- World Info has its own token budget (% of context)
- Example messages drop first when context fills
- Character's Note at fixed depth survives context trimming

### Summarize Extension (Long-term Memory)
- Auto-generates conversation summaries
- Injects via template with `{{summary}}` macro
- Configurable position (same options as Author's Note)
- Triggers every X messages or X words
- Can use main API or separate BART model
- Manual editing supported for corrections

### Data Bank (RAG)
- Upload documents (PDF, HTML, MD, TXT, ePUB)
- Web page scraping, YouTube transcript extraction
- Vector embeddings for semantic search
- Scopes: Global, Character-specific, Chat-specific, Message-attached
- Retrieved chunks injected into prompt based on relevance
- Score threshold 0.2-0.5 recommended

### STscript (Automation)
- Built-in scripting language
- `/gen` and `/genraw` for LLM calls
- `/inject` for unlimited custom prompt injections
- `/ask name=character` for multi-character queries
- Variables (local per-chat, global), conditionals, loops
- Build interactive narratives with branching dialogue
- Dynamic lorebook manipulation at runtime
- Dice rolling, character generation, automated progression

### Sampling Presets
- Temperature, Top-P, Top-K, Min-P, Typical-P
- Repetition Penalty, Presence Penalty, Frequency Penalty
- Mirostat (mode 1/2)
- CFG Scale (classifier-free guidance)
- DRY (Don't Repeat Yourself) penalty
- Custom stopping strings
- Response length (token limit)

### Model Reasoning
- Chain-of-thought in collapsible blocks
- Effort levels: Auto, Minimum through Maximum
- Optional inclusion in subsequent prompts (not recommended for RP)
- Manual reasoning blocks via edit menu

---

## 9. Technical Architecture Summary

### Prompt Assembly (Full Picture)

**For Text Completion (local models):**
```
[Instruct System Prefix]
  Story String (assembled from template):
    System Prompt
    World Info (Before)
    Character Description
    Character Personality
    Scenario
    World Info (After)
    Persona Description
  [Instruct System Suffix]

  Example Messages (with separators)

  Chat History:
    [At various depths: Author's Note, Character's Note, World Info @Depth entries]
    Message N-5 (user/assistant alternating)
    Message N-4
    Message N-3
    Message N-2
    Message N-1
    [Post-History Instructions / Jailbreak]

  [Assistant Prefix] CharacterName:
```

**For Chat Completion API:**
```
messages: [
  { role: "system", content: "Main Prompt + Character Defs + World Info" },
  { role: "system", content: "Enhance Definitions" },
  ...chat history messages...
  { role: "system", content: "Author's Note" },  // at configured depth
  ...more history...
  { role: "user", content: "last user message" },
  { role: "system", content: "Post-History Instructions" }
]
```

### Key Macros
| Macro | Resolves To |
|-------|-------------|
| `{{char}}` | Character name |
| `{{user}}` | User/persona name |
| `{{description}}` | Character description |
| `{{personality}}` | Character personality |
| `{{scenario}}` | Character scenario |
| `{{persona}}` | User persona description |
| `{{mesExamples}}` | Formatted example dialogues |
| `{{wiBefore}}`/`{{wiAfter}}` | World Info entries |
| `{{loreBefore}}`/`{{loreAfter}}` | Same as wiBefore/wiAfter |
| `{{trim}}` | Remove surrounding newlines |
| `{{original}}` | Include default prompt in character override |
| `{{summary}}` | Summarize extension output |
| `{{pipe}}` | STscript pipe value |
| `{{outlet::Name}}` | World Info outlet insertion |

---

## 10. What Makes Popular Cards "Good"

### Top Creator Patterns (from guides + community meta)

**Card Size**: 800-1800 tokens ideal. Under 600 permanent tokens is the gold standard.

**Structure (current meta)**:
1. PList in Author's Note (not description) — keeps permanent tokens minimal
2. 2-3 Ali:Chat examples in description showing personality through dialogue
3. World Info/Lorebook for environment, lore, side characters
4. Strong first message (60-150 words, action-first, no over-exposition)

**First Message Rules**:
- Start with action, not exposition
- Write from character's perspective
- Establish speech patterns immediately
- NEVER describe what {{user}} is doing
- No leading questions (prevents response loops)
- Varied paragraph lengths

**Description Best Practices**:
- Third person only — never "you" addressing the AI
- Show don't tell — express traits through examples and behaviors
- Use contrasting states: "When safe: relaxed. When cornered: vicious."
- Include speech examples showing tone, quirks, verbal ticks
- Mention character name at least once per example
- Parenthetical descriptors: `hair(light blue, short, messy)` saves tokens

**What to AVOID**:
- W++ (60% token waste on symbols, outdated)
- Overly long descriptions (>2000 tokens)
- AI-generated first messages (over-exposition)
- Planning stories in the card (cards provide context, not plot)
- Ambiguous "you" references (confuses AI vs user)
- Empty/placeholder sections
- Redundant traits in multiple fields

**Advanced Techniques**:
- Multiple alternate greetings for replayability
- Embedded Character Book for dynamic lore
- Character's Note at depth 2-4 for trait reinforcement
- System prompt override for character-specific instructions
- XML tags for clear section boundaries: `<personality>`, `<appearance>`
- `[Square bracket instructions]` for AI-only directives

### Format Hierarchy (effectiveness, 2025-2026):
1. **PList + Ali:Chat** (best balance of tokens and quality)
2. **Plain text with XML tags** (good for complex characters)
3. **Ali:Chat only** (excellent for dialogue-heavy characters)
4. **PList only** (minimal, good for simple characters)
5. **W++** (legacy, not recommended)

---

## Relevance to Aria

### Features Aria Could Adopt
1. **World Info / Lorebook** — dynamic keyword-triggered lore injection (biggest differentiator)
2. **Author's Note at configurable depth** — we have basic version, could add depth control
3. **Character's Note with @Depth** — reinforcement at fixed depth
4. **Alternate Greetings** — multiple first messages per character
5. **V2 Card Import/Export** — PNG embedded JSON for sharing
6. **Document Chat Style** — for story-focused sessions
7. **Embedded Character Books** — lorebooks bundled with characters
8. **Token budget visualization** — show users how much context is used

### What Aria Already Has That ST Has
- W++ character format
- System prompt building
- Passion/engagement depth injection (similar to Author's Note depth)
- Smart Suggestions (ST doesn't have this natively)
- Impersonate mode
- Custom characters

### Aria's Unique Advantages Over ST
- Smart Suggestions (AI-generated response options)
- Passion system (automatic engagement scaling)
- Much simpler UX (ST is overwhelming for new users)
- Fully offline by design (ST supports cloud APIs)
- Built-in NSFW doctrine (ST relies on user jailbreaks)
