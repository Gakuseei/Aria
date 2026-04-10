/**
 * PassionManager.js - Passion Level Tracking (v3.0)
 *
 * Manages:
 * - Passion level tracking per session (0-100)
 * - 6-tier system (Surface / Aware / Vivid / Immersive / Consuming / Transcendent)
 * - applyScore() for async LLM passion scores (upward only)
 * - Depth instructions per tier
 * - localStorage persistence
 */

const PASSION_STORAGE_KEY = 'aria_passion_data';
const PASSION_MEMORY_KEY = 'aria_passion_memory';
const HISTORY_LIMIT = 50;

function getPassionStorage() {
  try {
    return typeof globalThis !== 'undefined' && globalThis.localStorage
      ? globalThis.localStorage
      : null;
  } catch {
    return null;
  }
}

/** Unified passion tier definitions (6-tier v3.0) */
export const PASSION_TIERS = {
  surface:      { min: 0,  max: 15,  label: 'Surface' },
  aware:        { min: 16, max: 35,  label: 'Aware' },
  vivid:        { min: 36, max: 55,  label: 'Vivid' },
  immersive:    { min: 56, max: 75,  label: 'Immersive' },
  consuming:    { min: 76, max: 90,  label: 'Consuming' },
  transcendent: { min: 91, max: 100, label: 'Transcendent' }
};

/**
 * Returns the tier key for a given passion level
 * @param {number} passionLevel - Current passion level (0-100)
 * @returns {'surface'|'aware'|'vivid'|'immersive'|'consuming'|'transcendent'}
 */
export function getTierKey(passionLevel) {
  if (passionLevel <= PASSION_TIERS.surface.max) return 'surface';
  if (passionLevel <= PASSION_TIERS.aware.max) return 'aware';
  if (passionLevel <= PASSION_TIERS.vivid.max) return 'vivid';
  if (passionLevel <= PASSION_TIERS.immersive.max) return 'immersive';
  if (passionLevel <= PASSION_TIERS.consuming.max) return 'consuming';
  return 'transcendent';
}

/**
 * Returns a depth instruction string for the current passion tier
 * @param {number} passionLevel - Current passion level (0-100)
 * @param {'short'|'normal'|'long'} [responseMode='normal'] - Response length mode
 * @returns {string} Instruction string (empty at surface tier)
 */
export function getDepthInstruction(passionLevel, responseMode = 'normal') {
  const tier = getTierKey(passionLevel);
  const mode = responseMode === 'short' || responseMode === 'long' ? responseMode : 'normal';

  switch (tier) {
    case 'surface':
      return '';
    case 'aware':
      if (mode === 'short') {
        return '\n[Engagement: Aware] Add subtle physical awareness — proximity, temperature, small gestures — but stay compact.';
      }
      if (mode === 'long') {
        return '\n[Engagement: Aware] Add subtle physical awareness — proximity, temperature, small gestures — and let the moment breathe.';
      }
      return '\n[Engagement: Aware] Add subtle physical awareness — proximity, temperature, small gestures.';
    case 'vivid':
      if (mode === 'short') {
        return '\n[Engagement: Vivid] Write with sensory detail — textures, sounds, breath, warmth — but stay compact and focused.';
      }
      if (mode === 'long') {
        return '\n[Engagement: Vivid] Write with sensory detail — textures, sounds, breath, warmth. 2-3 paragraphs minimum.';
      }
      return '\n[Engagement: Vivid] Write with sensory detail — textures, sounds, breath, warmth — while staying focused and natural.';
    case 'immersive':
      if (mode === 'short') {
        return '\n[Engagement: Immersive] Keep the reply compact but vivid. Focus on the strongest sensations and reactions instead of covering everything.';
      }
      if (mode === 'long') {
        return '\n[Engagement: Immersive] Rich multi-paragraph responses. Every physical sensation described in detail. Internal reactions in italics.';
      }
      return '\n[Engagement: Immersive] Focus on the strongest sensations and inner reactions. Rich detail is welcome, but avoid sprawling multi-paragraph padding.';
    case 'consuming':
      if (mode === 'short') {
        return '\n[Engagement: Consuming] Keep the intensity high and the wording tight. Choose the most powerful sensory details instead of sprawling.';
      }
      if (mode === 'long') {
        return '\n[Engagement: Consuming] Maximum descriptive depth. Overwhelming sensory detail. Character\'s thoughts, sensations, and physical reactions fill each paragraph.';
      }
      return '\n[Engagement: Consuming] Push the intensity and sensory detail higher, but keep the reply controlled and purposeful.';
    case 'transcendent':
      if (mode === 'short') {
        return '\n[Engagement: Transcendent] Peak immersion in a compact form. Use the sharpest visceral details without drifting into long, layered replies.';
      }
      if (mode === 'long') {
        return '\n[Engagement: Transcendent] Peak immersion. Every touch, sound, taste, and tremor described with visceral precision. Deep, layered responses.';
      }
      return '\n[Engagement: Transcendent] Peak immersion. Choose the most visceral details and emotional beats without drifting into overwritten prose.';
    default:
      return '';
  }
}

