/**
 * PassionManager.js - Passion Level Tracking (v2.0)
 *
 * Manages:
 * - Passion level tracking per session (0-100)
 * - 6-tier system (Shy / Curious / Flirty / Heated / Passionate / Primal)
 * - applyScore() for async LLM passion scores
 * - Time-based decay, streak tracking, tier transitions
 * - localStorage persistence
 */

const PASSION_STORAGE_KEY = 'aria_passion_data';
const PASSION_MEMORY_KEY = 'aria_passion_memory';
const HISTORY_LIMIT = 50;
const DECAY_INTERVAL_MS = 5 * 60 * 1000;
const DECAY_POINTS_PER_INTERVAL = 2;
const DECAY_MAX_POINTS = 10;
const KNOWN_SUFFIXES = ['_history', '_streak', '_transition', '_transition_down', '_lastUpdate'];

/** Unified passion tier definitions (6-tier v2.0) */
export const PASSION_TIERS = {
  shy:         { min: 0,  max: 15,  label: 'Shy' },
  curious:     { min: 16, max: 30,  label: 'Curious' },
  flirty:      { min: 31, max: 50,  label: 'Flirty' },
  heated:      { min: 51, max: 70,  label: 'Heated' },
  passionate:  { min: 71, max: 85,  label: 'Passionate' },
  primal:      { min: 86, max: 100, label: 'Primal' }
};

/**
 * Returns the tier key for a given passion level
 * @param {number} passionLevel - Current passion level (0-100)
 * @returns {'shy'|'curious'|'flirty'|'heated'|'passionate'|'primal'}
 */
