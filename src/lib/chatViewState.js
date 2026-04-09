export function buildManualModeSelectionState(mode) {
  return {
    selectedMode: mode,
    loadedSession: null,
  };
}

export function buildManualCharacterSelectionState(character) {
  return {
    selectedCharacter: character,
    loadedSession: null,
  };
}

export function getScrollBottomTarget({ scrollHeight = 0, clientHeight = 0 } = {}) {
  return Math.max(0, scrollHeight - clientHeight);
}

export function isNearScrollBottom({ scrollHeight = 0, scrollTop = 0, clientHeight = 0, threshold = 150 } = {}) {
  return getScrollBottomTarget({ scrollHeight, clientHeight }) - scrollTop < threshold;
}

export function getChatAutoScrollBehavior({ animationsEnabled = true, isStreaming = false, preferSmooth = false } = {}) {
  return animationsEnabled && preferSmooth && !isStreaming ? 'smooth' : 'auto';
}
