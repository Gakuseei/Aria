import { describe, expect, it } from 'vitest';
import { assembleRuntimeContext, buildRuntimeState, compileCharacterRuntimeCard, resolveSessionSceneMemory, validateSceneMemory } from '../../src/lib/chatRuntime/index.js';

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
        { role: 'assistant', content: '*She lingers in the doorway, book pressed to her chest.* "I was hoping you were home."' },
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
        { role: 'assistant', content: '*She slides a mug across the cafe counter and taps the empty stool beside it.* "Your usual."' },
        { role: 'user', content: 'You always keep the corner stool for me.' },
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
    expect(replyContext.systemPrompt).toContain("Lead with the reply itself.");
    expect(replyContext.systemPrompt).toContain('Prefer in-character action and dialogue over detached observer-style scene summary.');
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
    expect(runtimeCard.globalCore.length).toBeLessThan(280);
    expect(runtimeCard.globalCore).toContain("You are {{char}}");
    expect(runtimeCard.globalCore).toContain('asterisks');
    expect(runtimeCard.globalCore).not.toContain('Preserve location, pacing, physical continuity');
    expect(runtimeCard.globalCore).not.toContain('Never reveal');
  });
});
