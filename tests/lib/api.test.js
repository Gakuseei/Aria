import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRestoredSuggestions } from '../../src/components/ChatInterface.jsx';
import {
  buildRoleplaySceneContext,
  buildSystemPrompt,
  cleanTranscriptArtifacts,
  deriveAssistBudgetTier,
  finalizeImpersonateDraft,
  generateSuggestionsBackground,
  isUnderfilledShortReply,
  normalizeSuggestionDisplayValue,
  parseSuggestionResponse,
  resolveTemplates,
  saveSession,
  sendMessage,
  shouldAutoStopStreamingResponse
} from '../../src/lib/api.js';

const originalFetch = global.fetch;
const originalLocalStorage = global.localStorage;

function createStorageMock() {
  let store = {};

  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) {
      store[key] = String(value);
    },
    removeItem(key) {
      delete store[key];
    },
    clear() {
      store = {};
    }
  };
}

function createJsonResponse(data, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data)
  };
}

function createStreamAbortHandle() {
  return {
    aborted: false,
    reason: null,
    abortImpl: null,
    setAbortImpl(nextAbort) {
      this.abortImpl = typeof nextAbort === 'function' ? nextAbort : null;
    },
    abort(reason = 'user') {
      if (this.aborted) return;
      this.aborted = true;
      this.reason = reason;
      if (typeof this.abortImpl === 'function') {
        this.abortImpl(reason);
      }
    }
  };
}

afterEach(() => {
  global.fetch = originalFetch;
  if (global.localStorage && typeof global.localStorage.clear === 'function') {
    global.localStorage.clear();
  }
  global.localStorage = originalLocalStorage;
  vi.restoreAllMocks();
});

describe('resolveTemplates', () => {
  it('replaces {{char}} with character name', () => {
    expect(resolveTemplates('Hello {{char}}', 'Alice', 'Bob')).toBe('Hello Alice');
  });

  it('replaces {{user}} with user name', () => {
    expect(resolveTemplates('Hello {{user}}', 'Alice', 'Bob')).toBe('Hello Bob');
  });

  it('replaces both placeholders', () => {
    expect(resolveTemplates('{{char}} meets {{user}}', 'Alice', 'Bob')).toBe('Alice meets Bob');
  });

  it('is case insensitive', () => {
    expect(resolveTemplates('{{CHAR}} and {{User}}', 'Alice', 'Bob')).toBe('Alice and Bob');
  });

  it('replaces multiple occurrences', () => {
    expect(resolveTemplates('{{char}} {{char}} {{char}}', 'A', 'B')).toBe('A A A');
  });

  it('returns empty string for null/undefined input', () => {
    expect(resolveTemplates(null, 'A', 'B')).toBe('');
    expect(resolveTemplates(undefined, 'A', 'B')).toBe('');
  });

  it('returns original text for empty string input', () => {
    expect(resolveTemplates('', 'A', 'B')).toBe('');
  });

  it('falls back to defaults when names are missing', () => {
    expect(resolveTemplates('{{char}} and {{user}}', null, null)).toBe('Character and User');
    expect(resolveTemplates('{{char}} and {{user}}', '', '')).toBe('Character and User');
  });
});

