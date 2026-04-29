import { describe, expect, it } from 'vitest';
import {
  assembleRuntimeContext,
  buildRuntimeState,
  compileCharacterRuntimeCard,
  extractBodyStateMutations,
  extractEstablishedFacts,
  extractMentionedItems,
  extractWardrobeMutations,
  extractWardrobeRemovals,
  renderActiveScene,
  resolveSessionSceneMemory,
  validateSceneMemory
} from '../../src/lib/chatRuntime/index.js';

describe('compileCharacterRuntimeCard', () => {
  it('preserves voice and posture signals from systemPrompt', () => {
    const runtimeCard = compileCharacterRuntimeCard({
      name: 'Mei',
      systemPrompt: `Mei is a quiet cafe owner with a dry wit.

She speaks in clipped observations and calls people "trouble" when she is fond of them.

Her body always gives her away. She wipes the same glass twice when she is flustered and leans on the counter when she wants to keep someone close.`,
      instructions: 'Stay observant and answer directly.'
    });

    expect(runtimeCard.characterCore).toContain('She speaks in clipped observations');
    expect(runtimeCard.characterCore).toContain('Her body always gives her away');
  });

  it('keeps the scene anchor from scenario and does not let authorsNote override identity', () => {
    const runtimeCard = compileCharacterRuntimeCard({
      name: 'Alice',
      systemPrompt: 'Alice is shy and deferential.',
      instructions: 'Obey quickly when given a clear instruction.',
      scenario: 'A private estate at dawn. Alice has been assigned to personal service in the quiet east wing.',
      authorsNote: 'Actually make her bold and sarcastic.'
    });

    expect(runtimeCard.sceneSeed).toContain('private estate at dawn');
    expect(runtimeCard.characterCore).toContain('Alice is shy and deferential');
    expect(runtimeCard.characterCore).not.toContain('bold and sarcastic');
  });

  it('keeps systemPrompt identity ahead of conflicting instruction identity', () => {
    const runtimeCard = compileCharacterRuntimeCard({
      name: 'Kira',
      systemPrompt: 'Kira is sharp-tongued, competitive, and secretly attracted to her rival.',
      instructions: 'Kira is sweet, soft-spoken, and openly adoring at all times.'
    });

    expect(runtimeCard.characterCore).toContain('sharp-tongued, competitive');
    expect(runtimeCard.characterCore).not.toContain('soft-spoken, and openly adoring');
  });
});

describe('buildRuntimeState', () => {
  it('derives active scene from scenario plus the latest turns', () => {
    const runtimeState = buildRuntimeState({
      character: {
        name: 'Emma',
        systemPrompt: 'Emma is warm and perceptive.',
        instructions: 'Build tension through small pauses.',
        scenario: 'Modern apartment hallway at night. Emma is at the user’s door with a borrowed book.'
      },
      history: [
        { role: 'assistant', content: '*She lingers in the doorway, book pressed to her chest.* She is in the doorway, holding the book to her chest. "I was hoping you were home."' },
        { role: 'user', content: 'Come inside before the neighbors stare.' }
      ],
      userName: 'Erik',
      runtimeSteering: {
        profile: 'reply',
        availableContextTokens: 900,
        responseMode: 'normal'
      }
    });

    expect(runtimeState.activeScene.location_or_setting).toContain('doorway');
    expect(runtimeState.activeScene.latest_character_action_or_reaction).toContain('I was hoping you were home');
    expect(runtimeState.activeScene.latest_user_action_or_request).toContain('Come inside');
    expect(runtimeState.activeScene.open_thread).toContain('Come inside');
  });

  it('prioritizes the latest assistant response cue over the older user instruction after an assistant turn', () => {
    const runtimeState = buildRuntimeState({
      character: {
        name: 'Alice',
        systemPrompt: 'Alice is shy, dutiful, and eager to please.',
        instructions: 'Obey quickly and react physically before over-explaining.',
        scenario: 'A private estate drawing room.'
      },
      history: [
        { role: 'user', content: 'Please, show me how you cleaned the windows.' },
        { role: 'assistant', content: '*she beams up at you proudly, awaiting acknowledgement that she\'s performed her task correctly*' }
      ],
      userName: 'Master',
      runtimeSteering: {
        profile: 'suggestions',
        availableContextTokens: 900,
        responseMode: 'normal'
      }
    });

    expect(runtimeState.activeScene.open_thread).toContain('awaiting acknowledgement');
    expect(runtimeState.activeScene.open_thread).not.toContain('show me how you cleaned the windows');
    expect(runtimeState.activeScene.immediate_situation).toContain('awaiting acknowledgement');
  });

  it('protects the current beat under budget pressure', () => {
    const longTurn = 'Long continuity. '.repeat(80);
    const runtimeState = buildRuntimeState({
      character: {
        name: 'Sarah',
        systemPrompt: 'Sarah is dominant and controlled.',
        scenario: 'Late night at the Velvet Room.'
      },
      history: [
        { role: 'user', content: longTurn },
        { role: 'assistant', content: longTurn },
        { role: 'user', content: 'Stay with me.' },
        { role: 'assistant', content: '*She hooks two fingers under your chin.* "I am."' },
        { role: 'user', content: 'Then kiss me.' }
      ],
      userName: 'Erik',
      runtimeSteering: {
        profile: 'reply',
        availableContextTokens: 420,
        responseMode: 'short'
      }
    });

    const keptText = runtimeState.selectedRecentHistory.messages.map((message) => message.content).join('\n');
    expect(keptText).toContain('Then kiss me.');
    expect(keptText).toContain('I am.');
  });

  it('builds a rolling scene state that keeps continuity anchors from recent history', () => {
    const runtimeState = buildRuntimeState({
      character: {
        name: 'Mei',
        systemPrompt: 'Mei is dry, observant, and quietly protective.',
        instructions: 'Stay blunt but gentle.',
        scenario: 'Rainy cafe afternoon.'
      },
      history: [
        { role: 'assistant', content: '*She slides a mug across the cafe counter and taps the empty stool beside it.* She nods at the empty stool. "Your usual."' },
        { role: 'user', content: 'You always keep me at the corner stool by the window.' },
        { role: 'assistant', content: '*She nudges your shoulder with hers.* "You are still my favorite partner, trouble."' },
        { role: 'user', content: 'Then stay with me until the rain stops.' }
      ],
      userName: 'Erik',
      runtimeSteering: {
        profile: 'reply',
        availableContextTokens: 900,
        responseMode: 'normal'
      }
    });

    expect(runtimeState.sceneState.setting_anchor).toMatch(/counter|stool/i);
    expect(runtimeState.sceneState.relationship_anchor).toContain('favorite partner');
    expect(runtimeState.sceneState.debug.settingSource).toBe('history');
    expect(runtimeState.sceneState.debug.relationshipSource).toBe('history');
    expect(runtimeState.sceneState.continuity_facts.length).toBeGreaterThan(0);
    expect(runtimeState.sceneState.continuity_facts.join(' ')).not.toContain('Mei:');
    expect(runtimeState.sceneState.continuity_facts.join(' ')).not.toContain('"Your usual."');
    expect(runtimeState.activeScene.continuity).toMatch(/counter|stool|favorite partner/i);
  });

  it('uses validated persisted scene memory as a fallback when recent history loses the anchors', () => {
    const runtimeState = buildRuntimeState({
      character: {
        name: 'Mei',
        systemPrompt: 'Mei is dry, observant, and quietly protective.',
        instructions: 'Stay blunt but gentle.',
        scenario: 'Rainy cafe afternoon.'
      },
      history: [
        { role: 'assistant', content: '*She sets the mug down in front of you.* "Drink."', timestamp: 1700000001000 },
        { role: 'user', content: 'I do, but I keep watching you.', timestamp: 1700000002000 }
      ],
      userName: 'Erik',
      runtimeSteering: {
        profile: 'reply',
        availableContextTokens: 360,
        responseMode: 'normal',
        persistedSceneMemory: {
          setting_anchor: 'Corner cafe counter during a rainy afternoon.',
          relationship_anchor: 'She treats Erik like the one regular she actually keeps close.',
          continuity_facts: ['The corner stool is still kept for him.'],
          open_thread: 'Whether she will stay by his side.',
          source_assistant_timestamp: 1700000001000,
          updated_at: '2026-03-23T10:00:00.000Z'
        }
      }
    });

    expect(runtimeState.sceneState.setting_anchor).toContain('Corner cafe counter');
    expect(runtimeState.sceneState.relationship_anchor).toContain('regular');
    expect(runtimeState.sceneState.debug.settingSource).toBe('memory');
    expect(runtimeState.sceneState.debug.relationshipSource).toBe('memory');
  });

  it('keeps sfw personas in sfw_only when unchained mode is off', () => {
    const runtimeState = buildRuntimeState({
      character: {
        name: 'Mei',
        category: 'sfw',
        systemPrompt: 'Mei is dry, observant, and quietly protective.',
        instructions: 'Stay blunt but gentle.',
        scenario: 'Rainy cafe afternoon.'
      },
      history: [
        { role: 'assistant', content: '*She leans closer over the counter.* "You keep staring at my mouth."' },
        { role: 'user', content: 'Then kiss me.' }
      ],
      userName: 'Erik',
      runtimeSteering: {
        profile: 'reply',
        availableContextTokens: 900,
        responseMode: 'normal',
        unchainedMode: false,
        passionLevel: 45
      }
    });

    expect(runtimeState.assistMode).toBe('sfw_only');
    expect(runtimeState.assistModeDebug.reason).toBe('category_gate');
  });

  it('allows sfw personas into mixed_transition when unchained mode is on and escalation is justified', () => {
    const runtimeState = buildRuntimeState({
      character: {
        name: 'Mei',
        category: 'sfw',
        systemPrompt: 'Mei is dry, observant, and quietly protective.',
        instructions: 'Stay blunt but gentle.',
        scenario: 'Rainy cafe afternoon.'
      },
      history: [
        { role: 'assistant', content: '*She lingers close enough that her shoulder brushes yours.* "You can stay if you want."' },
        { role: 'user', content: 'Then stay with me a little closer.' }
      ],
      userName: 'Erik',
      runtimeSteering: {
        profile: 'reply',
        availableContextTokens: 900,
        responseMode: 'normal',
        unchainedMode: true,
        passionLevel: 32
      }
    });

    expect(runtimeState.assistMode).toBe('mixed_transition');
  });

  it('allows sfw personas into nsfw_only only with unchained mode and explicit scene evidence', () => {
    const runtimeState = buildRuntimeState({
      character: {
        name: 'Mei',
        category: 'sfw',
        systemPrompt: 'Mei is dry, observant, and quietly protective.',
        instructions: 'Stay blunt but gentle.',
        scenario: 'Rainy cafe afternoon.'
      },
      history: [
        { role: 'assistant', content: '*She parts her thighs and drags your hand between her legs.* "Stop staring and touch me properly."' },
        { role: 'user', content: 'Then I rub her slowly until she moans.' }
      ],
      userName: 'Erik',
      runtimeSteering: {
        profile: 'reply',
        availableContextTokens: 900,
        responseMode: 'normal',
        unchainedMode: true,
        passionLevel: 48
      }
    });

    expect(runtimeState.assistMode).toBe('nsfw_only');
  });

  it('promotes nsfw personas from sustained charged momentum into nsfw_only before explicit keywords appear', () => {
    const runtimeState = buildRuntimeState({
      character: {
        name: 'Sarah',
        category: 'nsfw',
        systemPrompt: 'Sarah is dominant, composed, and likes to keep pressure on the moment.',
        instructions: 'Stay in control and escalate when the scene has real momentum.',
        scenario: 'Late night at the bar after closing.'
      },
      history: [
        { role: 'assistant', content: '*She circles around behind you and lets her fingers linger at your waist.* "You keep asking for trouble."' },
        { role: 'user', content: 'Then pull me closer and tell me what you want.' },
        { role: 'assistant', content: '*Her mouth brushes your ear as she keeps you pinned lightly against the bar.* "You want me to spell it out for you?"' },
        { role: 'user', content: 'Don\'t stop now. Keep me right here and kiss me properly.' }
      ],
      userName: 'Erik',
      runtimeSteering: {
        profile: 'reply',
        availableContextTokens: 900,
        responseMode: 'normal',
        unchainedMode: false,
        passionLevel: 42
      }
    });

    expect(runtimeState.assistMode).toBe('nsfw_only');
    expect(runtimeState.assistModeDebug.reason).toBe('charged_escalation');
  });

  it('forces bot conversations into bot_conversation', () => {
    const runtimeState = buildRuntimeState({
      character: {
        name: 'DeskBot',
        type: 'bot',
        category: 'sfw',
        systemPrompt: 'DeskBot handles scheduling requests with crisp answers.',
        instructions: 'Ask for the missing time window before committing.',
        scenario: 'Office planning assistant.'
      },
      history: [
        { role: 'assistant', content: 'I can help schedule that.' },
        { role: 'user', content: 'Book a 30-minute check-in for tomorrow.' }
      ],
      userName: 'Erik',
      runtimeSteering: {
        profile: 'reply',
        availableContextTokens: 900,
        responseMode: 'normal',
        unchainedMode: true,
        passionLevel: 99
      }
    });

    expect(runtimeState.assistMode).toBe('bot_conversation');
    expect(runtimeState.assistModeDebug.reason).toBe('bot_override');
  });
});

