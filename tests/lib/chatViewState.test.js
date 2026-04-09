import { describe, expect, it } from 'vitest';
import {
  buildManualCharacterSelectionState,
  buildManualModeSelectionState,
  getChatAutoScrollBehavior,
  getScrollBottomTarget,
  isNearScrollBottom,
} from '../../src/lib/chatViewState.js';

describe('chatViewState', () => {
  it('clears a previously loaded session when the user manually selects a mode', () => {
    expect(buildManualModeSelectionState('character_chat')).toEqual({
      selectedMode: 'character_chat',
      loadedSession: null,
    });
  });

  it('clears a previously loaded session when the user manually selects a character', () => {
    const character = { id: 'sarah', name: 'Sarah' };
    expect(buildManualCharacterSelectionState(character)).toEqual({
      selectedCharacter: character,
      loadedSession: null,
    });
  });

  it('computes the bottom scroll target without going negative', () => {
    expect(getScrollBottomTarget({ scrollHeight: 1200, clientHeight: 500 })).toBe(700);
    expect(getScrollBottomTarget({ scrollHeight: 300, clientHeight: 500 })).toBe(0);
  });

  it('treats positions within the threshold as near the bottom', () => {
    expect(isNearScrollBottom({ scrollHeight: 2000, scrollTop: 1360, clientHeight: 500, threshold: 150 })).toBe(true);
    expect(isNearScrollBottom({ scrollHeight: 2000, scrollTop: 1200, clientHeight: 500, threshold: 150 })).toBe(false);
  });

  it('only enables smooth auto-scroll when animations are on and the chat is not streaming', () => {
    expect(getChatAutoScrollBehavior({ animationsEnabled: true, isStreaming: false, preferSmooth: true })).toBe('smooth');
    expect(getChatAutoScrollBehavior({ animationsEnabled: false, isStreaming: false, preferSmooth: true })).toBe('auto');
    expect(getChatAutoScrollBehavior({ animationsEnabled: true, isStreaming: true, preferSmooth: true })).toBe('auto');
  });
});
