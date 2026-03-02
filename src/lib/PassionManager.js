/**
 * PassionManager.js - Passion Level & Vocabulary Tier Management (v8.0 Overhaul)
 *
 * Manages:
 * - Passion level tracking per session (0-100)
 * - Unified tier system (Innocent / Warm / Passionate / Primal)
 * - Word-boundary keyword matching with regex cache
 * - Cooldown-based decay for idle conversations
 * - Passion history tracking (last 50 values per session)
 * - localStorage persistence
 */

const PASSION_STORAGE_KEY = 'aria_passion_data';

/** Unified passion tier definitions */
export const PASSION_TIERS = {
  innocent:    { min: 0,  max: 20,  label: 'Innocent' },
  warm:        { min: 21, max: 50,  label: 'Warm' },
  passionate:  { min: 51, max: 80,  label: 'Passionate' },
  primal:      { min: 81, max: 100, label: 'Primal' }
};

/**
 * Returns the tier key for a given passion level
 * @param {number} passionLevel - Current passion level (0-100)
 * @returns {'innocent'|'warm'|'passionate'|'primal'}
 */
export function getTierKey(passionLevel) {
  if (passionLevel <= PASSION_TIERS.innocent.max) return 'innocent';
  if (passionLevel <= PASSION_TIERS.warm.max) return 'warm';
  if (passionLevel <= PASSION_TIERS.passionate.max) return 'passionate';
  return 'primal';
}

/** Word choice mapped to tier keys */
const PASSION_VOCABULARY = {
  innocent: {
    touch: ['gentle touch', 'soft brush', 'light caress', 'tender stroke'],
    reaction: ['blushes', 'heart flutters', 'breath catches', 'cheeks warm'],
    sound: ['soft gasp', 'quiet sigh', 'gentle hum', 'tiny whimper'],
    desire: ['curiosity', 'interest', 'attraction', 'fascination']
  },

  warm: {
    touch: ['warm hand', 'lingering touch', 'exploring fingers', 'firm grip'],
    reaction: ['heart races', 'skin tingles', 'pulse quickens', 'body responds'],
    sound: ['breathy moan', 'sharp inhale', 'soft whimper', 'throaty hum'],
    desire: ['longing', 'craving', 'need', 'hunger']
  },

  passionate: {
    touch: ['desperate grip', 'clawing fingers', 'bruising hold', 'possessive grasp'],
    reaction: ['trembles violently', 'back arches', 'hips buck', 'muscles clench'],
    sound: ['loud moan', 'broken cry', 'desperate whine', 'guttural groan'],
    desire: ['desperation', 'aching need', 'burning hunger', 'overwhelming want']
  },

  primal: {
    touch: ['rough handling', 'forceful thrust', 'savage grip', 'merciless pressure'],
    reaction: ['convulses', 'writhes uncontrollably', 'screams', 'shatters'],
    sound: ['animalistic cry', 'raw scream', 'incoherent babbling', 'sobbing moans'],
    desire: ['primal need', 'savage hunger', 'complete loss of control', 'feral lust']
  }
};

/** Regex cache for word-boundary keyword matching */
const keywordRegexCache = new Map();

/**
 * Escapes regex metacharacters in a string
 * @param {string} str - Raw string to escape
 * @returns {string} Regex-safe string
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Tests whether text contains keyword as a whole word (word-boundary match)
 * @param {string} text - Text to search in
 * @param {string} keyword - Keyword to match
 * @returns {boolean}
 */
