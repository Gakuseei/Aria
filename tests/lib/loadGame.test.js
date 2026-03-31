import { describe, expect, it } from 'vitest';
import { buildLoadGameEmptyState } from '../../src/components/LoadGame.jsx';

describe('buildLoadGameEmptyState', () => {
  const t = {
    loadGame: {
      noSavesTitle: 'No Saves Found',
      noSavesDesc: 'Start a new game to create your first save. Your progress will be automatically saved.',
      selectSave: 'Select a save to preview and continue',
    },
    mainMenu: {
      newGame: 'New Game',
    },
  };

  it('returns a primary new-game CTA when there are no saves at all', () => {
    expect(buildLoadGameEmptyState({ totalSessions: 0, t })).toEqual({
      title: 'No Saves Found',
      description: 'Start a new game to create your first save. Your progress will be automatically saved.',
      actionLabel: 'New Game',
      previewTitle: 'No Saves Found',
      previewDescription: 'Start a new game to create your first save. Your progress will be automatically saved.',
    });
  });

  it('keeps the preview instruction when saves exist but none are selected', () => {
    expect(buildLoadGameEmptyState({ totalSessions: 3, t })).toEqual({
      title: 'No Saves Found',
      description: 'Start a new game to create your first save. Your progress will be automatically saved.',
      actionLabel: null,
      previewTitle: 'Select a save to preview and continue',
      previewDescription: 'Start a new game to create your first save. Your progress will be automatically saved.',
    });
  });
});