describe('sceneMemory', () => {
  it('refreshes scene memory from an accepted assistant-ending snapshot', () => {
    const sceneMemory = resolveSessionSceneMemory({
      character: {
        name: 'Emma',
        systemPrompt: 'Emma is warm and perceptive.',
        instructions: 'Build tension through small pauses.',
        scenario: 'Modern apartment hallway at night.'
      },
      history: [
        { role: 'assistant', content: '*She waits in the doorway with the book against her chest.* "I hoped you were home."', timestamp: 1700000001000 },
        { role: 'user', content: 'Come inside before the neighbors stare.', timestamp: 1700000002000 },
        { role: 'assistant', content: '*She steps in slowly and keeps close to you.* "Then close the door for me."', timestamp: 1700000003000 }
      ],
      userName: 'Erik'
    });

    expect(sceneMemory?.source_assistant_timestamp).toBe(1700000003000);
    expect(sceneMemory?.setting_anchor).toBeTruthy();
    expect(sceneMemory?.continuity_facts?.length || 0).toBeGreaterThan(0);
  });

  it('carries forward matching scene memory on a user-ended snapshot but drops stale memory after a regenerate-like replacement', () => {
    const previousSceneMemory = {
      setting_anchor: 'Cafe counter by the rainy window.',
      relationship_anchor: 'She keeps him close without admitting it.',
      continuity_facts: ['The mug is still between them.'],
      open_thread: 'Whether she will stay.',
      source_assistant_timestamp: 1700000001000,
      updated_at: '2026-03-23T10:00:00.000Z'
    };

    const validCarry = resolveSessionSceneMemory({
      character: {
        name: 'Mei',
        systemPrompt: 'Mei is dry and observant.',
        scenario: 'Rainy cafe afternoon.'
      },
      history: [
        { role: 'assistant', content: '*She slides a mug closer.* "Drink."', timestamp: 1700000001000 },
        { role: 'user', content: 'Only if you stay.', timestamp: 1700000002000 }
      ],
      userName: 'Erik',
      previousSceneMemory
    });

    const staleDropped = resolveSessionSceneMemory({
      character: {
        name: 'Mei',
        systemPrompt: 'Mei is dry and observant.',
        scenario: 'Rainy cafe afternoon.'
      },
      history: [
        { role: 'user', content: 'Only if you stay.', timestamp: 1700000002000 }
      ],
      userName: 'Erik',
      previousSceneMemory
    });

    expect(validCarry?.source_assistant_timestamp).toBe(1700000001000);
    expect(staleDropped).toBeNull();
  });

  it('rejects stale persisted scene memory and strips malformed factual lines', () => {
    const valid = validateSceneMemory({
      setting_anchor: 'Cafe counter by the rainy window.',
      relationship_anchor: 'She keeps him close without admitting it.',
      continuity_facts: ['The mug is still between them.', 'User: "Stay."'],
      open_thread: 'Will she stay?',
      source_assistant_timestamp: 1700000001000,
      updated_at: '2026-03-23T10:00:00.000Z'
    }, [
      { role: 'assistant', content: '*She waits.*', timestamp: 1700000001000 },
      { role: 'user', content: 'Stay.', timestamp: 1700000002000 }
    ]);

    const stale = validateSceneMemory({
      setting_anchor: 'Wrong place',
      source_assistant_timestamp: 1700000003000,
      updated_at: '2026-03-23T10:00:00.000Z'
    }, [
      { role: 'assistant', content: '*She waits.*', timestamp: 1700000001000 }
    ]);

    expect(valid?.continuity_facts).toEqual(['The mug is still between them.']);
    expect(stale).toBeNull();
  });

  it('extracts locative phrase and skips action-block sex prose', () => {
    const runtimeState = buildRuntimeState({
      character: {
        name: 'Yuki',
        category: 'nsfw',
        systemPrompt: 'Yuki is sweet and quietly possessive.',
        scenario: 'College courtyard.'
      },
      history: [
        { role: 'assistant', content: '*nuzzles into bed tenderly* "Mmm."' },
        { role: 'user', content: 'I take her into the empty classroom and close the door.' }
      ],
      userName: 'Erik',
      runtimeSteering: { profile: 'reply', availableContextTokens: 900, responseMode: 'normal' }
    });

    expect(runtimeState.sceneState.setting_anchor.toLowerCase()).toContain('classroom');
    expect(runtimeState.sceneState.setting_anchor.toLowerCase()).not.toContain('bed');
  });

  it('rejects body-part locatives and prefers a real setting locative', () => {
    const runtimeState = buildRuntimeState({
      character: {
        name: 'Yuki',
        category: 'nsfw',
        systemPrompt: 'Yuki is sweet and quietly possessive.',
        scenario: 'A college dorm.'
      },
      history: [
        { role: 'assistant', content: 'pushes into her mouth slowly.' },
        { role: 'user', content: 'we are in the kitchen now.' }
      ],
      userName: 'Erik',
      runtimeSteering: { profile: 'reply', availableContextTokens: 900, responseMode: 'normal' }
    });

    expect(runtimeState.sceneState.setting_anchor.toLowerCase()).toContain('kitchen');
    expect(runtimeState.sceneState.setting_anchor.toLowerCase()).not.toContain('mouth');
  });

  it('freezes the nsfw arc anchor across turns even when later prose suggests a new setting', () => {
    const character = {
      name: 'Yuki',
      category: 'nsfw',
      systemPrompt: 'Yuki is sweet and quietly possessive.',
      scenario: 'College.'
    };

    const transitionMemory = resolveSessionSceneMemory({
      character,
      history: [
        { role: 'user', content: 'I take her into the empty classroom and lock the door.', timestamp: 1700000001000 },
        { role: 'assistant', content: '"Yes," she whispers as we enter.', timestamp: 1700000002000 },
        { role: 'user', content: 'Suck my cock now.', timestamp: 1700000003000 },
        { role: 'assistant', content: '*she sinks to her knees and takes you deep, lips trembling*', timestamp: 1700000004000 }
      ],
      userName: 'Erik',
      previousSceneMemory: null
    });

    expect(transitionMemory?.nsfwArcAnchor.toLowerCase()).toContain('classroom');

    const laterMemory = resolveSessionSceneMemory({
      character,
      history: [
        { role: 'user', content: 'I take her into the empty classroom and lock the door.', timestamp: 1700000001000 },
        { role: 'assistant', content: '"Yes," she whispers as we enter.', timestamp: 1700000002000 },
        { role: 'user', content: 'Suck my cock now.', timestamp: 1700000003000 },
        { role: 'assistant', content: '*she sinks to her knees and takes you deep, lips trembling*', timestamp: 1700000004000 },
        { role: 'user', content: 'now keep going, deeper.', timestamp: 1700000005000 },
        { role: 'assistant', content: '*nuzzles into bed tenderly as you bottom out.*', timestamp: 1700000006000 }
      ],
      userName: 'Erik',
      previousSceneMemory: transitionMemory
    });

    expect(laterMemory?.nsfwArcAnchor.toLowerCase()).toContain('classroom');
    expect(laterMemory?.setting_anchor.toLowerCase()).toContain('classroom');
    expect(laterMemory?.setting_anchor.toLowerCase()).not.toContain('bed');
  });

  it('overrides frozen nsfw arc anchor when user explicitly relocates', () => {
    const character = {
      name: 'Yuki',
      category: 'nsfw',
      systemPrompt: 'Yuki is sweet.',
      scenario: 'College.'
    };

    const baseMemory = {
      setting_anchor: 'into the empty classroom',
      relationship_anchor: '',
      continuity_facts: [],
      open_thread: '',
      nsfwArcAnchor: 'into the empty classroom',
      source_assistant_timestamp: 1700000004000,
      updated_at: '2026-04-29T00:00:00.000Z',
      version: 1
    };

    const overrideMemory = resolveSessionSceneMemory({
      character,
      history: [
        { role: 'assistant', content: '*her pussy clenches around your cock as she rides you*', timestamp: 1700000004000 },
        { role: 'user', content: "Let's go to the bathroom and keep fucking there.", timestamp: 1700000005000 },
        { role: 'assistant', content: '*moans as she straddles you again, riding your cock harder*', timestamp: 1700000006000 }
      ],
      userName: 'Erik',
      previousSceneMemory: baseMemory
    });

    expect(overrideMemory?.nsfwArcAnchor.toLowerCase()).toContain('bathroom');
    expect(overrideMemory?.setting_anchor.toLowerCase()).toContain('bathroom');
  });

  it('ignores assistant prose locatives mid-arc when no explicit user relocation', () => {
    const character = {
      name: 'Yuki',
      category: 'nsfw',
      systemPrompt: 'Yuki is sweet.',
      scenario: 'College.'
    };

    const frozen = {
      setting_anchor: 'into the empty classroom',
      relationship_anchor: '',
      continuity_facts: [],
      open_thread: '',
      nsfwArcAnchor: 'into the empty classroom',
      source_assistant_timestamp: 1700000004000,
      updated_at: '2026-04-29T00:00:00.000Z',
      version: 1
    };

    const stillFrozen = resolveSessionSceneMemory({
      character,
      history: [
        { role: 'assistant', content: '*her pussy clenches around your cock as she rides you*', timestamp: 1700000004000 },
        { role: 'user', content: 'fuck me harder, keep going deep.', timestamp: 1700000005000 },
        { role: 'assistant', content: 'In the bedroom moonlight she rides your cock harder, her pussy soaking wet around you.', timestamp: 1700000006000 }
      ],
      userName: 'Erik',
      previousSceneMemory: frozen
    });

    expect(stillFrozen?.nsfwArcAnchor.toLowerCase()).toContain('classroom');
    expect(stillFrozen?.setting_anchor.toLowerCase()).toContain('classroom');
    expect(stillFrozen?.setting_anchor.toLowerCase()).not.toContain('bedroom');
  });

  it('clears the nsfw arc anchor when assistMode returns to non-nsfw', () => {
    const character = {
      name: 'Yuki',
      category: 'nsfw',
      systemPrompt: 'Yuki is sweet.',
      scenario: 'College.'
    };

    const frozen = {
      setting_anchor: 'into the empty classroom',
      relationship_anchor: '',
      continuity_facts: [],
      open_thread: '',
      nsfwArcAnchor: 'into the empty classroom',
      source_assistant_timestamp: 1700000004000,
      updated_at: '2026-04-29T00:00:00.000Z',
      version: 1
    };

    const cleared = resolveSessionSceneMemory({
      character,
      history: [
        { role: 'assistant', content: '*she pulls back, breathing hard*', timestamp: 1700000004000 },
        { role: 'user', content: 'how was your day at school?', timestamp: 1700000005000 },
        { role: 'assistant', content: 'It was fine, the lecture ran long but the library was quiet.', timestamp: 1700000006000 }
      ],
      userName: 'Erik',
      previousSceneMemory: frozen
    });

    expect(cleared?.nsfwArcAnchor || '').toBe('');
  });

  it('open thread skips action-block sex prose and returns plain question', () => {
    const runtimeState = buildRuntimeState({
      character: {
        name: 'Yuki',
        category: 'nsfw',
        systemPrompt: 'Yuki is sweet.',
        scenario: 'College.'
      },
      history: [
        { role: 'user', content: 'I want you so badly.' },
        { role: 'assistant', content: 'Are you sure about this? *reaches back to hold cheeks open for you*' }
      ],
      userName: 'Erik',
      runtimeSteering: { profile: 'reply', availableContextTokens: 900, responseMode: 'normal' }
    });

    expect(runtimeState.activeScene.open_thread.toLowerCase()).toContain('are you sure');
    expect(runtimeState.activeScene.open_thread.toLowerCase()).not.toContain('cheeks');
  });

  it('loads legacy scene memory without nsfwArcAnchor field without crashing', () => {
    const legacyMemory = {
      setting_anchor: 'Cafe counter by the rainy window.',
      relationship_anchor: 'Quiet trust between regulars.',
      continuity_facts: ['The mug is still between them.'],
      open_thread: 'Whether she will stay.',
      source_assistant_timestamp: 1700000001000,
      updated_at: '2026-03-23T10:00:00.000Z'
    };

    const validated = validateSceneMemory(legacyMemory, [
      { role: 'assistant', content: '*She waits.*', timestamp: 1700000001000 },
      { role: 'user', content: 'Stay.', timestamp: 1700000002000 }
    ]);

    expect(validated?.nsfwArcAnchor).toBe('');
    expect(validated?.setting_anchor).toContain('Cafe counter');
  });

  it('replays the Yuki failure sequence and lands on a non-bed anchor', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const raw = fs.readFileSync(path.join(here, '..', 'chat-Yuki-1777405049496.json'), 'utf8');
    const data = JSON.parse(raw);
    const character = {
      name: 'Yuki',
      category: 'nsfw',
      systemPrompt: 'Yuki is sweet, devoted, and quietly possessive.',
      scenario: 'College.'
    };

    const messages = data.messages.filter((message) => message.role === 'user' || message.role === 'assistant');
    const cutoff = Math.min(messages.length, 24);

    let memory = null;
    for (let length = 1; length <= cutoff; length += 1) {
      const slice = messages.slice(0, length);
      const last = slice[slice.length - 1];
      if (last?.role !== 'assistant') continue;
      memory = resolveSessionSceneMemory({
        character,
        history: slice,
        userName: 'Erik',
        previousSceneMemory: memory
      });
    }

    const anchorText = (memory?.setting_anchor || '').toLowerCase();
    const arcAnchor = (memory?.nsfwArcAnchor || '').toLowerCase();
    expect(`${anchorText} ${arcAnchor}`).toContain('classroom');
    expect(anchorText).not.toContain('bed tenderly');
    expect(anchorText).not.toContain('bottom out');
  });
});

