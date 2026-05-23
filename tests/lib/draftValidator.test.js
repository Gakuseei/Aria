import { describe, expect, it } from 'vitest';
import {
  finalizeImpersonateDraft,
  isStructurallyValid,
  containsGenericPhrasing,
  containsMetaLead,
  hasInvalidImpersonateLead,
  containsMidSentencePovBleed
} from '../../src/lib/chat/impersonate/draftValidator.js';

describe('finalizeImpersonateDraft', () => {
  it('strips system tokens and trailing tildes', () => {
    const result = finalizeImpersonateDraft('<|im_end|>I lean in.~~~', { charName: 'Mei', userName: 'Erik' });
    expect(result.text).toBe('I lean in.');
    expect(result.valid).toBe(true);
  });

  it('drops a leading "Erik:" prefix from the draft', () => {
    const result = finalizeImpersonateDraft('Erik: I close the door behind me.', { charName: 'Mei', userName: 'Erik' });
    expect(result.text).toBe('I close the door behind me.');
  });

  it('blanks out the draft if it leads with the character name', () => {
    const result = finalizeImpersonateDraft('Mei: She nods slowly.', { charName: 'Mei', userName: 'Erik' });
    expect(result.text).toBe('');
    expect(result.valid).toBe(false);
  });

  it('returns invalid for empty input', () => {
    const result = finalizeImpersonateDraft('   ', { charName: 'Mei', userName: 'Erik' });
    expect(result.text).toBe('');
    expect(result.valid).toBe(false);
  });
});

describe('isStructurallyValid', () => {
  it('rejects empty text', () => {
    expect(isStructurallyValid('', 'Erik', 'Mei')).toBe(false);
  });

  it('rejects char-perspective leads', () => {
    expect(isStructurallyValid('She watches him quietly.', 'Erik', 'Mei')).toBe(false);
    expect(isStructurallyValid('Mei reaches out.', 'Erik', 'Mei')).toBe(false);
  });

  it('rejects "You" / "Your" leads (POV inverted)', () => {
    expect(isStructurallyValid('You smile back.', 'Erik', 'Mei')).toBe(false);
  });

  it('accepts first-person user POV', () => {
    expect(isStructurallyValid('I lean back and meet her gaze.', 'Erik', 'Mei')).toBe(true);
    expect(isStructurallyValid('*pulls her closer* I want this.', 'Erik', 'Mei')).toBe(true);
  });
});

describe('containsGenericPhrasing', () => {
  it('flags known generic phrases', () => {
    expect(containsGenericPhrasing("There's no denying the warmth between us.")).toBe(true);
  });

  it('passes specific replies', () => {
    expect(containsGenericPhrasing('I close the distance and meet her gaze.')).toBe(false);
  });
});

describe('hasInvalidImpersonateLead', () => {
  it('flags malformed "I Word Word" leads', () => {
    expect(hasInvalidImpersonateLead('I Look Back.', 'Erik', 'Mei')).toBe(true);
  });

  it('passes natural first-person', () => {
    expect(hasInvalidImpersonateLead('I look at her.', 'Erik', 'Mei')).toBe(false);
  });
});

describe('containsMetaLead', () => {
  it('flags meta-lead phrases', () => {
    expect(containsMetaLead('Sure, here is the reply.')).toBe(true);
    expect(containsMetaLead("Here's a reply you could send.")).toBe(true);
    expect(containsMetaLead('Let me try this one.')).toBe(true);
  });

  it('passes natural in-character replies', () => {
    expect(containsMetaLead('I lean back and watch her quietly.')).toBe(false);
    expect(containsMetaLead('"You should rest." I take her hand.')).toBe(false);
  });
});

describe('containsMidSentencePovBleed', () => {
  it('flags "his + body part" inside *action* for he/him user', () => {
    expect(containsMidSentencePovBleed('*I sit down, patting his stomach* "I\'m starving!"', 'he/him')).toBe(true);
  });

  it('passes when pronoun does not match user pronoun set', () => {
    expect(containsMidSentencePovBleed('*I sit down, patting her stomach*', 'he/him')).toBe(false);
  });

  it('passes when other-gender pronoun targets the character', () => {
    expect(containsMidSentencePovBleed('*reaches for her hand*', 'he/him')).toBe(false);
  });

  it('passes dialogue-only text with no action block', () => {
    expect(containsMidSentencePovBleed('"What time is it?"', 'he/him')).toBe(false);
  });

  it('flags "his shoulder" mid-action', () => {
    expect(containsMidSentencePovBleed('*pats his shoulder while smiling*', 'he/him')).toBe(true);
  });

  it('returns false for empty input', () => {
    expect(containsMidSentencePovBleed('', 'he/him')).toBe(false);
  });

  it('returns false for empty userPronouns (defense if unset)', () => {
    expect(containsMidSentencePovBleed('*pats his shoulder*', '')).toBe(false);
  });

  it('flags "their + body part" for they/them user', () => {
    expect(containsMidSentencePovBleed('*I rub their back*', 'they/them')).toBe(true);
  });

  it('flags "her + body part" for she/her user', () => {
    expect(containsMidSentencePovBleed('*runs a hand through her hair* "Hmm."', 'she/her')).toBe(true);
  });
});