/**
 * Returns a speed multiplier based on passion speed string
 * @param {string} passionSpeed - Speed string ('slow'|'normal'|'fast'|'extreme')
 * @returns {number} Multiplier value
 */
export function getSpeedMultiplier(passionSpeed) {
  switch (passionSpeed) {
    case 'slow': return 0.5;
    case 'fast': return 1.5;
    case 'extreme': return 1.8;
    default: return 1.0;
  }
}

class PassionManager {
  constructor() {
    this.passionData = this.loadPassionData();
  }

  /**
   * Load passion data from localStorage
   * @returns {Object}
   */
  loadPassionData() {
    const storage = getPassionStorage();
    if (!storage) return {};

    try {
      const stored = storage.getItem(PASSION_STORAGE_KEY);
      if (!stored) return {};
      const data = JSON.parse(stored);
      for (const key of Object.keys(data)) {
        if (key.endsWith('_history') && Array.isArray(data[key]) && data[key].length > HISTORY_LIMIT) {
          data[key] = data[key].slice(-HISTORY_LIMIT);
        }
      }
      return data;
    } catch (error) {
      console.error('[PassionManager] Error loading:', error);
      return {};
    }
  }

  /**
   * Persist passion data to localStorage
   */
  savePassionData() {
    const storage = getPassionStorage();
    if (!storage) return;

    try {
      storage.setItem(PASSION_STORAGE_KEY, JSON.stringify(this.passionData));
    } catch (error) {
      console.error('[PassionManager] Error saving:', error);
    }
  }

  /**
   * Get current passion level for a session
   * @param {string} sessionId - Session identifier
   * @returns {number} Clamped 0-100 integer
   */
  getPassionLevel(sessionId) {
    const rawLevel = this.passionData[sessionId] || 0;
    return Math.round(Math.max(0, Math.min(100, rawLevel)));
  }

  /**
   * Get and clear a pending tier transition for a session
   * @param {string} sessionId - Session identifier
   * @returns {string|null} Tier key or null
   */
  getAndClearTransition(sessionId) {
    const key = `${sessionId}_transition`;
    const transition = this.passionData[key];
    if (transition) {
      delete this.passionData[key];
      this.savePassionData();
    }
    return transition || null;
  }

  /**
   * Apply an externally-calculated passion score to a session.
   * Passion only goes up (scores <= 0 are ignored). No decay, no streak, no momentum.
   * @param {string} sessionId - Session identifier
   * @param {number} score - Pre-calculated score (only positive values applied)
   * @returns {number} New passion level (rounded integer 0-100)
   */
  applyScore(sessionId, score) {
    if (isNaN(score) || score <= 0) return this.getPassionLevel(sessionId);

    const currentLevel = this.passionData[sessionId] || 0;
    const newLevel = Math.round(Math.min(100, currentLevel + score));

    const oldTier = getTierKey(currentLevel);
    const newTier = getTierKey(newLevel);
    if (oldTier !== newTier) {
      this.passionData[`${sessionId}_transition`] = newTier;
    }

    this.passionData[sessionId] = newLevel;
    this.trackHistory(sessionId, newLevel);
    this.savePassionData();
    return newLevel;
  }

  /**
   * Directly set passion level for a session
   * @param {string} sessionId - Session identifier
   * @param {number} level - Target passion level (0-100)
   * @returns {number} Clamped level that was set
   */
  setPassion(sessionId, level, skipHistory = false) {
    const oldLevel = this.passionData[sessionId] || 0;
    const clamped = Math.round(Math.max(0, Math.min(100, level)));
    const oldTier = getTierKey(oldLevel);
    const newTier = getTierKey(clamped);
    if (oldTier !== newTier) {
      this.passionData[`${sessionId}_transition`] = newTier;
    }
    this.passionData[sessionId] = clamped;
    if (!skipHistory) this.trackHistory(sessionId, clamped);
    this.savePassionData();
    return clamped;
  }

