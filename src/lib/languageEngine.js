/**
 * languageEngine.js - Universal Language Synchronization (v7.7 RESTORED)
 * 
 * Ensures:
 * - DEFAULT: System language is ALWAYS English unless user switches
 * - Deep mirroring: Scans last 7 messages to detect language switches
 * - 100% language sync without meta-talk or apologies
 * - No English contamination when user switches languages
 */

const SUPPORTED_LANGUAGES = {
  en: {
    name: 'English',
    patterns: [
      /\b(the|is|are|was|were|have|has|had|do|does|did|will|would|can|could|should|may|might)\b/i,
      /\b(hello|hi|hey|yes|no|please|thank|sorry)\b/i
    ]
  },
  de: {
    name: 'Deutsch',
    patterns: [
      /\b(der|die|das|den|dem|des|ein|eine|einen|einem|einer|eines)\b/i,
      /\b(ich|du|er|sie|es|wir|ihr|sein|haben|werden|können|müssen)\b/i,
      /\b(und|oder|aber|nicht|ist|sind|war|waren|hat|hatte)\b/i,
      /[äöüß]/i
    ]
  },
  es: {
    name: 'Español',
    patterns: [
      /\b(el|la|los|las|un|una|unos|unas|de|del|al)\b/i,
      /\b(yo|tú|él|ella|nosotros|vosotros|ellos|ellas)\b/i,
      /\b(ser|estar|haber|tener|hacer|poder|deber|querer)\b/i,
      /[áéíóúñ¿¡]/i
    ]
  },
  fr: {
    name: 'Français',
    patterns: [
      /\b(le|la|les|un|une|des|du|de|au|aux)\b/i,
      /\b(je|tu|il|elle|nous|vous|ils|elles)\b/i,
      /\b(être|avoir|faire|aller|pouvoir|vouloir|devoir)\b/i,
      /[àâäéèêëïîôùûü]/i
    ]
  },
  it: {
    name: 'Italiano',
    patterns: [
      /\b(il|lo|la|i|gli|le|un|una|uno|dei|delle)\b/i,
      /\b(io|tu|lui|lei|noi|voi|loro)\b/i,
      /\b(essere|avere|fare|andare|potere|volere|dovere)\b/i,
      /[àèéìíîòóùú]/i
    ]
  },
  pt: {
    name: 'Português',
    patterns: [
      /\b(o|a|os|as|um|uma|uns|umas|do|da|dos|das)\b/i,
      /\b(eu|tu|ele|ela|nós|vós|eles|elas)\b/i,
      /\b(ser|estar|ter|haver|fazer|poder|dever|querer)\b/i,
      /[ãâáàçéêíóôõú]/i
    ]
  },
  ru: {
    name: 'Русский',
    patterns: [
      /[а-яА-ЯёЁ]/
    ]
  },
  ja: {
    name: '日本語',
    patterns: [
      /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/
    ]
  },
  zh: {
    name: '中文',
    patterns: [
      /[\u4E00-\u9FFF]/
    ]
  },
  ko: {
    name: '한국어',
    patterns: [
      /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/
    ]
  },
  ar: {
    name: 'العربية',
    patterns: [
      /[\u0600-\u06FF]/
    ]
  },
  hi: {
    name: 'हिंदी',
    patterns: [
      /[\u0900-\u097F]/  // Devanagari script (Hindi)
    ]
  },
  tr: {
    name: 'Türkçe',
    patterns: [
      /\b(ve|bir|bu|için|ile|de|da|olarak|gibi|daha|ancak)\b/i,
      /\b(ben|sen|o|biz|siz|onlar|ne|nasıl|neden)\b/i,
      /[şğıİçöüŞĞÇÖÜ]/i
    ]
  },
};

/**
 * Detects the language of a text with confidence scoring
 */
export function detectLanguage(text) {
  if (!text || text.trim().length === 0) {
    return { language: 'en', confidence: 0, name: 'English' };
  }
  
  const cleanText = text.toLowerCase().trim();
  const scores = {};
  
  for (const [langCode, langData] of Object.entries(SUPPORTED_LANGUAGES)) {
    let score = 0;
    
    for (const pattern of langData.patterns) {
      const matches = cleanText.match(pattern);
      if (matches) {
        score += matches.length;
      }
    }
    
    scores[langCode] = score;
  }
  
  let detectedLang = 'en';
  let maxScore = 0;
  
  for (const [langCode, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      detectedLang = langCode;
    }
  }
  
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = totalScore > 0 ? Math.round((maxScore / totalScore) * 100) : 0;
  
  return {
    language: detectedLang,
    confidence: confidence,
    name: SUPPORTED_LANGUAGES[detectedLang].name,
    allScores: scores
  };
}

/**
 * Generates language instruction for the system prompt
 * CRITICAL: NO meta-talk about language switching
 */
export function generateLanguageInstruction(detectedLanguage, characterName) {
  const langName = SUPPORTED_LANGUAGES[detectedLanguage]?.name || 'English';
  
  if (detectedLanguage === 'en') {
    return `You must respond in English. Maintain natural, fluent English throughout the entire conversation.`;
  }
  
  return `CRITICAL LANGUAGE INSTRUCTION:
You must respond ENTIRELY in ${langName}. Every word, every sentence must be in ${langName}.

ABSOLUTE RULES:
- 100% ${langName} - NO English words or phrases
- NO explanations about language switching
- NO apologies or meta-commentary
- NO mixing languages
- Act as if ${langName} is your native language
- Maintain character voice in ${langName}

You are ${characterName} speaking fluent ${langName}. Respond naturally and stay in character.`;
}

export default {
  detectLanguage,
  generateLanguageInstruction,
  SUPPORTED_LANGUAGES
};