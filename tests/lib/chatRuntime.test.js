import { describe, expect, it } from 'vitest';
import { assembleRuntimeContext, buildRuntimeState, compileCharacterRuntimeCard } from '../../src/lib/chatRuntime/index.js';

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
    const suggestionState = { ...baseState, runtimeSteering: { ...baseState.runtimeSteering, profile: 'suggestions', passionLevel: 0, avoidSuggestions: [] } };
    const suggestionContext = assembleRuntimeContext({ profile: 'suggestions', runtimeState: suggestionState });
    const impersonateState = { ...baseState, runtimeSteering: { ...baseState.runtimeSteering, profile: 'impersonate', passionLevel: 0 } };
    const impersonateContext = assembleRuntimeContext({ profile: 'impersonate', runtimeState: impersonateState });

    expect(replyContext.systemPrompt).toContain('Global Core:');
    expect(suggestionContext.systemPrompt).not.toContain('Global Core:');
    expect(suggestionContext.systemPrompt).toContain('same scene with Mei');
    expect(suggestionContext.userPrompt).toContain('3 actions for Erik');
    expect(suggestionContext.userPrompt).toContain('Current beat:');
    expect(impersonateContext.systemPrompt).toContain('Character Reference:');
    expect(impersonateContext.userPrompt).toContain("Write Erik's next reply");
  });
});
