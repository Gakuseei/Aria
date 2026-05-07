import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const validResponse = JSON.stringify({
  pills: [
    { role: 'stay',    text: 'Sure thing.' },
    { role: 'forward', text: 'Lead the way.' },
    { role: 'push',    text: 'Heading there.' }
  ]
});

const fixtureCharacter = {
  name: 'Sarah',
  systemPrompt: 'You are {{char}}.',
  instructions: 'Snarky bartender, dry voice.'
};
const fixtureHistory = [
  { role: 'user',      content: 'hey' },
  { role: 'assistant', content: 'Cleaning up. The back room is quieter. Coming?' }
];
const fixtureSettings = {
  ollamaUrl: 'http://127.0.0.1:11434',
  ollamaModel: 'mag-mell-12b',
  suggestionModel: 'huihui_ai/qwen3-abliterated:4b-instruct-2507-q4_K_M',
  suggestionFallbackToChat: true,
  customProfiles: {}
};

function setupElectronApiMock(impl) {
  globalThis.window = globalThis.window || {};
  globalThis.window.electronAPI = { aiChat: vi.fn(impl) };
}

function loadModule() {
  return import('../../src/lib/chat/suggestions/index.js?t=' + Date.now());
}

beforeEach(() => {
  setupElectronApiMock(async () => ({ success: true, content: validResponse }));
});

afterEach(() => {
  vi.restoreAllMocks();
  delete globalThis.window?.electronAPI;
});

