/**
 * PassionManager.js - Passion Level & Vocabulary Tier Management (v7.7 RESTORED)
 * 
 * Manages:
 * - Passion level tracking per character (0-100)
 * - Vocabulary tier mapping (Innocent -> Primal)
 * - Automatic progression based on conversation content
 * - localStorage persistence
 */

const PASSION_STORAGE_KEY = 'aria_passion_data';

// Vocabulary tiers mapped to passion levels
const VOCABULARY_TIERS = {
  innocent: { min: 0, max: 20, label: 'Innocent' },
  warm: { min: 21, max: 50, label: 'Warm' },
  passionate: { min: 51, max: 80, label: 'Passionate' },
  primal: { min: 81, max: 100, label: 'Primal' }
};

// Word choice by passion level
const PASSION_VOCABULARY = {
  low: {
    touch: ['gentle touch', 'soft brush', 'light caress', 'tender stroke'],
    reaction: ['blushes', 'heart flutters', 'breath catches', 'cheeks warm'],
    sound: ['soft gasp', 'quiet sigh', 'gentle hum', 'tiny whimper'],
    desire: ['curiosity', 'interest', 'attraction', 'fascination']
  },
  
  medium: {
    touch: ['warm hand', 'lingering touch', 'exploring fingers', 'firm grip'],
    reaction: ['heart races', 'skin tingles', 'pulse quickens', 'body responds'],
    sound: ['breathy moan', 'sharp inhale', 'soft whimper', 'throaty hum'],
    desire: ['longing', 'craving', 'need', 'hunger']
  },
  
  high: {
    touch: ['desperate grip', 'clawing fingers', 'bruising hold', 'possessive grasp'],
    reaction: ['trembles violently', 'back arches', 'hips buck', 'muscles clench'],
    sound: ['loud moan', 'broken cry', 'desperate whine', 'guttural groan'],
    desire: ['desperation', 'aching need', 'burning hunger', 'overwhelming want']
  },
  
  extreme: {
    touch: ['rough handling', 'forceful thrust', 'savage grip', 'merciless pressure'],
    reaction: ['convulses', 'writhes uncontrollably', 'screams', 'shatters'],
    sound: ['animalistic cry', 'raw scream', 'incoherent babbling', 'sobbing moans'],
    desire: ['primal need', 'savage hunger', 'complete loss of control', 'feral lust']
  }
};

class PassionManager {
  constructor() {
    this.passionData = this.loadPassionData();
  }

  loadPassionData() {
    try {
      const stored = localStorage.getItem(PASSION_STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      console.error('[PassionManager] Error loading:', error);
      return {};
    }
  }

  savePassionData() {
    try {
      localStorage.setItem(PASSION_STORAGE_KEY, JSON.stringify(this.passionData));
    } catch (error) {
      console.error('[PassionManager] Error saving:', error);
    }
  }

  /**
   * Get current passion level for a character
   */
  getPassionLevel(characterName) {
    const rawLevel = this.passionData[characterName] || 0;
    return Math.round(Math.max(0, Math.min(100, rawLevel)));
  }

  /**
   * Update passion level based on conversation content
   */
  updatePassion(characterName, userMessage, aiResponse, speedMultiplier = 1.0) {
    const currentLevel = this.passionData[characterName] || 0;
    
    const basePoints = this.calculatePassionPoints(userMessage, aiResponse);
    const finalPoints = basePoints * Math.max(0.1, Math.min(10, speedMultiplier));
    
    const newLevel = Math.max(0, Math.min(100, currentLevel + finalPoints));
    
    this.passionData[characterName] = newLevel;
    this.savePassionData();
    
    console.log(`[PassionManager] ${characterName}: ${currentLevel} -> ${Math.round(newLevel)} (+${finalPoints.toFixed(1)})`);
    
    return Math.round(newLevel);
  }

  /**
   * Calculate passion points based on message content
   */
  calculatePassionPoints(userMessage, aiResponse) {
    let points = 2.0;
    
    const message = userMessage.toLowerCase();
    const response = aiResponse.toLowerCase();
    
    // Keyword categories with weighted scoring
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
    
    // Score romantic keywords
    romanticKeywords.forEach(keyword => {
      if (message.includes(keyword)) points += 1.5;
      if (response.includes(keyword)) points += 0.5;
    });
    
    // Score intimate keywords
    intimateKeywords.forEach(keyword => {
      if (message.includes(keyword)) points += 2.5;
      if (response.includes(keyword)) points += 1.0;
    });
    
    // Score explicit keywords
    explicitKeywords.forEach(keyword => {
      if (message.includes(keyword)) points += 3.5;
      if (response.includes(keyword)) points += 1.5;
    });
    
    // Bonus for asterisk actions (roleplay intensity)
    const asteriskCount = (response.match(/\*/g) || []).length;
    if (asteriskCount > 4) points += 1.0;
    if (asteriskCount > 10) points += 2.0;
    
    // Bonus for emotional words
    const emotionalWords = ['mmm', 'ahh', 'ohh', 'yes', 'god', 'please', 'more', 'ja', 'bitte', 'mehr'];
    emotionalWords.forEach(word => {
      if (response.includes(word)) points += 1.0;
    });
    
    // Bonus for length (engagement)
    if (message.length > 100) points += 1.5;
    if (response.length > 200) points += 1.0;
    
    return Math.max(0.5, points);
  }

  /**
   * Get vocabulary tier for current passion level
   */
  getVocabularyTier(passionLevel) {
    if (passionLevel <= VOCABULARY_TIERS.innocent.max) return VOCABULARY_TIERS.innocent.label;
    if (passionLevel <= VOCABULARY_TIERS.warm.max) return VOCABULARY_TIERS.warm.label;
    if (passionLevel <= VOCABULARY_TIERS.passionate.max) return VOCABULARY_TIERS.passionate.label;
    return VOCABULARY_TIERS.primal.label;
  }

  /**
   * Get vocabulary suggestions for current level
   */
  getVocabulary(passionLevel) {
    if (passionLevel <= 20) return PASSION_VOCABULARY.low;
    if (passionLevel <= 50) return PASSION_VOCABULARY.medium;
    if (passionLevel <= 80) return PASSION_VOCABULARY.high;
    return PASSION_VOCABULARY.extreme;
  }

  /**
   * Reset passion level for a character
   */
  resetPassion(characterName) {
    this.passionData[characterName] = 0;
    this.savePassionData();
    console.log(`[PassionManager] Reset ${characterName} to 0`);
    return 0;
  }

  /**
   * Get all passion levels
   */
  getAllPassionLevels() {
    const levels = {};
    Object.keys(this.passionData).forEach(char => {
      levels[char] = Math.round(this.passionData[char] || 0);
    });
    return levels;
  }

  /**
   * Delete passion data for a character (hard reset)
   */
  deleteCharacterPassion(characterName) {
    delete this.passionData[characterName];
    this.savePassionData();
    console.log(`[PassionManager] Deleted passion data for ${characterName}`);
  }
}

// Export singleton instance
export const passionManager = new PassionManager();

export default passionManager;