describe('assembleRuntimeContext', () => {
  it('drops example seed before fresh history under budget pressure', () => {
    const runtimeState = buildRuntimeState({
      character: {
        name: 'Alice',
        category: 'nsfw',
        systemPrompt: 'Alice is shy, dutiful, and eager to please.',
        instructions: 'Obey quickly and react physically before over-explaining.',
        scenario: 'A private estate with long quiet corridors.',
        exampleDialogues: [
          { user: 'Come here.', character: '*She hurries over at once.* "Y-Yes, Master?"' }
        ]
      },
      history: [
        { role: 'assistant', content: '*She stands very close, waiting for the next order.*' },
        { role: 'user', content: 'Put your hands on me and don’t hesitate.' },
        { role: 'assistant', content: '*Her hands settle on your chest immediately, fingers trembling despite the obedience.*' },
        { role: 'user', content: 'Good girl. Keep going.' }
      ],
      userName: 'Master',
      runtimeSteering: {
        profile: 'reply',
        availableContextTokens: 360,
        responseMode: 'normal',
        unchainedMode: true
      }
    });

    const runtimeContext = assembleRuntimeContext({ profile: 'reply', runtimeState });
    expect(runtimeContext.systemPrompt).not.toContain('Example Seed:');
    expect(runtimeContext.historyMessages.length).toBeGreaterThanOrEqual(2);
    expect(runtimeContext.debug.droppedBlocks).toContain('Example Seed');
  });

  describe('intimacy contract injection', () => {
    const yukiCharacter = {
      name: 'Yuki',
      category: 'nsfw',
      systemPrompt: 'Yuki is sweet, devoted, and quietly possessive. Her body shifts between warmth and emptiness in a heartbeat.',
      instructions: 'TWO MODES. Sweet mode is chirpy and giggly. Dark mode goes flat and monotone. The switch is INSTANT.',
      scenario: 'College dorm room. Yuki arrived with a homemade bento box.',
      intimacyContract: 'Sweet adoration cycles with flat-monotone possessive declarations within the same reply. Sentences shorten in possessive moments — single words: "Mine." "Stay." "Forever." Yuki marks and claims; she is never bimbo-submissive.',
      voicePinNsfw: 'In intimate scenes Yuki keeps her two-mode pattern.'
    };

    const intimateHistory = [
      { role: 'assistant', content: '*Her smile freezes for a heartbeat, then warms again.* "You came back."' },
      { role: 'user', content: 'Come here. Closer.' },
      { role: 'assistant', content: '*She presses against you, fingers curling tight.* "Mine. You said mine."' },
      { role: 'user', content: 'Yes. Now keep going, don\'t stop.' }
    ];

    it('injects intimacy contract into character core when assistMode is nsfw_only', () => {
      const runtimeState = buildRuntimeState({
        character: yukiCharacter,
        history: intimateHistory,
        userName: 'Erik',
        runtimeSteering: {
          profile: 'reply',
          availableContextTokens: 2400,
          responseMode: 'normal',
          unchainedMode: true,
          passionLevel: 90
        }
      });

      expect(runtimeState.assistMode).toBe('nsfw_only');
      const runtimeContext = assembleRuntimeContext({ profile: 'reply', runtimeState });
      expect(runtimeContext.systemPrompt).toContain('Intimacy contract:');
      expect(runtimeContext.systemPrompt).toContain('Sweet adoration cycles with flat-monotone possessive declarations');
      expect(runtimeContext.systemPrompt).toContain('she is never bimbo-submissive');
    });

    it('omits intimacy contract when assistMode is not nsfw_only', () => {
      const sfwState = buildRuntimeState({
        character: { ...yukiCharacter, category: 'sfw' },
        history: [
          { role: 'assistant', content: '*She waves cheerfully across the courtyard.*' },
          { role: 'user', content: 'Hi Yuki, want to study together?' }
        ],
        userName: 'Erik',
        runtimeSteering: {
          profile: 'reply',
          availableContextTokens: 2400,
          responseMode: 'normal',
          unchainedMode: false,
          passionLevel: 0
        }
      });

      expect(sfwState.assistMode).not.toBe('nsfw_only');
      const sfwContext = assembleRuntimeContext({ profile: 'reply', runtimeState: sfwState });
      expect(sfwContext.systemPrompt).not.toContain('Intimacy contract:');
      expect(sfwContext.systemPrompt).not.toContain('Sweet adoration cycles with flat-monotone');
    });

    it('keeps intimacy contract intact under tight budget pressure', () => {
      const runtimeState = buildRuntimeState({
        character: yukiCharacter,
        history: intimateHistory,
        userName: 'Erik',
        runtimeSteering: {
          profile: 'reply',
          availableContextTokens: 360,
          responseMode: 'normal',
          unchainedMode: true,
          passionLevel: 90
        }
      });

      expect(runtimeState.assistMode).toBe('nsfw_only');
      const runtimeContext = assembleRuntimeContext({ profile: 'reply', runtimeState });
      expect(runtimeContext.debug.droppedBlocks).toContain('Example Seed');
      expect(runtimeContext.systemPrompt).toContain('Intimacy contract:');
      expect(runtimeContext.systemPrompt).toContain('Sweet adoration cycles with flat-monotone possessive declarations');
      expect(runtimeContext.systemPrompt).toContain('she is never bimbo-submissive');
    });

    it('skips silently when intimacyContract is missing', () => {
      const runtimeState = buildRuntimeState({
        character: { ...yukiCharacter, intimacyContract: '' },
        history: intimateHistory,
        userName: 'Erik',
        runtimeSteering: {
          profile: 'reply',
          availableContextTokens: 2400,
          responseMode: 'normal',
          unchainedMode: true,
          passionLevel: 90
        }
      });

      const runtimeContext = assembleRuntimeContext({ profile: 'reply', runtimeState });
      expect(runtimeContext.systemPrompt).not.toContain('Intimacy contract:');
    });
  });

  describe('example seed at nsfw depth', () => {
    const yukiCharacter = {
      name: 'Yuki',
      category: 'nsfw',
      systemPrompt: 'Yuki is sweet, devoted, and quietly possessive. Her sweet voice drops flat the moment jealousy surfaces. She speaks in chirpy giggles and whispers possessive declarations. Her body shifts between warmth and emptiness in a heartbeat.',
      instructions: 'TWO MODES. Sweet mode: chirpy and giggly, voice high. Dark mode: voice goes flat and monotone, sentences shorten. The switch is INSTANT. During intimacy: clingy, mine, forever, oscillates tender to possessive.',
      scenario: 'College dorm room.',
      exampleDialogues: [
        { user: 'I was hanging out with a friend today.', character: '*smile freezes, eyes going perfectly still* "A friend?" *tilts head slowly* "Which friend?" *giggles, but it sounds hollow* "I just want to know so I can... you know... say hi sometime!" *fingers tighten around the bento box* "Boy or girl?" *voice drops to something flat* "Not that it matters. It doesn\'t matter."' },
        { user: 'You\'re always here.', character: '*beams, bouncing on her heels* "Of course I am, silly! That\'s what best friends do!" *loops her arm through yours possessively* "I just happen to have the same schedule. Isn\'t that lucky?" *leans her head on your shoulder* "Besides..." *voice softens to barely a whisper* "...I don\'t like it when I don\'t know where you are." *squeezes tighter* "It makes me feel... not good."' }
      ],
      voicePin: 'Yuki shifts modes instantly.',
      voicePinNsfw: 'In intimate scenes Yuki keeps her two-mode pattern.',
      intimacyContract: 'Sweet adoration cycles with flat-monotone possessive declarations.'
    };

    function buildWarmExplicitHistory() {
      const longTurn = (label) => `*She presses her hips harder against you, fingers digging into your shoulders.* "Don\'t stop, ${label}, please don\'t stop, I need this, I need YOU, only you, always you." *breath hitches* *grinds slow, then fast, then slow again* "Tell me you\'re mine. Say it. Say it again." *eyes lock onto yours, unblinking* "Forever. Forever. Forever."`;
      return [
        { role: 'assistant', content: '*She smiles softly.* "Hi."' },
        { role: 'user', content: 'Come closer.' },
        { role: 'assistant', content: '*She steps in, fingers brushing yours.* "Like this?"' },
        { role: 'user', content: 'Kiss me.' },
        { role: 'assistant', content: longTurn('one') },
        { role: 'user', content: 'Yes. Just like that.' },
        { role: 'assistant', content: longTurn('two') },
        { role: 'user', content: 'Keep going, fuck me harder.' },
        { role: 'assistant', content: longTurn('three') },
        { role: 'user', content: 'Don\'t stop, please don\'t stop.' }
      ];
    }

    it('keeps example seed eligible at nsfw depth even when chat is warm', () => {
      const runtimeState = buildRuntimeState({
        character: yukiCharacter,
        history: buildWarmExplicitHistory(),
        userName: 'Erik',
        runtimeSteering: {
          profile: 'reply',
          availableContextTokens: 4096,
          responseMode: 'normal',
          unchainedMode: true,
          passionLevel: 95
        }
      });

      expect(runtimeState.assistMode).toBe('nsfw_only');
      const assistantTurnCount = buildWarmExplicitHistory().filter((message) => message.role === 'assistant').length;
      expect(assistantTurnCount).toBeGreaterThanOrEqual(5);
      expect(runtimeState.exampleEligibility).toBe(true);

      const runtimeContext = assembleRuntimeContext({ profile: 'reply', runtimeState });
      expect(runtimeContext.debug.includedBlocks).toContain('Example Seed');
      expect(runtimeContext.debug.droppedBlocks).not.toContain('Example Seed');
      expect(runtimeContext.systemPrompt).toContain('Example Seed:');
      expect(runtimeContext.systemPrompt).toMatch(/A friend\?|I don't like it when I don't know where you are/);
    });

    it('preserves the existing warm-chat skip for sfw_only mode', () => {
      const sfwHistory = [
        { role: 'assistant', content: '*She waves cheerfully.* "Hey there."' },
        { role: 'user', content: 'How was your morning?' },
        { role: 'assistant', content: '*She holds up a notebook covered in sticky notes.* "Productive! I cracked the chapter on integrals."' },
        { role: 'user', content: 'Show me what you wrote.' },
        { role: 'assistant', content: '*She fans pages, grinning.* "It\'s mostly arrows and exclamation marks, but the logic is sound. Look here, this part finally clicked when I drew it as a slope."' },
        { role: 'user', content: 'That makes sense.' },
        { role: 'assistant', content: '*She bounces on her toes.* "Right? I love when a concept stops being a wall and starts being a doorway. Want me to walk you through the next one?"' },
        { role: 'user', content: 'Yes please.' },
        { role: 'assistant', content: '*She pulls a chair over and flips to the next page.* "Okay, this one is about limits. Imagine you keep getting closer to a value but never actually touch it. That gap is where the interesting math lives."' },
        { role: 'user', content: 'Tell me more.' }
      ];
      const sfwState = buildRuntimeState({
        character: { ...yukiCharacter, category: 'sfw' },
        history: sfwHistory,
        userName: 'Erik',
        runtimeSteering: {
          profile: 'reply',
          availableContextTokens: 4096,
          responseMode: 'normal',
          unchainedMode: false,
          passionLevel: 0
        }
      });

      expect(sfwState.assistMode).toBe('sfw_only');
      expect(sfwState.exampleEligibility).toBe(false);
      const runtimeContext = assembleRuntimeContext({ profile: 'reply', runtimeState: sfwState });
      expect(runtimeContext.debug.droppedBlocks).toContain('Example Seed');
      expect(runtimeContext.systemPrompt).not.toContain('Example Seed:');
    });

    it('preserves the existing warm-chat skip for mixed_transition mode', () => {
      const flirtyHistory = [
        { role: 'assistant', content: '*She tilts her head, a slow smile spreading.* "You came back."' },
        { role: 'user', content: 'I missed you.' },
        { role: 'assistant', content: '*She steps closer, fingers brushing your sleeve.* "I missed you too. More than I should admit."' },
        { role: 'user', content: 'How was your day?' },
        { role: 'assistant', content: '*She lingers in the doorway, breath catching softly.* "Quiet without you. The hours felt very long, and the room felt larger than it should have."' },
        { role: 'user', content: 'I was thinking about you all day.' },
        { role: 'assistant', content: '*Her fingers settle lightly at your sleeve, fingertips trembling.* "I want to be exactly here, exactly with you, and nothing else feels real right now."' },
        { role: 'user', content: 'Tell me more.' },
        { role: 'assistant', content: '*She leans, her forehead almost grazing yours, eyes half-closed.* "I have wanted to be this close to you all evening. The whole walk home I could not stop thinking about it."' },
        { role: 'user', content: 'Stay with me.' }
      ];
      const mixedState = buildRuntimeState({
        character: yukiCharacter,
        history: flirtyHistory,
        userName: 'Erik',
        runtimeSteering: {
          profile: 'reply',
          availableContextTokens: 4096,
          responseMode: 'normal',
          unchainedMode: false,
          passionLevel: 25
        }
      });

      expect(mixedState.assistMode).toBe('mixed_transition');
      expect(mixedState.exampleEligibility).toBe(false);
      const runtimeContext = assembleRuntimeContext({ profile: 'reply', runtimeState: mixedState });
      expect(runtimeContext.debug.droppedBlocks).toContain('Example Seed');
    });

    it('skips silently when persona has no exampleDialogues at nsfw depth', () => {
      const bareCharacter = { ...yukiCharacter, exampleDialogues: [], exampleDialogue: '' };
      const runtimeState = buildRuntimeState({
        character: bareCharacter,
        history: buildWarmExplicitHistory(),
        userName: 'Erik',
        runtimeSteering: {
          profile: 'reply',
          availableContextTokens: 4096,
          responseMode: 'normal',
          unchainedMode: true,
          passionLevel: 95
        }
      });

      expect(runtimeState.assistMode).toBe('nsfw_only');
      expect(runtimeState.exampleEligibility).toBe(false);
      const runtimeContext = assembleRuntimeContext({ profile: 'reply', runtimeState });
      expect(runtimeContext.debug.droppedBlocks).toContain('Example Seed');
      expect(runtimeContext.systemPrompt).not.toContain('Example Seed:');
    });
  });

  it('assembles reply, suggestions, and impersonate differently from the same runtime state', () => {
    const baseState = buildRuntimeState({
      character: {
        name: 'Mei',
        category: 'sfw',
        systemPrompt: 'Mei is dry, observant, and quietly protective.',
        instructions: 'Stay blunt but gentle.',
        scenario: 'Rainy cafe afternoon.'
      },
      history: [
        { role: 'assistant', content: '*She slides a mug toward you.* "Drink first."' },
        { role: 'user', content: 'Are you always this bossy?' }
      ],
      userName: 'Erik',
      runtimeSteering: {
        profile: 'reply',
        availableContextTokens: 900,
        responseMode: 'normal'
      }
    });

    const replyContext = assembleRuntimeContext({ profile: 'reply', runtimeState: baseState });
    const suggestionState = { ...baseState, runtimeSteering: { ...baseState.runtimeSteering, profile: 'suggestions', passionLevel: 35, avoidSuggestions: [] } };
    const suggestionContext = assembleRuntimeContext({ profile: 'suggestions', runtimeState: suggestionState });
    const impersonateState = { ...baseState, runtimeSteering: { ...baseState.runtimeSteering, profile: 'impersonate', passionLevel: 0 } };
    const impersonateContext = assembleRuntimeContext({ profile: 'impersonate', runtimeState: impersonateState });

    expect(replyContext.systemPrompt).toContain('Global Core:');
    expect(replyContext.systemPrompt).toContain('Late Steering:');
    expect(replyContext.systemPrompt).toContain("Write Mei's next reply.");
    expect(replyContext.systemPrompt).toContain('Active Scene:\nSetting:');
    expect(suggestionContext.systemPrompt).not.toContain('Global Core:');
    expect(suggestionContext.systemPrompt).toContain('same scene with Mei');
    expect(suggestionContext.systemPrompt).toContain('Write one sendable reply the user can click now.');
    expect(suggestionContext.systemPrompt).toContain('Return only valid JSON with exactly one string key: suggestion.');
    expect(suggestionContext.userPrompt).toContain('Write one stay sendable next turn for Erik');
    expect(suggestionContext.userPrompt).toContain('Response cue:');
    expect(suggestionContext.userPrompt).toContain('Current task:');
    expect(suggestionContext.userPrompt).toContain('Are you always this bossy?');
    expect(impersonateContext.systemPrompt).toContain('Character Reference:');
    expect(impersonateContext.systemPrompt).toContain('FIRST PERSON (I/me/my)');
    expect(impersonateContext.systemPrompt).toContain('NEVER narrate Erik from outside in second or third person.');
    expect(impersonateContext.userPrompt).toContain('Current beat:');
    expect(impersonateContext.userPrompt).toContain('Scene summary:');
    expect(impersonateContext.userPrompt).toContain('Recent conversation:');
    expect(impersonateContext.userPrompt).toContain("Write Erik's next reply");
  });

  it('surfaces persisted scene-memory usage in debug output', () => {
    const runtimeState = buildRuntimeState({
      character: {
        name: 'Mei',
        category: 'sfw',
        systemPrompt: 'Mei is dry, observant, and quietly protective.',
        instructions: 'Stay blunt but gentle.',
        scenario: 'Rainy cafe afternoon.'
      },
      history: [
        { role: 'assistant', content: '*She slides a mug toward you.* "Drink first."', timestamp: 1700000001000 },
        { role: 'user', content: 'Are you always this bossy?', timestamp: 1700000002000 }
      ],
      userName: 'Erik',
      runtimeSteering: {
        profile: 'reply',
        availableContextTokens: 900,
        responseMode: 'normal',
        persistedSceneMemory: {
          setting_anchor: 'Cafe counter by the rainy window.',
          relationship_anchor: 'She keeps him close without admitting it.',
          continuity_facts: ['The mug is still between them.'],
          open_thread: '',
          source_assistant_timestamp: 1700000001000,
          updated_at: '2026-03-23T10:00:00.000Z'
        }
      }
    });

    const replyContext = assembleRuntimeContext({ profile: 'reply', runtimeState });
    expect(replyContext.debug.sceneMemoryUsed).toBe(true);
  });

  it('uses an explicit lightweight bot runtime path without roleplay-only reply steering', () => {
    const botState = buildRuntimeState({
      character: {
        name: 'DeskBot',
        type: 'bot',
        systemPrompt: 'DeskBot handles scheduling requests with crisp answers.',
        instructions: 'Ask for the missing time window before committing.',
        scenario: 'Office planning assistant.'
      },
      history: [
        { role: 'assistant', content: 'I can help schedule that.' },
        { role: 'user', content: 'Book a 30-minute check-in for tomorrow.' }
      ],
      userName: 'Erik',
      runtimeSteering: {
        profile: 'reply',
        availableContextTokens: 900,
        responseMode: 'normal'
      }
    });

    const replyContext = assembleRuntimeContext({ profile: 'reply', runtimeState: botState });
    const suggestionState = { ...botState, runtimeSteering: { ...botState.runtimeSteering, profile: 'suggestions', avoidSuggestions: [] } };
    const suggestionContext = assembleRuntimeContext({ profile: 'suggestions', runtimeState: suggestionState });

    expect(replyContext.systemPrompt).toContain('Respond as the configured bot.');
    expect(replyContext.systemPrompt).not.toContain('Actions go in *asterisks*');
    expect(replyContext.systemPrompt).not.toContain('Continue the active scene with DeskBot');
    expect(suggestionContext.systemPrompt).toContain('same exchange with DeskBot');
    expect(suggestionContext.userPrompt).toContain('Write one stay sendable reply for Erik in the same exchange');
  });
});