  /**
   * Adjust passion level with tier transition detection
   * @param {string} sessionId - Session identifier
   * @param {number} level - Target passion level (0-100)
   * @returns {number} Clamped level that was set
   */
  adjustPassion(sessionId, level) {
    const oldLevel = this.passionData[sessionId] || 0;
    const clamped = Math.round(Math.max(0, Math.min(100, level)));
    const oldTier = getTierKey(oldLevel);
    const newTier = getTierKey(clamped);
    if (oldTier !== newTier) {
      this.passionData[`${sessionId}_transition`] = newTier;
    }
    this.passionData[sessionId] = clamped;
    this.trackHistory(sessionId, clamped);
    this.savePassionData();
    return clamped;
  }

  /**
   * Track passion history for a session (last 50 values)
   * @param {string} sessionId - Session identifier
   * @param {number} level - Passion level to record
   */
  trackHistory(sessionId, level) {
    const historyKey = `${sessionId}_history`;
    if (!Array.isArray(this.passionData[historyKey])) {
      this.passionData[historyKey] = [];
    }
    this.passionData[historyKey].push(Math.round(level));
    if (this.passionData[historyKey].length > HISTORY_LIMIT) {
      this.passionData[historyKey] = this.passionData[historyKey].slice(-HISTORY_LIMIT);
    }
  }

  /**
   * Get passion history for a session
   * @param {string} sessionId - Session identifier
   * @returns {number[]} Array of past passion levels
   */
  getHistory(sessionId) {
    const historyKey = `${sessionId}_history`;
    return Array.isArray(this.passionData[historyKey]) ? this.passionData[historyKey] : [];
  }

  /**
   * Revert last passion score (for regenerate — removes old score before re-scoring)
   * @param {string} sessionId - Session identifier
   */
  revertLastScore(sessionId) {
    const historyKey = `${sessionId}_history`;
    const history = this.passionData[historyKey];
    if (!Array.isArray(history) || history.length < 2) return;
    const previousLevel = history[history.length - 2];
    history.pop();
    this.passionData[sessionId] = previousLevel;
    this.savePassionData();
  }

  /**
   * Restore passion history from an imported array
   * @param {string} sessionId - Session identifier
   * @param {number[]} historyArray - Array of passion levels to restore
   */
  restoreHistory(sessionId, historyArray) {
    if (!Array.isArray(historyArray)) return;
    const validated = historyArray
      .filter(v => typeof v === 'number' && v >= 0 && v <= 100)
      .slice(-HISTORY_LIMIT);
    if (validated.length > 0) {
      this.passionData[`${sessionId}_history`] = validated;
      this.savePassionData();
    }
  }

  /**
   * Reset passion level for a session
   * @param {string} sessionId - Session identifier
   * @returns {number} 0
   */
  resetPassion(sessionId) {
    this.passionData[sessionId] = 0;
    delete this.passionData[`${sessionId}_transition`];
    delete this.passionData[`${sessionId}_lastUpdate`];
    this.trackHistory(sessionId, 0);
    this.savePassionData();
    return 0;
  }

  /**
   * Save passion memory for a character across sessions
   * @param {string} characterId - Character identifier
   * @param {number} level - Passion level to remember (0-100)
   * @param {number[]} [history=[]] - Recent passion history to store (last 10 entries kept)
   */
  saveCharacterMemory(characterId, level, history = []) {
    const storage = getPassionStorage();
    if (!storage) return;

    try {
      const stored = storage.getItem(PASSION_MEMORY_KEY);
      const memory = stored ? JSON.parse(stored) : {};
      memory[characterId] = {
        lastLevel: Math.round(Math.max(0, Math.min(100, level))),
        lastHistory: Array.isArray(history) ? history.slice(-25) : [],
        timestamp: new Date().toISOString()
      };
      storage.setItem(PASSION_MEMORY_KEY, JSON.stringify(memory));
    } catch (error) {
      console.error('[PassionManager] Error saving character memory:', error);
    }
  }

  /**
   * Clear passion memory for a character
   * @param {string} characterId - Character identifier
   */
  clearCharacterMemory(characterId) {
    const storage = getPassionStorage();
    if (!storage) return;

    try {
      const stored = storage.getItem(PASSION_MEMORY_KEY);
      if (!stored) return;
      const memory = JSON.parse(stored);
      delete memory[characterId];
      storage.setItem(PASSION_MEMORY_KEY, JSON.stringify(memory));
    } catch (error) {
      console.error('[PassionManager] Error clearing character memory:', error);
    }
  }

}

export const passionManager = new PassionManager();
