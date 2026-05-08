import { describe, it, expect } from 'vitest';
import { assembleRuntimeContext, buildRuntimeState } from '../../src/lib/chatRuntime/index.js';

const character = {
  name: 'Aria',
  persona: 'A composed, observant woman who watches before speaking.',
  scenario: 'In a quiet room.',
  category: 'sfw'
};

function buildState({ historyExtra = [], passionLevel = 10 } = {}) {
  const history = [
    { role: 'assistant', content: 'You take a seat across from me.' },
    { role: 'user', content: 'I lean back and watch.' },
    { role: 'assistant', content: 'I tilt my head, considering.' },
    { role: 'user', content: 'Tell me what you want.' },
    ...historyExtra
  ];
  return buildRuntimeState({
    character,
    history,
    userName: 'Erik',
    userGender: 'male',
    userPronouns: 'he/him',
    runtimeSteering: {
      profile: 'impersonate',
      availableContextTokens: 2000,
      passionLevel,
      unchainedMode: false,
      assistBudgetTier: 'default'
    }
  });
}

describe('assembleRuntimeContext (impersonate, continue)', () => {
  it('returns a sentenceTarget in ctx.debug', () => {
    const ctx = assembleRuntimeContext({ profile: 'impersonate', runtimeState: buildState() });
    expect([1, 2, 3]).toContain(ctx.debug.sentenceTarget);
  });

  it('includes numbered constraints in the system prompt', () => {
    const ctx = assembleRuntimeContext({ profile: 'impersonate', runtimeState: buildState() });
    expect(ctx.systemPrompt).toMatch(/Constraints:/);
    expect(ctx.systemPrompt).toMatch(/1\. Write only Erik's reply/);
    expect(ctx.systemPrompt).toMatch(/2\. \d+ sentence/);
    expect(ctx.systemPrompt).toMatch(/3\. Do not write Aria's/);
  });

  it('omits the legacy "Late Steering" block label', () => {
    const ctx = assembleRuntimeContext({ profile: 'impersonate', runtimeState: buildState() });
    expect(ctx.systemPrompt).not.toMatch(/Late Steering:/);
  });

  it('appends scene-intensity constraint when passionLevel > 15', () => {
    const ctx = assembleRuntimeContext({ profile: 'impersonate', runtimeState: buildState({ passionLevel: 40 }) });
    expect(ctx.systemPrompt).toMatch(/Match scene intensity 40\/100/);
  });

  it('omits scene-intensity constraint when passionLevel <= 15', () => {
    const ctx = assembleRuntimeContext({ profile: 'impersonate', runtimeState: buildState({ passionLevel: 10 }) });
    expect(ctx.systemPrompt).not.toMatch(/Match scene intensity/);
  });

  it('emits new stop-strings (action lead-in and bare-action variant)', () => {
    const ctx = assembleRuntimeContext({ profile: 'impersonate', runtimeState: buildState() });
    expect(ctx.stopStrings).toContain('\n*Aria ');
    expect(ctx.stopStrings).toContain('\nAria ');
    expect(ctx.stopStrings).toContain('\nAria:');
    expect(ctx.stopStrings).toContain('<|im_end|>');
  });

  it('does NOT include the bare "Aria:" stop-string (without leading newline)', () => {
    const ctx = assembleRuntimeContext({ profile: 'impersonate', runtimeState: buildState() });
    expect(ctx.stopStrings).not.toContain('Aria:');
  });

  it('uses the impersonate sampler from resolvedProfile when present', () => {
    const state = buildState();
    state.runtimeSteering.resolvedProfile = {
      family: 'magmell',
      temperature: 1.0,
      minP: 0.02,
      topP: 0.95,
      topK: 40,
      repeatPenalty: 1.0,
      repeatLastN: 0,
      flags: { dry: true, dryMultiplier: 0.8, dryBase: 1.75, dryAllowedLength: 2, dryPenaltyLastN: 512 }
    };
    const ctx = assembleRuntimeContext({ profile: 'impersonate', runtimeState: state });
    expect(ctx.sampler.temperature).toBe(1.0);
    expect(ctx.sampler.minP).toBe(0.02);
    expect(ctx.sampler.flags.dryPenaltyLastN).toBe(512);
  });

  it('strips the "Actions go in *asterisks*" line from globalCore (impersonate-only filter)', () => {
    const ctx = assembleRuntimeContext({ profile: 'impersonate', runtimeState: buildState() });
    expect(ctx.systemPrompt).not.toMatch(/Actions go in \*asterisks\*/i);
  });

  it('emits the new XML block tags in the system prompt', () => {
    const ctx = assembleRuntimeContext({ profile: 'impersonate', runtimeState: buildState() });
    expect(ctx.systemPrompt).toMatch(/<character>/);
    expect(ctx.systemPrompt).toMatch(/<\/character>/);
    expect(ctx.systemPrompt).toMatch(/<user>/);
    expect(ctx.systemPrompt).toMatch(/<\/user>/);
    expect(ctx.systemPrompt).toMatch(/<scene>/);
    expect(ctx.systemPrompt).toMatch(/<\/scene>/);
    expect(ctx.systemPrompt).toMatch(/<global>/);
    expect(ctx.systemPrompt).toMatch(/<\/global>/);
  });

  it('returns assistantPrefix matching the userName', () => {
    const ctx = assembleRuntimeContext({ profile: 'impersonate', runtimeState: buildState() });
    expect(ctx.assistantPrefix).toBe('Erik: ');
  });
});

describe('assembleRuntimeContext (impersonate, first reply)', () => {
  function buildFirstReplyState() {
    return buildRuntimeState({
      character,
      history: [{ role: 'assistant', content: 'You step inside and I look up.' }],
      userName: 'Erik',
      userGender: 'male',
      userPronouns: 'he/him',
      runtimeSteering: {
        profile: 'impersonate',
        availableContextTokens: 2000,
        passionLevel: 0,
        unchainedMode: false,
        assistBudgetTier: 'default'
      }
    });
  }

  it('uses sentenceTarget = 1', () => {
    const ctx = assembleRuntimeContext({ profile: 'impersonate', runtimeState: buildFirstReplyState() });
    expect(ctx.debug.sentenceTarget).toBe(1);
    expect(ctx.debug.firstReply).toBe(true);
  });

  it('omits user_voice_examples block (no history yet)', () => {
    const ctx = assembleRuntimeContext({ profile: 'impersonate', runtimeState: buildFirstReplyState() });
    expect(ctx.systemPrompt).not.toMatch(/<user_voice_examples/);
  });

  it('first-reply prompt is shorter than continue prompt', () => {
    const firstCtx = assembleRuntimeContext({ profile: 'impersonate', runtimeState: buildFirstReplyState() });
    const contCtx = assembleRuntimeContext({ profile: 'impersonate', runtimeState: buildState() });
    expect(firstCtx.systemPrompt.length).toBeLessThan(contCtx.systemPrompt.length);
  });
});