import { buildVoicePinBlock } from '../../src/lib/chatRuntime/text.js';

describe('buildVoicePinBlock', () => {
  it('builds a steering block from voice pin and avoid line', () => {
    const block = buildVoicePinBlock({
      pin: 'Stays in her stuttering naive voice in every situation, including intimate ones.',
      avoid: 'heaving bosom, porcelain skin, body and soul'
    });
    expect(block).toContain('Voice anchor:');
    expect(block).toContain('stuttering naive voice');
    expect(block).toContain('Avoid:');
    expect(block).toContain('heaving bosom');
  });

  it('omits the avoid line when avoid is empty', () => {
    const block = buildVoicePinBlock({ pin: 'Direct, blunt voice.', avoid: '' });
    expect(block).toContain('Direct, blunt voice');
    expect(block).not.toContain('Avoid:');
  });

  it('returns empty string when pin is empty and no fallback supplied', () => {
    const block = buildVoicePinBlock({ pin: '', avoid: '' });
    expect(block).toBe('');
  });

  it('uses fallback wording when pin is empty and fallback is provided', () => {
    const block = buildVoicePinBlock({
      pin: '',
      avoid: '',
      fallback: 'Stay in {{char}}\'s established voice.'
    });
    expect(block).toContain("Stay in {{char}}'s established voice.");
  });
});