describe('cleanTranscriptArtifacts', () => {
  it('returns empty string for null/undefined/non-string', () => {
    expect(cleanTranscriptArtifacts(null)).toBe('');
    expect(cleanTranscriptArtifacts(undefined)).toBe('');
    expect(cleanTranscriptArtifacts(123)).toBe('');
  });

  it('strips special tokens and everything after', () => {
    expect(cleanTranscriptArtifacts('Hello world<|endoftext|>garbage')).toBe('Hello world');
    expect(cleanTranscriptArtifacts('Text<|im_end|>more')).toBe('Text');
    expect(cleanTranscriptArtifacts('Good<|eot_id|>stuff')).toBe('Good');
  });

  it('cuts at transcript artifacts (User:, Human:, Assistant:)', () => {
    expect(cleanTranscriptArtifacts('Response text.\n\nUser: more stuff')).toBe('Response text.');
    expect(cleanTranscriptArtifacts('AI says hi.\nHuman: hey')).toBe('AI says hi.');
    expect(cleanTranscriptArtifacts('First part.\nAssistant: second')).toBe('First part.');
  });

  it('removes meta-commentary preambles', () => {
    const input = "Here's my response:\nActual content here.";
    const result = cleanTranscriptArtifacts(input);
    expect(result).not.toContain("Here's my response");
    expect(result).toContain('Actual content here.');
  });

  it('strips character name prefixes', () => {
    expect(cleanTranscriptArtifacts('Alice: Hello there.', 'Alice')).toBe('Hello there.');
    expect(cleanTranscriptArtifacts('**Alice**: Hello there.', 'Alice')).toBe('Hello there.');
  });

  it('strips markdown headers', () => {
    expect(cleanTranscriptArtifacts('## Scene Title\nActual text.')).toBe('Actual text.');
    expect(cleanTranscriptArtifacts('### **Bold Header**\nContent.')).toBe('Content.');
  });

  it('trims incomplete sentences when cut point is past halfway', () => {
    const input = 'She smiled. She laughed. She began to wal';
    const result = cleanTranscriptArtifacts(input);
    expect(result).toBe('She smiled. She laughed.');
  });

  it('keeps text when last sentence end is before halfway', () => {
    const input = 'Hi. Then she began to walk across the room and';
    const result = cleanTranscriptArtifacts(input);
    expect(result).toBe(input);
  });

  it('preserves complete responses ending in punctuation', () => {
    expect(cleanTranscriptArtifacts('She smiled warmly.')).toBe('She smiled warmly.');
    expect(cleanTranscriptArtifacts('*She waves.*')).toBe('*She waves.*');
    expect(cleanTranscriptArtifacts('"Hello there!"')).toBe('"Hello there!"');
  });

  it('removes --- separator lines', () => {
    expect(cleanTranscriptArtifacts('Part one.\n---\nPart two.')).toBe('Part one.\nPart two.');
  });

  it('strips leading dots/slashes before asterisks', () => {
    expect(cleanTranscriptArtifacts('.*action*')).toBe('*action*');
    expect(cleanTranscriptArtifacts('/.*action*')).toBe('*action*');
  });

  it('collapses excessive blank lines', () => {
    expect(cleanTranscriptArtifacts('Line one.\n\n\n\nLine two.')).toBe('Line one.\n\nLine two.');
  });

  it('handles clean text without modifications', () => {
    const clean = '*She looks up and smiles.* "Hey there!"';
    expect(cleanTranscriptArtifacts(clean)).toBe(clean);
  });
});

describe('getRestoredSuggestions', () => {
  it('restores suggestions when the latest message is an assistant turn with suggestions', () => {
    const messages = [
      { role: 'assistant', content: 'Hi there.' },
      {
        role: 'assistant',
        content: 'What would you like to do next?',
        suggestions: ['Sit closer', 'Ask about the coffee', 'Smile back']
      }
    ];

    expect(getRestoredSuggestions(messages)).toEqual([
      'Sit closer',
      'Ask about the coffee',
      'Smile back'
    ]);
  });

  it('does not restore stale suggestions when a newer user turn exists', () => {
    const messages = [
      {
        role: 'assistant',
        content: 'What would you like to do next?',
        suggestions: ['Sit closer', 'Ask about the coffee']
      },
      { role: 'user', content: 'I sit down beside you.' }
    ];

    expect(getRestoredSuggestions(messages)).toEqual([]);
  });

  it('returns an empty list when the latest assistant turn has no suggestions', () => {
    const messages = [
      {
        role: 'assistant',
        content: 'What would you like to do next?',
        suggestions: ['Sit closer', 'Ask about the coffee']
      },
      { role: 'assistant', content: 'She smiles softly.' }
    ];

    expect(getRestoredSuggestions(messages)).toEqual([]);
  });

  it('drops empty and non-string suggestion values', () => {
    const messages = [
      {
        role: 'assistant',
        content: 'What would you like to do next?',
        suggestions: [' Sit closer ', '', null, 'Ask about the coffee']
      }
    ];

    expect(getRestoredSuggestions(messages)).toEqual([
      'Sit closer',
      'Ask about the coffee'
    ]);
  });

  it('dedupes and normalizes restored suggestions before rendering', () => {
    const messages = [
      {
        role: 'assistant',
        content: 'What would you like to do next?',
        suggestions: [
          ' gently pats her shoulder in reassurance gently pats her shoulder in reassurance ',
          'Gently pats her shoulder in reassurance',
          'Smile reassuringly to ease her nerves'
        ]
      }
    ];

    expect(getRestoredSuggestions(messages)).toEqual([
      'gently pats her shoulder in reassurance',
      'Smile reassuringly to ease her nerves'
    ]);
  });
});

