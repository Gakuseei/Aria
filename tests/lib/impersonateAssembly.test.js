import { describe, expect, it } from 'vitest';
import { assembleRuntimeContext, buildRuntimeState } from '../../src/lib/chatRuntime/index.js';
import { resolveProfile } from '../../src/lib/modelProfiles.js';

const CHARACTER = {
  id: 'mei',
  name: 'Mei',
  persona: 'A grounded, witty woman.',
  scenario: 'Cafe afternoon.',
  firstMes: 'Hey, you came.',
  exampleDialogues: ''
};

const HISTORY = [
  { role: 'assistant', content: 'She watches you over the rim of her mug.' },
  { role: 'user', content: 'I lean back and let the silence sit between us for a beat.' },
  { role: 'assistant', content: 'Her mouth quirks. Cute.' },
  { role: 'user', content: '"Cute, huh?" I keep my voice flat.' },
  { role: 'assistant', content: 'She laughs and leans in.' }
];

function buildContext() {
  const runtimeState = buildRuntimeState({
    character: CHARACTER,
    history: HISTORY,
    userName: 'Erik',
    userGender: 'male',
    userPronouns: 'he/him',
    runtimeSteering: {
      profile: 'impersonate',
      availableContextTokens: 1600,
      passionLevel: 30,
      assistBudgetTier: 'default'
    }
  });
  runtimeState.runtimeSteering.resolvedProfile = resolveProfile('mag-mell', null);
  return assembleRuntimeContext({ profile: 'impersonate', runtimeState });
}

describe('assembleRuntimeContext - impersonate branch', () => {
  it('returns assistantPrefix in the form `${userName}: `', () => {
    const ctx = buildContext();
    expect(ctx.assistantPrefix).toBe('Erik: ');
  });

  it('returns stopStrings that include the character POV markers and end token', () => {
    const ctx = buildContext();
    expect(ctx.stopStrings).toContain('\nMei:');
    expect(ctx.stopStrings).toContain('Mei:');
    expect(ctx.stopStrings).toContain('<|im_end|>');
  });

  it('omits all NEVER directives and asterisk-format mandates from the system prompt', () => {
    const ctx = buildContext();
    expect(ctx.systemPrompt).not.toMatch(/NEVER/);
    expect(ctx.systemPrompt).not.toMatch(/Actions go in \*asterisks\*/i);
  });

  it('includes the user voice card block when user history is non-empty', () => {
    const ctx = buildContext();
    expect(ctx.systemPrompt).toContain('<user_voice_examples');
    expect(ctx.systemPrompt).toContain('I lean back and let the silence sit between us');
  });

  it('user prompt ends with a continuation cue to the user (not a NEVER rule)', () => {
    const ctx = buildContext();
    expect(ctx.userPrompt).toMatch(/Continue Erik'?s next reply\.?$/);
  });

  it('returns sampler with profile temperature unmodified (no floor clamp)', () => {
    const ctx = buildContext();
    expect(typeof ctx.sampler.temperature).toBe('number');
    expect(ctx.sampler.temperature).toBeGreaterThan(0);
    expect(ctx.sampler).not.toHaveProperty('temperatureFloor');
  });

  it('returns sampler === null when resolvedProfile is not provided', () => {
    const runtimeState = buildRuntimeState({
      character: CHARACTER,
      history: HISTORY,
      userName: 'Erik',
      userGender: 'male',
      userPronouns: 'he/him',
      runtimeSteering: {
        profile: 'impersonate',
        availableContextTokens: 1600,
        passionLevel: 30,
        assistBudgetTier: 'default'
      }
    });
    const ctx = assembleRuntimeContext({ profile: 'impersonate', runtimeState });
    expect(ctx.sampler).toBeNull();
  });
});

describe('assembleRuntimeContext — impersonate first-reply branch', () => {
  function buildFirstReplyContext() {
    const runtimeState = buildRuntimeState({
      character: CHARACTER,
      history: [
        { role: 'assistant', content: 'Hey, you came.' }
      ],
      userName: 'Erik',
      userGender: 'male',
      userPronouns: 'he/him',
      runtimeSteering: {
        profile: 'impersonate',
        availableContextTokens: 1600,
        passionLevel: 0,
        assistBudgetTier: 'default'
      }
    });
    runtimeState.runtimeSteering.resolvedProfile = resolveProfile('mag-mell', null);
    return assembleRuntimeContext({ profile: 'impersonate', runtimeState });
  }

  it('uses a first-reply PHI when no user messages are in history', () => {
    const ctx = buildFirstReplyContext();
    expect(ctx.systemPrompt).toMatch(/very first reply/i);
    expect(ctx.systemPrompt).not.toContain('user_voice_examples');
  });

  it('changes the user-prompt closing cue for first-reply', () => {
    const ctx = buildFirstReplyContext();
    expect(ctx.userPrompt).toMatch(/Write Erik'?s very first reply/i);
    expect(ctx.userPrompt).not.toMatch(/Continue Erik'?s next reply\.?$/);
  });

  it('debug carries a firstReply flag', () => {
    const ctx = buildFirstReplyContext();
    expect(ctx.debug.firstReply).toBe(true);
  });
});
