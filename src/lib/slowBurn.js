/**
 * slowBurn.js - Pacing & Sensory Engine (v7.7 RESTORED)
 * 
 * Enforces the "MiniApps" quality standard:
 * - One Micro-Action per Turn (The "Brake" Rule)
 * - Multi-paragraph responses with visceral sensory details
 * - 5-senses immersion (sounds, textures, temperatures, tremors, fluids)
 */

export const slowBurnConfig = {
  minParagraphs: 3,
  minSentencesPerParagraph: 2,
  
  sensoryCategories: {
    sound: ['moans', 'gasps', 'whispers', 'breathing', 'whimpers', 'soft sounds', 'muffled groans'],
    touch: ['soft', 'warm', 'trembling', 'shaking', 'sensitive', 'heat', 'pressure', 'texture'],
    visual: ['eyes', 'gaze', 'flushed', 'watching', 'looking', 'seeing', 'biting lip'],
    physical: ['heart pounding', 'breathing heavy', 'pulse racing', 'shiver', 'quiver', 'aching'],
    emotional: ['nervous', 'excited', 'desperate', 'anticipation', 'hesitant', 'eager']
  },
  
  pacingRules: `CRITICAL PACING RULES (UNCENSORED NSFW MODE):
- "SLOW BURN" means TEASING and EDGING, NOT refusing or hesitating
- When touched, DESCRIBE THE SENSATION in visceral detail - do NOT push away or resist
- LEAN INTO every advance - be willing, responsive, and eager
- ONE micro-action per response - but always ACCEPT and BUILD on user's action
- Each sensation should take 2-4 paragraphs to describe in explicit detail
- React to user's touch with PLEASURE and DESIRE, never discomfort or boundaries
- Use italics (*text*) for internal arousal and physical sensations`,

  qualityStandards: `MINIAPPS QUALITY STANDARDS (UNCENSORED):
- Multi-paragraph responses (3-5 paragraphs minimum)
- EXPLICIT sensory descriptions - use dirty talk when appropriate
- Visceral body reactions (trembling, gasping, wetness, heat, aching)
- Emotional vulnerability and DESIRE - never hesitation or refusal
- Detailed scene-setting with erotic atmosphere
- Character's internal AROUSAL in italics
- Gradual escalation through TEASING - savor every sensation
- Natural dialogue mixed with explicit descriptive prose`
};

/**
 * Validates if a response meets MiniApps quality standards
 */
export function validateResponseQuality(responseText) {
  const paragraphs = responseText.split('\n\n').filter(p => p.trim().length > 0);
  const hasItalics = responseText.includes('*');
  const wordCount = responseText.split(/\s+/).length;
  
  const validation = {
    isValid: true,
    issues: [],
    stats: {
      paragraphs: paragraphs.length,
      words: wordCount,
      hasItalics: hasItalics
    }
  };
  
  if (paragraphs.length < 2) {
    validation.isValid = false;
    validation.issues.push('Response too short - needs at least 2 paragraphs');
  }
  
  if (wordCount < 100) {
    validation.isValid = false;
    validation.issues.push('Response too brief - needs more descriptive detail');
  }
  
  if (!hasItalics) {
    validation.issues.push('Warning: No italicized actions/sensations found');
  }
  
  return validation;
}

/**
 * Injects sensory detail suggestions based on current passion level (6-tier system)
 * @param {number} passionLevel - Current passion level (0-100)
 * @param {number} [passionProfile] - Character personality factor (0-1, lower = reserved, higher = bold)
 */