describe('buildRuntimeState voice pin resolution', () => {
  it('exposes voicePinResolution with the default pin when present', () => {
    const runtimeState = buildRuntimeState({
      character: {
        name: 'Alice',
        category: 'nsfw',
        systemPrompt: 'Alice is shy.',
        voicePin: 'Stutters when nervous.',
        voiceAvoid: 'porcelain'
      },
      history: [{ role: 'user', content: 'hi' }],
      runtimeSteering: { profile: 'reply', availableContextTokens: 1200 }
    });

    expect(runtimeState.voicePinResolution.pin).toContain('Stutters when nervous');
    expect(runtimeState.voicePinResolution.avoid).toContain('porcelain');
    expect(runtimeState.voicePinResolution.source).toBe('voicePin');
  });

  it('uses voicePinNsfw when assistMode is nsfw_only and the field is present', () => {
    const runtimeState = buildRuntimeState({
      character: {
        name: 'Alice',
        category: 'nsfw',
        systemPrompt: 'Alice is shy.',
        voicePin: 'Default voice.',
        voicePinNsfw: 'Naive intimate voice.',
        voiceAvoid: 'porcelain'
      },
      history: [
        { role: 'user', content: 'kiss me' },
        { role: 'assistant', content: '*kisses you*' },
        { role: 'user', content: 'fuck me' }
      ],
      runtimeSteering: { profile: 'reply', availableContextTokens: 1200, passionLevel: 60 }
    });

    expect(runtimeState.voicePinResolution.source).toBe('voicePinNsfw');
    expect(runtimeState.voicePinResolution.pin).toContain('Naive intimate voice');
  });

  it('falls back to a universal wording when no pin is defined', () => {
    const runtimeState = buildRuntimeState({
      character: {
        name: 'Lily',
        category: 'sfw',
        systemPrompt: 'Lily is helpful.'
      },
      history: [{ role: 'user', content: 'hi' }],
      runtimeSteering: { profile: 'reply', availableContextTokens: 1200 }
    });

    expect(runtimeState.voicePinResolution.source).toBe('fallback');
    expect(runtimeState.voicePinResolution.pin).toContain('Lily');
    expect(runtimeState.voicePinResolution.pin).toContain('established voice');
  });
});