describe('generateSuggestionsBackground', () => {
  it('produces 3 pills via the suggestion model', async () => {
    const { generateSuggestionsBackground } = await loadModule();
    const onResult = vi.fn();
    await generateSuggestionsBackground(fixtureHistory, fixtureCharacter, 'Erik', fixtureSettings, onResult);
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult.mock.calls[0][0]).toEqual(['Sure thing.', 'Lead the way.', 'Heading there.']);
  });

  it('uses suggestionModel when set, not ollamaModel', async () => {
    const aiChat = vi.fn(async () => ({ success: true, content: validResponse }));
    setupElectronApiMock(aiChat);
    const { generateSuggestionsBackground } = await loadModule();
    await generateSuggestionsBackground(fixtureHistory, fixtureCharacter, 'Erik', fixtureSettings, () => {});
    const callArgs = aiChat.mock.calls[0][0];
    expect(callArgs.model).toBe('huihui_ai/qwen3-abliterated:4b-instruct-2507-q4_K_M');
  });

  it('falls back to ollamaModel when suggestionModel is null and fallback is on', async () => {
    const aiChat = vi.fn(async () => ({ success: true, content: validResponse }));
    setupElectronApiMock(aiChat);
    const { generateSuggestionsBackground } = await loadModule();
    const settings = { ...fixtureSettings, suggestionModel: null, suggestionFallbackToChat: true };
    await generateSuggestionsBackground(fixtureHistory, fixtureCharacter, 'Erik', settings, () => {});
    expect(aiChat.mock.calls[0][0].model).toBe('mag-mell-12b');
  });

  it('emits empty array when fallback is off and suggestionModel is null', async () => {
    const { generateSuggestionsBackground } = await loadModule();
    const onResult = vi.fn();
    const settings = { ...fixtureSettings, suggestionModel: null, suggestionFallbackToChat: false };
    await generateSuggestionsBackground(fixtureHistory, fixtureCharacter, 'Erik', settings, onResult);
    expect(onResult).toHaveBeenCalledWith([]);
  });

  it('retries once on malformed JSON, then succeeds', async () => {
    let call = 0;
    setupElectronApiMock(async () => {
      call++;
      return call === 1
        ? { success: true, content: 'not valid json' }
        : { success: true, content: validResponse };
    });
    const { generateSuggestionsBackground } = await loadModule();
    const onResult = vi.fn();
    await generateSuggestionsBackground(fixtureHistory, fixtureCharacter, 'Erik', fixtureSettings, onResult);
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult.mock.calls[0][0]).toHaveLength(3);
  });

  it('emits empty array after second failure', async () => {
    setupElectronApiMock(async () => ({ success: true, content: 'not valid json' }));
    const { generateSuggestionsBackground } = await loadModule();
    const onResult = vi.fn();
    await generateSuggestionsBackground(fixtureHistory, fixtureCharacter, 'Erik', fixtureSettings, onResult);
    expect(onResult).toHaveBeenCalledWith([]);
  });

  it('emits empty array when ollama returns success=false', async () => {
    setupElectronApiMock(async () => ({ success: false, error: 'connection refused' }));
    const { generateSuggestionsBackground } = await loadModule();
    const onResult = vi.fn();
    await generateSuggestionsBackground(fixtureHistory, fixtureCharacter, 'Erik', fixtureSettings, onResult);
    expect(onResult).toHaveBeenLastCalledWith([]);
  });

  it('discards stale request via requestId guard when abortSuggestionCall fires mid-flight', async () => {
    let resolveCall;
    setupElectronApiMock(() => new Promise((resolve) => { resolveCall = () => resolve({ success: true, content: validResponse }); }));
    const { generateSuggestionsBackground, abortSuggestionCall } = await loadModule();
    const onResult = vi.fn();
    const promise = generateSuggestionsBackground(fixtureHistory, fixtureCharacter, 'Erik', fixtureSettings, onResult);
    abortSuggestionCall();
    resolveCall();
    await promise;
    expect(onResult).not.toHaveBeenCalled();
  });

  it('passes resolved character core and derived open_thread into the system prompt', async () => {
    const aiChat = vi.fn(async () => ({ success: true, content: validResponse }));
    setupElectronApiMock(aiChat);
    const { generateSuggestionsBackground } = await loadModule();

    const character = {
      name: 'Sarah',
      systemPrompt: 'You are {{char}}, a snarky bartender talking to {{user}}.',
      instructions: 'Stay sharp and dry.'
    };
    const history = [
      { role: 'user',      content: 'Hey, what are you doing later?' },
      { role: 'assistant', content: 'Cleaning up. The back room is quieter. Coming?' }
    ];

    await generateSuggestionsBackground(history, character, 'Erik', fixtureSettings, () => {}, { previousPills: [] });

    const sysPrompt = aiChat.mock.calls[0][0].systemPrompt;
    expect(sysPrompt).toContain('Sarah');
    expect(sysPrompt).toContain('Erik');
    expect(sysPrompt).not.toContain('{{char}}');
    expect(sysPrompt).not.toContain('{{user}}');
    expect(sysPrompt).toContain('back room is quieter');
  });

  it('rejects pill set when previousPills contains an exact duplicate, then retries', async () => {
    let call = 0;
    setupElectronApiMock(async () => {
      call++;
      if (call === 1) {
        return { success: true, content: JSON.stringify({
          pills: [
            { role: 'stay',    text: 'Sure thing.' },
            { role: 'forward', text: 'Lead the way.' },
            { role: 'push',    text: 'Heading there.' }
          ]
        }) };
      }
      return { success: true, content: JSON.stringify({
        pills: [
          { role: 'stay',    text: 'A different reply.' },
          { role: 'forward', text: 'A different forward.' },
          { role: 'push',    text: 'A different push.' }
        ]
      }) };
    });
    const { generateSuggestionsBackground } = await loadModule();
    const onResult = vi.fn();
    await generateSuggestionsBackground(
      fixtureHistory,
      fixtureCharacter,
      'Erik',
      fixtureSettings,
      onResult,
      { previousPills: ['Sure thing.'] }
    );
    expect(call).toBe(2);
    expect(onResult).toHaveBeenCalledWith(['A different reply.', 'A different forward.', 'A different push.']);
  });
});
