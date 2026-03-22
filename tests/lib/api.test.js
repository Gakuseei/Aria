import { describe, it, expect } from 'vitest';
import {
  buildRoleplaySceneContext,
  buildSystemPrompt,
  cleanTranscriptArtifacts,
  isUnderfilledShortReply,
  resolveTemplates,
  shouldAutoStopStreamingResponse
} from '../../src/lib/api.js';

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
    expect(prompt).toContain('immediate in-character physical compliance');
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
    expect(context.sceneSummary).toContain('User Beat:');
    expect(context.currentBeat).toContain('Mei: *She wipes the counter.* "Long day?"');
    expect(context.currentBeat).toContain('Erik: Yeah. I barely slept.');
  });
});