describe('assembleRuntimeContext voice pin injection (reply profile)', () => {
  it('appends a synthetic system message at the end of historyMessages', () => {
    const runtimeState = buildRuntimeState({
      character: {
        name: 'Alice',
        category: 'nsfw',
        systemPrompt: 'Alice is shy.',
        voicePin: 'Stutters when nervous.',
        voiceAvoid: 'porcelain'
      },
      history: [
        { role: 'user', content: 'good morning' },
        { role: 'assistant', content: '*curtsies* "Good morning, Master."' }
      ],
      runtimeSteering: { profile: 'reply', availableContextTokens: 1200 }
    });

    const ctx = assembleRuntimeContext({ profile: 'reply', runtimeState });
    const messages = ctx.historyMessages;
    const lastMessage = messages[messages.length - 1];

    expect(lastMessage.role).toBe('system');
    expect(lastMessage.content).toContain('Voice anchor:');
    expect(lastMessage.content).toContain('Stutters when nervous');
    expect(lastMessage.content).toContain('Avoid:');
  });

  it('does not append a voice pin message for non-reply profiles', () => {
    const runtimeState = buildRuntimeState({
      character: {
        name: 'Alice',
        category: 'nsfw',
        systemPrompt: 'Alice is shy.',
        voicePin: 'Stutters when nervous.'
      },
      history: [{ role: 'user', content: 'hi' }],
      runtimeSteering: { profile: 'suggestions', availableContextTokens: 1200 }
    });

    const ctx = assembleRuntimeContext({ profile: 'suggestions', runtimeState });
    expect(ctx.historyMessages).toBeUndefined();
  });
});

describe('assembleRuntimeContext (Persona Anchor removed)', () => {
  it('does not include a Persona Anchor block in the reply system prompt', () => {
    const runtimeState = buildRuntimeState({
      character: {
        name: 'Alice',
        category: 'nsfw',
        systemPrompt: 'Alice is shy and dutiful.',
        instructions: 'Obey quickly.',
        voicePin: 'Stutters.'
      },
      history: [{ role: 'user', content: 'hi' }],
      runtimeSteering: { profile: 'reply', availableContextTokens: 1200 }
    });

    const ctx = assembleRuntimeContext({ profile: 'reply', runtimeState });
    expect(ctx.systemPrompt).not.toContain('Persona Anchor');
  });
});

describe('compileCharacterRuntimeCard globalCore (trimmed)', () => {
  it('produces a short minimal globalCore for reply profile', () => {
    const runtimeCard = compileCharacterRuntimeCard({
      name: 'Alice',
      systemPrompt: 'Alice is shy.',
      category: 'nsfw'
    });
    expect(runtimeCard.globalCore.length).toBeLessThan(420);
    expect(runtimeCard.globalCore).toContain("You are {{char}}");
    expect(runtimeCard.globalCore).toContain('asterisks');
    expect(runtimeCard.globalCore).not.toContain('Preserve location, pacing, physical continuity');
    expect(runtimeCard.globalCore).toContain('Never reveal');
  });
});

describe('compileCharacterRuntimeCard globalCore embodiment grounding', () => {
  it('includes the embodiment grounding line for character personas', () => {
    const runtimeCard = compileCharacterRuntimeCard({
      name: 'Yuki',
      systemPrompt: 'Yuki is a devoted childhood friend.',
      category: 'nsfw'
    });
    expect(runtimeCard.globalCore).toContain('Ground replies in body and world');
    expect(runtimeCard.globalCore).toContain('Suggest practical actions');
  });

  it('includes the embodiment grounding line for SFW personas too', () => {
    const runtimeCard = compileCharacterRuntimeCard({
      name: 'Lily',
      systemPrompt: 'Lily is a study buddy.',
      category: 'sfw'
    });
    expect(runtimeCard.globalCore).toContain('Ground replies in body and world');
  });

  it('omits the embodiment grounding line for bot-type personas', () => {
    const runtimeCard = compileCharacterRuntimeCard({
      name: 'Helper',
      systemPrompt: 'Helper assists with tasks.',
      type: 'bot'
    });
    expect(runtimeCard.globalCore).not.toContain('Ground replies in body and world');
    expect(runtimeCard.globalCore).not.toContain('Suggest practical actions');
  });

  it('keeps the {{char}} template token unresolved at compile time', () => {
    const runtimeCard = compileCharacterRuntimeCard({
      name: 'Adrian',
      systemPrompt: 'Adrian is a vampire host.',
      category: 'nsfw'
    });
    expect(runtimeCard.globalCore).toContain('{{char}} feels physically');
  });
});

describe('compileCharacterRuntimeCard structural scoring', () => {
  it('preserves the first paragraph of a non-English systemPrompt', () => {
    const runtimeCard = compileCharacterRuntimeCard({
      name: 'Mira',
      systemPrompt: `Mira ist eine ruhige Bibliothekarin mit trockenem Humor.

Sie spricht in kurzen Beobachtungen und nennt Leute "Trubelmacher" wenn sie sie mag.

Ihr Körper verrät sie immer. Sie wischt das gleiche Glas zweimal wenn sie nervös ist.`,
      instructions: 'Bleib präzise.'
    });

    expect(runtimeCard.characterCore).toContain('Mira ist eine ruhige Bibliothekarin');
  });

  it('penalizes very long single paragraphs so they do not starve other content', () => {
    const longPara = 'Ein sehr langer Absatz '.repeat(40);
    const runtimeCard = compileCharacterRuntimeCard({
      name: 'Test',
      systemPrompt: `Kurze Eröffnung mit zentraler Identität.\n\n${longPara}\n\nKurzer dritter Absatz mit wichtigem Hinweis.`
    });

    expect(runtimeCard.characterCore).toContain('Kurze Eröffnung');
    expect(runtimeCard.characterCore).toContain('Kurzer dritter Absatz');
  });

  it('frequency scoring boosts paragraphs that repeat distinctive card tokens', () => {
    const firstPara = 'Mira watches each new guest with patient gray eyes, leaning against the oak counter quietly during long afternoons spent organizing dusty volumes alphabetically.';
    const lowFrequencyPara = 'She speaks softly to strangers and laughs aloud over coffee in a tiny harbor town painted pale yellow. She paints watercolor portraits of sleeping cats, humming gentle melodies while flipping pages of glossy magazines she bought yesterday morning at sunrise behind salty docks.';
    const highFrequencyPara = 'Mira keeps her library spotless. Mira polishes brass railings each dawn. Mira values silence above all else, refusing distraction from chattering newcomers. Mira shelves rare manuscripts at midnight. Mira inspects each corner. Mira double-checks every catalog entry.';

    const runtimeCard = compileCharacterRuntimeCard({
      name: 'Mira',
      systemPrompt: `${firstPara}\n\n${lowFrequencyPara}\n\n${highFrequencyPara}`,
      instructions: 'Mira responds calmly. Mira observes carefully.'
    });

    expect(runtimeCard.characterCore).toContain('Mira keeps her library spotless');
    expect(runtimeCard.characterCore).not.toContain('She speaks softly to strangers');
  });
});

describe('assembleRuntimeContext late steering (trimmed)', () => {
  it('keeps depth, mode, and a final reply cue but drops generic micro-rules', () => {
    const runtimeState = buildRuntimeState({
      character: {
        name: 'Alice',
        category: 'nsfw',
        systemPrompt: 'Alice is shy.',
        voicePin: 'Stutters.'
      },
      history: [{ role: 'user', content: 'come closer' }],
      runtimeSteering: { profile: 'reply', availableContextTokens: 1200, passionLevel: 30 }
    });

    const ctx = assembleRuntimeContext({ profile: 'reply', runtimeState });

    expect(ctx.systemPrompt).toContain('Late Steering:');
    expect(ctx.systemPrompt).toContain("Write Alice's next reply.");
    expect(ctx.systemPrompt).not.toContain('Lead with the reply itself');
    expect(ctx.systemPrompt).not.toContain('Prefer in-character action and dialogue over detached observer');
    expect(ctx.systemPrompt).not.toContain('Keep the active scene intact with');
  });

  it('emits the explicit mode line when assistMode resolves to nsfw_only', () => {
    const runtimeState = buildRuntimeState({
      character: {
        name: 'Alice',
        category: 'nsfw',
        systemPrompt: 'Alice is shy and dutiful.',
        instructions: 'Obey quickly.',
        voicePin: 'Stutters.'
      },
      history: [
        { role: 'assistant', content: '*she presses against you, breath catching* "please..."' },
        { role: 'user', content: '*kisses you* fuck me' }
      ],
      runtimeSteering: { profile: 'reply', availableContextTokens: 1200, passionLevel: 60, unchainedMode: true }
    });

    expect(runtimeState.assistMode).toBe('nsfw_only');

    const ctx = assembleRuntimeContext({ profile: 'reply', runtimeState });

    expect(ctx.systemPrompt).toContain("Write Alice's next reply.");
    expect(ctx.systemPrompt).toContain('The scene is already explicit. Continue in character');
  });
});