describe('shouldAutoStopStreamingResponse', () => {
  it('only auto-stops short mode replies', () => {
    const text = 'She steps closer and smiles softly. "Come here."';
    expect(shouldAutoStopStreamingResponse(text, 'normal')).toBe(false);
    expect(shouldAutoStopStreamingResponse(text, 'long')).toBe(false);
  });

  it('auto-stops short replies once they end cleanly with enough substance', () => {
    const text = '*She slips in close, her lips brushing your ear as she smiles to herself while her fingertips drag slowly down your chest and linger there just long enough to make you shiver.* "You really do make it hard to behave."';
    expect(shouldAutoStopStreamingResponse(text, 'short')).toBe(true);
  });

  it('does not auto-stop terse mirrored short replies', () => {
    expect(shouldAutoStopStreamingResponse('Drink first.', 'short')).toBe(false);
    expect(shouldAutoStopStreamingResponse('Always.', 'short')).toBe(false);
  });

  it('waits when the short reply still ends mid-thought', () => {
    const text = '*She slips in close, her lips brushing your ear as she smiles to herself.* "You really do make it hard';
    expect(shouldAutoStopStreamingResponse(text, 'short')).toBe(false);
  });

  it('waits when formatting markers are still unbalanced', () => {
    const text = '*She slips in close and smiles. "You really do make it hard to behave.';
    expect(shouldAutoStopStreamingResponse(text, 'short')).toBe(false);
  });

  it('treats a finished paragraph break as a safe short-stop point', () => {
    const text = 'She smiles and drags her fingertips down your chest. "Stay still for me."\n\n';
    expect(shouldAutoStopStreamingResponse(text, 'short')).toBe(false);
  });
});

describe('isUnderfilledShortReply', () => {
  it('flags mirrored or underdeveloped short replies for repair', () => {
    expect(isUnderfilledShortReply('Drink first.', 'Hey', 'short')).toBe(true);
    expect(isUnderfilledShortReply('Always.', 'Will I be welcome tomorrow?', 'short')).toBe(true);
  });

  it('does not flag full short replies or explicit short-answer requests', () => {
    const fullReply = '*She nudges the mug closer and watches him over the rim of her glasses.* "Drink first. Then talk if you still want to."';
    expect(isUnderfilledShortReply(fullReply, 'Hey', 'short')).toBe(false);
    expect(isUnderfilledShortReply('Always.', 'Short answer: am I welcome here tomorrow?', 'short')).toBe(false);
  });
});