function matchesKeyword(text, keyword) {
  if (!keywordRegexCache.has(keyword)) {
    keywordRegexCache.set(keyword, new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i'));
  }
  return keywordRegexCache.get(keyword).test(text);
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
   * @returns {string|null} Tier key ('innocent'|'warm'|'passionate'|'primal') or null
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
   * Update passion level based on conversation content
   * @param {string} sessionId - Session identifier
   * @param {string} userMessage - User message text
   * @param {string} aiResponse - AI response text
   * @param {number} [speedMultiplier=1.0] - Passion gain multiplier
   * @returns {number} New passion level (rounded integer)
   */
  updatePassion(sessionId, userMessage, aiResponse, speedMultiplier = 1.0) {
    const currentLevel = this.passionData[sessionId] || 0;
    const basePoints = this.calculatePassionPoints(userMessage, aiResponse);

    const cooldownKey = `${sessionId}_cooldown`;
    const streakKey = `${sessionId}_streak`;
    let finalPoints;

    if (basePoints < 3) {
      this.passionData[cooldownKey] = (this.passionData[cooldownKey] || 0) + 1;
      this.passionData[streakKey] = 0;
      if (this.passionData[cooldownKey] >= 3) {
        finalPoints = -1;
      } else {
        finalPoints = basePoints * Math.max(0.1, Math.min(10, speedMultiplier));
      }
    } else {
      this.passionData[cooldownKey] = 0;
      this.passionData[streakKey] = (this.passionData[streakKey] || 0) + 1;
      let totalPoints = basePoints * Math.max(0.1, Math.min(10, speedMultiplier));
      const streak = this.passionData[streakKey];
      if (streak >= 3) {
        totalPoints *= 1.0 + Math.min((streak - 2) * 0.1, 0.5);
      }
      finalPoints = totalPoints;
    }

    const newLevel = Math.round(Math.max(0, Math.min(100, currentLevel + finalPoints)));

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
   * Calculate passion points based on message content using word-boundary matching
   * @param {string} userMessage - User message text
   * @param {string} aiResponse - AI response text
   * @returns {number} Calculated points (minimum 0)
   */
  calculatePassionPoints(userMessage, aiResponse) {
    let points = 0;

    const message = userMessage.toLowerCase();
    const response = aiResponse.toLowerCase();

    const romanticKeywords = [
      'love', 'kiss', 'hug', 'touch', 'hold', 'embrace', 'caress', 'stroke',
      'beautiful', 'gorgeous', 'sexy', 'hot', 'attractive', 'cute', 'adorable',
      'liebe', 'küss', 'umarm', 'berühr', 'halt', 'streichel', 'schön', 'heiß',
      'affection', 'desire', 'want', 'need', 'crave', 'yearn'
    ];

    const intimateKeywords = [
      'bed', 'bedroom', 'naked', 'undress', 'clothes', 'body', 'skin',
      'bett', 'schlafzimmer', 'nackt', 'ausziehen', 'körper', 'haut',
      'moan', 'gasp', 'shiver', 'tremble', 'breathe', 'pant'
    ];

    const explicitKeywords = [
      'fuck', 'sex', 'cock', 'dick', 'pussy', 'breast', 'tits', 'ass',
      'cum', 'orgasm', 'climax', 'pleasure', 'lust',
      'ficken', 'orgasmus', 'lust', 'verlangen'
    ];

    romanticKeywords.forEach(keyword => {
      if (matchesKeyword(message, keyword)) points += 1.5;
      if (matchesKeyword(response, keyword)) points += 0.5;
    });

    intimateKeywords.forEach(keyword => {
      if (matchesKeyword(message, keyword)) points += 2.5;
      if (matchesKeyword(response, keyword)) points += 1.0;
    });

    explicitKeywords.forEach(keyword => {
      if (matchesKeyword(message, keyword)) points += 3.5;
      if (matchesKeyword(response, keyword)) points += 1.5;
    });

    const asteriskCount = (response.match(/\*/g) || []).length;
    if (asteriskCount > 4) points += 1.0;
    if (asteriskCount > 10) points += 2.0;

    const emotionalWords = ['mmm', 'ahh', 'ohh', 'yes', 'god', 'please', 'more', 'ja', 'bitte', 'mehr'];
    emotionalWords.forEach(word => {
      if (matchesKeyword(response, word)) points += 1.0;
    });

    if (message.length > 100) points += 1.5;
    if (response.length > 200) points += 1.0;

    return Math.max(0, points);
  }

  /**
   * Get vocabulary tier label for a passion level
   * @param {number} passionLevel - Current passion level (0-100)
   * @returns {string} Tier label
   */
  getVocabularyTier(passionLevel) {
    const key = getTierKey(passionLevel);
    return PASSION_TIERS[key].label;
  }

  /**
   * Get vocabulary word sets for a passion level
   * @param {number} passionLevel - Current passion level (0-100)
   * @returns {Object} Vocabulary object with touch, reaction, sound, desire arrays
   */
  getVocabulary(passionLevel) {
    const key = getTierKey(passionLevel);
    return PASSION_VOCABULARY[key];
  }

  /**
   * Directly set passion level for a session
   * @param {string} sessionId - Session identifier
   * @param {number} level - Target passion level (0-100)
   * @returns {number} Clamped level that was set
   */
  setPassion(sessionId, level) {
    const clamped = Math.round(Math.max(0, Math.min(100, level)));
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
    if (this.passionData[historyKey].length > 50) {
      this.passionData[historyKey] = this.passionData[historyKey].slice(-50);
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
   * Reset passion level for a session (clears cooldown and records reset in history)
   * @param {string} sessionId - Session identifier
   * @returns {number} 0
   */
  resetPassion(sessionId) {
    this.passionData[sessionId] = 0;
    delete this.passionData[`${sessionId}_cooldown`];
    delete this.passionData[`${sessionId}_streak`];
    delete this.passionData[`${sessionId}_transition`];
    this.trackHistory(sessionId, 0);
    this.savePassionData();
    return 0;
  }

  /**
   * Get all passion levels (excludes internal keys like cooldown/history)
   * @returns {Object} Map of sessionId to passion level
   */
  getAllPassionLevels() {
    const levels = {};
    Object.keys(this.passionData).forEach(key => {
      if (key.endsWith('_cooldown') || key.endsWith('_history') || key.endsWith('_streak') || key.endsWith('_transition')) return;
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
    delete this.passionData[`${sessionId}_cooldown`];
    delete this.passionData[`${sessionId}_history`];
    delete this.passionData[`${sessionId}_streak`];
    delete this.passionData[`${sessionId}_transition`];
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
      const baseKey = key.replace(/_cooldown$/, '').replace(/_history$/, '').replace(/_streak$/, '').replace(/_transition$/, '');
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
}

export const passionManager = new PassionManager();

export default passionManager;