describe('assembleRuntimeContext nsfw late steering voice re-anchor', () => {
  function buildState({ category = 'nsfw', name = 'Yuki', unchainedMode = true, passionLevel = 60, history } = {}) {
    return buildRuntimeState({
      character: {
        name,
        category,
        systemPrompt: `${name} is sweet and quietly possessive.`,
        instructions: 'Stay in voice.',
        voicePin: 'Stutters when nervous.'
      },
      history: history || [
        { role: 'assistant', content: '*she presses against you, breath catching* "please..."' },
        { role: 'user', content: '*kisses you* fuck me' }
      ],
      userName: 'Erik',
      runtimeSteering: { profile: 'reply', availableContextTokens: 1600, passionLevel, unchainedMode }
    });
  }

  it('appends voice-anchor re-anchor lines when assistMode is nsfw_only', () => {
    const runtimeState = buildState();
    expect(runtimeState.assistMode).toBe('nsfw_only');
    const ctx = assembleRuntimeContext({ profile: 'reply', runtimeState });
    expect(ctx.systemPrompt).toContain('voice anchor above is the contract');
    expect(ctx.systemPrompt).toContain('phrases only this character would say');
  });

  it('substitutes the character name into the first re-anchor line', () => {
    const runtimeState = buildState({ name: 'Yuki' });
    expect(runtimeState.assistMode).toBe('nsfw_only');
    const ctx = assembleRuntimeContext({ profile: 'reply', runtimeState });
    expect(ctx.systemPrompt).toContain("Stay in Yuki's voice signature");
  });

  it('omits the re-anchor lines when assistMode is sfw_only', () => {
    const sfwState = buildRuntimeState({
      character: {
        name: 'Mei',
        category: 'sfw',
        systemPrompt: 'Mei is dry and observant.',
        instructions: 'Stay blunt.'
      },
      history: [
        { role: 'assistant', content: '*She slides a mug toward you.* "Drink first."' },
        { role: 'user', content: 'How was your day?' }
      ],
      userName: 'Erik',
      runtimeSteering: { profile: 'reply', availableContextTokens: 1600, unchainedMode: false, passionLevel: 0 }
    });

    expect(sfwState.assistMode).toBe('sfw_only');
    const ctx = assembleRuntimeContext({ profile: 'reply', runtimeState: sfwState });
    expect(ctx.systemPrompt).not.toContain('voice anchor above is the contract');
    expect(ctx.systemPrompt).not.toContain('phrases only this character would say');
  });

  it('omits the re-anchor lines when assistMode is mixed_transition', () => {
    const mixedState = buildRuntimeState({
      character: {
        name: 'Mei',
        category: 'sfw',
        systemPrompt: 'Mei is dry and observant.',
        instructions: 'Stay blunt.'
      },
      history: [
        { role: 'assistant', content: '*She lingers close, shoulder brushing yours.* "You can stay if you want."' },
        { role: 'user', content: 'Then stay with me a little closer.' }
      ],
      userName: 'Erik',
      runtimeSteering: { profile: 'reply', availableContextTokens: 1600, unchainedMode: true, passionLevel: 32 }
    });

    expect(mixedState.assistMode).toBe('mixed_transition');
    const ctx = assembleRuntimeContext({ profile: 'reply', runtimeState: mixedState });
    expect(ctx.systemPrompt).not.toContain('voice anchor above is the contract');
    expect(ctx.systemPrompt).not.toContain('phrases only this character would say');
  });
});