describe('buildSystemPrompt', () => {
  it('builds runtime blocks and preserves example seed text for roleplay characters', () => {
    const prompt = buildSystemPrompt({
      character: {
        name: 'Mei',
        category: 'sfw',
        systemPrompt: 'Mei is a grumpy cafe owner.',
        instructions: 'Stay warm underneath the bluntness.',
        scenario: 'Rainy cafe afternoon.',
        exampleDialogue: '',
        authorsNote: 'Stay grounded in the cafe.',
        exampleDialogues: [
          { user: 'How was your day?', character: '*She wipes the counter.* "Busy."' }
        ]
      },
      userName: 'Erik',
      responseMode: 'normal'
    });

    expect(prompt).toContain('Global Core:');
    expect(prompt).toContain('Character Core:');
    expect(prompt).toContain('Active Scene:');
    expect(prompt).toContain('Example Seed:');
    expect(prompt).toContain('Late Steering:');
    expect(prompt).toContain('Keep the interaction non-explicit.');
    expect(prompt).toContain('Erik: How was your day?');
    expect(prompt).toContain('Mei: *She wipes the counter.* "Busy."');
    expect(prompt).toContain("Lead with the reply itself.");
    expect(prompt).toContain('Prefer in-character action and dialogue over detached observer-style scene summary.');
  });

  it('ignores bracketed meta exampleDialogue blocks and adds unchained mode rules cleanly', () => {
    const prompt = buildSystemPrompt({
      character: {
        name: 'Alice',
        category: 'nsfw',
        systemPrompt: 'Alice is shy.',
        instructions: 'She obeys quickly.',
        scenario: 'Private estate.',
        exampleDialogue: '[Instructions: describe intimacy vividly]',
        authorsNote: ''
      },
      userName: 'Master',
      responseMode: 'normal',
      unchainedMode: true
    });

    expect(prompt).not.toContain('[Instructions:');
    expect(prompt).toContain('Explicit intimacy is allowed when the scene leads there.');
    expect((prompt.match(/immediate in-character physical compliance/g) || [])).toHaveLength(1);
  });

  it('uses a lean bot runtime prompt without roleplay-only reply rules', () => {
    const prompt = buildSystemPrompt({
      character: {
        name: 'DeskBot',
        type: 'bot',
        systemPrompt: 'DeskBot handles scheduling requests with crisp answers.',
        instructions: 'Ask for the missing time window before committing.',
        scenario: 'Office planning assistant.'
      },
      userName: 'Erik',
      responseMode: 'normal'
    });

    expect(prompt).toContain('Respond as the configured bot or scenario without roleplay framing.');
    expect(prompt).not.toContain('Keep actions in third person inside *asterisks* and dialogue in plain text.');
    expect(prompt).not.toContain('Continue the active scene with DeskBot instead of summarizing or resetting it.');
  });
});

