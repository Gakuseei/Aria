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
const KNOWN_SUFFIXES = ['_history', '_transition', '_lastUpdate'];

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
 * @returns {string} Instruction string (empty at surface tier)
 */
export function getDepthInstruction(passionLevel) {
  const tier = getTierKey(passionLevel);
  switch (tier) {
    case 'surface':
      return '';
    case 'aware':
      return '\n[Engagement: Aware] Add subtle physical awareness — proximity, temperature, small gestures.';
    case 'vivid':
      return '\n[Engagement: Vivid] Write with sensory detail — textures, sounds, breath, warmth. 2-3 paragraphs minimum.';
    case 'immersive':
      return '\n[Engagement: Immersive] Rich multi-paragraph responses. Every physical sensation described in detail. Internal reactions in italics.';
    case 'consuming':
      return '\n[Engagement: Consuming] Maximum descriptive depth. Overwhelming sensory detail. Character\'s thoughts, sensations, and physical reactions fill each paragraph.';
    case 'transcendent':
      return '\n[Engagement: Transcendent] Peak immersion. Every touch, sound, taste, and tremor described with visceral precision. Deep, layered responses.';
    default:
      return '';
  }
}

/**
 * Returns a speed multiplier based on passion profile or speed string
 * @param {string|number} passionProfileOrSpeed - Speed string ('slow'|'fast'|'extreme') or numeric profile (0-1)
 * @returns {number} Multiplier value
 */
export function getSpeedMultiplier(passionProfileOrSpeed) {
  if (typeof passionProfileOrSpeed === 'string') {
    switch (passionProfileOrSpeed) {
      case 'slow': return 0.5;
      case 'fast': return 1.5;
      case 'extreme': return 2.5;
      default: return 1.0;
    }
  }
  const p = passionProfileOrSpeed ?? 0.7;
  if (p <= 0.3) return 0.5;
  if (p <= 0.7) return 1.0;
  if (p <= 0.9) return 1.5;
  return 2.5;
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
    try {
      const stored = localStorage.getItem(PASSION_STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      console.error('[PassionManager] Error loading:', error);
      return {};
    }
  }

  /**
   * Persist passion data to localStorage
   */
  savePassionData() {
    try {
      localStorage.setItem(PASSION_STORAGE_KEY, JSON.stringify(this.passionData));
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
    if (score <= 0) return this.getPassionLevel(sessionId);

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
  setPassion(sessionId, level) {
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
   * Get all passion levels (excludes internal keys like history/transition)
   * @returns {Object} Map of sessionId to passion level
   */
  getAllPassionLevels() {
    const levels = {};
    Object.keys(this.passionData).forEach(key => {
      if (key.endsWith('_history') || key.endsWith('_transition') || key.endsWith('_lastUpdate')) return;
      const val = this.passionData[key];
      if (typeof val !== 'number' || isNaN(val)) return;
      levels[key] = Math.round(val);
    });
    return levels;
  }

  /**
   * Delete all passion data for a session (hard reset)
   * @param {string} sessionId - Session identifier
   */
  deleteCharacterPassion(sessionId) {
    delete this.passionData[sessionId];
    delete this.passionData[`${sessionId}_history`];
    delete this.passionData[`${sessionId}_transition`];
    delete this.passionData[`${sessionId}_lastUpdate`];
    this.savePassionData();
  }

  /**
   * Remove passion data for sessions that are no longer active
   * @param {string[]} activeSessionIds - Array of currently active session IDs
   */
  cleanupStaleSessions(activeSessionIds) {
    const activeSet = new Set(activeSessionIds);
    const keysToDelete = [];

    Object.keys(this.passionData).forEach(key => {
      let baseKey = key;
      for (const suffix of KNOWN_SUFFIXES) {
        if (key.endsWith(suffix)) {
          baseKey = key.slice(0, -suffix.length);
          break;
        }
      }
      if (!activeSet.has(baseKey)) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => {
      delete this.passionData[key];
    });

    if (keysToDelete.length > 0) {
      this.savePassionData();
    }
  }

  /**
   * Save passion memory for a character across sessions
   * @param {string} characterId - Character identifier
   * @param {number} level - Passion level to remember (0-100)
   * @param {number[]} [history=[]] - Recent passion history to store (last 10 entries kept)
   */
  saveCharacterMemory(characterId, level, history = []) {
    try {
      const stored = localStorage.getItem(PASSION_MEMORY_KEY);
      const memory = stored ? JSON.parse(stored) : {};
      memory[characterId] = {
        lastLevel: Math.round(Math.max(0, Math.min(100, level))),
        lastHistory: Array.isArray(history) ? history.slice(-25) : [],
        timestamp: new Date().toISOString()
      };
      localStorage.setItem(PASSION_MEMORY_KEY, JSON.stringify(memory));
    } catch (error) {
      console.error('[PassionManager] Error saving character memory:', error);
    }
  }

  /**
   * Clear passion memory for a character
   * @param {string} characterId - Character identifier
   */
  clearCharacterMemory(characterId) {
    try {
      const stored = localStorage.getItem(PASSION_MEMORY_KEY);
      if (!stored) return;
      const memory = JSON.parse(stored);
      delete memory[characterId];
      localStorage.setItem(PASSION_MEMORY_KEY, JSON.stringify(memory));
    } catch (error) {
      console.error('[PassionManager] Error clearing character memory:', error);
    }
  }

  /**
   * Retrieve passion memory for a character
   * @param {string} characterId - Character identifier
   * @returns {Object|null} Memory object with lastLevel and timestamp, or null
   */
  getCharacterMemory(characterId) {
    try {
      const stored = localStorage.getItem(PASSION_MEMORY_KEY);
      if (!stored) return null;
      const memory = JSON.parse(stored);
      return memory[characterId] || null;
    } catch (error) {
      console.error('[PassionManager] Error loading character memory:', error);
      return null;
    }
  }
}

export const passionManager = new PassionManager();

export default passionManager;