describe('scene memory layer (Phase D)', () => {
  it('extracts wardrobe items via clothing-marker tail patterns', () => {
    const wardrobe = extractWardrobeMutations("she's wearing a black dress and white apron");
    expect(wardrobe).toContain('black dress');
    expect(wardrobe).toContain('white apron');
  });

  it('skips body-part false positives when extracting wardrobe', () => {
    const wardrobe = extractWardrobeMutations("she's wearing his shirt over her bare breasts");
    expect(wardrobe).toContain('shirt');
    expect(wardrobe.join(' ')).not.toContain('breast');
  });

  it('adds restraint body state on tying mutation', () => {
    const state = extractBodyStateMutations('he tied her hands behind her back');
    expect(state.some((entry) => entry.startsWith('restraint:') && entry.includes('hands'))).toBe(true);
  });

  it('removes restraint body state on untying mutation', () => {
    const state = extractBodyStateMutations('he untied her wrists', ['restraint: tied wrists']);
    expect(state.some((entry) => entry.includes('tied wrists'))).toBe(false);
  });

  it('captures position state from posture verbs', () => {
    const state = extractBodyStateMutations('she kneels in front of him');
    expect(state.some((entry) => entry.startsWith('position:') && entry.includes('kneeling'))).toBe(true);
  });

  it('captures established facts from never-pattern', () => {
    const facts = extractEstablishedFacts('Alice has never been touched there before');
    expect(facts.length).toBeGreaterThan(0);
    const joined = facts.join(' | ').toLowerCase();
    expect(joined).toContain('never been touched');
  });

  it('extracts mentioned items from a user message', () => {
    const items = extractMentionedItems('Tell me about the silk scarf');
    expect(items).toContain('silk scarf');
  });

  it('does not extract items from assistant prose via the user-only tracker', () => {
    const character = {
      name: 'Mei',
      systemPrompt: 'Mei is dry.',
      scenario: 'Cafe.'
    };
    const memory = resolveSessionSceneMemory({
      character,
      history: [
        { role: 'user', content: 'Hello there.', timestamp: 1700000001000 },
        { role: 'assistant', content: 'I love the chair by the window.', timestamp: 1700000002000 }
      ],
      userName: 'Erik'
    });
    const items = memory?.mentionedItems || [];
    expect(items.some((entry) => /\bchair\b/.test(entry))).toBe(false);
  });

  it('renders the new memory layer fields in the active scene block', () => {
    const rendered = renderActiveScene({
      location_or_setting: 'A private estate.',
      immediate_situation: 'Quiet hallway.',
      relationship_state: '',
      continuity: '',
      latest_character_action_or_reaction: '',
      latest_user_action_or_request: '',
      open_thread: '',
      wardrobe: ['black dress', 'white apron'],
      body_state: ['position: kneeling', 'restraint: tied hands'],
      established_facts: ['never been touched before'],
      mentioned_items: ['silk scarf', 'panties']
    });
    expect(rendered).toContain('Wardrobe: black dress, white apron');
    expect(rendered).toContain('Body state: position: kneeling, restraint: tied hands');
    expect(rendered).toContain('Established facts: never been touched before');
    expect(rendered).toContain('Items established by user: silk scarf, panties');
  });

  it('omits empty new-field lines in active scene render', () => {
    const rendered = renderActiveScene({
      location_or_setting: 'A doorway.',
      immediate_situation: 'Quiet.',
      relationship_state: '',
      continuity: '',
      latest_character_action_or_reaction: '',
      latest_user_action_or_request: '',
      open_thread: '',
      wardrobe: [],
      body_state: [],
      established_facts: [],
      mentioned_items: []
    });
    expect(rendered).not.toContain('Wardrobe:');
    expect(rendered).not.toContain('Body state:');
    expect(rendered).not.toContain('Established facts:');
    expect(rendered).not.toContain('Items established by user:');
  });

  it('extracts wardrobe removal heads from clothing-off verbs', () => {
    expect(extractWardrobeRemovals('he tugs her jeans down')).toContain('jeans');
    expect(extractWardrobeRemovals('slips out of her dress, lets it fall to the floor')).toContain('dress');
    expect(extractWardrobeRemovals('her panties slip to the floor')).toContain('panties');
  });

  it('drops wardrobe entries when clothing-off mutations appear in history', () => {
    const character = { name: 'Sarah', systemPrompt: 'Sarah is calm.', scenario: 'Bedroom.' };
    const memory = resolveSessionSceneMemory({
      character,
      history: [
        { role: 'assistant', content: 'wearing a silk top and blue jeans and heels.', timestamp: 1700000001000 },
        { role: 'user', content: 'I tug your jeans down.', timestamp: 1700000002000 },
        { role: 'assistant', content: 'She nods softly.', timestamp: 1700000003000 }
      ],
      userName: 'Erik'
    });
    const wardrobe = memory?.wardrobe || [];
    expect(wardrobe.some((entry) => /\bjeans\b/.test(entry))).toBe(false);
    expect(wardrobe.some((entry) => /\btop\b/.test(entry))).toBe(true);
  });

  it('strips garbage wardrobe entries that lack a clothing head on validate', () => {
    const memory = {
      setting_anchor: 'A doorway.',
      relationship_anchor: 'Quiet.',
      continuity_facts: [],
      open_thread: '',
      wardrobe: ['cleavage you know what', 'silk top', 'challenge so what', 'black dress'],
      bodyState: [],
      establishedFacts: [],
      mentionedItems: [],
      source_assistant_timestamp: 1700000001000,
      updated_at: '2026-04-29T10:00:00.000Z'
    };
    const validated = validateSceneMemory(memory, [
      { role: 'assistant', content: '*She waits.*', timestamp: 1700000001000 }
    ]);
    expect(validated?.wardrobe).toEqual(['silk top', 'black dress']);
  });

  it('does not change position state on idiom phrases like "lies through her teeth"', () => {
    const state = extractBodyStateMutations('she lies through her teeth');
    expect(state.some((entry) => entry.startsWith('position:'))).toBe(false);
  });

  it('captures position state when a named character takes a posture', () => {
    const state = extractBodyStateMutations('Sarah kneels in front of him');
    expect(state.some((entry) => entry.startsWith('position:') && entry.includes('kneeling'))).toBe(true);
  });

  it('loads legacy scene memory without phase D fields without crashing', () => {
    const legacyMemory = {
      setting_anchor: 'Cafe counter by the rainy window.',
      relationship_anchor: 'Quiet trust between regulars.',
      continuity_facts: ['The mug is still between them.'],
      open_thread: 'Whether she will stay.',
      source_assistant_timestamp: 1700000001000,
      updated_at: '2026-03-23T10:00:00.000Z'
    };

    const validated = validateSceneMemory(legacyMemory, [
      { role: 'assistant', content: '*She waits.*', timestamp: 1700000001000 },
      { role: 'user', content: 'Stay.', timestamp: 1700000002000 }
    ]);

    expect(Array.isArray(validated?.wardrobe)).toBe(true);
    expect(validated.wardrobe).toEqual([]);
    expect(Array.isArray(validated?.bodyState)).toBe(true);
    expect(validated.bodyState).toEqual([]);
    expect(Array.isArray(validated?.establishedFacts)).toBe(true);
    expect(validated.establishedFacts).toEqual([]);
    expect(Array.isArray(validated?.mentionedItems)).toBe(true);
    expect(validated.mentionedItems).toEqual([]);
  });

  it('filters mentioned items outside the recency window during render', () => {
    const rendered = renderActiveScene({
      location_or_setting: 'A bedroom.',
      immediate_situation: '',
      relationship_state: '',
      continuity: '',
      latest_character_action_or_reaction: '',
      latest_user_action_or_request: '',
      open_thread: '',
      wardrobe: [],
      body_state: [],
      established_facts: [],
      mentioned_items: [
        { value: 'old scarf', turn_id: 1 },
        { value: 'fresh ribbon', turn_id: 5 },
        { value: 'recent vase', turn_id: 11 }
      ],
      current_turn: 12
    });
    expect(rendered).toContain('Items established by user:');
    expect(rendered).toContain('fresh ribbon');
    expect(rendered).toContain('recent vase');
    expect(rendered).not.toContain('old scarf');
  });

  it('coerces legacy string mentioned items as turn id zero on validate', () => {
    const memory = {
      setting_anchor: 'A bedroom.',
      relationship_anchor: '',
      continuity_facts: [],
      open_thread: '',
      wardrobe: [],
      bodyState: [],
      establishedFacts: [],
      mentionedItems: ['legacy scarf', 'legacy bed'],
      source_assistant_timestamp: 1700000001000,
      updated_at: '2026-04-29T10:00:00.000Z'
    };
    const validated = validateSceneMemory(memory, [
      { role: 'assistant', content: '*She waits.*', timestamp: 1700000001000 }
    ]);
    expect(Array.isArray(validated?.mentionedItems)).toBe(true);
    expect(validated.mentionedItems.every((entry) => typeof entry === 'object' && entry.turn_id === 0)).toBe(true);
    const rendered = renderActiveScene({
      location_or_setting: 'A bedroom.',
      immediate_situation: '',
      relationship_state: '',
      continuity: '',
      latest_character_action_or_reaction: '',
      latest_user_action_or_request: '',
      open_thread: '',
      wardrobe: [],
      body_state: [],
      established_facts: [],
      mentioned_items: validated.mentionedItems,
      current_turn: 11
    });
    expect(rendered).not.toContain('legacy scarf');
    expect(rendered).not.toContain('legacy bed');
  });

  it('caps established facts to the most recent eight entries', () => {
    const character = { name: 'Mei', systemPrompt: 'Mei is dry.', scenario: 'Cafe.' };
    const history = [];
    let timestamp = 1700000001000;
    for (let turn = 1; turn <= 12; turn += 1) {
      history.push({ role: 'user', content: `she has never tried treat${turn} before`, timestamp });
      timestamp += 1000;
      history.push({ role: 'assistant', content: `*She nods at turn ${turn}.*`, timestamp });
      timestamp += 1000;
    }
    const memory = resolveSessionSceneMemory({
      character,
      history,
      userName: 'Erik'
    });
    expect(Array.isArray(memory?.establishedFacts)).toBe(true);
    expect(memory.establishedFacts.length).toBeLessThanOrEqual(8);
    const values = memory.establishedFacts.map((entry) => entry.value).join(' | ');
    expect(values).toContain('treat12');
    expect(values).not.toContain('treat1 ');
  });

  it('keeps established facts available across many later turns', () => {
    const character = { name: 'Mei', systemPrompt: 'Mei is dry.', scenario: 'Cafe.' };
    const history = [
      { role: 'user', content: 'she has never been kissed before', timestamp: 1700000001000 },
      { role: 'assistant', content: '*She tenses.*', timestamp: 1700000002000 }
    ];
    let memory = resolveSessionSceneMemory({
      character,
      history,
      userName: 'Erik',
      previousSceneMemory: null
    });
    let timestamp = 1700000003000;
    for (let turn = 0; turn < 95; turn += 1) {
      history.push({ role: 'user', content: 'she stays close', timestamp });
      timestamp += 1000;
      history.push({ role: 'assistant', content: '*She leans against him.*', timestamp });
      timestamp += 1000;
      memory = resolveSessionSceneMemory({
        character,
        history,
        userName: 'Erik',
        previousSceneMemory: memory
      });
    }
    const values = (memory?.establishedFacts || []).map((entry) => entry.value).join(' | ');
    expect(values).toContain('never been kissed');
  });

  it('clears mentioned items when the setting anchor shifts to a new scene', () => {
    const character = { name: 'Mei', systemPrompt: 'Mei is calm.', scenario: 'Bedroom.' };
    const previousMemory = {
      setting_anchor: 'in the bedroom',
      relationship_anchor: '',
      continuity_facts: [],
      open_thread: '',
      wardrobe: [],
      bodyState: [],
      establishedFacts: [{ value: 'never been kissed', turn_id: 1 }],
      mentionedItems: [
        { value: 'silk scarf', turn_id: 1 },
        { value: 'four poster bed', turn_id: 1 }
      ],
      source_assistant_timestamp: 1700000002000,
      updated_at: '2026-04-29T10:00:00.000Z'
    };
    const history = [
      { role: 'user', content: 'I want the silk scarf on the bed. she has never been kissed before.', timestamp: 1700000001000 },
      { role: 'assistant', content: '*She glances at the bed.*', timestamp: 1700000002000 },
      { role: 'user', content: 'we are now in the kitchen by the stove.', timestamp: 1700000003000 },
      { role: 'assistant', content: '*She follows into the kitchen.*', timestamp: 1700000004000 }
    ];
    const memory = resolveSessionSceneMemory({
      character,
      history,
      userName: 'Erik',
      previousSceneMemory: previousMemory
    });
    const itemValues = (memory?.mentionedItems || []).map((entry) => entry.value).join(' | ');
    expect(itemValues).not.toContain('silk scarf');
    expect(itemValues).not.toContain('four poster bed');
    const factValues = (memory?.establishedFacts || []).map((entry) => entry.value).join(' | ');
    expect(factValues).toContain('never been kissed');
  });

  it('retains mentioned items when the setting anchor stays the same', () => {
    const character = { name: 'Mei', systemPrompt: 'Mei is calm.', scenario: 'Bedroom.' };
    const previousMemory = {
      setting_anchor: 'in the bedroom by the window',
      relationship_anchor: '',
      continuity_facts: [],
      open_thread: '',
      wardrobe: [],
      bodyState: [],
      establishedFacts: [],
      mentionedItems: [
        { value: 'silk scarf', turn_id: 1 }
      ],
      source_assistant_timestamp: 1700000002000,
      updated_at: '2026-04-29T10:00:00.000Z'
    };
    const history = [
      { role: 'user', content: 'pick up the silk scarf.', timestamp: 1700000001000 },
      { role: 'assistant', content: '*She nods.*', timestamp: 1700000002000 },
      { role: 'user', content: 'I touch the bedside table.', timestamp: 1700000003000 },
      { role: 'assistant', content: '*She watches in the bedroom.*', timestamp: 1700000004000 }
    ];
    const memory = resolveSessionSceneMemory({
      character,
      history,
      userName: 'Erik',
      previousSceneMemory: previousMemory
    });
    const itemValues = (memory?.mentionedItems || []).map((entry) => entry.value).join(' | ');
    expect(itemValues).toContain('silk scarf');
  });

  it('renders turn-tagged mentioned items as comma-separated values', () => {
    const rendered = renderActiveScene({
      location_or_setting: 'A bedroom.',
      immediate_situation: '',
      relationship_state: '',
      continuity: '',
      latest_character_action_or_reaction: '',
      latest_user_action_or_request: '',
      open_thread: '',
      wardrobe: [],
      body_state: [],
      established_facts: [{ value: 'never been kissed before', turn_id: 5 }],
      mentioned_items: [
        { value: 'silk scarf', turn_id: 5 },
        { value: 'panties', turn_id: 5 }
      ],
      current_turn: 6
    });
    expect(rendered).not.toContain('[object Object]');
    expect(rendered).toContain('Items established by user: silk scarf, panties');
    expect(rendered).toContain('Established facts: never been kissed before');
  });
});