describe('suggestions stabilization', () => {
  it('keeps click-ready action suggestions that use valid leading verbs', () => {
    const parsed = parseSuggestionResponse(
      'Option 1: Continue kissing her neck | Option 2: Offer her your hand | Option 3: Pull her closer and murmur in her ear',
      '',
      []
    );

    expect(parsed).toEqual([
      'Continue kissing her neck',
      'Offer her your hand',
      'Pull her closer and murmur in her ear'
    ]);
  });

  it('salvages an overlong third suggestion instead of dropping the batch to two', () => {
    const parsed = parseSuggestionResponse(
      'Gaze into her eyes intensely | Slowly run a hand down her side | Murmur huskily, "Please Sarah, I need you to keep me right here while you make me beg for more."',
      '',
      []
    );

    expect(parsed).toHaveLength(3);
    expect(parsed[2].split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(14);
    expect(parsed[2]).toContain('Murmur huskily');
  });

  it('cuts quoted or prose-heavy suggestion tails down to a compact action', () => {
    const parsed = parseSuggestionResponse(
      "Lean in closer to Alice, so she can feel the warmth radiating from your body as you begin explaining. This proximity will calm her nerves | Smile reassuringly to ease her nervousness | Gently adjust Alice's fingers on the pen to improve her grip",
      '',
      []
    );

    expect(parsed).toEqual([
      'Lean in closer to Alice',
      'Smile reassuringly to ease her nervousness',
      "Gently adjust Alice's fingers on the pen to improve her grip"
    ]);
  });

  it('keeps bot suggestions conversational instead of bodily when mode-aware parsing is used', () => {
    const parsed = parseSuggestionResponse(
      'Kiss her neck | Ask what time works best | Confirm the requested duration',
      '',
      [],
      { assistMode: 'bot_conversation' }
    );

    expect(parsed).toEqual([
      'Ask what time works best',
      'Confirm the requested duration'
    ]);
  });

  it('drops quoted dialogue and repeated phrase spam during normalization', () => {
    expect(normalizeSuggestionDisplayValue('gently pats her shoulder in reassurance gently pats her shoulder in reassurance'))
      .toBe('gently pats her shoulder in reassurance');
    expect(normalizeSuggestionDisplayValue('Hold her gaze intently and smile*'))
      .toBe('Hold her gaze intently and smile');
    expect(parseSuggestionResponse(
      'Offer Alice a reassuring smile and nod "I have every confidence in you" | Guide her gently by the elbow towards the study | Push open the study door for her',
      '',
      []
    )).toEqual([
      'Offer Alice a reassuring smile and nod',
      'Guide her gently by the elbow towards the study',
      'Push open the study door for her'
    ]);
    expect(parseSuggestionResponse(
      "Smile warmly at Alice's attentiveness and begin listing out the day's duties | Gently pat the seat next to you | Ask Alice if she has any questions about today's tasks before continuing",
      '',
      []
    )).toEqual([
      "Smile warmly at Alice's attentiveness",
      'Gently pat the seat next to you',
      "Ask Alice if she has any questions about today's tasks"
    ]);
  });

  it('returns parsed suggestions from the public generator without forcing a retry', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).endsWith('/api/show')) {
        return createJsonResponse({
          details: { parameter_size: '7B' },
          model_info: { 'general.context_length': 4096 }
        });
      }

      if (String(url).endsWith('/api/chat')) {
        return createJsonResponse({
          message: {
            content: 'Option 1: Continue kissing her neck | Option 2: Offer her your hand | Option 3: Pull her closer and murmur in her ear'
          }
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    global.fetch = fetchMock;

    const suggestions = await new Promise(async (resolve) => {
      await generateSuggestionsBackground(
        [
          { role: 'assistant', content: '*She tilts her throat toward you.* "Well?"' },
          { role: 'user', content: 'I kiss her neck slowly.' }
        ],
        {
          name: 'Sarah',
          category: 'nsfw',
          systemPrompt: 'Sarah is dominant, poised, and exacting.',
          instructions: 'Stay in the active beat.',
          scenario: 'Private lounge at night.'
        },
        'Erik',
        {
          ollamaUrl: 'http://127.0.0.1:11434',
          ollamaModel: 'test-model',
          contextSize: 'medium'
        },
        resolve,
        [],
        35
      );
    });

    expect(suggestions).toEqual([
      'Continue kissing her neck',
      'Offer her your hand',
      'Pull her closer and murmur in her ear'
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps a usable 2-option retry instead of collapsing the UI result to null', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).endsWith('/api/show')) {
        return createJsonResponse({
          details: { parameter_size: '7B' },
          model_info: { 'general.context_length': 4096 }
        });
      }

      if (String(url).endsWith('/api/chat')) {
        const callIndex = fetchMock.mock.calls.filter(([calledUrl]) => String(calledUrl).endsWith('/api/chat')).length;
        if (callIndex === 1) {
          return createJsonResponse({
            message: { content: 'Here are some ideas: | Explain what you want more clearly' }
          });
        }

        return createJsonResponse({
          message: { content: 'Hold her gaze | Lean closer across the bar' }
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    global.fetch = fetchMock;

    const suggestions = await new Promise(async (resolve) => {
      await generateSuggestionsBackground(
        [
          { role: 'assistant', content: '*She keeps your chin tilted up.* "Ask nicely."' },
          { role: 'user', content: 'Then give me something worth asking for.' }
        ],
        {
          name: 'Sarah',
          category: 'nsfw',
          systemPrompt: 'Sarah is dominant, poised, and exacting.',
          instructions: 'Stay in the active beat.',
          scenario: 'Private lounge at night.'
        },
        'Erik',
        {
          ollamaUrl: 'http://127.0.0.1:11434',
          ollamaModel: 'test-model',
          contextSize: 'medium'
        },
        resolve,
        [],
        35
      );
    });

    expect(suggestions).toEqual([
      'Hold her gaze',
      'Lean closer across the bar'
    ]);
  });
});

describe('finalizeImpersonateDraft', () => {
  it('repairs leading action blocks into first-person phrasing', () => {
    const finalized = finalizeImpersonateDraft(
      '*slowly traces a finger along her lip* "You look good like this."',
      { charName: 'Alice', userName: 'Erik' }
    );

    expect(finalized.valid).toBe(true);
    expect(finalized.repaired).toBe(true);
    expect(finalized.text).toContain('*I slowly trace a finger along her lip*');
  });

  it('repairs second-person narration of the user without another model call', () => {
    const finalized = finalizeImpersonateDraft(
      'You guide her head gently and keep her eyes on you.',
      { charName: 'Alice', userName: 'Erik' }
    );

    expect(finalized.valid).toBe(true);
    expect(finalized.text).toBe('I guide her head gently and keep her eyes on you.');
  });

  it('rejects drafts that still start as the character after cleanup', () => {
    const finalized = finalizeImpersonateDraft(
      'Alice: *She smiles faintly.* "Then come closer."',
      { charName: 'Alice', userName: 'Erik' }
    );

    expect(finalized.valid).toBe(false);
    expect(finalized.text).toContain('*She smiles faintly.*');
  });

  it('strips visible user speaker prefixes from finalized drafts', () => {
    const finalized = finalizeImpersonateDraft(
      'User: *I take a slow breath and meet her eyes.* "Then stay."',
      { charName: 'Mei', userName: 'Erik' }
    );

    expect(finalized.valid).toBe(true);
    expect(finalized.text.startsWith('User:')).toBe(false);
    expect(finalized.text.startsWith('I:')).toBe(false);
  });
});

describe('deriveAssistBudgetTier', () => {
  it('returns constrained for small-model or low-budget setups', () => {
    expect(deriveAssistBudgetTier({
      parameterSize: '7B',
      modelName: 'test-7b',
      contextSize: 4096,
      maxResponseTokens: 192
    })).toBe('constrained');
  });

  it('returns roomy for larger-model or high-budget setups', () => {
    expect(deriveAssistBudgetTier({
      parameterSize: '27B',
      modelName: 'test-27b',
      contextSize: 8192,
      maxResponseTokens: 512
    })).toBe('roomy');
  });

  it('returns default for the normal middle path', () => {
    expect(deriveAssistBudgetTier({
      parameterSize: '12B',
      modelName: 'test-12b',
      contextSize: 6144,
      maxResponseTokens: 256
    })).toBe('default');
  });
});

describe('buildRoleplaySceneContext', () => {
  it('includes active-scene lines and the latest beat for helper grounding', () => {
    const context = buildRoleplaySceneContext(
      [
        { role: 'assistant', content: '*She wipes the counter.* "Long day?"' },
        { role: 'user', content: 'Yeah. I barely slept.' }
      ],
      'Mei',
      'Erik',
      'A grumpy cafe owner with hidden warmth.',
      'A rainy afternoon in a small corner cafe.',
      'She gives blunt comfort and notices small details.'
    );

    expect(context.sceneSummary).toContain('Setting:');
    expect(context.sceneSummary).toContain('Situation:');
    expect(context.sceneSummary).toContain('Relationship:');
    expect(context.sceneSummary).toContain('Continuity:');
    expect(context.sceneSummary).toContain('User Beat:');
    expect(context.currentBeat).toContain('Mei: *She wipes the counter.* "Long day?"');
    expect(context.currentBeat).toContain('Erik: Yeah. I barely slept.');
  });
});

describe('saveSession', () => {
  beforeEach(() => {
    global.localStorage = createStorageMock();
  });

  it('stores sceneMemory inside the same saved session snapshot', async () => {
    const result = await saveSession('session-memory-test', {
      characterName: 'Mei',
      conversationHistory: [
        { role: 'assistant', content: '*She waits by the counter.*', timestamp: 1700000001000 }
      ],
      sceneMemory: {
        setting_anchor: 'Cafe counter by the rainy window.',
        relationship_anchor: 'She keeps him close without admitting it.',
        continuity_facts: ['The mug is still between them.'],
        open_thread: '',
        source_assistant_timestamp: 1700000001000,
        updated_at: '2026-03-23T10:00:00.000Z'
      },
      lastUpdated: '2026-03-23T10:00:00.000Z'
    });

    const stored = JSON.parse(global.localStorage.getItem('sessions') || '{}');
    expect(result.success).toBe(true);
    expect(stored['session-memory-test'].sceneMemory.setting_anchor).toContain('Cafe counter');
  });

  it('does not let an older session snapshot overwrite a newer one in local storage', async () => {
    await saveSession('session-stale-test', {
      characterName: 'Mei',
      conversationHistory: [
        { role: 'assistant', content: '*She waits by the counter.*', timestamp: 1700000001000 }
      ],
      lastUpdated: '2026-03-23T10:05:00.000Z'
    });

    await saveSession('session-stale-test', {
      characterName: 'Mei',
      conversationHistory: [
        { role: 'assistant', content: '*Older stale reply.*', timestamp: 1699999999000 }
      ],
      lastUpdated: '2026-03-23T10:00:00.000Z'
    });

    const stored = JSON.parse(global.localStorage.getItem('sessions') || '{}');
    expect(stored['session-stale-test'].conversationHistory[0].content).toContain('waits by the counter');
  });
});

describe('sendMessage abort cleanup', () => {
  it('returns an aborted result without retrying or cleaning partial fetch-stream output', async () => {
    const encoder = new TextEncoder();
    let streamController = null;
    let chatCalls = 0;

    global.fetch = vi.fn(async (url, options = {}) => {
      if (String(url).endsWith('/api/show')) {
        return createJsonResponse({
          details: { parameter_size: '7B' },
          model_info: { 'general.context_length': 4096 }
        });
      }

      if (String(url).endsWith('/api/chat')) {
        chatCalls += 1;
        const signal = options.signal;
        const stream = new ReadableStream({
          start(controller) {
            streamController = controller;
            controller.enqueue(encoder.encode(JSON.stringify({ message: { content: '*She smiles slowly.* ' } }) + '\n'));
            setTimeout(() => {
              if (signal?.aborted) return;
              controller.enqueue(encoder.encode(JSON.stringify({
                message: { content: '"Stay."' },
                done: true,
                eval_count: 24,
                prompt_eval_count: 128
              }) + '\n'));
              controller.close();
            }, 25);
          }
        });

        signal?.addEventListener('abort', () => {
          streamController?.error(new Error('aborted'));
        }, { once: true });

        return new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const abortHandle = createStreamAbortHandle();
    let tokenCount = 0;
    const result = await sendMessage(
      'Stay with me.',
      {
        name: 'Mei',
        category: 'sfw',
        systemPrompt: 'Mei is dry, observant, and quietly protective.',
        instructions: 'Stay grounded in the moment.',
        scenario: 'Rainy cafe after closing time.'
      },
      [{ role: 'user', content: 'Stay with me.' }],
      null,
      false,
      null,
      {
        ollamaUrl: 'http://127.0.0.1:11434',
        ollamaModel: 'test-model',
        contextSize: 'medium',
        userName: 'Erik',
        maxResponseTokens: 128
      },
      () => {
        tokenCount += 1;
        abortHandle.abort('user');
      },
      abortHandle
    );

    expect(result).toEqual({
      success: false,
      error: 'The operation was aborted',
      aborted: true
    });
    expect(tokenCount).toBe(1);
    expect(chatCalls).toBe(1);
  });
});