export function getTierKey(passionLevel) {
  if (passionLevel <= PASSION_TIERS.shy.max) return 'shy';
  if (passionLevel <= PASSION_TIERS.curious.max) return 'curious';
  if (passionLevel <= PASSION_TIERS.flirty.max) return 'flirty';
  if (passionLevel <= PASSION_TIERS.heated.max) return 'heated';
  if (passionLevel <= PASSION_TIERS.passionate.max) return 'passionate';
  return 'primal';
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
   * Get current romantic streak count for a session
   * @param {string} sessionId - Session identifier
   * @returns {number} Consecutive romantic message count
   */
  getStreak(sessionId) {
    return this.passionData[`${sessionId}_streak`] || 0;
  }

  /**
   * Get and clear a pending tier transition for a session
   * @param {string} sessionId - Session identifier
   * @returns {string|null} Tier key ('shy'|'curious'|'flirty'|'heated'|'passionate'|'primal') or null
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
   * Get and clear a pending downward tier transition for a session
   * @param {string} sessionId - Session identifier
   * @returns {string|null} Tier key or null
   */
  getAndClearDownTransition(sessionId) {
    const key = `${sessionId}_transition_down`;
    const transition = this.passionData[key];
    if (transition) {
      delete this.passionData[key];
      this.savePassionData();
    }
    return transition || null;
  }

  /**
   * Apply an externally-calculated passion score to a session.
   * Handles decay, streak tracking, tier transitions, and persistence.
   * @param {string} sessionId - Session identifier
   * @param {number} score - Pre-calculated score (negative = de-escalation, positive = escalation)
   * @returns {number} New passion level (rounded integer 0-100)
   */
  applyScore(sessionId, score) {
    const currentLevel = this.passionData[sessionId] || 0;

    const lastUpdateKey = `${sessionId}_lastUpdate`;
    const now = Date.now();
    const lastUpdate = this.passionData[lastUpdateKey] || now;
    const elapsed = now - lastUpdate;
    let decayPoints = 0;
    if (elapsed > DECAY_INTERVAL_MS) {
      const intervals = Math.floor(elapsed / DECAY_INTERVAL_MS);
      let decayRate = DECAY_POINTS_PER_INTERVAL;
      const currentMomentum = this.getMomentum(sessionId);
      if (currentLevel >= 86) {
        decayRate = 3;
      } else if (currentMomentum > 1.5) {
        decayRate = 1;
      }
      decayPoints = Math.min(intervals * decayRate, DECAY_MAX_POINTS);
    }
    this.passionData[lastUpdateKey] = now;
    let decayedLevel = Math.max(0, currentLevel - decayPoints);
    if (decayPoints > 0) {
      const currentTierKey = getTierKey(currentLevel);
      const decayedTierKey = getTierKey(decayedLevel);
      if (currentTierKey !== decayedTierKey) {
        decayedLevel = PASSION_TIERS[currentTierKey].min;
      }
    }

    const streakKey = `${sessionId}_streak`;
    let finalScore = score;

    if (score > 0) {
      this.passionData[streakKey] = (this.passionData[streakKey] || 0) + 1;
      const streak = this.passionData[streakKey];
      if (streak >= 3) {
        finalScore *= 1.0 + Math.min((streak - 2) * 0.1, 0.5);
      }
    } else if (score < 0) {
      this.passionData[streakKey] = 0;
    }

    const newLevel = Math.round(Math.max(0, Math.min(100, decayedLevel + finalScore)));

    const oldTier = getTierKey(decayedLevel);
    const newTier = getTierKey(newLevel);
    const tierOrder = ['shy', 'curious', 'flirty', 'heated', 'passionate', 'primal'];
    if (oldTier !== newTier && tierOrder.indexOf(newTier) > tierOrder.indexOf(oldTier)) {
      this.passionData[`${sessionId}_transition`] = newTier;
    }
    if (oldTier !== newTier && tierOrder.indexOf(newTier) < tierOrder.indexOf(oldTier)) {
      this.passionData[`${sessionId}_transition_down`] = newTier;
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
    const tierOrder = ['shy', 'curious', 'flirty', 'heated', 'passionate', 'primal'];
    if (oldTier !== newTier && tierOrder.indexOf(newTier) > tierOrder.indexOf(oldTier)) {
      this.passionData[`${sessionId}_transition`] = newTier;
    }
    if (oldTier !== newTier && tierOrder.indexOf(newTier) < tierOrder.indexOf(oldTier)) {
      this.passionData[`${sessionId}_transition_down`] = newTier;
    }
    this.passionData[sessionId] = clamped;
    delete this.passionData[`${sessionId}_streak`];
    this.trackHistory(sessionId, clamped);
    this.savePassionData();
    return clamped;
  }

  /**
   * Adjust passion level with tier transition detection (no streak reset)
   * @param {string} sessionId - Session identifier
   * @param {number} level - Target passion level (0-100)
   * @returns {number} Clamped level that was set
   */
  adjustPassion(sessionId, level) {
    const oldLevel = this.passionData[sessionId] || 0;
    const clamped = Math.round(Math.max(0, Math.min(100, level)));
    const oldTier = getTierKey(oldLevel);
    const newTier = getTierKey(clamped);
    const tierOrder = ['shy', 'curious', 'flirty', 'heated', 'passionate', 'primal'];
    if (oldTier !== newTier && tierOrder.indexOf(newTier) > tierOrder.indexOf(oldTier)) {
      this.passionData[`${sessionId}_transition`] = newTier;
    }
    if (oldTier !== newTier && tierOrder.indexOf(newTier) < tierOrder.indexOf(oldTier)) {
      this.passionData[`${sessionId}_transition_down`] = newTier;
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
   * Reset passion level for a session (clears streak and records reset in history)
   * @param {string} sessionId - Session identifier
   * @returns {number} 0
   */
  resetPassion(sessionId) {
    this.passionData[sessionId] = 0;
    delete this.passionData[`${sessionId}_streak`];
    delete this.passionData[`${sessionId}_transition`];
    delete this.passionData[`${sessionId}_transition_down`];
    delete this.passionData[`${sessionId}_lastUpdate`];
    this.trackHistory(sessionId, 0);
    this.savePassionData();
    return 0;
  }

  /**
   * Get all passion levels (excludes internal keys like history/streak)
   * @returns {Object} Map of sessionId to passion level
   */
  getAllPassionLevels() {
    const levels = {};
    Object.keys(this.passionData).forEach(key => {
      if (key.endsWith('_history') || key.endsWith('_streak') || key.endsWith('_transition') || key.endsWith('_transition_down') || key.endsWith('_lastUpdate')) return;
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
    delete this.passionData[`${sessionId}_streak`];
    delete this.passionData[`${sessionId}_transition`];
    delete this.passionData[`${sessionId}_transition_down`];
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

  /**
   * Calculate momentum (slope) from last 5 history entries via linear regression
   * @param {string} sessionId - Session identifier
   * @returns {number} Slope value (positive = rising, negative = falling, 0 = insufficient data)
   */
  getMomentum(sessionId) {
    const history = this.getHistory(sessionId);
    if (history.length < 5) return 0;
    const recent = history.slice(-5);
    const n = recent.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += recent[i];
      sumXY += i * recent[i];
      sumX2 += i * i;
    }
    return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  }
}

export const passionManager = new PassionManager();

export default passionManager;