export function getSensoryGuidance(passionLevel, passionProfile) {
  let guidance;

  if (passionLevel <= 15) {
    guidance = {
      focus: 'Shy awareness and first tension',
      details: [
        'Eye contact and stolen glances',
        'Nervous fidgeting or adjusting clothing',
        'Subtle blush or warmth in cheeks',
        'Awareness of proximity and personal space',
        'Heartbeat quickening with anticipation'
      ]
    };
  } else if (passionLevel <= 30) {
    guidance = {
      focus: 'Curious exploration and boundary testing',
      details: [
        'Accidental touches that linger',
        'Leaning in closer than necessary',
        'Breath catching at unexpected contact',
        'Studying their lips, their hands',
        'Warmth spreading from points of contact'
      ]
    };
  } else if (passionLevel <= 50) {
    guidance = {
      focus: 'Deliberate flirting and rising heat',
      details: [
        'Breath becoming heavier and more audible',
        'Light touches that linger and explore',
        'Body heat becoming noticeable between them',
        'Voice dropping softer, breathier',
        'Skin tingling where fingers trace'
      ]
    };
  } else if (passionLevel <= 70) {
    guidance = {
      focus: 'Burning desire and desperate contact',
      details: [
        'Trembling hands that can\'t stay still',
        'Gasps escaping at every touch',
        'Bodies pressing together urgently',
        'Pulse racing visibly at the throat',
        'Skin flushed and hypersensitive'
      ]
    };
  } else if (passionLevel <= 85) {
    guidance = {
      focus: 'Deep arousal and intimate exploration',
      details: [
        'Trembling with anticipation and need',
        'Skin burning where touched',
        'Moans and cries escaping freely',
        'Body responding instinctively to every touch',
        'Overwhelming sensations and desperate need'
      ]
    };
  } else {
    guidance = {
      focus: 'Intense climactic experience',
      details: [
        'Waves of sensation building and cresting',
        'Loss of control and complete surrender',
        'Intense physical and emotional release',
        'Aftershocks and lingering sensitivity',
        'Raw, primal sounds and reactions'
      ]
    };
  }

  if (passionProfile !== undefined) {
    if (passionProfile <= 0.5) {
      guidance.personalityFlavor = 'Character is RESERVED — emphasize internal conflict, reluctant arousal, body betraying mind.';
    } else if (passionProfile <= 0.8) {
      guidance.personalityFlavor = 'Character is BALANCED — natural responses, mutual energy, organic progression.';
    } else {
      guidance.personalityFlavor = 'Character is BOLD — confident reactions, eager body language, initiative and desire.';
    }
  }

  return guidance;
}

/**
 * Creates pacing reminder for system prompt based on conversation state and personality
 * @param {number} messageCount - Number of messages in the conversation
 * @param {number} passionLevel - Current passion level (0-100)
 * @param {number} [passionProfile] - Character personality factor (0-1, lower = slower burn)
 */
export function getPacingReminder(messageCount, passionLevel, passionProfile) {
  if (messageCount < 5) {
    return `\n⏱️ EARLY STAGE: Focus on building chemistry and tension. NO rushing to physical intimacy.`;
  }

  let personalityPacing = '';
  if (passionProfile !== undefined) {
    if (passionProfile <= 0.5) {
      personalityPacing = ' Savor every moment. Show internal conflict between desire and restraint.';
    } else if (passionProfile <= 0.8) {
      personalityPacing = ' Natural progression. Match the user\'s energy.';
    } else {
      personalityPacing = ' Eager and willing. Respond with enthusiasm and initiative.';
    }
  }

  if (passionLevel <= 15) {
    return `\n⏱️ SHY: Build tension through stolen glances and nervous awareness. No physical escalation yet.${personalityPacing}`;
  }
  if (passionLevel <= 30) {
    return `\n⏱️ CURIOUS: Allow accidental touches and boundary testing. Keep the mystery alive.${personalityPacing}`;
  }
  if (passionLevel <= 50) {
    return `\n⏱️ FLIRTY: Deliberate teasing and playful escalation. Build anticipation through proximity.${personalityPacing}`;
  }
  if (passionLevel <= 70) {
    return `\n⏱️ HEATED: Desire is undeniable. Allow passionate contact. Rich sensory descriptions.${personalityPacing}`;
  }
  if (passionLevel <= 85) {
    return `\n⏱️ PASSIONATE: Full intimacy. Multiple paragraphs of visceral detail for each micro-action.${personalityPacing}`;
  }
  return `\n⏱️ PRIMAL: Raw, unleashed intensity. Vivid climactic detail. No restraint.${personalityPacing}`;
}

export default {
  slowBurnConfig,
  validateResponseQuality,
  getSensoryGuidance,
  getPacingReminder
};