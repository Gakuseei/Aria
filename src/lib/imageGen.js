// ARIA v1.0 RELEASE - Image Generation Logic

/**
 * Generate image using AUTOMATIC1111 WebUI API
 * @param {string} prompt - The text prompt for image generation
 * @param {string} apiUrl - The API URL (default: http://127.0.0.1:7860)
 * @returns {Promise<string>} Base64 encoded image
 */
export async function generateImage(prompt, apiUrl = 'http://127.0.0.1:7860', imageGenTier = 'standard') {
  try {
    const isPremium = imageGenTier === 'premium';
    console.log(`[Image Gen] ${isPremium ? '🌟 Premium (FLUX)' : 'Standard (SDXL)'} mode`);

    const payload = {
      prompt: prompt,
      negative_prompt: isPremium 
        ? "blurry, low quality, distorted, text, watermark"
        : "ugly, low quality, deformed, text, watermark, bad anatomy, mutation, blurry, pixelated",
      steps: isPremium ? 28 : 20,
      sampler_name: isPremium ? "Euler" : "Euler a",
      cfg_scale: isPremium ? 3.5 : 7,
      width: isPremium ? 1024 : 512,
      height: isPremium ? 1024 : 768,
      batch_size: 1,
      n_iter: 1,
      restore_faces: false,
      save_images: true,
      do_not_save_grid: true,
      do_not_save_samples: false
    };

    console.log("[Image Gen] Sending Payload:", JSON.stringify(payload, null, 2));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 600000); // v1.0.2 FIX: 600s (10m) timeout for CPU generation

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
      console.error('[Image Gen] Request timed out after 600s');
      throw new Error('Image generation timed out (10m). Check if AUTOMATIC1111 is running with GPU acceleration.');
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

// ============ MULTILINGUAL TRANSLATION PREPROCESSOR ============
// Translates foreign NSFW terms to English for pattern matching
const NSFW_TRANSLATIONS = {
  // GERMAN
  'küssen': 'kiss', 'kuss': 'kiss', 'küsse': 'kiss', 'stöhnen': 'moan', 'seufzen': 'moan',
  'nackt': 'nude', 'nackig': 'nude', 'brüste': 'breasts', 'titten': 'tits', 'busen': 'boobs',
  'arsch': 'ass', 'hintern': 'butt', 'po': 'butt', 'ficken': 'fuck', 'vögeln': 'fuck',
  'bumsen': 'fuck', 'blasen': 'blowjob', 'lutschen': 'suck', 'lecken': 'lick',
  'orgasmus': 'orgasm', 'kommen': 'cum', 'abspritzen': 'cum', 'feucht': 'wet', 'nass': 'wet',
  'erregt': 'aroused', 'hart': 'hard', 'steif': 'erect', 'sperma': 'cum', 'samen': 'semen',
  'streicheln': 'caress', 'berühren': 'touch', 'dominant': 'dominant', 'unterwürfig': 'submissive',
  'fesseln': 'tie', 'gefesselt': 'tied', 'gebunden': 'bound', 'peitsche': 'whip', 'schlagen': 'hit',
  'sklave': 'slave', 'sklavin': 'slave', 'herrin': 'mistress', 'meister': 'master',
  'dienstmädchen': 'maid', 'magd': 'maid', 'zofe': 'maid', 'krankenschwester': 'nurse',
  'schülerin': 'schoolgirl', 'studentin': 'student', 'lehrerin': 'teacher', 'schwanz': 'cock',
  'fotze': 'pussy', 'muschi': 'pussy', 'reiten': 'ride', 'doggy': 'doggy', 'anal': 'anal',
  'dreier': 'threesome', 'gangbang': 'gangbang', 'schlucken': 'swallow', 'spritzen': 'squirt',
  
  // SPANISH
  'besar': 'kiss', 'beso': 'kiss', 'gemir': 'moan', 'gemido': 'moan', 'jadear': 'pant',
  'desnuda': 'nude', 'desnudo': 'nude', 'pechos': 'breasts', 'tetas': 'tits', 'senos': 'boobs',
  'culo': 'ass', 'trasero': 'butt', 'nalgas': 'butt', 'follar': 'fuck', 'coger': 'fuck',
  'chupar': 'suck', 'mamar': 'suck', 'lamer': 'lick', 'orgasmo': 'orgasm', 'correrse': 'cum',
  'mojada': 'wet', 'excitada': 'aroused', 'duro': 'hard', 'semen': 'cum', 'leche': 'cum',
  'acariciar': 'caress', 'tocar': 'touch', 'dominante': 'dominant', 'sumisa': 'submissive',
  'atar': 'tie', 'atada': 'tied', 'látigo': 'whip', 'azotar': 'spank', 'esclava': 'slave',
  'ama': 'mistress', 'sirvienta': 'maid', 'criada': 'maid', 'enfermera': 'nurse',
  'colegiala': 'schoolgirl', 'estudiante': 'student', 'profesora': 'teacher', 'polla': 'cock',
  'coño': 'pussy', 'verga': 'cock', 'cabalgar': 'ride', 'trío': 'threesome',
  
  // FRENCH
  'embrasser': 'kiss', 'baiser': 'kiss', 'gémir': 'moan', 'gémissement': 'moan',
  'nue': 'nude', 'nu': 'nude', 'seins': 'breasts', 'poitrine': 'chest', 'nichons': 'tits',
  'cul': 'ass', 'fesses': 'butt', 'derrière': 'butt', 'baiser': 'fuck', 'niquer': 'fuck',
  'sucer': 'suck', 'pipe': 'blowjob', 'lécher': 'lick', 'orgasme': 'orgasm', 'jouir': 'cum',
  'mouillée': 'wet', 'excitée': 'aroused', 'dur': 'hard', 'bandé': 'erect', 'sperme': 'cum',
  'foutre': 'cum', 'caresser': 'caress', 'toucher': 'touch', 'dominante': 'dominant',
  'soumise': 'submissive', 'attacher': 'tie', 'attachée': 'tied', 'ligotée': 'bound',
  'fouetter': 'whip', 'fessée': 'spank', 'esclave': 'slave', 'maîtresse': 'mistress',
  'soubrette': 'maid', 'bonne': 'maid', 'infirmière': 'nurse', 'écolière': 'schoolgirl',
  'étudiante': 'student', 'professeur': 'teacher', 'bite': 'cock', 'chatte': 'pussy',
  
  // ITALIAN
  'baciare': 'kiss', 'bacio': 'kiss', 'gemere': 'moan', 'gemito': 'moan',
  'nuda': 'nude', 'nudo': 'nude', 'tette': 'tits', 'seno': 'breasts', 'petto': 'chest',
  'culo': 'ass', 'sedere': 'butt', 'chiappe': 'butt', 'scopare': 'fuck', 'fottere': 'fuck',
  'succhiare': 'suck', 'pompino': 'blowjob', 'leccare': 'lick', 'orgasmo': 'orgasm',
  'venire': 'cum', 'godere': 'cum', 'bagnata': 'wet', 'eccitata': 'aroused', 'duro': 'hard',
  'sperma': 'cum', 'sborra': 'cum', 'accarezzare': 'caress', 'toccare': 'touch',
  'dominante': 'dominant', 'sottomessa': 'submissive', 'legata': 'tied', 'incatenata': 'chained',
  'frustata': 'whipped', 'sculacciata': 'spanked', 'schiava': 'slave', 'padrona': 'mistress',
  'cameriera': 'maid', 'domestica': 'maid', 'infermiera': 'nurse', 'studentessa': 'student',
  'scolara': 'schoolgirl', 'professoressa': 'teacher', 'cazzo': 'cock', 'figa': 'pussy',
  
  // PORTUGUESE
  'beijar': 'kiss', 'beijo': 'kiss', 'gemer': 'moan', 'gemido': 'moan',
  'nua': 'nude', 'nu': 'nude', 'pelada': 'nude', 'peitos': 'breasts', 'seios': 'boobs',
  'mamas': 'tits', 'bunda': 'ass', 'rabo': 'butt', 'traseiro': 'butt', 'foder': 'fuck',
  'trepar': 'fuck', 'chupar': 'suck', 'mamar': 'suck', 'lamber': 'lick', 'orgasmo': 'orgasm',
  'gozar': 'cum', 'molhada': 'wet', 'excitada': 'aroused', 'duro': 'hard', 'porra': 'cum',
  'esperma': 'cum', 'acariciar': 'caress', 'tocar': 'touch', 'dominante': 'dominant',
  'submissa': 'submissive', 'amarrada': 'tied', 'atada': 'bound', 'chicote': 'whip',
  'palmada': 'spank', 'escrava': 'slave', 'mestra': 'mistress', 'empregada': 'maid',
  'criada': 'maid', 'enfermeira': 'nurse', 'estudante': 'student', 'aluna': 'schoolgirl',
  'professora': 'teacher', 'pau': 'cock', 'pica': 'cock', 'buceta': 'pussy', 'xoxota': 'pussy',
  
  // RUSSIAN (transliterated)
  'целовать': 'kiss', 'поцелуй': 'kiss', 'стонать': 'moan', 'стон': 'moan',
  'голая': 'nude', 'нагая': 'nude', 'обнажённая': 'nude', 'грудь': 'breasts', 'сиськи': 'tits',
  'титьки': 'tits', 'попа': 'ass', 'жопа': 'ass', 'задница': 'butt', 'трахать': 'fuck',
  'ебать': 'fuck', 'сосать': 'suck', 'отсос': 'blowjob', 'лизать': 'lick', 'оргазм': 'orgasm',
  'кончать': 'cum', 'кончить': 'cum', 'мокрая': 'wet', 'влажная': 'wet', 'возбуждённая': 'aroused',
  'твёрдый': 'hard', 'стоит': 'erect', 'сперма': 'cum', 'ласкать': 'caress', 'трогать': 'touch',
  'доминант': 'dominant', 'покорная': 'submissive', 'подчинённая': 'submissive',
  'связанная': 'tied', 'привязанная': 'bound', 'плётка': 'whip', 'шлёпать': 'spank',
  'раба': 'slave', 'хозяин': 'master', 'госпожа': 'mistress', 'горничная': 'maid',
  'служанка': 'maid', 'медсестра': 'nurse', 'студентка': 'student', 'школьница': 'schoolgirl',
  'учительница': 'teacher', 'член': 'cock', 'хуй': 'cock', 'пизда': 'pussy', 'киска': 'pussy',
  
  // TURKISH
  'öpmek': 'kiss', 'öpücük': 'kiss', 'inlemek': 'moan', 'ah': 'moan',
  'çıplak': 'nude', 'soyunmuş': 'undressed', 'göğüs': 'breasts', 'meme': 'tits',
  'popo': 'ass', 'kıç': 'butt', 'göt': 'ass', 'sikmek': 'fuck', 'seks': 'sex',
  'emmek': 'suck', 'sakso': 'blowjob', 'yalamak': 'lick', 'orgazm': 'orgasm',
  'boşalmak': 'cum', 'ıslak': 'wet', 'tahrik': 'aroused', 'sert': 'hard', 'kalkmış': 'erect',
  'döl': 'cum', 'meni': 'semen', 'okşamak': 'caress', 'dokunmak': 'touch',
  'dominant': 'dominant', 'itaatkar': 'submissive', 'bağlı': 'tied', 'zincirli': 'chained',
  'kırbaç': 'whip', 'tokat': 'slap', 'köle': 'slave', 'efendi': 'master', 'sahip': 'owner',
  'hizmetçi': 'maid', 'hemşire': 'nurse', 'öğrenci': 'student', 'öğretmen': 'teacher',
  'yarrak': 'cock', 'sik': 'cock', 'am': 'pussy', 'amcık': 'pussy',
  
  // CHINESE (pinyin and characters)
  '亲吻': 'kiss', '接吻': 'kiss', '呻吟': 'moan', '喘气': 'pant',
  '裸体': 'nude', '赤裸': 'nude', '光着': 'naked', '胸部': 'breasts', '乳房': 'boobs',
  '奶子': 'tits', '屁股': 'ass', '臀部': 'butt', '做爱': 'sex', '性交': 'sex',
  '口交': 'blowjob', '吹箫': 'blowjob', '舔': 'lick', '高潮': 'orgasm', '射精': 'cum',
  '湿润': 'wet', '兴奋': 'aroused', '勃起': 'erect', '硬挺': 'hard', '精液': 'cum',
  '精子': 'semen', '抚摸': 'caress', '触摸': 'touch', '主人': 'master', '奴隶': 'slave',
  '女仆': 'maid', '侍女': 'servant', '护士': 'nurse', '医生': 'doctor',
  '学生': 'student', '老师': 'teacher', '捆绑': 'bondage', '束缚': 'bound',
  '鞭打': 'whip', '调教': 'training', '羞耻': 'shame', '害羞': 'shy',
  '阴茎': 'cock', '鸡巴': 'cock', '阴道': 'pussy', '小穴': 'pussy',
  
  // KOREAN
  '키스': 'kiss', '뽀뽀': 'kiss', '입맞춤': 'kiss', '신음': 'moan',
  '벗은': 'nude', '알몸': 'nude', '나체': 'naked', '가슴': 'breasts', '젖': 'tits',
  '엉덩이': 'ass', '섹스': 'sex', '성관계': 'sex', '오럴': 'oral', '펠라': 'blowjob',
  '핥기': 'lick', '오르가즘': 'orgasm', '절정': 'climax', '젖은': 'wet', '흥분': 'aroused',
  '정액': 'cum', '애무': 'caress', '만지기': 'touch', '주인': 'master', '노예': 'slave',
  '메이드': 'maid', '하녀': 'maid', '간호사': 'nurse', '의사': 'doctor',
  '학생': 'student', '선생님': 'teacher', '묶기': 'bondage', '긴박': 'bound',
  '채찍': 'whip', '부끄러움': 'shy', '수치': 'shame', '자지': 'cock', '보지': 'pussy',
  
  // ARABIC (transliterated)
  'قبلة': 'kiss', 'تقبيل': 'kiss', 'أنين': 'moan',
  'عارية': 'nude', 'عاري': 'nude', 'صدر': 'chest', 'ثدي': 'breasts', 'نهود': 'boobs',
  'مؤخرة': 'ass', 'طيز': 'ass', 'جنس': 'sex', 'ممارسة': 'sex',
  'مص': 'suck', 'لعق': 'lick', 'نشوة': 'orgasm', 'ذروة': 'climax',
  'مبللة': 'wet', 'رطب': 'wet', 'مثار': 'aroused', 'سيد': 'master', 'عبد': 'slave',
  'خادمة': 'maid', 'ممرضة': 'nurse', 'طبيب': 'doctor', 'طالبة': 'student',
  'معلمة': 'teacher', 'مقيد': 'tied', 'مربوط': 'bound', 'سوط': 'whip',
  'جلد': 'whip', 'خجل': 'shy', 'حياء': 'shy',
  
  // HINDI (transliterated)
  'चूम': 'kiss', 'चुंबन': 'kiss', 'किस': 'kiss', 'कराहना': 'moan', 'आह': 'moan',
  'नग्न': 'nude', 'नंगा': 'naked', 'निर्वस्त्र': 'nude', 'स्तन': 'breasts', 'छाती': 'chest',
  'गांड': 'ass', 'नितंब': 'butt', 'सेक्स': 'sex', 'संभोग': 'sex', 'चोदना': 'fuck',
  'चूसना': 'suck', 'मुखमैथुन': 'blowjob', 'चाटना': 'lick', 'चरमसुख': 'orgasm',
  'ऑर्गेज्म': 'orgasm', 'गीला': 'wet', 'उत्तेजित': 'aroused', 'वीर्य': 'cum',
  'सहलाना': 'caress', 'छूना': 'touch', 'मालिक': 'master', 'गुलाम': 'slave',
  'नौकरानी': 'maid', 'नर्स': 'nurse', 'डॉक्टर': 'doctor', 'छात्रा': 'student',
  'शिक्षिका': 'teacher', 'बंधन': 'bondage', 'बांध': 'tied', 'चाबुक': 'whip',
  'शर्म': 'shy', 'लज्जा': 'shy', 'लंड': 'cock', 'चूत': 'pussy'
};

/**
 * Preprocesses text by translating foreign NSFW terms to English
 * This allows all English patterns to work with any of the 13 supported languages
 */
function translateToEnglish(text) {
  if (!text) return text;
  let translated = text.toLowerCase();
  
  for (const [foreign, english] of Object.entries(NSFW_TRANSLATIONS)) {
    const regex = new RegExp(foreign, 'gi');
    translated = translated.replace(regex, english);
  }
  
  return translated;
}

/**
 * Clean conversation text for image generation
 * BLOCK v1.1: Semantic phrase extraction - extracts meaningful visual descriptions
 * @param {string} text - Raw conversation text from AI messages
 * @param {Object|string} character - Character object or name for visual context
 * @returns {string} Coherent visual prompt for Stable Diffusion
 */
export function cleanContextForImage(text, character = '') {
  // Always start with character visual identity
  const characterTags = character ? getCharacterVisualTags(character) : '1girl, beautiful woman';

  if (!text) return `${characterTags}, intimate scene, soft lighting`;

  // Extract content from asterisks (roleplay actions are visual gold)
  const actionMatches = text.match(/\*([^*]+)\*/g);
  const actionContent = actionMatches 
    ? actionMatches.map(m => m.replace(/\*/g, '').trim()).join(' ') 
    : '';

  // Combine action content with full text for analysis
  const fullContent = (actionContent + ' ' + text).toLowerCase();

  // ========== SEMANTIC EXTRACTION ==========

  // 1. SETTING/LOCATION - Where is the scene?
  const settingPatterns = [
    { pattern: /\b(behind the bar|at the bar|bar counter)\b/i, tag: 'bar setting, bottles in background' },
    { pattern: /\b(bar)\b/i, tag: 'bar setting' },
    { pattern: /\b(bedroom|bed|sheets|pillow)\b/i, tag: 'bedroom, soft bedding' },
    { pattern: /\b(office|desk|chair)\b/i, tag: 'office setting' },
    { pattern: /\b(kitchen|counter)\b/i, tag: 'kitchen setting' },
    { pattern: /\b(bathroom|shower|bath)\b/i, tag: 'bathroom setting' },
    { pattern: /\b(garden|outdoor|outside)\b/i, tag: 'outdoor setting' },
    { pattern: /\b(pool|swimming)\b/i, tag: 'poolside setting' },
    { pattern: /\b(couch|sofa|living room)\b/i, tag: 'living room, couch' },
  ];
  
  let settingTag = '';
  for (const { pattern, tag } of settingPatterns) {
    if (pattern.test(fullContent)) {
      settingTag = tag;
      break;
    }
  }

  // 2. POSE/ACTION - What is the character doing?
  const posePatterns = [
    { pattern: /\b(lean(s|ing)?[^,.]*(forward|closer|in))\b/i, tag: 'leaning forward' },
    { pattern: /\b(lean(s|ing)?[^,.]*elbow)\b/i, tag: 'leaning on elbows' },
    { pattern: /\b(polish(es|ing)?[^,.]*glass)\b/i, tag: 'polishing a glass' },
    { pattern: /\b(sit(s|ting)?[^,.]*down)\b/i, tag: 'sitting' },
    { pattern: /\b(stand(s|ing)?)\b/i, tag: 'standing' },
    { pattern: /\b(walk(s|ing)?[^,.]*toward)\b/i, tag: 'approaching' },
    { pattern: /\b(cross(es|ing)?[^,.]*leg)\b/i, tag: 'crossed legs' },
    { pattern: /\b(tilt(s|ing)?[^,.]*head)\b/i, tag: 'tilted head' },
    { pattern: /\b(hair fall(s|ing)?)\b/i, tag: 'hair falling over shoulder' },
    { pattern: /\b(touch(es|ing)?[^,.]*lip)\b/i, tag: 'touching lips' },
    { pattern: /\b(smirk(s|ing)?)\b/i, tag: 'smirking expression' },
    { pattern: /\b(smile|smiling)\b/i, tag: 'slight smile' },
    { pattern: /\b(glanc(e|es|ing))\b/i, tag: 'glancing' },
    { pattern: /\b(stud(y|ies|ying))\b/i, tag: 'studying expression' },
    { pattern: /\b(press(es|ing)?[^,.]*lips?[^,.]*against)\b/i, tag: 'kissing' },
    { pattern: /\b(kiss(es|ing)?)\b/i, tag: 'kissing' },
    { pattern: /\b(trail(s|ing)?[^,.]*finger)\b/i, tag: 'trailing finger' },
    { pattern: /\b(step(s|ping)?[^,.]*forward)\b/i, tag: 'stepping forward' },
    { pattern: /\b(brush(es|ing)?[^,.]*thigh)\b/i, tag: 'touching thigh' },
  ];
  
  const posesTags = [];
  for (const { pattern, tag } of posePatterns) {
    if (pattern.test(fullContent) && !posesTags.includes(tag)) {
      posesTags.push(tag);
      if (posesTags.length >= 2) break; // Limit to 2 poses
    }
  }

  // 3. CLOTHING - What is the character wearing?
  const clothingPatterns = [
    { pattern: /\b(black top|black dress)\b/i, tag: 'black dress' },
    { pattern: /\b(low[- ]cut|neckline|cleavage)\b/i, tag: 'low-cut neckline, showing cleavage' },
    { pattern: /\b(dress)\b/i, tag: 'elegant dress' },
    { pattern: /\b(skirt)\b/i, tag: 'skirt' },
    { pattern: /\b(maid|apron)\b/i, tag: 'maid outfit with apron' },
    { pattern: /\b(lingerie|underwear|panties|bra)\b/i, tag: 'lingerie' },
    { pattern: /\b(naked|nude|bare|undress)\b/i, tag: 'nude' },
    { pattern: /\b(blouse|shirt)\b/i, tag: 'blouse' },
    { pattern: /\b(stockings|thigh[- ]?high)\b/i, tag: 'thigh-high stockings' },
    { pattern: /\b(heels|high[- ]heels)\b/i, tag: 'high heels' },
    { pattern: /\b(glasses|spectacles)\b/i, tag: 'wearing glasses' },
    { pattern: /\b(necklace|pendant|jewelry)\b/i, tag: 'wearing necklace' },
  ];
  
  const clothingTags = [];
  for (const { pattern, tag } of clothingPatterns) {
    if (pattern.test(fullContent) && !clothingTags.includes(tag)) {
      clothingTags.push(tag);
      if (clothingTags.length >= 2) break;
    }
  }

  // 4. ATMOSPHERE/LIGHTING - What's the mood?
  const atmospherePatterns = [
    { pattern: /\b(dim light|low light|soft light)\b/i, tag: 'dim lighting' },
    { pattern: /\b(candle|candlelight)\b/i, tag: 'candlelight' },
    { pattern: /\b(warm|warmth)\b/i, tag: 'warm atmosphere' },
    { pattern: /\b(dark|night)\b/i, tag: 'dark atmosphere' },
    { pattern: /\b(romantic)\b/i, tag: 'romantic mood' },
    { pattern: /\b(intimate|seductive)\b/i, tag: 'intimate atmosphere' },
    { pattern: /\b(whiskey|vanilla|scent)\b/i, tag: 'intimate bar atmosphere' },
  ];
  
  let atmosphereTag = '';
  for (const { pattern, tag } of atmospherePatterns) {
    if (pattern.test(fullContent)) {
      atmosphereTag = tag;
      break;
    }
  }

  // 5. GAZE/EXPRESSION - Eye contact and expression
  const gazePatterns = [
    { pattern: /\b(dark eyes|eyes dark)\b/i, tag: 'dark seductive eyes' },
    { pattern: /\b(eyes locked|eye contact|looking at you)\b/i, tag: 'looking at viewer' },
    { pattern: /\b(desire|wanting|longing)\b/i, tag: 'longing expression' },
    { pattern: /\b(playful|teasing)\b/i, tag: 'playful expression' },
  ];
  
  let gazeTag = '';
  for (const { pattern, tag } of gazePatterns) {
    if (pattern.test(fullContent)) {
      gazeTag = tag;
      break;
    }
  }

  // ========== ASSEMBLE FINAL PROMPT ==========
  const promptParts = [characterTags];
  
  if (settingTag) promptParts.push(settingTag);
  if (posesTags.length > 0) promptParts.push(...posesTags);
  if (clothingTags.length > 0) promptParts.push(...clothingTags);
  if (gazeTag) promptParts.push(gazeTag);
  if (atmosphereTag) promptParts.push(atmosphereTag);
  
  // Add quality boosters
  promptParts.push('high quality', 'detailed', 'beautiful lighting');
  
  // Fallback if nothing was extracted
  if (promptParts.length <= 2) {
    promptParts.push('intimate scene', 'soft lighting', 'seductive pose');
  }

  const finalPrompt = promptParts.join(', ');
  console.log("[Image Gen] 🎨 Extracted Context:", finalPrompt);

  return finalPrompt;
}

/**
 * Get visual tags for characters - v1.3 ENHANCED
 * Supports standard characters (hardcoded) and custom characters (extracted from description)
 * @param {Object|string} character - Character object or character name
 * @returns {string} Visual description tags for consistent image generation
 */
function getCharacterVisualTags(character) {
  // Handle string input (backwards compatibility)
  const charName = typeof character === 'string' ? character : character?.name;
  const charDescription = typeof character === 'object' ? (character?.description || '') : '';
  const charSystemPrompt = typeof character === 'object' ? (character?.systemPrompt || '') : '';
  const isCustom = typeof character === 'object' && character?.isCustom;

  // STANDARD CHARACTERS - Detailed consistent visual tags
  const standardTags = {
    'Alice': '1girl, alice, young maid, cute face, black hair, short hair, blue eyes, maid outfit, white apron, petite body, shy expression',
    'Sarah': '1girl, sarah, elegant bartender, beautiful woman, long brown hair, wavy hair, green eyes, black dress, low neckline, confident expression, mature woman',
    'Emma': '1girl, emma, shy secretary, glasses, professional attire, brown hair, tied hair, hazel eyes, pencil skirt, blouse, nervous expression',
    'Luna': '1girl, luna, mysterious woman, silver hair, long hair, purple eyes, dark makeup, gothic dress, pale skin, seductive expression',
    'Aria': '1girl, aria, fantasy healer, flowing white dress, long blonde hair, blue eyes, ethereal beauty, soft expression, magical aura'
  };

  // Return standard character tags if found
  if (standardTags[charName]) {
    return standardTags[charName];
  }

  // CUSTOM CHARACTER - Extract visual details from description and systemPrompt
  if (isCustom || !standardTags[charName]) {
    const combinedText = (charDescription + ' ' + charSystemPrompt).toLowerCase();
    const visualParts = [];
    
    // Add character name
    if (charName) {
      visualParts.push(`1girl, ${charName.toLowerCase()}`);
    } else {
      visualParts.push('1girl, beautiful woman');
    }

    // HAIR COLOR detection
    const hairColors = [
      { pattern: /\b(blonde|blond)\b/i, tag: 'blonde hair' },
      { pattern: /\b(brown hair|brunette)\b/i, tag: 'brown hair' },
      { pattern: /\b(black hair|dark hair|raven)\b/i, tag: 'black hair' },
      { pattern: /\b(red hair|redhead|ginger)\b/i, tag: 'red hair' },
      { pattern: /\b(silver hair|white hair|platinum)\b/i, tag: 'silver hair' },
      { pattern: /\b(pink hair)\b/i, tag: 'pink hair' },
      { pattern: /\b(blue hair)\b/i, tag: 'blue hair' },
    ];
    for (const { pattern, tag } of hairColors) {
      if (pattern.test(combinedText)) {
        visualParts.push(tag);
        break;
      }
    }

    // HAIR LENGTH detection
    const hairLengths = [
      { pattern: /\b(long hair)\b/i, tag: 'long hair' },
      { pattern: /\b(short hair)\b/i, tag: 'short hair' },
      { pattern: /\b(ponytail)\b/i, tag: 'ponytail' },
      { pattern: /\b(twintails|pigtails)\b/i, tag: 'twintails' },
      { pattern: /\b(braided|braid)\b/i, tag: 'braided hair' },
    ];
    for (const { pattern, tag } of hairLengths) {
      if (pattern.test(combinedText)) {
        visualParts.push(tag);
        break;
      }
    }

    // EYE COLOR detection
    const eyeColors = [
      { pattern: /\b(blue eyes)\b/i, tag: 'blue eyes' },
      { pattern: /\b(green eyes)\b/i, tag: 'green eyes' },
      { pattern: /\b(brown eyes|hazel)\b/i, tag: 'brown eyes' },
      { pattern: /\b(red eyes|crimson)\b/i, tag: 'red eyes' },
      { pattern: /\b(purple eyes|violet)\b/i, tag: 'purple eyes' },
      { pattern: /\b(golden eyes|amber)\b/i, tag: 'golden eyes' },
    ];
    for (const { pattern, tag } of eyeColors) {
      if (pattern.test(combinedText)) {
        visualParts.push(tag);
        break;
      }
    }

    // BODY TYPE detection
    const bodyTypes = [
      { pattern: /\b(petite|small|slim)\b/i, tag: 'petite body' },
      { pattern: /\b(curvy|voluptuous)\b/i, tag: 'curvy body' },
      { pattern: /\b(athletic|fit|toned)\b/i, tag: 'athletic body' },
      { pattern: /\b(tall)\b/i, tag: 'tall woman' },
      { pattern: /\b(busty|large breasts)\b/i, tag: 'large breasts' },
    ];
    for (const { pattern, tag } of bodyTypes) {
      if (pattern.test(combinedText)) {
        visualParts.push(tag);
        break;
      }
    }

    // OUTFIT/CLOTHING detection
    const outfits = [
      { pattern: /\b(maid|apron)\b/i, tag: 'maid outfit, white apron' },
      { pattern: /\b(nurse)\b/i, tag: 'nurse uniform' },
      { pattern: /\b(school|uniform|student)\b/i, tag: 'school uniform' },
      { pattern: /\b(secretary|office|business)\b/i, tag: 'office attire, pencil skirt' },
      { pattern: /\b(bartender)\b/i, tag: 'bartender outfit' },
      { pattern: /\b(dress)\b/i, tag: 'elegant dress' },
      { pattern: /\b(bikini|swimsuit)\b/i, tag: 'bikini' },
      { pattern: /\b(lingerie|underwear)\b/i, tag: 'lingerie' },
      { pattern: /\b(gothic|dark|vampire)\b/i, tag: 'gothic dress, dark clothing' },
      { pattern: /\b(casual)\b/i, tag: 'casual clothing' },
    ];
    for (const { pattern, tag } of outfits) {
      if (pattern.test(combinedText)) {
        visualParts.push(tag);
        break;
      }
    }

    // EXPRESSION detection
    const expressions = [
      { pattern: /\b(shy|timid|nervous)\b/i, tag: 'shy expression' },
      { pattern: /\b(confident|bold|dominant)\b/i, tag: 'confident expression' },
      { pattern: /\b(seductive|sultry|flirty)\b/i, tag: 'seductive expression' },
      { pattern: /\b(innocent|naive|pure)\b/i, tag: 'innocent expression' },
      { pattern: /\b(stern|strict|serious)\b/i, tag: 'stern expression' },
      { pattern: /\b(kind|gentle|warm)\b/i, tag: 'gentle expression' },
    ];
    for (const { pattern, tag } of expressions) {
      if (pattern.test(combinedText)) {
        visualParts.push(tag);
        break;
      }
    }

    // If we found visual details, return them
    if (visualParts.length > 1) {
      console.log('[Image Gen] 🎨 Custom character visual tags:', visualParts.join(', '));
      return visualParts.join(', ');
    }
  }

  // FALLBACK - Generic beautiful character
  return `1girl, ${charName || 'beautiful woman'}, beautiful face`;
}

/**
 * Extract visual context from multiple conversation messages
 * v1.3: LAST MESSAGE FIRST - The very last AI message has priority #1
 * @param {Array} messages - Full message array from conversation
 * @param {Object|string} character - Full character object or character name
 * @returns {string} Rich visual prompt combining recent context
 */
export function extractConversationContext(messages, character = '') {
  const charName = typeof character === 'string' ? character : character?.name;
  console.log('[Image Gen] 📸 Starting context extraction for character:', charName);
  
  if (!messages || messages.length === 0) {
    console.log('[Image Gen] ⚠️ No messages found, using fallback');
    return cleanContextForImage('', character);
  }

  // Get AI messages only
  const allAiMessages = messages.filter(m => m.role === 'assistant' && m.content);
  
  if (allAiMessages.length === 0) {
    const lastMessage = messages[messages.length - 1];
    console.log('[Image Gen] ⚠️ No AI content, using last message fallback');
    return cleanContextForImage(lastMessage?.content || '', character);
  }

  // v1.3: LAST MESSAGE = PRIORITY #1, then older for context
  // The VERY LAST AI message is the current scene (absolute priority)
  const lastAiMessage = allAiMessages[allAiMessages.length - 1];
  const secondLastAi = allAiMessages.length > 1 ? allAiMessages[allAiMessages.length - 2] : null;
  const olderAi = allAiMessages.slice(-4, -2); // Even older for setting

  // Priority 1: The LAST message (current scene/action)
  const priorityContent = lastAiMessage.content;
  
  // Priority 2: Second-to-last message (context)
  const contextContent = secondLastAi ? secondLastAi.content : '';
  
  // Background: Older messages for setting
  const backgroundContent = olderAi.map(m => m.content).join(' ');

  console.log('[Image Gen] ✨ Priority 1 (LAST): Content length', priorityContent.length);
  console.log('[Image Gen] 📝 Priority 2 (Context): Content length', contextContent.length);
  console.log('[Image Gen] 📝 Background messages:', olderAi.length);

  // Pass all contents with priority weighting
  return cleanContextForImageWithPriority(priorityContent, contextContent + ' ' + backgroundContent, character);
}

/**
 * Clean conversation with priority weighting
 * Recent content takes priority for actions/poses, older content for setting
 * @param {string} recentText - Most recent AI message content (priority 1)
 * @param {string} olderText - Older messages for background context
 * @param {Object|string} character - Full character object or name
 */
function cleanContextForImageWithPriority(recentText, olderText, character = '') {
  const characterTags = character ? getCharacterVisualTags(character) : '1girl, beautiful woman';

  if (!recentText && !olderText) return `${characterTags}, intimate scene, soft lighting`;

  // Extract actions from asterisks in RECENT text (priority)
  const recentActions = recentText.match(/\*([^*]+)\*/g);
  const recentActionContent = recentActions 
    ? recentActions.map(m => m.replace(/\*/g, '').trim()).join(' ') 
    : '';

  // v1.8: MULTILINGUAL PREPROCESSING - Translate all foreign terms to English first
  const recentFull = translateToEnglish((recentActionContent + ' ' + recentText).toLowerCase());
  const olderFull = translateToEnglish(olderText.toLowerCase());

  // ========== PRIORITY EXTRACTION (RECENT FIRST) ==========
  // v1.5: COMPREHENSIVE NSFW PATTERN LIBRARY
  // All actions translated to VISUAL STATES for single-person SD images

  // 1. INTIMATE/EXPLICIT STATES - What the CHARACTER looks like
  const intimatePatterns = [
    // ============ BASIC INTIMATE ============
    // KISSING
    { pattern: /\b(kiss(es|ing|ed)?)\b/i, tag: 'closed eyes, parted lips, flushed cheeks' },
    { pattern: /\b(lips?[^,.]*against|press(es|ing)?[^,.]*lips?)\b/i, tag: 'closed eyes, soft lips, intimate expression' },
    { pattern: /\b(tongue|french kiss)\b/i, tag: 'tongue visible, open mouth, saliva' },
    { pattern: /\b(make[^,.]*out)\b/i, tag: 'passionate kiss, messy hair' },
    
    // PLEASURE EXPRESSIONS
    { pattern: /\b(moan(s|ing)?|gasp(s|ing)?|groan(s|ing)?|whimper)\b/i, tag: 'open mouth, closed eyes, pleasure expression, blushing' },
    { pattern: /\b(orgasm|climax|cum(s|ming)?|finish)\b/i, tag: 'ecstatic expression, open mouth, closed eyes, sweating, ahegao' },
    { pattern: /\b(pant(s|ing)?|breath(e|ing)?[^,.]*(heavy|hard)|breathless)\b/i, tag: 'parted lips, heavy breathing, flushed, panting' },
    { pattern: /\b(scream(s|ing)?[^,.]*pleasure|cry[^,.]*out)\b/i, tag: 'screaming in pleasure, tears of joy' },
    
    // AROUSAL
    { pattern: /\b(arous(ed|al)|turn(ed)?[^,.]*on|excit(ed|ement)|horny)\b/i, tag: 'flushed cheeks, bedroom eyes, seductive gaze, blushing' },
    { pattern: /\b(wet|dripping|slick|juice)\b/i, tag: 'sweating, glistening skin, wet' },
    { pattern: /\b(hard nipple|erect nipple|nipple|areola)\b/i, tag: 'erect nipples visible, perky breasts' },
    { pattern: /\b(throb(s|bing)?|pulse|quiver)\b/i, tag: 'trembling, anticipation expression' },
    
    // ============ UNDRESSING / CLOTHING STATES ============
    { pattern: /\b(undress(es|ing)?|strip(s|ping)?|remov(e|es|ing)[^,.]*cloth)\b/i, tag: 'partially undressed, clothes falling off' },
    { pattern: /\b(tear[^,.]*open|rip[^,.]*off|torn)\b/i, tag: 'torn clothing, exposed skin' },
    { pattern: /\b(shirt[^,.]*open|unbutton|blouse[^,.]*open)\b/i, tag: 'open shirt, exposed cleavage' },
    { pattern: /\b(pull[^,.]*down|slide[^,.]*off)\b/i, tag: 'clothes being removed, exposed' },
    
    // ============ BODY TOUCHING ============
    // BREASTS
    { pattern: /\b(grip(s|ping)?[^,.]*breast|grab(s|bing)?[^,.]*breast|touch(es|ing)?[^,.]*breast|fondle|grope|squeeze[^,.]*breast)\b/i, tag: 'hands on breasts, breast grab, groping pose' },
    { pattern: /\b(suck(s|ing)?[^,.]*nipple|lick(s|ing)?[^,.]*nipple|bite[^,.]*nipple)\b/i, tag: 'arched back, nipple stimulation, pleasure' },
    { pattern: /\b(milk(ing)?|lactate|breast milk)\b/i, tag: 'lactating, breast milk, nursing' },
    
    // ASS
    { pattern: /\b(grip(s|ping)?[^,.]*ass|grab(s|bing)?[^,.]*ass|touch(es|ing)?[^,.]*ass|squeeze[^,.]*ass)\b/i, tag: 'bent over pose, ass grab, hand on hip' },
    { pattern: /\b(spank(s|ing|ed)?|slap[^,.]*ass)\b/i, tag: 'bent over, red marks on ass, spanking pose' },
    { pattern: /\b(spread[^,.]*cheeks?|spread[^,.]*ass)\b/i, tag: 'spreading pose, exposed from behind' },
    
    // THIGHS/LEGS
    { pattern: /\b(grip(s|ping)?[^,.]*thigh|touch(es|ing)?[^,.]*thigh|between[^,.]*thighs?)\b/i, tag: 'thighs spread, hands on thighs' },
    { pattern: /\b(spread[^,.]*legs?|open[^,.]*legs?|part[^,.]*legs?)\b/i, tag: 'legs spread wide, seductive pose, M-pose' },
    { pattern: /\b(wrap[^,.]*legs?|legs?[^,.]*around)\b/i, tag: 'legs wrapped, holding pose' },
    
    // PUSSY/VAGINA
    { pattern: /\b(touch(es|ing)?[^,.]*(puss|clit|vagina)|finger(s|ing)?|rub(s|bing)?[^,.]*clit)\b/i, tag: 'hand between legs, masturbating, touching self' },
    { pattern: /\b(insert(s|ing)?|inside|enter(s|ing)?[^,.]*her)\b/i, tag: 'penetrated, filled expression, open mouth' },
    { pattern: /\b(lick(s|ing)?[^,.]*(puss|clit)|eat(s|ing)?[^,.]*out|cunnilingus)\b/i, tag: 'legs spread, receiving oral, pleasure face' },
    
    // ============ ORAL SEX ============
    { pattern: /\b(suck(s|ing)?[^,.]*(cock|dick|shaft)|blow(s|ing)?[^,.]*job|fellatio)\b/i, tag: 'on knees, looking up, open mouth, tongue out, kneeling blowjob' },
    { pattern: /\b(lick(s|ing)?[^,.]*(cock|dick|shaft|tip|head))\b/i, tag: 'tongue on shaft, licking pose, seductive eyes' },
    { pattern: /\b(deep[^,.]*throat|gag(s|ging)?|chok(e|ing))\b/i, tag: 'deepthroat, teary eyes, saliva dripping, messy' },
    { pattern: /\b(mouth[^,.]*full|stuff(ed|ing)?[^,.]*mouth)\b/i, tag: 'mouth full, bulging cheeks' },
    { pattern: /\b(swallow(s|ing)?|gulp)\b/i, tag: 'swallowing, throat visible, satisfied look' },
    
    // ============ SEX POSITIONS ============
    { pattern: /\b(penetrat|enter(s|ing)?|thrust(s|ing)?|fuck(s|ing)?|pound(s|ing)?|plow)\b/i, tag: 'being penetrated, ecstatic expression, arched back, open mouth' },
    { pattern: /\b(ride(s|ing)?|grind(s|ing)?[^,.]*hips?|cowgirl|on top)\b/i, tag: 'cowgirl position, riding pose, hips forward, bouncing' },
    { pattern: /\b(reverse[^,.]*cowgirl)\b/i, tag: 'reverse cowgirl, looking back, ass view' },
    { pattern: /\b(from behind|doggy|bent over|rear)\b/i, tag: 'doggystyle, on all fours, looking back, arched back' },
    { pattern: /\b(missionary|on[^,.]*back|lying[^,.]*down)\b/i, tag: 'lying on back, legs up, missionary position' },
    { pattern: /\b(straddle|lap|sitting[^,.]*on)\b/i, tag: 'straddling, lap sitting, facing viewer' },
    { pattern: /\b(against[^,.]*wall|wall[^,.]*fuck)\b/i, tag: 'pressed against wall, leg lifted, standing sex' },
    { pattern: /\b(standing[^,.]*sex|standing[^,.]*fuck)\b/i, tag: 'standing position, one leg up' },
    { pattern: /\b(69|sixty[- ]?nine)\b/i, tag: '69 position, mutual oral' },
    
    // ============ ANAL ============
    { pattern: /\b(anal|ass[^,.]*fuck|butt[^,.]*fuck)\b/i, tag: 'anal penetration, tight expression, gripping sheets' },
    { pattern: /\b(rim(s|ming)?|lick(s|ing)?[^,.]*ass|ass[^,.]*lick)\b/i, tag: 'rimming, face buried, spread cheeks' },
    { pattern: /\b(plug|butt[^,.]*plug|anal[^,.]*toy)\b/i, tag: 'butt plug visible, toy inserted' },
    
    // ============ BDSM / BONDAGE ============
    { pattern: /\b(tie(d|s|ing)?|bound|bind(s|ing)?|rope)\b/i, tag: 'tied up, rope bondage, shibari, bound hands' },
    { pattern: /\b(handcuff(s|ed)?|cuff(s|ed)?|restrain(ed|t)?)\b/i, tag: 'handcuffed, hands behind back, restrained' },
    { pattern: /\b(chain(s|ed)?|collar(ed)?|leash)\b/i, tag: 'collar and leash, chained, pet play' },
    { pattern: /\b(blind(fold)?|eyes[^,.]*covered)\b/i, tag: 'blindfolded, silk blindfold, sensory deprivation' },
    { pattern: /\b(gag(ged)?|ball[^,.]*gag|mouth[^,.]*gag)\b/i, tag: 'ball gag, gagged, drooling, muffled' },
    { pattern: /\b(whip(ped|ping)?|flog(ged|ging)?|lash)\b/i, tag: 'whip marks, red welts, pain expression' },
    { pattern: /\b(spank(ed|ing)?|paddle(d)?)\b/i, tag: 'red ass cheeks, spanking marks' },
    { pattern: /\b(suspend(ed)?|hang(ing)?)\b/i, tag: 'suspended, hanging bondage, helpless' },
    { pattern: /\b(cage(d)?|imprison)\b/i, tag: 'in cage, imprisoned, captive' },
    
    // ============ DOMINANCE / SUBMISSION ============
    { pattern: /\b(domin(ate|ant|ation)|mistress|master)\b/i, tag: 'dominant pose, confident expression, commanding' },
    { pattern: /\b(submis(sive|sion)|sub|obey|obedient)\b/i, tag: 'submissive pose, lowered gaze, kneeling' },
    { pattern: /\b(beg(s|ging)?|plead(s|ing)?)\b/i, tag: 'begging pose, pleading eyes, on knees' },
    { pattern: /\b(worship|serve|service)\b/i, tag: 'worship pose, devoted expression' },
    { pattern: /\b(degrad(e|ed|ing)|humiliat(e|ed|ing))\b/i, tag: 'humiliated expression, blushing, embarrassed' },
    { pattern: /\b(punish(ed|ment)?)\b/i, tag: 'being punished, pain and pleasure' },
    { pattern: /\b(order(s|ed)?|command(s|ed)?)\b/i, tag: 'following orders, obedient pose' },
    
    // ============ FOOT FETISH ============
    { pattern: /\b(feet|foot|toes?|sole(s)?)\b/i, tag: 'bare feet visible, pretty feet, painted toenails' },
    { pattern: /\b(lick(s|ing)?[^,.]*feet|lick(s|ing)?[^,.]*toes?|suck(s|ing)?[^,.]*toes?)\b/i, tag: 'foot worship, toe sucking, licking feet' },
    { pattern: /\b(foot[^,.]*job|feet[^,.]*on)\b/i, tag: 'footjob, feet on crotch, foot fetish' },
    { pattern: /\b(heel(s)?|stiletto|high[^,.]*heel)\b/i, tag: 'high heels, stilettos, sexy shoes' },
    { pattern: /\b(stockings?|thigh[^,.]*high|nylon)\b/i, tag: 'stockings, thigh highs, nylon legs' },
    { pattern: /\b(barefoot|no shoes)\b/i, tag: 'barefoot, bare soles, feet focus' },
    
    // ============ NON-CONSENSUAL / ROUGH ============
    { pattern: /\b(force(d|s|ing)?|forc(ful|ibly))\b/i, tag: 'forced, struggling, resistance' },
    { pattern: /\b(resist(s|ing|ance)?|struggle|fight(s|ing)?[^,.]*back)\b/i, tag: 'struggling, resistance, trying to escape' },
    { pattern: /\b(overpower(ed)?|pin(ned|ning)?[^,.]*down)\b/i, tag: 'pinned down, overpowered, helpless' },
    { pattern: /\b(rough|hard|brutal|violent)\b/i, tag: 'rough sex, intense expression, messy' },
    { pattern: /\b(rape|ravish|violate)\b/i, tag: 'non-consensual, tears, struggling' },
    { pattern: /\b(unwilling|reluctant|hesitant)\b/i, tag: 'reluctant expression, conflicted, hesitant' },
    { pattern: /\b(choke|choking|strangle)\b/i, tag: 'hand on throat, choking, breathplay' },
    { pattern: /\b(slap(ped|ping)?[^,.]*face)\b/i, tag: 'face slap, red cheek, shocked expression' },
    { pattern: /\b(hair[^,.]*pull|grab(s|bing)?[^,.]*hair)\b/i, tag: 'hair pulled back, head tilted, pain expression' },
    
    // ============ FANTASY RACES / CHARACTERS ============
    { pattern: /\b(elf|elven|elvish)\b/i, tag: 'elf ears, pointed ears, ethereal beauty' },
    { pattern: /\b(dark[^,.]*elf|drow)\b/i, tag: 'dark elf, dark skin, white hair, pointed ears' },
    { pattern: /\b(demon|devil|succubus)\b/i, tag: 'demon horns, demon tail, succubus, bat wings' },
    { pattern: /\b(angel|angelic|celestial)\b/i, tag: 'angel wings, halo, divine beauty, white feathers' },
    { pattern: /\b(vampire|vampir)\b/i, tag: 'vampire fangs, pale skin, red eyes, gothic' },
    { pattern: /\b(werewolf|wolf[^,.]*girl|kemono)\b/i, tag: 'wolf ears, tail, feral eyes, claws' },
    { pattern: /\b(cat[^,.]*girl|neko|nya)\b/i, tag: 'cat ears, cat tail, nekomimi' },
    { pattern: /\b(bunny[^,.]*girl|rabbit)\b/i, tag: 'bunny ears, bunny tail, playboy bunny' },
    { pattern: /\b(fox[^,.]*girl|kitsune)\b/i, tag: 'fox ears, fox tail, kitsune' },
    { pattern: /\b(dragon[^,.]*girl|dragonkin)\b/i, tag: 'dragon horns, dragon tail, scales, dragon wings' },
    { pattern: /\b(mermaid|siren)\b/i, tag: 'mermaid tail, scales, underwater, fins' },
    { pattern: /\b(fairy|pixie|fae)\b/i, tag: 'fairy wings, tiny, glowing, magical' },
    { pattern: /\b(witch|sorceress|mage|wizard)\b/i, tag: 'witch hat, magic staff, spellcasting, magical aura' },
    { pattern: /\b(priestess|cleric|nun)\b/i, tag: 'religious outfit, holy symbol, prayer pose' },
    { pattern: /\b(princess|queen|royal)\b/i, tag: 'crown, royal dress, regal, tiara' },
    { pattern: /\b(knight|warrior|amazon)\b/i, tag: 'armor, warrior, battle-ready, shield' },
    { pattern: /\b(goblin|orc)\b/i, tag: 'green skin, tribal, monster girl' },
    { pattern: /\b(slime[^,.]*girl)\b/i, tag: 'translucent body, slime, gooey' },
    { pattern: /\b(robot|android|cyborg)\b/i, tag: 'robotic parts, android, mechanical, glowing eyes' },
    { pattern: /\b(alien)\b/i, tag: 'alien, exotic skin color, unusual eyes' },
    
    // ============ TENTACLES / MONSTERS ============
    { pattern: /\b(tentacle(s)?)\b/i, tag: 'tentacles, wrapped by tentacles, tentacle penetration' },
    { pattern: /\b(monster|creature|beast)\b/i, tag: 'monster, creature, beast' },
    { pattern: /\b(plant|vine(s)?)\b/i, tag: 'vines wrapping, plant tentacles' },
    
    // ============ EXHIBITIONISM / VOYEURISM ============
    { pattern: /\b(exhibiti|flash(es|ing)?|expos(e|ing)?[^,.]*public)\b/i, tag: 'exhibitionism, public exposure, daring' },
    { pattern: /\b(voyeur|watch(ed|ing)?|spy(ing)?|peep)\b/i, tag: 'being watched, voyeurism, aware of viewer' },
    { pattern: /\b(caught|discover(ed)?|walk(ed)?[^,.]*in)\b/i, tag: 'caught in act, surprised expression, embarrassed' },
    { pattern: /\b(public|outside|outdoor)\b/i, tag: 'public setting, outdoors, risky' },
    { pattern: /\b(hidden|secret|forbidden)\b/i, tag: 'secret encounter, forbidden, hidden' },
    
    // ============ GROUP / MULTI ============
    { pattern: /\b(threesome|3some|three[^,.]*way)\b/i, tag: 'threesome, multiple partners' },
    { pattern: /\b(gangbang|gang[^,.]*bang|multiple[^,.]*partner)\b/i, tag: 'gangbang, surrounded, multiple' },
    { pattern: /\b(orgy|group[^,.]*sex)\b/i, tag: 'orgy, group activity' },
    { pattern: /\b(double[^,.]*penetration|dp)\b/i, tag: 'double penetration, filled completely' },
    
    // ============ LESBIAN / YURI ============
    { pattern: /\b(lesbian|girl[^,.]*on[^,.]*girl|yuri)\b/i, tag: 'yuri, girl love, lesbian' },
    { pattern: /\b(scissor(s|ing)?|tribad)\b/i, tag: 'scissoring, tribbing, grinding' },
    { pattern: /\b(strap[- ]?on|dildo)\b/i, tag: 'strap-on, dildo, toy' },
    
    // ============ SPECIAL FETISHES ============
    { pattern: /\b(pregnant|breed(ing)?|impreg)\b/i, tag: 'pregnant, baby bump, breeding' },
    { pattern: /\b(creampie|cum[^,.]*inside|fill(ed)?[^,.]*cum)\b/i, tag: 'creampie, cum dripping, filled' },
    { pattern: /\b(facial|cum[^,.]*on[^,.]*face)\b/i, tag: 'facial, cum on face, messy face' },
    { pattern: /\b(bukkake|covered[^,.]*cum)\b/i, tag: 'bukkake, covered in cum, messy' },
    { pattern: /\b(ahegao|fucked[^,.]*silly|mind[^,.]*break)\b/i, tag: 'ahegao, tongue out, rolling eyes, fucked silly' },
    { pattern: /\b(drool(ing)?|saliva|spit)\b/i, tag: 'drooling, saliva string, messy' },
    { pattern: /\b(sweat(y|ing)?|perspir)\b/i, tag: 'sweating, glistening, wet skin' },
    { pattern: /\b(tan[^,.]*line|tanline)\b/i, tag: 'tanlines, bikini tan' },
    { pattern: /\b(body[^,.]*writing|degrading[^,.]*words?)\b/i, tag: 'body writing, degrading text on skin' },
    { pattern: /\b(pet[^,.]*play|puppy|kitty[^,.]*play)\b/i, tag: 'pet play, collar, on all fours, pet pose' },
    { pattern: /\b(maid|serv(e|ant))\b/i, tag: 'maid outfit, serving, domestic' },
    { pattern: /\b(nurse|doctor|medical)\b/i, tag: 'nurse outfit, medical play, uniform' },
    { pattern: /\b(school[^,.]*girl|student|uniform)\b/i, tag: 'school uniform, sailor uniform, student' },
    { pattern: /\b(teacher|sensei|professor)\b/i, tag: 'teacher, glasses, strict, authority' },
    { pattern: /\b(office|secretary|boss)\b/i, tag: 'office lady, professional, business attire' },
    { pattern: /\b(gym|workout|exercise|sport)\b/i, tag: 'sports outfit, athletic, sweaty, fit body' },
    { pattern: /\b(swimsuit|bikini|beach)\b/i, tag: 'bikini, swimsuit, beach, wet' },
    { pattern: /\b(cosplay|costume)\b/i, tag: 'cosplay, costume, character outfit' },
    
    // ============ EMBRACE / INTIMATE NON-SEXUAL ============
    { pattern: /\b(hold(s|ing)?[^,.]*close|pull(s|ing)?[^,.]*closer|embrac)\b/i, tag: 'arms wrapped, close embrace, intimate pose' },
    { pattern: /\b(press(es|ing)?[^,.]*body|body against)\b/i, tag: 'bodies pressed together, intimate' },
    { pattern: /\b(cuddle|snuggle|spoon)\b/i, tag: 'cuddling, spooning, intimate embrace' },
    { pattern: /\b(lap[^,.]*pillow|head[^,.]*lap)\b/i, tag: 'lap pillow, head on lap, caring' },
    
    // ============ POST-SEX STATES ============
    { pattern: /\b(afterglow|after[^,.]*sex|post[^,.]*sex)\b/i, tag: 'afterglow, satisfied, messy hair, relaxed' },
    { pattern: /\b(exhaust(ed)?|tire(d)?|worn[^,.]*out)\b/i, tag: 'exhausted, tired, satisfied, sweaty' },
    { pattern: /\b(collapse(d)?|spent)\b/i, tag: 'collapsed, spent, blissful' },
    { pattern: /\b(messy|disheveled|ruined)\b/i, tag: 'messy appearance, disheveled, ruined makeup' },
    
    // ============ ADDITIONAL ROLEPLAY SCENARIOS ============
    // AGE ROLEPLAY
    { pattern: /\b(innocent|naive|first[^,.]*time)\b/i, tag: 'innocent expression, naive, inexperienced' },
    { pattern: /\b(virgin|untouched|pure)\b/i, tag: 'virgin, innocent, pure, nervous' },
    { pattern: /\b(experienc(ed|e)|taught|learn|teach)\b/i, tag: 'learning, being taught, curious expression' },
    { pattern: /\b(older|mature|milf|cougar)\b/i, tag: 'mature woman, milf, experienced, confident' },
    { pattern: /\b(young|youthful|petite)\b/i, tag: 'youthful appearance, petite, small frame' },
    
    // RELATIONSHIP ROLEPLAY
    { pattern: /\b(step[^,.]*mom|stepmom|step[^,.]*mother)\b/i, tag: 'stepmother roleplay, mature, forbidden' },
    { pattern: /\b(step[^,.]*sis|stepsister|step[^,.]*sister)\b/i, tag: 'stepsister roleplay, taboo, sneaky' },
    { pattern: /\b(step[^,.]*dad|stepdad|step[^,.]*father)\b/i, tag: 'stepfather scenario, authority, taboo' },
    { pattern: /\b(neighbor|next[^,.]*door)\b/i, tag: 'neighbor, casual setting, familiar' },
    { pattern: /\b(landlord|tenant)\b/i, tag: 'landlord scenario, power dynamic' },
    { pattern: /\b(babysitter|nanny)\b/i, tag: 'babysitter, youthful, uniform' },
    { pattern: /\b(tutor|private[^,.]*lesson)\b/i, tag: 'tutor, one-on-one, teaching' },
    { pattern: /\b(ex[^,.]*girlfriend|ex[^,.]*boyfriend|ex)\b/i, tag: 'revenge sex, passionate, emotional' },
    { pattern: /\b(best[^,.]*friend|bff)\b/i, tag: 'best friend, familiar, intimate' },
    { pattern: /\b(stranger|unknown|anonymous)\b/i, tag: 'stranger, mysterious, anonymous encounter' },
    
    // WORKPLACE SCENARIOS
    { pattern: /\b(ceo|executive|businessman)\b/i, tag: 'CEO, power suit, executive, wealthy' },
    { pattern: /\b(intern|assistant|subordinate)\b/i, tag: 'intern, subordinate, eager to please' },
    { pattern: /\b(interview|job[^,.]*interview|hiring)\b/i, tag: 'job interview, nervous, professional' },
    { pattern: /\b(meeting|conference|boardroom)\b/i, tag: 'office meeting, professional setting' },
    { pattern: /\b(coworker|colleague|office[^,.]*romance)\b/i, tag: 'coworker, office romance, sneaky' },
    { pattern: /\b(delivery|pizza|repair(man)?)\b/i, tag: 'delivery person, casual, unexpected' },
    { pattern: /\b(plumber|electrician|handyman)\b/i, tag: 'handyman, working clothes, muscular' },
    { pattern: /\b(photographer|model|photoshoot)\b/i, tag: 'photoshoot, model pose, camera, studio lighting' },
    { pattern: /\b(stripper|pole[^,.]*danc|lap[^,.]*dance)\b/i, tag: 'stripper, pole dancing, g-string, stage' },
    { pattern: /\b(escort|prostitute|hooker|whore)\b/i, tag: 'escort, paid encounter, professional' },
    { pattern: /\b(masseuse|massage|spa)\b/i, tag: 'massage, oiled body, spa, relaxed' },
    
    // AUTHORITY FIGURES
    { pattern: /\b(police|cop|officer|arrest)\b/i, tag: 'police uniform, handcuffs, authority' },
    { pattern: /\b(military|soldier|army|uniform)\b/i, tag: 'military uniform, soldier, disciplined' },
    { pattern: /\b(pilot|flight[^,.]*attendant|stewardess)\b/i, tag: 'flight attendant uniform, professional' },
    { pattern: /\b(fireman|firefighter)\b/i, tag: 'firefighter, muscular, heroic' },
    { pattern: /\b(lifeguard|beach[^,.]*patrol)\b/i, tag: 'lifeguard, swimsuit, tanned, fit' },
    { pattern: /\b(coach|trainer|athlete)\b/i, tag: 'coach, athletic, sports outfit' },
    { pattern: /\b(priest|confession|church|sin)\b/i, tag: 'religious setting, confession, forbidden' },
    
    // ============ HISTORICAL / PERIOD SETTINGS ============
    { pattern: /\b(victorian|corset|bustle)\b/i, tag: 'victorian dress, corset, period clothing' },
    { pattern: /\b(medieval|castle|throne)\b/i, tag: 'medieval setting, castle, stone walls' },
    { pattern: /\b(ancient|greek|roman|toga)\b/i, tag: 'ancient setting, toga, classical' },
    { pattern: /\b(pirate|ship|captain)\b/i, tag: 'pirate outfit, ship, treasure' },
    { pattern: /\b(geisha|kimono|japanese[^,.]*traditional)\b/i, tag: 'geisha, kimono, traditional japanese' },
    { pattern: /\b(belly[^,.]*dancer|harem)\b/i, tag: 'belly dancer, harem outfit, exotic' },
    { pattern: /\b(viking|norse|warrior)\b/i, tag: 'viking, fur clothing, nordic' },
    { pattern: /\b(egyptian|pharaoh|cleopatra)\b/i, tag: 'egyptian style, gold jewelry, exotic' },
    { pattern: /\b(tribal|native|indigenous)\b/i, tag: 'tribal, body paint, primal' },
    
    // ============ SCI-FI / FUTURISTIC ============
    { pattern: /\b(space|astronaut|spaceship)\b/i, tag: 'space suit, zero gravity, spaceship' },
    { pattern: /\b(hologram|virtual|vr|simulation)\b/i, tag: 'holographic, virtual reality, digital' },
    { pattern: /\b(clone|duplicate|twin)\b/i, tag: 'clone, identical, mirror' },
    { pattern: /\b(time[^,.]*travel|future|past)\b/i, tag: 'time displaced, anachronistic' },
    { pattern: /\b(experiment|lab|scientist)\b/i, tag: 'laboratory, scientist, experiment' },
    { pattern: /\b(mutation|transform|morph)\b/i, tag: 'transformation, changing, morphing' },
    
    // ============ MIND CONTROL / CORRUPTION ============
    { pattern: /\b(hypno(sis|tize)?|trance|mind[^,.]*control)\b/i, tag: 'hypnotized, blank expression, spiral eyes, trance' },
    { pattern: /\b(brainwash|reprogram|condition)\b/i, tag: 'brainwashed, empty eyes, obedient' },
    { pattern: /\b(corrupt(ed|ion)?|fall(en)?|taint)\b/i, tag: 'corrupted, dark aura, fallen' },
    { pattern: /\b(possess(ed|ion)?|take[^,.]*over)\b/i, tag: 'possessed, glowing eyes, controlled' },
    { pattern: /\b(drug(ged)?|potion|aphrodisiac)\b/i, tag: 'drugged, hazy eyes, intoxicated' },
    { pattern: /\b(spell|enchant|charm|bewitch)\b/i, tag: 'enchanted, magical glow, spellbound' },
    { pattern: /\b(love[^,.]*potion|bimbo|bimbofication)\b/i, tag: 'bimbo, ditzy expression, exaggerated features' },
    
    // ============ BODY MODIFICATIONS ============
    { pattern: /\b(tattoo|ink(ed)?|body[^,.]*art)\b/i, tag: 'tattoos, body art, inked' },
    { pattern: /\b(pierc(e|ed|ing)|body[^,.]*pierc)\b/i, tag: 'piercings, nipple piercing, body jewelry' },
    { pattern: /\b(big[^,.]*breast|huge[^,.]*breast|large[^,.]*breast|busty)\b/i, tag: 'huge breasts, busty, large bust' },
    { pattern: /\b(small[^,.]*breast|flat[^,.]*chest|petite[^,.]*chest)\b/i, tag: 'small breasts, flat chest, petite' },
    { pattern: /\b(thick|curvy|wide[^,.]*hips|pear)\b/i, tag: 'thick thighs, wide hips, curvy' },
    { pattern: /\b(skinny|thin|slender)\b/i, tag: 'skinny, slender, thin waist' },
    { pattern: /\b(muscular|buff|abs|toned|fit)\b/i, tag: 'muscular, toned abs, athletic body' },
    { pattern: /\b(chubby|plump|bbw)\b/i, tag: 'chubby, plump, soft body' },
    { pattern: /\b(short[^,.]*hair|bob[^,.]*cut|pixie)\b/i, tag: 'short hair, bob cut, pixie cut' },
    { pattern: /\b(shaved|bald|hairless)\b/i, tag: 'shaved, smooth, hairless' },
    { pattern: /\b(bush|hairy|pubic[^,.]*hair)\b/i, tag: 'pubic hair, natural, unshaved' },
    
    // ============ FURRY / ANTHRO ============
    { pattern: /\b(furry|anthro|animal[^,.]*ear)\b/i, tag: 'anthro, furry, animal features' },
    { pattern: /\b(dog[^,.]*girl|inu)\b/i, tag: 'dog ears, dog tail, loyal' },
    { pattern: /\b(cow[^,.]*girl|bovine)\b/i, tag: 'cow ears, cow horns, large breasts, cow print' },
    { pattern: /\b(horse[^,.]*girl|centaur)\b/i, tag: 'horse ears, horse tail, centaur' },
    { pattern: /\b(sheep[^,.]*girl|lamb)\b/i, tag: 'sheep ears, fluffy, wool' },
    { pattern: /\b(snake[^,.]*girl|lamia|naga)\b/i, tag: 'snake tail, scales, lamia, forked tongue' },
    { pattern: /\b(spider[^,.]*girl|arachne)\b/i, tag: 'spider body, multiple limbs, arachne' },
    { pattern: /\b(harpy|bird[^,.]*girl)\b/i, tag: 'bird wings, feathers, harpy, talons' },
    { pattern: /\b(shark[^,.]*girl)\b/i, tag: 'shark tail, fins, shark teeth' },
    { pattern: /\b(mouse[^,.]*girl|rat[^,.]*girl)\b/i, tag: 'mouse ears, small, cute' },
    { pattern: /\b(deer[^,.]*girl)\b/i, tag: 'deer ears, antlers, gentle' },
    { pattern: /\b(panda[^,.]*girl)\b/i, tag: 'panda ears, black and white' },
    { pattern: /\b(tiger[^,.]*girl)\b/i, tag: 'tiger ears, stripes, fierce' },
    { pattern: /\b(lion[^,.]*girl)\b/i, tag: 'lion ears, mane, regal' },
    { pattern: /\b(bear[^,.]*girl)\b/i, tag: 'bear ears, fluffy, strong' },
    
    // ============ EXTREME / NICHE FETISHES ============
    { pattern: /\b(vore|eat(en|ing)[^,.]*whole|swallow[^,.]*whole)\b/i, tag: 'vore, being swallowed, consumed' },
    { pattern: /\b(inflation|inflat(e|ed|ing)|balloon)\b/i, tag: 'inflation, inflated body, swelling' },
    { pattern: /\b(giantess|giant|huge[^,.]*size|macro)\b/i, tag: 'giantess, macro, towering, huge' },
    { pattern: /\b(tiny|shrunk|miniature|micro)\b/i, tag: 'tiny, shrunken, micro size' },
    { pattern: /\b(growth|grow(s|ing)|enlarg)\b/i, tag: 'growing, size growth, expansion' },
    { pattern: /\b(smother|face[^,.]*sit|queening)\b/i, tag: 'facesitting, smothering, dominant' },
    { pattern: /\b(armpit|underarm|axilla)\b/i, tag: 'armpit, underarm, sweaty armpits' },
    { pattern: /\b(navel|belly[^,.]*button)\b/i, tag: 'navel focus, belly button, stomach' },
    { pattern: /\b(tickl(e|ing|ish))\b/i, tag: 'tickling, laughing, ticklish' },
    { pattern: /\b(wet[^,.]*and[^,.]*messy|wam|splosh)\b/i, tag: 'wet and messy, covered in substances' },
    { pattern: /\b(oil(ed|y)?|baby[^,.]*oil|lubric)\b/i, tag: 'oiled body, shiny, glistening, lubed' },
    { pattern: /\b(latex|rubber|shiny[^,.]*suit)\b/i, tag: 'latex suit, shiny rubber, tight latex' },
    { pattern: /\b(leather|biker|jacket)\b/i, tag: 'leather outfit, leather jacket, edgy' },
    { pattern: /\b(pvc|vinyl|plastic)\b/i, tag: 'pvc outfit, shiny, tight fitting' },
    { pattern: /\b(spandex|lycra|bodysuit)\b/i, tag: 'spandex bodysuit, tight, form-fitting' },
    { pattern: /\b(zentai|full[^,.]*body[^,.]*suit)\b/i, tag: 'zentai suit, full body covered' },
    { pattern: /\b(vacuum|sealed|trapped)\b/i, tag: 'vacuum sealed, trapped, helpless' },
    { pattern: /\b(electr(ic|o)|shock|stim)\b/i, tag: 'electric stimulation, shocked expression' },
    { pattern: /\b(wax|candle|hot[^,.]*wax)\b/i, tag: 'hot wax, wax dripping, wax play' },
    { pattern: /\b(ice|cold|frozen)\b/i, tag: 'ice play, cold, goosebumps' },
    { pattern: /\b(needle|pierce|pin)\b/i, tag: 'needle play, pain expression' },
    { pattern: /\b(edge|edging|denial)\b/i, tag: 'edging, frustrated expression, desperate' },
    { pattern: /\b(ruin(ed)?[^,.]*orgasm)\b/i, tag: 'ruined orgasm, frustrated, denied' },
    { pattern: /\b(multiple[^,.]*orgasm|continuous)\b/i, tag: 'multiple orgasms, overstimulated, exhausted' },
    { pattern: /\b(squirt(ing)?|female[^,.]*ejaculation)\b/i, tag: 'squirting, female ejaculation, wet' },
    { pattern: /\b(pee|piss|golden[^,.]*shower|watersport)\b/i, tag: 'watersports, wet, golden shower' },
    
    // ============ CLOTHING / ACCESSORIES ============
    { pattern: /\b(apron|naked[^,.]*apron)\b/i, tag: 'naked apron, cooking, domestic' },
    { pattern: /\b(glasses|spectacles|megane)\b/i, tag: 'glasses, intellectual, megane' },
    { pattern: /\b(choker|neck[^,.]*accessory)\b/i, tag: 'choker, neck jewelry, accent' },
    { pattern: /\b(garter|garter[^,.]*belt)\b/i, tag: 'garter belt, stockings, sexy' },
    { pattern: /\b(gloves?|elegant[^,.]*gloves?)\b/i, tag: 'gloves, elegant, formal' },
    { pattern: /\b(mask|masquerade|mysterious)\b/i, tag: 'masquerade mask, mysterious, elegant' },
    { pattern: /\b(veil|bridal|wedding)\b/i, tag: 'bridal veil, wedding dress, bride' },
    { pattern: /\b(tiara|princess|crown)\b/i, tag: 'tiara, princess, royal' },
    { pattern: /\b(ribbon|bow|cute[^,.]*accessory)\b/i, tag: 'hair ribbon, cute bow, accessory' },
    { pattern: /\b(collar|pet|owned)\b/i, tag: 'collar, pet collar, owned' },
    { pattern: /\b(harness|body[^,.]*harness)\b/i, tag: 'body harness, straps, BDSM aesthetic' },
    { pattern: /\b(crop[^,.]*top|midriff)\b/i, tag: 'crop top, midriff visible, casual' },
    { pattern: /\b(miniskirt|short[^,.]*skirt)\b/i, tag: 'miniskirt, short skirt, legs visible' },
    { pattern: /\b(hotpants|short[^,.]*shorts|daisy[^,.]*dukes)\b/i, tag: 'hotpants, short shorts, revealing' },
    { pattern: /\b(sundress|summer[^,.]*dress)\b/i, tag: 'sundress, light dress, summery' },
    { pattern: /\b(nightgown|sleepwear|negligee)\b/i, tag: 'nightgown, negligee, silky, sleepwear' },
    { pattern: /\b(robe|bath[^,.]*robe)\b/i, tag: 'bathrobe, loosely tied, casual' },
    { pattern: /\b(towel|just[^,.]*towel)\b/i, tag: 'wrapped in towel, post-shower' },
    { pattern: /\b(oversized[^,.]*shirt|boyfriend[^,.]*shirt)\b/i, tag: 'oversized shirt, boyfriend shirt, casual' },
    { parameter: /\b(sweater|cozy|warm)\b/i, tag: 'cozy sweater, warm, casual' },
    { pattern: /\b(tank[^,.]*top|sleeveless)\b/i, tag: 'tank top, sleeveless, casual' },
    { pattern: /\b(tube[^,.]*top|strapless)\b/i, tag: 'tube top, strapless, showing shoulders' },
    
    // ============ LOCATIONS / SETTINGS ============
    { pattern: /\b(shower|bathroom|steam)\b/i, tag: 'shower, wet, steam, bathroom' },
    { pattern: /\b(bathtub|bath|bubbles)\b/i, tag: 'bathtub, bubbles, relaxing' },
    { pattern: /\b(pool|swimming|poolside)\b/i, tag: 'pool, swimming, wet, poolside' },
    { pattern: /\b(locker[^,.]*room|changing)\b/i, tag: 'locker room, changing, semi-public' },
    { pattern: /\b(gym|fitness|workout)\b/i, tag: 'gym, workout, sweaty, athletic' },
    { pattern: /\b(sauna|steam[^,.]*room)\b/i, tag: 'sauna, steam, hot, sweaty' },
    { pattern: /\b(library|quiet|study)\b/i, tag: 'library, quiet, books, studying' },
    { pattern: /\b(classroom|school|desk)\b/i, tag: 'classroom, school desk, academic' },
    { pattern: /\b(dorm|college|roommate)\b/i, tag: 'dorm room, college, roommate' },
    { pattern: /\b(car|backseat|vehicle)\b/i, tag: 'car interior, backseat, cramped' },
    { pattern: /\b(alley|dark[^,.]*alley|urban)\b/i, tag: 'dark alley, urban, risky' },
    { pattern: /\b(rooftop|balcony|window)\b/i, tag: 'rooftop, balcony, city view' },
    { pattern: /\b(forest|woods|nature)\b/i, tag: 'forest, nature, outdoor' },
    { pattern: /\b(cave|dungeon|underground)\b/i, tag: 'cave, dungeon, dark, underground' },
    { pattern: /\b(throne[^,.]*room|palace)\b/i, tag: 'throne room, palace, royal setting' },
    { pattern: /\b(temple|shrine|sacred)\b/i, tag: 'temple, shrine, sacred place' },
    { pattern: /\b(prison|cell|jail)\b/i, tag: 'prison cell, bars, captive' },
    { pattern: /\b(hotel|motel|room[^,.]*service)\b/i, tag: 'hotel room, bed, romantic' },
    { pattern: /\b(limo|limousine|luxury[^,.]*car)\b/i, tag: 'limousine, luxury, wealthy' },
    { pattern: /\b(yacht|boat|cruise)\b/i, tag: 'yacht, boat, ocean view, luxury' },
    { pattern: /\b(plane|airplane|mile[^,.]*high)\b/i, tag: 'airplane, mile high, cramped' },
    { pattern: /\b(train|compartment)\b/i, tag: 'train compartment, moving, travel' },
    
    // ============ EXTENDED PLEASURE EXPRESSIONS ============
    { pattern: /\b(shiver(s|ing)?|tremble|shudder)\b/i, tag: 'shivering, trembling, goosebumps' },
    { pattern: /\b(twitch(es|ing)?|spasm)\b/i, tag: 'twitching, muscle spasms, intense' },
    { pattern: /\b(arch(es|ing)?[^,.]*back)\b/i, tag: 'arched back, curved spine, pleasure' },
    { pattern: /\b(curl(s|ing)?[^,.]*toes?)\b/i, tag: 'curling toes, intense pleasure' },
    { pattern: /\b(grip(s|ping)?[^,.]*sheets?|clutch)\b/i, tag: 'gripping sheets, clutching, desperate' },
    { pattern: /\b(bite(s|ing)?[^,.]*lip)\b/i, tag: 'biting lip, suppressing moan' },
    { pattern: /\b(throw(s|ing)?[^,.]*head[^,.]*back)\b/i, tag: 'head thrown back, ecstasy' },
    { pattern: /\b(roll(s|ing)?[^,.]*eyes?)\b/i, tag: 'rolling eyes, overwhelmed' },
    { pattern: /\b(cross[^,.]*eye|ahegao)\b/i, tag: 'crossed eyes, ahegao, fucked silly' },
    { pattern: /\b(drool(s|ing)?|slobber)\b/i, tag: 'drooling, saliva, messy mouth' },
    { pattern: /\b(tear(s)?|cry(ing)?|weep)\b/i, tag: 'tears, crying, emotional' },
    { pattern: /\b(flush(ed)?|red[^,.]*face)\b/i, tag: 'flushed face, red cheeks, embarrassed' },
    { pattern: /\b(sweat(y|ing)?|perspir)\b/i, tag: 'sweating, glistening, wet skin' },
    { pattern: /\b(heart[^,.]*eye|love[^,.]*eye)\b/i, tag: 'heart-shaped pupils, love expression' },
    { pattern: /\b(blank[^,.]*eye|empty[^,.]*eye)\b/i, tag: 'blank eyes, mindbroken, empty gaze' },
    { pattern: /\b(glazed[^,.]*eye|hazy)\b/i, tag: 'glazed eyes, hazy, unfocused' },
    { pattern: /\b(half[^,.]*lid|bedroom[^,.]*eye)\b/i, tag: 'half-lidded eyes, bedroom eyes, seductive' },
    { pattern: /\b(wide[^,.]*eye|shock|surprise)\b/i, tag: 'wide eyes, shocked, surprised' },
    { pattern: /\b(squint|narrow[^,.]*eye)\b/i, tag: 'squinting, narrowed eyes, suspicious' },
    { pattern: /\b(wink(s|ing)?)\b/i, tag: 'winking, playful, flirty' },
    
    // ============ MORE BODY PARTS ============
    { pattern: /\b(neck|throat|adam[^,.]*apple)\b/i, tag: 'exposed neck, throat, vulnerable' },
    { pattern: /\b(collarbone|clavicle)\b/i, tag: 'collarbone visible, elegant' },
    { pattern: /\b(shoulder(s)?|bare[^,.]*shoulder)\b/i, tag: 'bare shoulders, off-shoulder' },
    { pattern: /\b(back|spine|backbone)\b/i, tag: 'bare back, spine visible' },
    { pattern: /\b(hip(s)?|hip[^,.]*bone)\b/i, tag: 'visible hips, hip bones' },
    { pattern: /\b(waist|slim[^,.]*waist)\b/i, tag: 'slim waist, hourglass' },
    { pattern: /\b(stomach|belly|tummy)\b/i, tag: 'flat stomach, belly' },
    { pattern: /\b(abs|six[^,.]*pack)\b/i, tag: 'visible abs, toned stomach' },
    { pattern: /\b(rib(s)?|ribcage)\b/i, tag: 'ribs visible, lean' },
    { pattern: /\b(butt|buttock|rear|bottom)\b/i, tag: 'round butt, shapely rear' },
    { pattern: /\b(thigh[^,.]*gap)\b/i, tag: 'thigh gap, slim legs' },
    { pattern: /\b(calves?|calf)\b/i, tag: 'toned calves, shapely legs' },
    { pattern: /\b(ankle(s)?)\b/i, tag: 'slim ankles, delicate' },
    { pattern: /\b(wrist(s)?)\b/i, tag: 'delicate wrists, feminine' },
    { pattern: /\b(finger(s)?|hand(s)?)\b/i, tag: 'delicate fingers, feminine hands' },
    { pattern: /\b(nail(s)?|manicure)\b/i, tag: 'painted nails, manicured' },
    { pattern: /\b(earlobe|ear)\b/i, tag: 'ear, earlobe, earring' },
    { pattern: /\b(dimple(s)?)\b/i, tag: 'dimples, cute smile' },
    { pattern: /\b(freckle(s)?)\b/i, tag: 'freckles, cute spots' },
    { pattern: /\b(mole|beauty[^,.]*mark)\b/i, tag: 'beauty mark, mole' },
    
    // ============ ADDITIONAL SEX POSITIONS ============
    { pattern: /\b(prone[^,.]*bone|face[^,.]*down)\b/i, tag: 'prone bone, face down, ass up' },
    { pattern: /\b(full[^,.]*nelson)\b/i, tag: 'full nelson, legs spread, exposed' },
    { pattern: /\b(mating[^,.]*press)\b/i, tag: 'mating press, legs up, deep penetration' },
    { pattern: /\b(lotus)\b/i, tag: 'lotus position, intimate, face to face' },
    { pattern: /\b(spooning)\b/i, tag: 'spooning, from behind, intimate' },
    { pattern: /\b(scissor(s|ing)?)\b/i, tag: 'scissoring, tribbing, grinding' },
    { pattern: /\b(pile[^,.]*driver)\b/i, tag: 'piledriver, legs over head' },
    { pattern: /\b(suspended|lifted|carry)\b/i, tag: 'suspended, lifted up, carried' },
    { pattern: /\b(pretzel)\b/i, tag: 'pretzel position, twisted' },
    { pattern: /\b(wheelbarrow)\b/i, tag: 'wheelbarrow position' },
    { pattern: /\b(leap[^,.]*frog)\b/i, tag: 'leapfrog position, bent over' },
    { pattern: /\b(side[^,.]*saddle)\b/i, tag: 'side position, laying' },
    { pattern: /\b(amazon)\b/i, tag: 'amazon position, woman on top' },
    { pattern: /\b(crab)\b/i, tag: 'crab position, reclined' },
    { pattern: /\b(bridge)\b/i, tag: 'bridge position, arched' },
    { pattern: /\b(butter[^,.]*churner)\b/i, tag: 'legs over head, deep angle' },
    { pattern: /\b(sideways|lateral)\b/i, tag: 'sideways position, lying' },
    { pattern: /\b(kneeling)\b/i, tag: 'kneeling position, on knees' },
    { pattern: /\b(table[^,.]*top)\b/i, tag: 'on table, laying back' },
    { pattern: /\b(edge[^,.]*of[^,.]*bed)\b/i, tag: 'edge of bed, hanging off' },
    
    // ============ EXTREME / VIOLENCE ============
    { pattern: /\b(beat(s|ing|en)?|batter)\b/i, tag: 'beaten, bruised, roughed up' },
    { pattern: /\b(blood|bleed(ing)?|bloody)\b/i, tag: 'blood, bleeding, bloody' },
    { pattern: /\b(bruise(d|s)?|black[^,.]*eye)\b/i, tag: 'bruised, bruises, marks' },
    { pattern: /\b(wound(ed)?|injur(e|ed|y))\b/i, tag: 'wounded, injured, hurt' },
    { pattern: /\b(scar(s|red)?)\b/i, tag: 'scarred, scars, battle marks' },
    { pattern: /\b(cut(s)?|slash|gash)\b/i, tag: 'cuts, slashes, wounds' },
    { pattern: /\b(strangle|asphyxi|suffoca|breath[^,.]*play)\b/i, tag: 'strangling, choking, breathplay' },
    { pattern: /\b(hit(s|ting)?|punch(ed|ing)?)\b/i, tag: 'hit, punched, violent' },
    { pattern: /\b(kick(ed|ing)?)\b/i, tag: 'kicked, violence' },
    { pattern: /\b(slap(ped|ping)?|smack)\b/i, tag: 'slapped, red mark, stinging' },
    { pattern: /\b(bite[^,.]*mark|hickey|love[^,.]*bite)\b/i, tag: 'bite marks, hickeys, love bites' },
    { pattern: /\b(scratch(es)?|claw[^,.]*mark)\b/i, tag: 'scratch marks, claw marks' },
    { pattern: /\b(burn(s|ed)?|brand(ed)?)\b/i, tag: 'burn marks, branded, scarred' },
    { pattern: /\b(needle|syringe|inject)\b/i, tag: 'needle, injection, medical' },
    { pattern: /\b(knife|blade|sword)\b/i, tag: 'knife, blade, weapon' },
    { pattern: /\b(gun|pistol|weapon)\b/i, tag: 'gun, weapon, threatening' },
    { pattern: /\b(torture|torment)\b/i, tag: 'torture, torment, suffering' },
    { pattern: /\b(abuse(d)?|mistreat)\b/i, tag: 'abused, mistreated, hurt' },
    { pattern: /\b(humiliate|degrade|shame)\b/i, tag: 'humiliated, degraded, shamed' },
    { pattern: /\b(kidnap|abduct|capture)\b/i, tag: 'kidnapped, captured, bound' },
    
    // ============ MORE FANTASY CREATURES ============
    { pattern: /\b(ghost|spirit|phantom)\b/i, tag: 'ghost, spirit, transparent, ethereal' },
    { pattern: /\b(zombie|undead|corpse)\b/i, tag: 'undead, pale, zombie' },
    { pattern: /\b(skeleton)\b/i, tag: 'skeleton, bones, undead' },
    { pattern: /\b(golem)\b/i, tag: 'golem, stone, construct' },
    { pattern: /\b(dryad|tree[^,.]*spirit)\b/i, tag: 'dryad, nature spirit, leaves' },
    { pattern: /\b(nymph|sprite)\b/i, tag: 'nymph, nature, playful' },
    { pattern: /\b(phoenix|fire[^,.]*bird)\b/i, tag: 'phoenix, fire, burning' },
    { pattern: /\b(unicorn)\b/i, tag: 'unicorn, horn, magical, pure' },
    { pattern: /\b(centaur|horse[^,.]*body)\b/i, tag: 'centaur, horse body, hybrid' },
    { pattern: /\b(minotaur|bull)\b/i, tag: 'minotaur, bull, muscular' },
    { pattern: /\b(satyr|faun|goat)\b/i, tag: 'satyr, goat legs, faun' },
    { pattern: /\b(medusa|gorgon|snake[^,.]*hair)\b/i, tag: 'medusa, snake hair, gorgon' },
    { pattern: /\b(cyclops|one[^,.]*eye)\b/i, tag: 'cyclops, single eye, giant' },
    { pattern: /\b(hydra|multi[^,.]*head)\b/i, tag: 'hydra, multiple heads' },
    { pattern: /\b(kraken|sea[^,.]*monster)\b/i, tag: 'kraken, sea monster, tentacles' },
    { pattern: /\b(griffin|gryphon)\b/i, tag: 'griffin, eagle, lion hybrid' },
    { pattern: /\b(chimera)\b/i, tag: 'chimera, hybrid beast' },
    { pattern: /\b(basilisk|serpent)\b/i, tag: 'basilisk, serpent, deadly gaze' },
    { pattern: /\b(djinn|genie)\b/i, tag: 'genie, djinn, magical, floating' },
    { pattern: /\b(imp)\b/i, tag: 'imp, small demon, mischievous' },
    
    // ============ ANIME / MANGA SPECIFIC ============
    { pattern: /\b(tsundere)\b/i, tag: 'tsundere, blushing, embarrassed, difficult' },
    { pattern: /\b(yandere)\b/i, tag: 'yandere, obsessive, crazy eyes, knife' },
    { pattern: /\b(kuudere)\b/i, tag: 'kuudere, emotionless, cold expression' },
    { pattern: /\b(dandere)\b/i, tag: 'dandere, shy, quiet, timid' },
    { pattern: /\b(gyaru|gal)\b/i, tag: 'gyaru, tan, blonde, flashy makeup' },
    { pattern: /\b(ojousama|rich[^,.]*girl)\b/i, tag: 'ojousama, rich, elegant, drill hair' },
    { pattern: /\b(tomboy)\b/i, tag: 'tomboy, boyish, sporty' },
    { pattern: /\b(yamato[^,.]*nadeshiko)\b/i, tag: 'yamato nadeshiko, traditional, graceful' },
    { pattern: /\b(onesan|older[^,.]*sister)\b/i, tag: 'oneesan, mature, caring, motherly' },
    { pattern: /\b(imouto|younger[^,.]*sister)\b/i, tag: 'imouto, cute, childish, clingy' },
    { pattern: /\b(senpai)\b/i, tag: 'senpai, senior, admired' },
    { pattern: /\b(kouhai)\b/i, tag: 'kouhai, junior, respectful' },
    { pattern: /\b(idol|pop[^,.]*star)\b/i, tag: 'idol, stage outfit, sparkles, cute pose' },
    { pattern: /\b(magical[^,.]*girl|mahou[^,.]*shoujo)\b/i, tag: 'magical girl, transformation, wand, frilly outfit' },
    { pattern: /\b(mecha|robot[^,.]*girl)\b/i, tag: 'mecha, mechanical parts, armor' },
    { pattern: /\b(kemonomimi|animal[^,.]*ear)\b/i, tag: 'kemonomimi, animal ears, tail' },
    { pattern: /\b(lolita[^,.]*fashion|gothic[^,.]*lolita)\b/i, tag: 'gothic lolita fashion, frilly dress, ribbons' },
    { pattern: /\b(miko|shrine[^,.]*maiden)\b/i, tag: 'miko, shrine maiden, red hakama, white top' },
    { pattern: /\b(yukata|festival)\b/i, tag: 'yukata, summer festival, traditional' },
    { pattern: /\b(sailor[^,.]*uniform|seifuku)\b/i, tag: 'sailor uniform, school, pleated skirt' },
    
    // ============ EMOTIONAL STATES ============
    { pattern: /\b(happy|joy(ful)?|delight)\b/i, tag: 'happy, joyful, bright smile' },
    { pattern: /\b(sad|sorrow|melanchol)\b/i, tag: 'sad, sorrowful, teary' },
    { pattern: /\b(angry|rage|fury|furious)\b/i, tag: 'angry, furious, intense expression' },
    { pattern: /\b(fear(ful)?|scared|terrif)\b/i, tag: 'fearful, scared, trembling' },
    { pattern: /\b(disgust|revolt|repulse)\b/i, tag: 'disgusted, repulsed expression' },
    { pattern: /\b(confus(ed|ion)|bewilder)\b/i, tag: 'confused, bewildered, question mark' },
    { pattern: /\b(embarrass|asham|blush)\b/i, tag: 'embarrassed, blushing, shy' },
    { pattern: /\b(proud|confident|smug)\b/i, tag: 'proud, confident, smug expression' },
    { pattern: /\b(guilt(y)?|regret)\b/i, tag: 'guilty, regretful, downcast' },
    { pattern: /\b(jealous|envy)\b/i, tag: 'jealous, envious, bitter' },
    { pattern: /\b(lonely|alone|isolat)\b/i, tag: 'lonely, alone, isolated' },
    { pattern: /\b(desperate|desper)\b/i, tag: 'desperate, pleading, needy' },
    { pattern: /\b(relief|reliev)\b/i, tag: 'relieved, relaxed, calm' },
    { pattern: /\b(excit(ed|ement)|thrill)\b/i, tag: 'excited, thrilled, eyes sparkling' },
    { pattern: /\b(nervous|anxious|worry)\b/i, tag: 'nervous, anxious, worried' },
    { pattern: /\b(bored|unamused)\b/i, tag: 'bored, unamused, disinterested' },
    { pattern: /\b(curious|intrigu)\b/i, tag: 'curious, intrigued, interested' },
    { pattern: /\b(determind|resolute)\b/i, tag: 'determined, resolute, focused' },
    { pattern: /\b(playful|teas(e|ing)|mischiev)\b/i, tag: 'playful, teasing, mischievous' },
    { pattern: /\b(seduct(ive)?|allur(e|ing))\b/i, tag: 'seductive, alluring, tempting' },
    
    // ============ CAMERA ANGLES / VIEWS ============
    { pattern: /\b(pov|first[^,.]*person|your[^,.]*view)\b/i, tag: 'POV, first person view, looking at viewer' },
    { pattern: /\b(close[^,.]*up|face[^,.]*focus)\b/i, tag: 'close-up, face focus, detailed' },
    { pattern: /\b(full[^,.]*body|whole[^,.]*body)\b/i, tag: 'full body, whole figure visible' },
    { pattern: /\b(upper[^,.]*body|portrait)\b/i, tag: 'upper body, portrait, bust shot' },
    { pattern: /\b(lower[^,.]*body)\b/i, tag: 'lower body focus, legs' },
    { pattern: /\b(from[^,.]*behind|back[^,.]*view|rear[^,.]*view)\b/i, tag: 'from behind, back view, ass focus' },
    { pattern: /\b(from[^,.]*below|low[^,.]*angle|worm)\b/i, tag: 'from below, low angle, looking up' },
    { pattern: /\b(from[^,.]*above|high[^,.]*angle|bird)\b/i, tag: 'from above, high angle, looking down' },
    { pattern: /\b(side[^,.]*view|profile)\b/i, tag: 'side view, profile, silhouette' },
    { pattern: /\b(dutch[^,.]*angle|tilted)\b/i, tag: 'dutch angle, tilted, dynamic' },
    { pattern: /\b(symmetr(y|ical))\b/i, tag: 'symmetrical, balanced composition' },
    { pattern: /\b(ass[^,.]*focus|butt[^,.]*focus)\b/i, tag: 'ass focus, rear view, butt emphasized' },
    { pattern: /\b(breast[^,.]*focus|chest[^,.]*focus)\b/i, tag: 'breast focus, cleavage shot' },
    { pattern: /\b(face[^,.]*focus)\b/i, tag: 'face focus, expression visible' },
    { pattern: /\b(feet[^,.]*focus|foot[^,.]*focus)\b/i, tag: 'feet focus, foot shot' },
    { pattern: /\b(crotch[^,.]*focus)\b/i, tag: 'crotch focus, genital area' },
    { pattern: /\b(spread|spreading)\b/i, tag: 'spreading pose, legs apart, open' },
    { pattern: /\b(all[^,.]*fours|hands[^,.]*and[^,.]*knees)\b/i, tag: 'on all fours, hands and knees' },
    { pattern: /\b(lying|laying|reclin)\b/i, tag: 'lying down, reclining, relaxed' },
    { pattern: /\b(squat(ting)?)\b/i, tag: 'squatting, crouching, low stance' },
    
    // ============ ART STYLES / QUALITY ============
    { pattern: /\b(realistic|photo[^,.]*real)\b/i, tag: 'realistic, photorealistic, detailed' },
    { pattern: /\b(anime|manga|japanese)\b/i, tag: 'anime style, manga, japanese art' },
    { pattern: /\b(cartoon|western)\b/i, tag: 'cartoon style, western art' },
    { pattern: /\b(3d|render|cgi)\b/i, tag: '3D render, CGI, rendered' },
    { pattern: /\b(sketch|drawing|pencil)\b/i, tag: 'sketch, pencil drawing, lineart' },
    { pattern: /\b(watercolor|paint(ed|ing)?)\b/i, tag: 'watercolor, painted, artistic' },
    { pattern: /\b(oil[^,.]*paint)\b/i, tag: 'oil painting, classical art' },
    { pattern: /\b(digital[^,.]*art)\b/i, tag: 'digital art, digital painting' },
    { pattern: /\b(pixel[^,.]*art)\b/i, tag: 'pixel art, retro, pixelated' },
    { pattern: /\b(cel[^,.]*shad)\b/i, tag: 'cel shaded, flat colors, anime style' },
    { pattern: /\b(soft[^,.]*shad)\b/i, tag: 'soft shading, smooth gradients' },
    { pattern: /\b(hard[^,.]*shad)\b/i, tag: 'hard shading, high contrast' },
    { pattern: /\b(glow(ing)?|bloom)\b/i, tag: 'glowing, bloom effect, luminous' },
    { pattern: /\b(dark|moody|noir)\b/i, tag: 'dark, moody, noir atmosphere' },
    { pattern: /\b(bright|vibrant|colorful)\b/i, tag: 'bright, vibrant colors, colorful' },
    { pattern: /\b(pastel)\b/i, tag: 'pastel colors, soft tones' },
    { pattern: /\b(monochrome|black[^,.]*white|grayscale)\b/i, tag: 'monochrome, black and white, grayscale' },
    { pattern: /\b(sepia|vintage)\b/i, tag: 'sepia, vintage, old photo' },
    { pattern: /\b(neon|cyberpunk)\b/i, tag: 'neon lights, cyberpunk, futuristic' },
    { pattern: /\b(bokeh|depth[^,.]*of[^,.]*field)\b/i, tag: 'bokeh, depth of field, blurred background' },
    
    // ============ MORE OUTFITS / COSTUMES ============
    { pattern: /\b(cheerleader|pom[^,.]*pom)\b/i, tag: 'cheerleader, pom poms, short skirt' },
    { pattern: /\b(bunny[^,.]*suit|playboy)\b/i, tag: 'bunny suit, leotard, bunny ears, fishnets' },
    { pattern: /\b(catsuit|bodysuit)\b/i, tag: 'catsuit, tight bodysuit, form-fitting' },
    { pattern: /\b(leotard|ballet)\b/i, tag: 'leotard, ballet, dancer' },
    { pattern: /\b(tennis|sport[^,.]*skirt)\b/i, tag: 'tennis outfit, sport skirt, athletic' },
    { pattern: /\b(yoga|exercise[^,.]*wear)\b/i, tag: 'yoga pants, exercise wear, stretching' },
    { pattern: /\b(racing|driver)\b/i, tag: 'racing suit, driver outfit' },
    { pattern: /\b(astronaut|space[^,.]*suit)\b/i, tag: 'astronaut, space suit' },
    { pattern: /\b(superhero|cape)\b/i, tag: 'superhero, cape, costume' },
    { pattern: /\b(villain)\b/i, tag: 'villain, dark costume, evil' },
    { pattern: /\b(ninja|shinobi)\b/i, tag: 'ninja, shinobi, stealth' },
    { pattern: /\b(samurai|katana)\b/i, tag: 'samurai, armor, katana' },
    { pattern: /\b(cowgirl|western)\b/i, tag: 'cowgirl, western, cowboy hat' },
    { pattern: /\b(chef|cook)\b/i, tag: 'chef outfit, cooking, apron' },
    { pattern: /\b(waitress|diner)\b/i, tag: 'waitress uniform, diner, serving' },
    { pattern: /\b(barista|coffee)\b/i, tag: 'barista, coffee shop, apron' },
    { pattern: /\b(librarian|book)\b/i, tag: 'librarian, glasses, books, quiet' },
    { pattern: /\b(gamer|controller)\b/i, tag: 'gamer girl, controller, headset' },
    { pattern: /\b(streamer|camera|live)\b/i, tag: 'streamer, webcam, gaming setup' },
    { pattern: /\b(farmer|country)\b/i, tag: 'farmer, country girl, overalls' },
    
    // ============ MORE ACCESSORIES ============
    { pattern: /\b(headphone|earphone)\b/i, tag: 'headphones, listening, music' },
    { pattern: /\b(sunglasses|shades)\b/i, tag: 'sunglasses, cool, stylish' },
    { pattern: /\b(hat|cap|beanie)\b/i, tag: 'hat, headwear, casual' },
    { pattern: /\b(crown|tiara)\b/i, tag: 'crown, tiara, royal, princess' },
    { pattern: /\b(hairpin|hair[^,.]*clip)\b/i, tag: 'hairpin, hair clip, accessory' },
    { pattern: /\b(headband)\b/i, tag: 'headband, hair accessory' },
    { pattern: /\b(flower[^,.]*crown|wreath)\b/i, tag: 'flower crown, nature, pretty' },
    { pattern: /\b(halo)\b/i, tag: 'halo, angelic, divine' },
    { pattern: /\b(horn(s)?)\b/i, tag: 'horns, demon, devilish' },
    { pattern: /\b(tail)\b/i, tag: 'tail, animal, fantasy' },
    { pattern: /\b(wing(s)?)\b/i, tag: 'wings, flying, fantasy' },
    { pattern: /\b(scarf)\b/i, tag: 'scarf, cozy, winter' },
    { pattern: /\b(necktie|tie)\b/i, tag: 'necktie, formal, professional' },
    { pattern: /\b(bowtie)\b/i, tag: 'bowtie, cute, formal' },
    { pattern: /\b(bracelet|bangle)\b/i, tag: 'bracelet, wrist jewelry' },
    { pattern: /\b(anklet)\b/i, tag: 'anklet, foot jewelry' },
    { pattern: /\b(ring[^,.]*finger|ring)\b/i, tag: 'ring, finger jewelry' },
    { pattern: /\b(necklace|pendant)\b/i, tag: 'necklace, pendant, chest jewelry' },
    { pattern: /\b(earring)\b/i, tag: 'earrings, ear jewelry' },
    { pattern: /\b(belly[^,.]*ring|navel[^,.]*piercing)\b/i, tag: 'belly ring, navel piercing' },
    
    // ============ LIGHTING CONDITIONS ============
    { pattern: /\b(sunset|golden[^,.]*hour)\b/i, tag: 'sunset lighting, golden hour, warm' },
    { pattern: /\b(sunrise|dawn)\b/i, tag: 'sunrise, dawn, soft light' },
    { pattern: /\b(moonlight|night)\b/i, tag: 'moonlight, night, dim' },
    { pattern: /\b(candlelight)\b/i, tag: 'candlelight, romantic, warm glow' },
    { pattern: /\b(spotlight|stage[^,.]*light)\b/i, tag: 'spotlight, stage lighting, dramatic' },
    { pattern: /\b(backlight|silhouette)\b/i, tag: 'backlit, silhouette, rim light' },
    { pattern: /\b(natural[^,.]*light|window[^,.]*light)\b/i, tag: 'natural light, window light, soft' },
    { pattern: /\b(studio[^,.]*light)\b/i, tag: 'studio lighting, professional' },
    { pattern: /\b(flash|bright[^,.]*light)\b/i, tag: 'flash, bright light, exposed' },
    { pattern: /\b(neon|colorful[^,.]*light)\b/i, tag: 'neon lights, colorful lighting' },
    { pattern: /\b(red[^,.]*light)\b/i, tag: 'red lighting, sultry, seductive' },
    { pattern: /\b(blue[^,.]*light)\b/i, tag: 'blue lighting, cool, mysterious' },
    { pattern: /\b(purple[^,.]*light)\b/i, tag: 'purple lighting, mystical' },
    { pattern: /\b(green[^,.]*light)\b/i, tag: 'green lighting, eerie' },
    { pattern: /\b(fire[^,.]*light|flame)\b/i, tag: 'firelight, flames, warm glow' },
    { pattern: /\b(light[^,.]*ray|god[^,.]*ray)\b/i, tag: 'light rays, god rays, dramatic' },
    { pattern: /\b(shadow(s|y)?)\b/i, tag: 'shadows, dark areas, contrast' },
    { pattern: /\b(harsh[^,.]*light)\b/i, tag: 'harsh lighting, high contrast' },
    { pattern: /\b(soft[^,.]*light)\b/i, tag: 'soft lighting, diffused, gentle' },
    { pattern: /\b(dramatic[^,.]*light)\b/i, tag: 'dramatic lighting, chiaroscuro' },
    
    // ============ HENTAI SPECIFIC - BODY TYPES ============
    { pattern: /\b(oppai|big[^,.]*boob|huge[^,.]*tit)\b/i, tag: 'oppai, huge breasts, massive boobs' },
    { pattern: /\b(mega[^,.]*milk|cowtit|udder)\b/i, tag: 'mega milk, cow tits, huge udders' },
    { pattern: /\b(flat|pettanko|washboard)\b/i, tag: 'pettanko, flat chest, small breasts' },
    { pattern: /\b(loli|petite[^,.]*body)\b/i, tag: 'petite body, small frame, young looking' },
    { pattern: /\b(shota)\b/i, tag: 'shota, young male, boyish' },
    { pattern: /\b(milf|ara[^,.]*ara)\b/i, tag: 'milf, ara ara, mature woman, motherly' },
    { pattern: /\b(gilf|granny|grandma)\b/i, tag: 'elderly woman, mature, experienced' },
    { pattern: /\b(thicc|dummy[^,.]*thicc)\b/i, tag: 'thicc, thick thighs, wide hips, big ass' },
    { pattern: /\b(shortstack)\b/i, tag: 'shortstack, short and curvy, thick' },
    { pattern: /\b(tall[^,.]*woman|amazon|giantess)\b/i, tag: 'tall woman, amazon, towering' },
    { pattern: /\b(muscle[^,.]*girl|abs[^,.]*girl)\b/i, tag: 'muscle girl, abs, toned, athletic' },
    { pattern: /\b(plump|chubby[^,.]*girl|bbw)\b/i, tag: 'plump, chubby, soft body, bbw' },
    { pattern: /\b(skinny|thin|bony)\b/i, tag: 'skinny, thin, slender frame' },
    { pattern: /\b(hourglass|perfect[^,.]*body)\b/i, tag: 'hourglass figure, perfect proportions' },
    { pattern: /\b(wide[^,.]*hip|child[^,.]*bear)\b/i, tag: 'wide hips, breeding hips' },
    { pattern: /\b(bubble[^,.]*butt|fat[^,.]*ass)\b/i, tag: 'bubble butt, fat ass, round' },
    { pattern: /\b(long[^,.]*leg|leg[^,.]*day)\b/i, tag: 'long legs, leggy, model legs' },
    { pattern: /\b(zettai[^,.]*ryouiki|absolute[^,.]*territory)\b/i, tag: 'zettai ryouiki, absolute territory, thigh gap' },
    { pattern: /\b(sideboob|underboob)\b/i, tag: 'sideboob, underboob, partial exposure' },
    { pattern: /\b(cleavage|valley)\b/i, tag: 'cleavage, deep valley, breast gap' },
    
    // ============ HENTAI - HAIR STYLES ============
    { pattern: /\b(twintail|pigtail)\b/i, tag: 'twintails, pigtails, twin ponytails' },
    { pattern: /\b(ponytail|high[^,.]*tail)\b/i, tag: 'ponytail, high ponytail' },
    { pattern: /\b(side[^,.]*tail|side[^,.]*ponytail)\b/i, tag: 'side ponytail, asymmetric' },
    { pattern: /\b(braid|plait)\b/i, tag: 'braided hair, plaits' },
    { pattern: /\b(drill[^,.]*hair|ojou[^,.]*curl)\b/i, tag: 'drill hair, ojou curls, ringlets' },
    { pattern: /\b(odango|bun)\b/i, tag: 'odango, hair buns, double buns' },
    { pattern: /\b(bob[^,.]*cut|short[^,.]*bob)\b/i, tag: 'bob cut, short bob' },
    { pattern: /\b(hime[^,.]*cut)\b/i, tag: 'hime cut, princess cut, straight bangs' },
    { pattern: /\b(messy[^,.]*hair|bed[^,.]*head)\b/i, tag: 'messy hair, bed head, disheveled' },
    { pattern: /\b(ahoge|antenna)\b/i, tag: 'ahoge, antenna hair, cowlick' },
    { pattern: /\b(gradient[^,.]*hair|ombre)\b/i, tag: 'gradient hair, ombre, multicolor' },
    { pattern: /\b(streaks?|highlight)\b/i, tag: 'hair streaks, highlights' },
    { pattern: /\b(wet[^,.]*hair|damp)\b/i, tag: 'wet hair, damp, dripping' },
    { pattern: /\b(hair[^,.]*over[^,.]*eye|eye[^,.]*cover)\b/i, tag: 'hair over eye, mysterious' },
    { pattern: /\b(floating[^,.]*hair|wind[^,.]*blown)\b/i, tag: 'floating hair, wind blown, flowing' },
    { pattern: /\b(long[^,.]*hair|very[^,.]*long)\b/i, tag: 'very long hair, floor length' },
    { pattern: /\b(short[^,.]*hair|cropped)\b/i, tag: 'short hair, cropped' },
    { pattern: /\b(wavy[^,.]*hair|curly)\b/i, tag: 'wavy hair, curly, waves' },
    { pattern: /\b(straight[^,.]*hair|sleek)\b/i, tag: 'straight hair, sleek, smooth' },
    { pattern: /\b(spiky[^,.]*hair)\b/i, tag: 'spiky hair, wild' },
    
    // ============ HENTAI - SPECIFIC ACTS ============
    { pattern: /\b(paizuri|titfuck|titjob)\b/i, tag: 'paizuri, titfuck, between breasts' },
    { pattern: /\b(sumata|thigh[^,.]*job|thighjob)\b/i, tag: 'sumata, thighjob, between thighs' },
    { pattern: /\b(assjob|buttjob|hotdog)\b/i, tag: 'assjob, buttjob, between cheeks' },
    { pattern: /\b(handjob|tekoki)\b/i, tag: 'handjob, tekoki, hand on shaft' },
    { pattern: /\b(blowjob|fellatio|irrumatio)\b/i, tag: 'blowjob, fellatio, oral sex' },
    { pattern: /\b(deepthroat|throat[^,.]*fuck)\b/i, tag: 'deepthroat, throat fuck, gagging' },
    { pattern: /\b(facefuck|skull[^,.]*fuck)\b/i, tag: 'facefuck, rough oral, forced' },
    { pattern: /\b(cunnilingus|pussy[^,.]*lick|eating[^,.]*out)\b/i, tag: 'cunnilingus, pussy licking, oral' },
    { pattern: /\b(rimjob|ass[^,.]*lick|analingus)\b/i, tag: 'rimjob, analingus, ass licking' },
    { pattern: /\b(69|sixty[^,.]*nine|mutual[^,.]*oral)\b/i, tag: '69 position, mutual oral' },
    { pattern: /\b(nakadashi|creampie|cum[^,.]*inside)\b/i, tag: 'nakadashi, creampie, internal cumshot' },
    { pattern: /\b(gokkun|cum[^,.]*swallow)\b/i, tag: 'gokkun, swallowing cum, drinking' },
    { pattern: /\b(bukkake|cum[^,.]*bath)\b/i, tag: 'bukkake, covered in cum, cum bath' },
    { pattern: /\b(facial|cum[^,.]*on[^,.]*face)\b/i, tag: 'facial, cum on face, messy' },
    { pattern: /\b(pearl[^,.]*necklace|chest[^,.]*cum)\b/i, tag: 'cum on chest, pearl necklace' },
    { pattern: /\b(cum[^,.]*in[^,.]*hair)\b/i, tag: 'cum in hair, messy hair' },
    { pattern: /\b(cum[^,.]*on[^,.]*body|body[^,.]*cumshot)\b/i, tag: 'cum on body, body cumshot' },
    { pattern: /\b(cum[^,.]*on[^,.]*ass)\b/i, tag: 'cum on ass, ass cumshot' },
    { pattern: /\b(cum[^,.]*on[^,.]*feet)\b/i, tag: 'cum on feet, foot cumshot' },
    { pattern: /\b(x[^,.]*ray|cross[^,.]*section)\b/i, tag: 'x-ray view, cross section, internal view' },
    { pattern: /\b(stomach[^,.]*bulge|womb[^,.]*bulge)\b/i, tag: 'stomach bulge, visible penetration' },
    { pattern: /\b(cervix[^,.]*penetra|womb[^,.]*penetra)\b/i, tag: 'cervix penetration, deep insertion' },
    { pattern: /\b(double[^,.]*penetrat|dp|dvp|dap)\b/i, tag: 'double penetration, both holes filled' },
    { pattern: /\b(triple[^,.]*penetra|all[^,.]*holes)\b/i, tag: 'triple penetration, all holes' },
    { pattern: /\b(fisting|fist[^,.]*insert)\b/i, tag: 'fisting, fist insertion, stretched' },
    { pattern: /\b(gaping|gape|loose)\b/i, tag: 'gaping, stretched open, loose' },
    { pattern: /\b(prolapse)\b/i, tag: 'prolapse, extreme' },
    
    // ============ HENTAI - CUM SITUATIONS ============
    { pattern: /\b(cum[^,.]*drip|dripping[^,.]*cum)\b/i, tag: 'cum dripping, leaking, oozing' },
    { pattern: /\b(cum[^,.]*pool|puddle)\b/i, tag: 'cum pool, puddle of cum' },
    { pattern: /\b(cum[^,.]*overflow|overflowing)\b/i, tag: 'overflowing cum, too much' },
    { pattern: /\b(cum[^,.]*string|cum[^,.]*trail)\b/i, tag: 'cum string, cum trail, connected' },
    { pattern: /\b(cum[^,.]*bubble)\b/i, tag: 'cum bubble, foam' },
    { pattern: /\b(cum[^,.]*inflation|belly[^,.]*full)\b/i, tag: 'cum inflation, belly full of cum' },
    { pattern: /\b(used|cum[^,.]*dump|cumdump)\b/i, tag: 'used, cum dump, filled' },
    { pattern: /\b(sloppy[^,.]*second|reuse)\b/i, tag: 'sloppy seconds, already used' },
    { pattern: /\b(multiple[^,.]*cum|many[^,.]*load)\b/i, tag: 'multiple cumshots, many loads' },
    { pattern: /\b(excessive[^,.]*cum|too[^,.]*much)\b/i, tag: 'excessive cum, unrealistic amount' },
    
    // ============ HENTAI - CENSORSHIP ============
    { pattern: /\b(uncensor|decensor|no[^,.]*censor)\b/i, tag: 'uncensored, explicit, visible genitals' },
    { pattern: /\b(censor|mosaic|pixelat)\b/i, tag: 'censored, mosaic, pixelated' },
    { pattern: /\b(bar[^,.]*censor|black[^,.]*bar)\b/i, tag: 'bar censor, black bars' },
    { pattern: /\b(light[^,.]*censor|convenient)\b/i, tag: 'light censor, convenient censoring' },
    { pattern: /\b(steam[^,.]*censor|fog)\b/i, tag: 'steam censor, fog hiding' },
    { pattern: /\b(hair[^,.]*censor)\b/i, tag: 'hair censor, hair covering' },
    
    // ============ HENTAI - JAPANESE TERMS ============
    { pattern: /\b(ecchi|ero|エッチ)\b/i, tag: 'ecchi, erotic, lewd' },
    { pattern: /\b(hentai|変態)\b/i, tag: 'hentai, perverted, explicit' },
    { pattern: /\b(oppai|おっぱい)\b/i, tag: 'oppai, breasts, boobs' },
    { pattern: /\b(pantsu|パンツ)\b/i, tag: 'pantsu, panties, underwear' },
    { pattern: /\b(shimapan|stripe[^,.]*pant)\b/i, tag: 'shimapan, striped panties' },
    { pattern: /\b(sukebe|スケベ)\b/i, tag: 'sukebe, perverted, lewd' },
    { pattern: /\b(omorashi|wetting)\b/i, tag: 'omorashi, wetting, desperate' },
    { pattern: /\b(nyotaimori|body[^,.]*sushi)\b/i, tag: 'nyotaimori, body sushi, serving' },
    { pattern: /\b(enjo[^,.]*kosai|compensat)\b/i, tag: 'enjo kosai, compensated dating' },
    { pattern: /\b(netorare|ntr|cuckold)\b/i, tag: 'netorare, NTR, cuckolding, cheating' },
    { pattern: /\b(netori)\b/i, tag: 'netori, stealing partner' },
    { pattern: /\b(oyakodon|mother[^,.]*daughter)\b/i, tag: 'oyakodon, mother and daughter' },
    { pattern: /\b(shimai[^,.]*don|sister)\b/i, tag: 'shimaidon, sisters together' },
    { pattern: /\b(gyaku[^,.]*rape|reverse[^,.]*rape)\b/i, tag: 'gyaku rape, reverse rape, female dom' },
    { pattern: /\b(goukan|rape|犯す)\b/i, tag: 'goukan, forced, non-consensual' },
    { pattern: /\b(chikan|groper|molest)\b/i, tag: 'chikan, groping, molesting, train' },
    { pattern: /\b(torogao|melting[^,.]*face)\b/i, tag: 'torogao, melting expression, pleasure' },
    { pattern: /\b(ikigao|orgasm[^,.]*face)\b/i, tag: 'ikigao, orgasm face, climax expression' },
    { pattern: /\b(ahegao|fucked[^,.]*silly)\b/i, tag: 'ahegao, fucked silly, tongue out, cross-eyed' },
    { pattern: /\b(ahoge)\b/i, tag: 'ahoge, hair antenna, cowlick' },
    
    // ============ HENTAI - MONSTER / CREATURE ============
    { pattern: /\b(orc|green[^,.]*skin)\b/i, tag: 'orc, green skin, muscular, tusks' },
    { pattern: /\b(goblin|小鬼)\b/i, tag: 'goblin, small, green, ugly' },
    { pattern: /\b(ogre|oni)\b/i, tag: 'ogre, oni, large, horned' },
    { pattern: /\b(troll)\b/i, tag: 'troll, large, ugly, regenerating' },
    { pattern: /\b(minotaur|bull[^,.]*man)\b/i, tag: 'minotaur, bull head, muscular' },
    { pattern: /\b(werewolf|wolf[^,.]*man)\b/i, tag: 'werewolf, wolf, furry, feral' },
    { pattern: /\b(dragon)\b/i, tag: 'dragon, scales, wings, powerful' },
    { pattern: /\b(slime)\b/i, tag: 'slime, translucent, gooey, absorption' },
    { pattern: /\b(tentacle|触手)\b/i, tag: 'tentacles, multiple appendages, wrapping' },
    { pattern: /\b(plant[^,.]*monster|alraune)\b/i, tag: 'plant monster, alraune, vines' },
    { pattern: /\b(insect|bug[^,.]*monster)\b/i, tag: 'insect, bug monster, exoskeleton' },
    { pattern: /\b(parasite)\b/i, tag: 'parasite, infection, control' },
    { pattern: /\b(demon|devil|akuma)\b/i, tag: 'demon, devil, horns, tail, evil' },
    { pattern: /\b(incubus)\b/i, tag: 'incubus, male demon, seducer' },
    { pattern: /\b(succubus|淫魔)\b/i, tag: 'succubus, female demon, seductress' },
    { pattern: /\b(angel|tenshi)\b/i, tag: 'angel, wings, halo, divine' },
    { pattern: /\b(fallen[^,.]*angel)\b/i, tag: 'fallen angel, dark wings, corrupted' },
    { pattern: /\b(vampire|kyuuketsuki)\b/i, tag: 'vampire, fangs, pale, blood' },
    { pattern: /\b(zombie|undead)\b/i, tag: 'zombie, undead, decaying' },
    { pattern: /\b(ghost|yurei|幽霊)\b/i, tag: 'ghost, yurei, transparent, spirit' },
    { pattern: /\b(kitsune|fox[^,.]*spirit)\b/i, tag: 'kitsune, fox spirit, nine tails' },
    { pattern: /\b(tanuki)\b/i, tag: 'tanuki, raccoon dog, shapeshifter' },
    { pattern: /\b(nekomata|cat[^,.]*spirit)\b/i, tag: 'nekomata, cat spirit, twin tails' },
    { pattern: /\b(yuki[^,.]*onna|snow[^,.]*woman)\b/i, tag: 'yuki onna, snow woman, ice' },
    { pattern: /\b(kappa)\b/i, tag: 'kappa, water creature, beak' },
    { pattern: /\b(tengu)\b/i, tag: 'tengu, bird man, long nose, wings' },
    { pattern: /\b(oni|鬼)\b/i, tag: 'oni, demon, horns, club' },
    { pattern: /\b(futanari|futa|ふたなり|hermaphrodite)\b/i, tag: 'futanari, futa, dickgirl, both genitals' },
    { pattern: /\b(trap|josou|femboy)\b/i, tag: 'trap, femboy, crossdresser, feminine male' },
    { pattern: /\b(reverse[^,.]*trap|tomboy)\b/i, tag: 'reverse trap, tomboy, masculine female' },
    
    // ============ HENTAI - CORRUPTION / TRANSFORMATION ============
    { pattern: /\b(corruption|堕落)\b/i, tag: 'corruption, falling, darkness consuming' },
    { pattern: /\b(mind[^,.]*break|精神崩壊)\b/i, tag: 'mind break, broken, empty' },
    { pattern: /\b(ahegao[^,.]*double[^,.]*peace)\b/i, tag: 'ahegao double peace, broken sign' },
    { pattern: /\b(slave[^,.]*training)\b/i, tag: 'slave training, obedience, breaking' },
    { pattern: /\b(brainwash|洗脳)\b/i, tag: 'brainwashing, mind control, obedient' },
    { pattern: /\b(hypno|催眠)\b/i, tag: 'hypnosis, hypnotized, trance, spiral eyes' },
    { pattern: /\b(drug|aphrodisiac|媚薬)\b/i, tag: 'drugged, aphrodisiac, out of control' },
    { pattern: /\b(body[^,.]*swap|入れ替わり)\b/i, tag: 'body swap, switched bodies' },
    { pattern: /\b(gender[^,.]*bend|tg|ts)\b/i, tag: 'gender bender, TG, TS, sex change' },
    { pattern: /\b(age[^,.]*regression|young[^,.]*again)\b/i, tag: 'age regression, younger' },
    { pattern: /\b(age[^,.]*progression|older)\b/i, tag: 'age progression, older, mature' },
    { pattern: /\b(monster[^,.]*transform|monsterization)\b/i, tag: 'monsterization, transforming, becoming monster' },
    { pattern: /\b(demonization|becoming[^,.]*demon)\b/i, tag: 'demonization, becoming demon, corruption' },
    { pattern: /\b(vampirization|turn[^,.]*vampire)\b/i, tag: 'becoming vampire, turned, bite' },
    { pattern: /\b(zombification|turn[^,.]*zombie)\b/i, tag: 'zombification, infection, undead' },
    
    // ============ HENTAI - EXPRESSIONS / REACTIONS ============
    { pattern: /\b(pleasure|快楽)\b/i, tag: 'pleasure, enjoying, feeling good' },
    { pattern: /\b(pain|痛み|hurting)\b/i, tag: 'pain, hurting, suffering' },
    { pattern: /\b(fear|恐怖|terrified)\b/i, tag: 'fear, terrified, scared' },
    { pattern: /\b(disgust|嫌悪)\b/i, tag: 'disgust, disgusted, repulsed' },
    { pattern: /\b(reluctant|嫌々)\b/i, tag: 'reluctant, unwilling, forced' },
    { pattern: /\b(willing|喜んで)\b/i, tag: 'willing, eager, wanting' },
    { pattern: /\b(begging|懇願)\b/i, tag: 'begging, pleading, desperate' },
    { pattern: /\b(defiant|反抗)\b/i, tag: 'defiant, resisting, rebellious' },
    { pattern: /\b(submissive|従順)\b/i, tag: 'submissive, obedient, yielding' },
    { pattern: /\b(embarrassed|恥ずかしい)\b/i, tag: 'embarrassed, shy, blushing' },
    { pattern: /\b(horny|発情)\b/i, tag: 'horny, aroused, in heat' },
    { pattern: /\b(satisfied|満足)\b/i, tag: 'satisfied, content, fulfilled' },
    { pattern: /\b(exhausted|疲労)\b/i, tag: 'exhausted, tired, worn out' },
    { pattern: /\b(addicted|中毒)\b/i, tag: 'addicted, craving, dependent' },
    
    // ============ HENTAI - BODY FLUIDS ============
    { pattern: /\b(saliva|drool|唾液)\b/i, tag: 'saliva, drool, dripping' },
    { pattern: /\b(tear|涙|crying)\b/i, tag: 'tears, crying, emotional' },
    { pattern: /\b(sweat|汗|sweating)\b/i, tag: 'sweat, sweating, glistening' },
    { pattern: /\b(love[^,.]*juice|愛液)\b/i, tag: 'love juice, wet, aroused' },
    { pattern: /\b(squirt|潮吹き)\b/i, tag: 'squirting, female ejaculation' },
    { pattern: /\b(precum|先走り)\b/i, tag: 'precum, dripping, aroused' },
    { pattern: /\b(cum|semen|精液)\b/i, tag: 'cum, semen, seed' },
    { pattern: /\b(milk|母乳|lactation)\b/i, tag: 'breast milk, lactation, milky' },
    { pattern: /\b(pee|urine|おしっこ)\b/i, tag: 'pee, urine, watersports' },
    
    // ============ HENTAI - SETTINGS / SCENARIOS ============
    { pattern: /\b(train|電車|chikan)\b/i, tag: 'train, crowded, groping' },
    { pattern: /\b(onsen|温泉|hot[^,.]*spring)\b/i, tag: 'onsen, hot spring, bathing' },
    { pattern: /\b(love[^,.]*hotel|ラブホ)\b/i, tag: 'love hotel, romantic, private' },
    { pattern: /\b(karaoke|カラオケ)\b/i, tag: 'karaoke room, private, singing' },
    { pattern: /\b(school|学校|classroom)\b/i, tag: 'school, classroom, students' },
    { pattern: /\b(rooftop|屋上)\b/i, tag: 'school rooftop, confession spot' },
    { pattern: /\b(nurse[^,.]*office|保健室)\b/i, tag: 'nurse office, medical, private' },
    { pattern: /\b(club[^,.]*room|部室)\b/i, tag: 'club room, after school' },
    { pattern: /\b(storage|倉庫|closet)\b/i, tag: 'storage room, hidden, cramped' },
    { pattern: /\b(behind[^,.]*gym|体育館裏)\b/i, tag: 'behind gym, hidden, risky' },
    { pattern: /\b(maid[^,.]*cafe|メイド喫茶)\b/i, tag: 'maid cafe, service, cute' },
    { pattern: /\b(shrine|神社|temple)\b/i, tag: 'shrine, temple, sacred' },
    { pattern: /\b(festival|祭り|matsuri)\b/i, tag: 'festival, matsuri, fireworks' },
    { pattern: /\b(beach|海|swimsuit)\b/i, tag: 'beach, ocean, swimsuit' },
    { pattern: /\b(pool|プール)\b/i, tag: 'pool, swimming, water' },
    
    // ============ HENTAI - DOUJINSHI TAGS ============
    { pattern: /\b(vanilla|ラブラブ|consent)\b/i, tag: 'vanilla, consensual, loving' },
    { pattern: /\b(wholesome|純愛)\b/i, tag: 'wholesome, pure love, sweet' },
    { pattern: /\b(dark|闇|guro)\b/i, tag: 'dark, disturbing, extreme' },
    { pattern: /\b(happy[^,.]*end)\b/i, tag: 'happy ending, satisfied' },
    { pattern: /\b(bad[^,.]*end)\b/i, tag: 'bad ending, tragic' },
    { pattern: /\b(impregnation|孕ませ)\b/i, tag: 'impregnation, breeding, fertile' },
    { pattern: /\b(pregnant|妊娠|expecting)\b/i, tag: 'pregnant, belly, expecting' },
    { pattern: /\b(birth|出産)\b/i, tag: 'birth, giving birth, labor' },
    { pattern: /\b(lactation|授乳)\b/i, tag: 'lactation, breastfeeding, milk' },
    { pattern: /\b(incest|近親)\b/i, tag: 'incest, family, taboo' },
    { pattern: /\b(cheating|浮気|affair)\b/i, tag: 'cheating, affair, unfaithful' },
    { pattern: /\b(blackmail|脅迫)\b/i, tag: 'blackmail, coercion, threat' },
    { pattern: /\b(revenge|復讐)\b/i, tag: 'revenge, payback, getting even' },
    { pattern: /\b(public[^,.]*use|公衆便所)\b/i, tag: 'public use, free use, available' },
    { pattern: /\b(prostitution|売春)\b/i, tag: 'prostitution, selling, paid sex' },
    { pattern: /\b(debt|借金)\b/i, tag: 'debt, owing, paying off' },
  ];

  const intimateTags = [];
  for (const { pattern, tag } of intimatePatterns) {
    if (pattern.test(recentFull) && !intimateTags.includes(tag)) {
      intimateTags.push(tag);
      if (intimateTags.length >= 5) break; // v1.5: Allow 5 tags for complex scenes
    }
  }

  // 2. POSE/STATIC ACTIONS - Recent first, then older
  const posePatterns = [
    { pattern: /\b(lean(s|ing)?[^,.]*(forward|closer|in))\b/i, tag: 'leaning forward' },
    { pattern: /\b(lean(s|ing)?[^,.]*elbow)\b/i, tag: 'leaning on elbows' },
    { pattern: /\b(sit(s|ting)?)\b/i, tag: 'sitting' },
    { pattern: /\b(stand(s|ing)?)\b/i, tag: 'standing' },
    { pattern: /\b(tilt(s|ing)?[^,.]*head)\b/i, tag: 'tilted head' },
    { pattern: /\b(smirk(s|ing)?)\b/i, tag: 'smirking' },
    { pattern: /\b(smile|smiling)\b/i, tag: 'slight smile' },
    { pattern: /\b(hair fall(s|ing)?)\b/i, tag: 'hair falling over shoulder' },
  ];

  const poseTags = [];
  // Check recent first
  for (const { pattern, tag } of posePatterns) {
    if (pattern.test(recentFull) && !poseTags.includes(tag) && !intimateTags.includes(tag)) {
      poseTags.push(tag);
      if (poseTags.length >= 1) break;
    }
  }
  // If nothing found in recent, check older
  if (poseTags.length === 0) {
    for (const { pattern, tag } of posePatterns) {
      if (pattern.test(olderFull) && !poseTags.includes(tag)) {
        poseTags.push(tag);
        if (poseTags.length >= 1) break;
      }
    }
  }

  // 3. SETTING - Check older content first (initial scene setup)
  const settingPatterns = [
    { pattern: /\b(bedroom|bed|sheets|pillow)\b/i, tag: 'bedroom setting' },
    { pattern: /\b(behind the bar|at the bar|bar counter)\b/i, tag: 'bar setting' },
    { pattern: /\b(bar)\b/i, tag: 'bar atmosphere' },
    { pattern: /\b(office|desk)\b/i, tag: 'office setting' },
    { pattern: /\b(couch|sofa)\b/i, tag: 'on couch' },
    { pattern: /\b(kitchen)\b/i, tag: 'kitchen setting' },
  ];

  let settingTag = '';
  // Check recent for setting changes first
  for (const { pattern, tag } of settingPatterns) {
    if (pattern.test(recentFull)) {
      settingTag = tag;
      break;
    }
  }
  // If no setting in recent, check older
  if (!settingTag) {
    for (const { pattern, tag } of settingPatterns) {
      if (pattern.test(olderFull)) {
        settingTag = tag;
        break;
      }
    }
  }

  // 4. CLOTHING/NUDITY STATE - Check recent first (may have changed during scene)
  const clothingPatterns = [
    // FULLY NUDE
    { pattern: /\b(naked|nude|bare skin|completely undress|nothing on)\b/i, tag: 'nude, completely naked' },
    { pattern: /\b(strip(ped)?[^,.]*naked|all[^,.]*off)\b/i, tag: 'nude, completely naked' },
    
    // PARTIALLY NUDE
    { pattern: /\b(topless|shirt[^,.]*off|top[^,.]*off|bare[^,.]*chest|breast[^,.]*expos)\b/i, tag: 'topless, exposed breasts' },
    { pattern: /\b(bottomless|pants[^,.]*off|panties[^,.]*off|skirt[^,.]*up)\b/i, tag: 'bottomless, exposed lower body' },
    { pattern: /\b(bra[^,.]*off|remov[^,.]*bra)\b/i, tag: 'topless, bra removed' },
    
    // UNDERWEAR/LINGERIE
    { pattern: /\b(lingerie|underwear|panties|bra only)\b/i, tag: 'lingerie, lace underwear' },
    { pattern: /\b(thong|g-string)\b/i, tag: 'thong, minimal coverage' },
    
    // DISHEVELED CLOTHING
    { pattern: /\b(shirt[^,.]*open|unbutton|half[^,.]*(undress|naked))\b/i, tag: 'open shirt, partially undressed' },
    { pattern: /\b(torn[^,.]*cloth|ripped)\b/i, tag: 'torn clothing, exposed skin' },
    { pattern: /\b(dress[^,.]*pull|hiked[^,.]*up|lift[^,.]*skirt)\b/i, tag: 'dress lifted, exposed thighs' },
    
    // CLOTHED
    { pattern: /\b(black (top|dress))\b/i, tag: 'black dress' },
    { pattern: /\b(low[- ]cut|neckline|cleavage)\b/i, tag: 'low neckline, cleavage visible' },
    { pattern: /\b(tight[^,.]*dress|form[- ]fitting)\b/i, tag: 'tight dress, curves visible' },
  ];

  const clothingTags = [];
  for (const { pattern, tag } of clothingPatterns) {
    if (pattern.test(recentFull) && !clothingTags.includes(tag)) {
      clothingTags.push(tag);
      if (clothingTags.length >= 1) break;
    }
  }
  if (clothingTags.length === 0) {
    for (const { pattern, tag } of clothingPatterns) {
      if (pattern.test(olderFull) && !clothingTags.includes(tag)) {
        clothingTags.push(tag);
        if (clothingTags.length >= 1) break;
      }
    }
  }

  // 5. GAZE/EXPRESSION
  const gazePatterns = [
    { pattern: /\b(eyes locked|eye contact|looking at you|staring)\b/i, tag: 'looking at viewer' },
    { pattern: /\b(dark eyes|eyes dark)\b/i, tag: 'dark seductive eyes' },
    { pattern: /\b(desire|wanting|longing)\b/i, tag: 'desire in eyes' },
  ];

  let gazeTag = '';
  for (const { pattern, tag } of gazePatterns) {
    if (pattern.test(recentFull)) {
      gazeTag = tag;
      break;
    }
  }

  // 6. ATMOSPHERE
  const atmospherePatterns = [
    { pattern: /\b(dim light|low light|soft light)\b/i, tag: 'dim lighting' },
    { pattern: /\b(warm|warmth)\b/i, tag: 'warm atmosphere' },
    { pattern: /\b(intimate|passion)\b/i, tag: 'intimate atmosphere' },
  ];

  let atmosphereTag = '';
  for (const { pattern, tag } of atmospherePatterns) {
    if (pattern.test(recentFull) || pattern.test(olderFull)) {
      atmosphereTag = tag;
      break;
    }
  }

  // ========== ASSEMBLE FINAL PROMPT ==========
  const promptParts = [characterTags];
  
  // Intimate states have HIGHEST priority (expressions, poses from actions)
  if (intimateTags.length > 0) promptParts.push(...intimateTags);
  
  // Then setting
  if (settingTag) promptParts.push(settingTag);
  
  // Then pose
  if (poseTags.length > 0) promptParts.push(...poseTags);
  
  // Then clothing
  if (clothingTags.length > 0) promptParts.push(...clothingTags);
  
  // Then gaze and atmosphere
  if (gazeTag) promptParts.push(gazeTag);
  if (atmosphereTag) promptParts.push(atmosphereTag);
  
  // Quality boosters
  promptParts.push('high quality', 'detailed', 'beautiful lighting');
  
  // Fallback if nothing meaningful was extracted
  if (promptParts.length <= 4) {
    promptParts.splice(1, 0, 'intimate scene', 'seductive pose');
  }

  const finalPrompt = promptParts.join(', ');
  console.log("[Image Gen] 🎨 Final Prompt:", finalPrompt);
  console.log("[Image Gen] 📊 Tags found - Intimate:", intimateTags, "Pose:", poseTags, "Setting:", settingTag);

  return finalPrompt;
}
