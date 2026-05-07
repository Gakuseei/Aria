import { describe, expect, it } from 'vitest';
import {
  finalizeImpersonateDraft,
  isStructurallyValid,
  containsGenericPhrasing,
  hasInvalidImpersonateLead
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
