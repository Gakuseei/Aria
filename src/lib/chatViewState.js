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
