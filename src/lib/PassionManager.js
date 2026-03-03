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
const PASSION_MEMORY_KEY = 'aria_passion_memory';
const COOLDOWN_THRESHOLD = 3;
const HISTORY_LIMIT = 50;
const DECAY_INTERVAL_MS = 5 * 60 * 1000;
const DECAY_POINTS_PER_INTERVAL = 2;
const DECAY_MAX_POINTS = 10;
const KNOWN_SUFFIXES = ['_cooldown', '_history', '_streak', '_transition', '_transition_down', '_lastUpdate'];

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

/** CJK Unicode range test — \b word boundaries fail for these scripts */
const CJK_RANGE = /[\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/;

/**
 * Escapes regex metacharacters in a string
 * @param {string} str - Raw string to escape
 * @returns {string} Regex-safe string
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Tests whether text contains keyword as a whole word.
 * Uses word-boundary regex for Latin/Cyrillic scripts,
 * falls back to plain includes() for CJK scripts where \b fails.
 * @param {string} text - Text to search in
 * @param {string} keyword - Keyword to match
 * @returns {boolean}
 */
function matchesKeyword(text, keyword) {
  if (CJK_RANGE.test(keyword)) {
    return text.includes(keyword.toLowerCase());
  }
  if (!keywordRegexCache.has(keyword)) {
    keywordRegexCache.set(keyword, new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i'));
  }
  return keywordRegexCache.get(keyword).test(text);
}

class PassionManager {
  constructor() {
    this.passionData = this.loadPassionData();
    this._lastBreakdown = null;
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
   * Update passion level based on conversation content
   * @param {string} sessionId - Session identifier
   * @param {string} userMessage - User message text
   * @param {string} aiResponse - AI response text
   * @param {number} [speedMultiplier=1.0] - Passion gain multiplier
   * @returns {number} New passion level (rounded integer)
   */
  updatePassion(sessionId, userMessage, aiResponse, speedMultiplier = 1.0) {
    const currentLevel = this.passionData[sessionId] || 0;

    const lastUpdateKey = `${sessionId}_lastUpdate`;
    const now = Date.now();
    const lastUpdate = this.passionData[lastUpdateKey] || now;
    const elapsed = now - lastUpdate;
    let decayPoints = 0;
    if (elapsed > DECAY_INTERVAL_MS) {
      const intervals = Math.floor(elapsed / DECAY_INTERVAL_MS);
      decayPoints = Math.min(intervals * DECAY_POINTS_PER_INTERVAL, DECAY_MAX_POINTS);
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

    const basePoints = this.calculatePassionPoints(userMessage, aiResponse);

    const cooldownKey = `${sessionId}_cooldown`;
    const streakKey = `${sessionId}_streak`;
    let finalPoints;

    if (basePoints < COOLDOWN_THRESHOLD) {
      this.passionData[cooldownKey] = (this.passionData[cooldownKey] || 0) + 1;
      this.passionData[streakKey] = 0;
      if (this.passionData[cooldownKey] >= COOLDOWN_THRESHOLD) {
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

    const newLevel = Math.round(Math.max(0, Math.min(100, decayedLevel + finalPoints)));

    const oldTier = getTierKey(decayedLevel);
    const newTier = getTierKey(newLevel);
    const tierOrder = ['innocent', 'warm', 'passionate', 'primal'];
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
   * Calculate passion points based on message content using word-boundary matching
   * @param {string} userMessage - User message text
   * @param {string} aiResponse - AI response text
   * @returns {number} Calculated points (minimum 0)
   */
  calculatePassionPoints(userMessage, aiResponse) {
    const message = userMessage.toLowerCase();
    const response = aiResponse.toLowerCase();

    const romanticKeywords = [
      'love', 'kiss', 'hug', 'touch', 'hold', 'embrace', 'caress', 'stroke',
      'beautiful', 'gorgeous', 'sexy', 'hot', 'attractive', 'cute', 'adorable',
      'liebe', 'küss', 'umarm', 'berühr', 'halt', 'streichel', 'schön', 'heiß',
      'affection', 'desire', 'want', 'need', 'crave', 'yearn',
      'amor', 'beso', 'abrazo', 'tocar', 'hermosa', 'deseo', 'querer',
      'amour', 'baiser', 'embrasser', 'toucher', 'belle', 'désir',
      'любовь', 'поцелуй', 'обнять', 'красивая', 'желание',
      '愛', 'キス', '抱きしめ', '触れ', '美しい', '欲しい',
      'beijo', 'abraço', 'bonita', 'desejo',
      'amore', 'bacio', 'abbraccio', 'toccare', 'bella', 'desiderio',
      '사랑', '키스', '포옹', '만지', '예쁜', '원해'
    ];

    const intimateKeywords = [
      'bed', 'bedroom', 'naked', 'undress', 'clothes', 'body', 'skin',
      'bett', 'schlafzimmer', 'nackt', 'ausziehen', 'körper', 'haut',
      'moan', 'gasp', 'shiver', 'tremble', 'breathe', 'pant',
      'cama', 'desnudo', 'cuerpo', 'piel', 'gemir', 'temblar',
      'lit', 'nu', 'corps', 'peau', 'gémir', 'frissonner',
      'кровать', 'голый', 'тело', 'кожа', 'стон', 'дрожь',
      'ベッド', '裸', '体', '肌', '喘ぐ', '震え',
      'corpo', 'pele', 'gemer', 'tremer',
      'letto', 'nudo', 'pelle', 'gemere', 'tremare',
      '침대', '벗', '몸', '피부', '신음', '떨림'
    ];

    const explicitKeywords = [
      'fuck', 'sex', 'cock', 'dick', 'pussy', 'breast', 'tits', 'ass',
      'cum', 'orgasm', 'climax', 'pleasure', 'lust',
      'ficken', 'orgasmus', 'verlangen',
      'follar', 'sexo', 'polla', 'coño', 'orgasmo', 'placer',
      'baiser', 'sexe', 'bite', 'chatte', 'orgasme', 'plaisir',
      'секс', 'оргазм', 'удовольствие', 'похоть',
      'セックス', 'オーガズム', '快感', '欲望',
      'foder', 'pau', 'buceta', 'prazer',
      'scopare', 'sesso', 'cazzo', 'piacere',
      '섹스', '오르가즘', '쾌감', '욕망'
    ];

    let romanticPoints = 0, intimatePoints = 0, explicitPoints = 0, asteriskPoints = 0, emotionalPoints = 0, lengthPoints = 0;

    const ROMANTIC_CAP = 6;
    const INTIMATE_CAP = 8;
    const EXPLICIT_CAP = 10;

    romanticKeywords.forEach(keyword => {
      if (matchesKeyword(message, keyword)) romanticPoints += 1.5;
      if (matchesKeyword(response, keyword)) romanticPoints += 0.5;
    });
    romanticPoints = Math.min(romanticPoints, ROMANTIC_CAP);

    intimateKeywords.forEach(keyword => {
      if (matchesKeyword(message, keyword)) intimatePoints += 2.5;
      if (matchesKeyword(response, keyword)) intimatePoints += 1.0;
    });
    intimatePoints = Math.min(intimatePoints, INTIMATE_CAP);

    explicitKeywords.forEach(keyword => {
      if (matchesKeyword(message, keyword)) explicitPoints += 3.5;
      if (matchesKeyword(response, keyword)) explicitPoints += 1.5;
    });
    explicitPoints = Math.min(explicitPoints, EXPLICIT_CAP);

    const asteriskCount = (response.match(/\*/g) || []).length;
    if (asteriskCount > 4) asteriskPoints += 1.0;
    if (asteriskCount > 10) asteriskPoints += 2.0;

    const emotionalWords = ['mmm', 'ahh', 'ohh', 'yes', 'god', 'please', 'more', 'ja', 'bitte', 'mehr'];
    emotionalWords.forEach(word => {
      if (matchesKeyword(response, word)) emotionalPoints += 1.0;
    });

    if (message.length > 100) lengthPoints += 1.5;
    if (response.length > 200) lengthPoints += 1.0;

    const points = romanticPoints + intimatePoints + explicitPoints + asteriskPoints + emotionalPoints + lengthPoints;

    this._lastBreakdown = {
      romantic: romanticPoints,
      intimate: intimatePoints,
      explicit: explicitPoints,
      asterisk: asteriskPoints,
      emotional: emotionalPoints,
      length: lengthPoints,
      total: Math.max(0, points)
    };

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
   * Get the breakdown from the last calculatePassionPoints call
   * @returns {Object|null} Breakdown with romantic, intimate, explicit, asterisk, emotional, length, total
   */
  getLastBreakdown() {
    return this._lastBreakdown || null;
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
    const tierOrder = ['innocent', 'warm', 'passionate', 'primal'];
    if (oldTier !== newTier && tierOrder.indexOf(newTier) > tierOrder.indexOf(oldTier)) {
      this.passionData[`${sessionId}_transition`] = newTier;
    }
    if (oldTier !== newTier && tierOrder.indexOf(newTier) < tierOrder.indexOf(oldTier)) {
      this.passionData[`${sessionId}_transition_down`] = newTier;
    }
    this.passionData[sessionId] = clamped;
    delete this.passionData[`${sessionId}_streak`];
    delete this.passionData[`${sessionId}_cooldown`];
    this.trackHistory(sessionId, clamped);
    this.savePassionData();
    return clamped;
  }

  /**
   * Adjust passion level with tier transition detection (no streak/cooldown reset)
   * @param {string} sessionId - Session identifier
   * @param {number} level - Target passion level (0-100)
   * @returns {number} Clamped level that was set
   */
  adjustPassion(sessionId, level) {
    const oldLevel = this.passionData[sessionId] || 0;
    const clamped = Math.round(Math.max(0, Math.min(100, level)));
    const oldTier = getTierKey(oldLevel);
    const newTier = getTierKey(clamped);
    const tierOrder = ['innocent', 'warm', 'passionate', 'primal'];
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
   * Reset passion level for a session (clears cooldown and records reset in history)
   * @param {string} sessionId - Session identifier
   * @returns {number} 0
   */
  resetPassion(sessionId) {
    this.passionData[sessionId] = 0;
    delete this.passionData[`${sessionId}_cooldown`];
    delete this.passionData[`${sessionId}_streak`];
    delete this.passionData[`${sessionId}_transition`];
    delete this.passionData[`${sessionId}_transition_down`];
    delete this.passionData[`${sessionId}_lastUpdate`];
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
      if (key.endsWith('_cooldown') || key.endsWith('_history') || key.endsWith('_streak') || key.endsWith('_transition') || key.endsWith('_transition_down') || key.endsWith('_lastUpdate')) return;
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
        lastHistory: Array.isArray(history) ? history.slice(-10) : [],
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
