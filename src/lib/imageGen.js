// ARIA v1.0 RELEASE - Image Generation Logic

/**
 * Generate image using AUTOMATIC1111 WebUI API
 * @param {string} prompt - The text prompt for image generation
 * @param {string} apiUrl - The API URL (default: http://127.0.0.1:7860)
 * @returns {Promise<string>} Base64 encoded image
 */
export async function generateImage(prompt, apiUrl = 'http://127.0.0.1:7860') {
  try {
    const payload = {
      prompt: prompt,
      negative_prompt: "ugly, low quality, deformed, text, watermark, bad anatomy, mutation, blurry, pixelated",
      steps: 20,              // Match User WebUI (Fast)
      sampler_name: "Euler a", // Match User WebUI (Reliable)
      cfg_scale: 7,           // Standard adherence
      width: 512,
      height: 768,            // Portrait Mode
      batch_size: 1,          // Critical for speed
      n_iter: 1,              // One image only
      restore_faces: false,   // Disable to save time
      save_images: true,      // Save on server side
      do_not_save_grid: true, // Don't generate grids
      do_not_save_samples: false
    };

    console.log("[Image Gen] Sending Payload:", JSON.stringify(payload, null, 2));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

    const response = await fetch(`${apiUrl}/sdapi/v1/txt2img`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.images || data.images.length === 0) {
      throw new Error('No images returned from API');
    }

    console.log("[Image Gen] Received Image Length:", data.images[0].length);
    console.log("[Image Gen] ✅ Image generated successfully");

    // Return the first image as base64
    return data.images[0];
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('[Image Gen] Request timed out after 60s');
      throw new Error('Image generation timed out. Check if AUTOMATIC1111 is running with GPU acceleration.');
    }
    console.error('[Image Gen] Error:', error);
    throw error;
  }
}

/**
 * Test connection to AUTOMATIC1111 API
 * @param {string} apiUrl - The API URL to test
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function testImageGenConnection(apiUrl = 'http://127.0.0.1:7860') {
  try {
    const response = await fetch(`${apiUrl}/sdapi/v1/options`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      return { success: true, message: '✅ Connected to AUTOMATIC1111 WebUI' };
    } else {
      return { success: false, message: `❌ API returned ${response.status}` };
    }
  } catch (error) {
    return { success: false, message: `❌ Connection failed: ${error.message}` };
  }
}

/**
 * Clean conversation text for image generation
 * BLOCK 8.2+: Keyword extraction approach - removes narrative prose, keeps only visual descriptors
 * @param {string} text - Raw conversation text
 * @param {string} characterName - Character name for visual context
 * @returns {string} Cleaned prompt
 */
export function cleanContextForImage(text, characterName = '') {
  if (!text) return characterName ? `${getCharacterVisualTags(characterName)}, intimate scene` : 'intimate scene, detailed';

  // Step 1: Remove dialogue (text inside quotes)
  let cleaned = text.replace(/"[^"]*"/g, '');

  // Step 2: Remove asterisks (narration markers)
  cleaned = cleaned.replace(/\*/g, '');

  // Step 3: Remove generic filler words and common verbs (aggressive filtering)
  const fillerPattern = /\b(the|a|an|is|are|was|were|has|have|had|it|he|she|they|i|me|you|my|your|his|her|their|breathes|whimpers|moans|gasps|sighs|looks|feels|seems|appears|says|tells|asks)\b/gi;
  cleaned = cleaned.replace(fillerPattern, ' ');

  // Step 4: Remove extra whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Step 5: Extract keywords (keep visual nouns/adjectives only)
  // Focus on: body parts, clothing, colors, emotions, settings
  const visualKeywords = cleaned.toLowerCase().split(' ').filter(word =>
    word.length > 2 && /^[a-z]+$/.test(word) // Only alphabetic words
  );

  // Step 6: Hard limit to ~30 words to prevent novel-length prompts
  const limitedKeywords = visualKeywords.slice(0, 30);
  cleaned = limitedKeywords.join(' ');

  // Step 7: Prepend character context (ALWAYS include character as subject)
  const characterTags = characterName ? getCharacterVisualTags(characterName) : 'beautiful character';

  // Final assembly: Character first, then context keywords
  const finalPrompt = cleaned.length > 0
    ? `${characterTags}, ${cleaned}`
    : `${characterTags}, intimate scene`;

  console.log("[Image Gen] Cleaned Context:", finalPrompt);

  return finalPrompt;
}

/**
 * Get visual tags for characters
 * @param {string} characterName - Character name
 * @returns {string} Visual description tags
 */
function getCharacterVisualTags(characterName) {
  const tags = {
    'Alice': 'alice, maid outfit, cute face, black hair, blue eyes',
    'Sarah': 'sarah, elegant woman, long brown hair, green eyes',
    'Emma': 'emma, shy secretary, glasses, professional attire',
    'Luna': 'luna, mysterious woman, silver hair, purple eyes',
    'Aria': 'aria, fantasy character, flowing dress'
  };

  return tags[characterName] || 'beautiful character';
}
