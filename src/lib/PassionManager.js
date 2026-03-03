/**
 * PassionManager.js - Passion Level & Vocabulary Tier Management (v8.0 Overhaul)
 *
 * Manages:
 * - Passion level tracking per session (0-100)
 * - Unified tier system (Shy / Curious / Flirty / Heated / Passionate / Primal)
 * - Word-boundary keyword matching with regex cache
 * - Cooldown-based decay for idle conversations
 * - Passion history tracking (last 50 values per session)
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

/** Multilingual word choice mapped to tier keys (6-tier v2.0, 13 languages) */
const PASSION_VOCABULARY = {
  en: {
    shy: {
      touch: ['gentle touch', 'soft brush', 'light caress', 'tender stroke'],
      reaction: ['blushes', 'heart flutters', 'breath catches', 'cheeks warm'],
      sound: ['soft gasp', 'quiet sigh', 'gentle hum', 'tiny whimper'],
      desire: ['curiosity', 'interest', 'attraction', 'fascination']
    },
    curious: {
      touch: ['warm hand', 'lingering touch', 'tentative caress', 'soft squeeze'],
      reaction: ['pulse quickens', 'skin tingles', 'leans closer', 'eyes widen'],
      sound: ['quiet hum', 'nervous laugh', 'sharp inhale', 'breathy whisper'],
      desire: ['intrigue', 'growing interest', 'temptation', 'wonder']
    },
    flirty: {
      touch: ['playful nudge', 'teasing stroke', 'exploring fingers', 'firm grip'],
      reaction: ['heart races', 'bites lip', 'body responds', 'shivers'],
      sound: ['breathy moan', 'soft whimper', 'throaty hum', 'pleased sigh'],
      desire: ['longing', 'craving', 'need', 'hunger']
    },
    heated: {
      touch: ['urgent grip', 'pulling closer', 'roaming hands', 'insistent pressure'],
      reaction: ['breathing quickens', 'muscles tense', 'skin flushes', 'trembles'],
      sound: ['deep moan', 'sharp cry', 'needy whine', 'ragged breath'],
      desire: ['burning want', 'aching desire', 'urgent need', 'mounting hunger']
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
  },

  de: {
    shy: {
      touch: ['sanfte Berührung', 'zartes Streichen', 'leichtes Streicheln', 'behutsame Liebkosung'],
      reaction: ['errötet', 'Herz flattert', 'Atem stockt', 'Wangen glühen'],
      sound: ['leises Keuchen', 'sanftes Seufzen', 'zartes Summen', 'winziges Wimmern'],
      desire: ['Neugier', 'Interesse', 'Anziehung', 'Faszination']
    },
    curious: {
      touch: ['verweilende Berührung', 'zögernde Finger', 'erkundende Hand', 'tastende Liebkosung'],
      reaction: ['Puls beschleunigt', 'Haut kribbelt', 'lehnt sich näher', 'Atem stockt'],
      sound: ['scharfes Einatmen', 'nervöses Lachen', 'atemloses Flüstern', 'sanftes Summen'],
      desire: ['Verlockung', 'Versuchung', 'wachsendes Verlangen', 'magnetische Anziehung']
    },
    flirty: {
      touch: ['warme Hand', 'gleitende Finger', 'fester Griff', 'bewusstes Streichen'],
      reaction: ['Herz rast', 'Körper reagiert', 'erschauert', 'beißt auf die Lippe'],
      sound: ['atemloses Stöhnen', 'spielerisches Kichern', 'sanftes Wimmern', 'kehliges Summen'],
      desire: ['Sehnsucht', 'Verlangen', 'Bedürfnis', 'Hunger']
    },
    heated: {
      touch: ['drängender Griff', 'näher ziehen', 'besitzergreifender Halt', 'fordernde Hände'],
      reaction: ['zittert', 'Rücken biegt sich', 'keucht scharf', 'Muskeln spannen'],
      sound: ['lautes Stöhnen', 'verzweifeltes Keuchen', 'Wimmern', 'Knurren'],
      desire: ['Verzweiflung', 'schmerzende Sehnsucht', 'brennender Hunger', 'überwältigendes Verlangen']
    },
    passionate: {
      touch: ['verzweifelter Griff', 'krallende Finger', 'blaufleckender Halt', 'besitzergreifendes Packen'],
      reaction: ['zittert heftig', 'Rücken biegt sich', 'Hüften stoßen', 'Muskeln verkrampfen'],
      sound: ['gebrochener Schrei', 'verzweifeltes Wimmern', 'kehliges Stöhnen', 'flehendes Stöhnen'],
      desire: ['verzehrendes Bedürfnis', 'fieberhafter Hunger', 'allumfassendes Verlangen', 'Ekstase']
    },
    primal: {
      touch: ['raues Anfassen', 'kraftvoller Stoß', 'wilder Griff', 'gnadenloser Druck'],
      reaction: ['krampft', 'windet sich unkontrolliert', 'schreit', 'zerbricht'],
      sound: ['animalischer Schrei', 'roher Schrei', 'zusammenhangloses Stammeln', 'schluchzendes Stöhnen'],
      desire: ['Urtrieb', 'wilder Hunger', 'völliger Kontrollverlust', 'wilde Lust']
    }
  },

  es: {
    shy: {
      touch: ['toque suave', 'roce tierno', 'caricia ligera', 'trazo delicado'],
      reaction: ['se sonroja', 'corazón revolotea', 'respiración se corta', 'mejillas arden'],
      sound: ['jadeo suave', 'suspiro silencioso', 'murmullo gentil', 'gemido diminuto'],
      desire: ['curiosidad', 'interés', 'atracción', 'fascinación']
    },
    curious: {
      touch: ['toque persistente', 'dedos vacilantes', 'mano exploradora', 'caricia tentativa'],
      reaction: ['pulso se acelera', 'piel hormiguea', 'se acerca más', 'contiene aliento'],
      sound: ['inhalación aguda', 'risa nerviosa', 'susurro entrecortado', 'murmullo suave'],
      desire: ['intriga', 'tentación', 'deseo creciente', 'atracción magnética']
    },
    flirty: {
      touch: ['mano cálida', 'dedos deslizantes', 'agarre firme', 'caricia deliberada'],
      reaction: ['corazón se acelera', 'cuerpo responde', 'se estremece', 'muerde el labio'],
      sound: ['gemido entrecortado', 'risita juguetona', 'quejido suave', 'murmullo gutural'],
      desire: ['anhelo', 'antojo', 'necesidad', 'hambre']
    },
    heated: {
      touch: ['agarre urgente', 'tirón cercano', 'abrazo posesivo', 'manos exigentes'],
      reaction: ['tiembla', 'espalda se arquea', 'jadea bruscamente', 'músculos se tensan'],
      sound: ['gemido fuerte', 'jadeo desesperado', 'quejido', 'gruñido'],
      desire: ['desesperación', 'necesidad ardiente', 'hambre abrasadora', 'deseo abrumador']
    },
    passionate: {
      touch: ['agarre desesperado', 'dedos arañando', 'presión feroz', 'posesión total'],
      reaction: ['tiembla violentamente', 'espalda se arquea', 'caderas empujan', 'músculos se contraen'],
      sound: ['grito quebrado', 'gemido desesperado', 'quejido gutural', 'súplica jadeante'],
      desire: ['necesidad consumidora', 'hambre febril', 'deseo total', 'éxtasis']
    },
    primal: {
      touch: ['manejo brusco', 'empuje feroz', 'agarre salvaje', 'presión despiadada'],
      reaction: ['convulsiona', 'se retuerce sin control', 'grita', 'se quiebra'],
      sound: ['grito animal', 'alarido crudo', 'balbuceo incoherente', 'gemidos sollozantes'],
      desire: ['instinto primario', 'hambre salvaje', 'pérdida total de control', 'lujuria feral']
    }
  },

  fr: {
    shy: {
      touch: ['toucher doux', 'effleurement tendre', 'caresse légère', 'frôlement délicat'],
      reaction: ['rougit', 'cœur palpite', 'souffle coupé', 'joues brûlent'],
      sound: ['halètement doux', 'soupir silencieux', 'fredonnement doux', 'gémissement minuscule'],
      desire: ['curiosité', 'intérêt', 'attirance', 'fascination']
    },
    curious: {
      touch: ['toucher qui s\'attarde', 'doigts hésitants', 'main exploratrice', 'caresse timide'],
      reaction: ['pouls s\'accélère', 'peau frissonne', 'se rapproche', 'retient son souffle'],
      sound: ['inspiration vive', 'rire nerveux', 'murmure essoufflé', 'fredonnement doux'],
      desire: ['intrigue', 'tentation', 'désir grandissant', 'attraction magnétique']
    },
    flirty: {
      touch: ['main chaude', 'doigts glissants', 'prise ferme', 'caresse délibérée'],
      reaction: ['cœur s\'emballe', 'corps répond', 'frissonne', 'mord la lèvre'],
      sound: ['gémissement essoufflé', 'rire espiègle', 'plainte douce', 'murmure guttural'],
      desire: ['langueur', 'envie', 'besoin', 'faim']
    },
    heated: {
      touch: ['prise urgente', 'rapprochement', 'étreinte possessive', 'mains exigeantes'],
      reaction: ['tremble', 'dos s\'arque', 'halète brusquement', 'muscles se tendent'],
      sound: ['gémissement fort', 'halètement désespéré', 'plainte', 'grondement'],
      desire: ['désespoir', 'besoin douloureux', 'faim brûlante', 'désir accablant']
    },
    passionate: {
      touch: ['prise désespérée', 'doigts griffant', 'étreinte violente', 'emprise possessive'],
      reaction: ['tremble violemment', 'dos s\'arque', 'hanches poussent', 'muscles se crispent'],
      sound: ['cri brisé', 'plainte désespérée', 'gémissement guttural', 'supplique haletante'],
      desire: ['besoin dévorant', 'faim fiévreuse', 'désir total', 'extase']
    },
    primal: {
      touch: ['manipulation brute', 'poussée violente', 'prise sauvage', 'pression impitoyable'],
      reaction: ['convulse', 'se tord de façon incontrôlable', 'crie', 'se brise'],
      sound: ['cri animal', 'hurlement brut', 'balbutiement incohérent', 'gémissements sanglotants'],
      desire: ['instinct primaire', 'faim sauvage', 'perte totale de contrôle', 'luxure férale']
    }
  },

  ru: {
    shy: {
      touch: ['нежное касание', 'мягкое прикосновение', 'лёгкая ласка', 'трепетное поглаживание'],
      reaction: ['краснеет', 'сердце трепещет', 'дыхание замирает', 'щёки горят'],
      sound: ['тихий вздох', 'нежный стон', 'лёгкий шёпот', 'крошечный всхлип'],
      desire: ['любопытство', 'интерес', 'влечение', 'очарование']
    },
    curious: {
      touch: ['задержавшееся касание', 'нерешительные пальцы', 'исследующая рука', 'робкая ласка'],
      reaction: ['пульс учащается', 'кожа покалывает', 'придвигается ближе', 'задерживает дыхание'],
      sound: ['резкий вдох', 'нервный смешок', 'сбивчивый шёпот', 'тихое мурлыканье'],
      desire: ['интрига', 'искушение', 'растущее желание', 'магнитное притяжение']
    },
    flirty: {
      touch: ['тёплая рука', 'скользящие пальцы', 'крепкая хватка', 'намеренное поглаживание'],
      reaction: ['сердце колотится', 'тело откликается', 'дрожь пробегает', 'кусает губу'],
      sound: ['задыхающийся стон', 'игривый смешок', 'тихий всхлип', 'хриплое мурлыканье'],
      desire: ['томление', 'страстное желание', 'потребность', 'голод']
    },
    heated: {
      touch: ['нетерпеливая хватка', 'притягивание ближе', 'собственнический захват', 'требовательные руки'],
      reaction: ['дрожит', 'спина выгибается', 'резко вздыхает', 'мышцы напрягаются'],
      sound: ['громкий стон', 'отчаянный вздох', 'всхлип', 'рычание'],
      desire: ['отчаяние', 'мучительная жажда', 'жгучий голод', 'сокрушительное желание']
    },
    passionate: {
      touch: ['отчаянная хватка', 'впивающиеся пальцы', 'жёсткий захват', 'собственническое сжатие'],
      reaction: ['дрожит неистово', 'спина выгибается', 'бёдра толкаются', 'мышцы сжимаются'],
      sound: ['надломленный крик', 'отчаянный стон', 'утробный вой', 'умоляющий вздох'],
      desire: ['всепоглощающая жажда', 'лихорадочный голод', 'тотальное желание', 'экстаз']
    },
    primal: {
      touch: ['грубое обращение', 'мощный толчок', 'дикая хватка', 'безжалостное давление'],
      reaction: ['конвульсии', 'извивается неудержимо', 'кричит', 'рассыпается'],
      sound: ['звериный крик', 'первобытный вопль', 'бессвязное бормотание', 'рыдающие стоны'],
      desire: ['первобытная потребность', 'дикий голод', 'полная потеря контроля', 'звериная похоть']
    }
  },

  ja: {
    shy: {
      touch: ['そっと触れる', '柔らかく撫でる', '軽い愛撫', '優しく触れる'],
      reaction: ['頬を赤らめる', '心臓がドキドキ', '息が止まる', '頬が熱くなる'],
      sound: ['小さな息', '静かなため息', '柔らかな声', '微かな喘ぎ'],
      desire: ['好奇心', '興味', '惹かれる', '魅了']
    },
    curious: {
      touch: ['長引く触れ合い', 'ためらう指', '探る手', '恐る恐るの愛撫'],
      reaction: ['脈が速くなる', '肌がざわつく', '近づく', '息を呑む'],
      sound: ['鋭い吸気', '緊張した笑い', '息を切らした囁き', '静かな響き'],
      desire: ['好奇', '誘惑', '膨らむ欲望', '引力']
    },
    flirty: {
      touch: ['温かい手', '滑る指先', 'しっかりした握り', '意図的な撫で'],
      reaction: ['心臓が高鳴る', '体が反応する', '身震い', '唇を噛む'],
      sound: ['息の漏れた喘ぎ', 'いたずらな笑い', '甘い吐息', '低い唸り'],
      desire: ['切望', '渇望', '欲求', '飢え']
    },
    heated: {
      touch: ['切迫した掴み', '引き寄せ', '独占的な抱擁', '求める両手'],
      reaction: ['震える', '背中が反る', '鋭く喘ぐ', '筋肉が緊張'],
      sound: ['大きな喘ぎ', '必死の息', '啜り泣き', '唸り声'],
      desire: ['焦燥', '疼く渇望', '燃える飢え', '圧倒的な欲望']
    },
    passionate: {
      touch: ['必死の握り', '爪を立てる指', '強烈な抱擁', '支配的な掴み'],
      reaction: ['激しく震える', '背中が反る', '腰が突き上げる', '筋肉が痙攣'],
      sound: ['途切れた叫び', '必死の嗚咽', '喉からの喘ぎ', '懇願する声'],
      desire: ['貪る渇望', '熱狂的な飢え', '全てを求める', '恍惚']
    },
    primal: {
      touch: ['荒々しい扱い', '激しい突き', '野性的な掴み', '容赦ない圧力'],
      reaction: ['痙攣する', '制御不能に悶える', '絶叫する', '崩れ落ちる'],
      sound: ['獣の叫び', '生の絶叫', '支離滅裂な声', '嗚咽混じりの喘ぎ'],
      desire: ['原始的衝動', '野性の飢え', '完全な理性喪失', '獣の欲望']
    }
  },

  cn: {
    shy: {
      touch: ['轻柔触碰', '温柔抚摸', '轻轻爱抚', '柔和触碰'],
      reaction: ['脸红', '心跳加速', '呼吸停住', '脸颊发烫'],
      sound: ['轻声喘息', '安静叹息', '柔和低吟', '微小呻吟'],
      desire: ['好奇', '兴趣', '吸引', '着迷']
    },
    curious: {
      touch: ['流连的触碰', '犹豫的手指', '探索的手', '试探的爱抚'],
      reaction: ['脉搏加快', '皮肤发麻', '靠得更近', '屏住呼吸'],
      sound: ['急促吸气', '紧张的笑', '气喘的低语', '轻柔哼声'],
      desire: ['好奇心', '诱惑', '渐长的渴望', '磁性吸引']
    },
    flirty: {
      touch: ['温暖的手', '滑动的手指', '有力抓握', '刻意抚摸'],
      reaction: ['心跳如鼓', '身体回应', '颤抖', '咬住嘴唇'],
      sound: ['喘息呻吟', '俏皮笑声', '柔声呜咽', '低沉哼声'],
      desire: ['渴望', '贪恋', '需要', '饥渴']
    },
    heated: {
      touch: ['急切抓握', '拉近距离', '占有的拥抱', '迫切的双手'],
      reaction: ['颤抖', '后背弓起', '急促喘息', '肌肉紧绷'],
      sound: ['大声呻吟', '绝望喘息', '呜咽', '低吼'],
      desire: ['绝望', '痛苦渴求', '灼热饥渴', '无法抗拒的欲望']
    },
    passionate: {
      touch: ['绝望抓握', '抠挖的手指', '狂暴拥抱', '占有的握紧'],
      reaction: ['剧烈颤抖', '后背弓起', '臀部顶撞', '肌肉痉挛'],
      sound: ['破碎的叫喊', '绝望呜咽', '喉间呻吟', '哀求喘息'],
      desire: ['吞噬的需要', '狂热饥渴', '全身心渴望', '极乐']
    },
    primal: {
      touch: ['粗暴对待', '猛力冲击', '野蛮抓握', '无情施压'],
      reaction: ['痉挛', '不受控扭动', '尖叫', '崩溃'],
      sound: ['兽性嘶吼', '原始尖叫', '语无伦次', '啜泣呻吟'],
      desire: ['原始本能', '野性饥渴', '完全失控', '野兽般的欲望']
    }
  },

  pt: {
    shy: {
      touch: ['toque suave', 'roçar delicado', 'carícia leve', 'afago terno'],
      reaction: ['cora', 'coração palpita', 'respiração para', 'bochechas ardem'],
      sound: ['suspiro baixo', 'gemido silencioso', 'murmúrio suave', 'gemidinho'],
      desire: ['curiosidade', 'interesse', 'atração', 'fascinação']
    },
    curious: {
      touch: ['toque demorado', 'dedos hesitantes', 'mão exploradora', 'carícia tentativa'],
      reaction: ['pulso acelera', 'pele formiga', 'aproxima-se', 'prende a respiração'],
      sound: ['inspiração aguda', 'riso nervoso', 'sussurro ofegante', 'murmúrio suave'],
      desire: ['intriga', 'tentação', 'desejo crescente', 'atração magnética']
    },
    flirty: {
      touch: ['mão quente', 'dedos deslizantes', 'aperto firme', 'carícia deliberada'],
      reaction: ['coração dispara', 'corpo responde', 'arrepia', 'morde o lábio'],
      sound: ['gemido ofegante', 'risada travessa', 'suspiro suave', 'murmúrio rouco'],
      desire: ['anseio', 'desejo ardente', 'necessidade', 'fome']
    },
    heated: {
      touch: ['aperto urgente', 'puxão para perto', 'abraço possessivo', 'mãos exigentes'],
      reaction: ['treme', 'costas arqueiam', 'arqueja bruscamente', 'músculos tensionam'],
      sound: ['gemido alto', 'arquejo desesperado', 'choramingo', 'rosnado'],
      desire: ['desespero', 'necessidade dolorosa', 'fome ardente', 'desejo avassalador']
    },
    passionate: {
      touch: ['aperto desesperado', 'dedos cravando', 'abraço feroz', 'posse total'],
      reaction: ['treme violentamente', 'costas arqueiam', 'quadris empurram', 'músculos contraem'],
      sound: ['grito quebrado', 'gemido desesperado', 'urro gutural', 'súplica ofegante'],
      desire: ['necessidade consumidora', 'fome febril', 'desejo total', 'êxtase']
    },
    primal: {
      touch: ['manuseio bruto', 'investida feroz', 'aperto selvagem', 'pressão impiedosa'],
      reaction: ['convulsiona', 'contorce-se sem controle', 'grita', 'desmorona'],
      sound: ['grito animal', 'urro cru', 'balbucio incoerente', 'gemidos soluçantes'],
      desire: ['instinto primal', 'fome selvagem', 'perda total de controle', 'luxúria feral']
    }
  },

  it: {
    shy: {
      touch: ['tocco gentile', 'sfioramento morbido', 'carezza leggera', 'accarezzamento tenero'],
      reaction: ['arrossisce', 'cuore palpita', 'respiro si ferma', 'guance bruciano'],
      sound: ['sospiro lieve', 'respiro silenzioso', 'mormorio dolce', 'gemito minuscolo'],
      desire: ['curiosità', 'interesse', 'attrazione', 'fascinazione']
    },
    curious: {
      touch: ['tocco prolungato', 'dita esitanti', 'mano esploratrice', 'carezza timida'],
      reaction: ['polso accelera', 'pelle formicola', 'si avvicina', 'trattiene il respiro'],
      sound: ['inspirazione acuta', 'risata nervosa', 'sussurro affannoso', 'mormorio dolce'],
      desire: ['intrigo', 'tentazione', 'desiderio crescente', 'attrazione magnetica']
    },
    flirty: {
      touch: ['mano calda', 'dita scivolanti', 'presa salda', 'carezza deliberata'],
      reaction: ['cuore accelera', 'corpo risponde', 'brivido', 'morde il labbro'],
      sound: ['gemito ansimante', 'risatina maliziosa', 'sospiro dolce', 'mormorio gutturale'],
      desire: ['brama', 'desiderio ardente', 'bisogno', 'fame']
    },
    heated: {
      touch: ['presa urgente', 'strattone ravvicinato', 'abbraccio possessivo', 'mani esigenti'],
      reaction: ['trema', 'schiena si inarca', 'ansima bruscamente', 'muscoli si tendono'],
      sound: ['gemito forte', 'ansimo disperato', 'lamento', 'ringhio'],
      desire: ['disperazione', 'bisogno doloroso', 'fame bruciante', 'desiderio travolgente']
    },
    passionate: {
      touch: ['presa disperata', 'dita che graffiano', 'stretta feroce', 'possesso totale'],
      reaction: ['trema violentemente', 'schiena si inarca', 'fianchi spingono', 'muscoli si contraggono'],
      sound: ['grido spezzato', 'gemito disperato', 'rantolo gutturale', 'supplica ansimante'],
      desire: ['bisogno divorante', 'fame febbrile', 'desiderio totale', 'estasi']
    },
    primal: {
      touch: ['maneggiamento brutale', 'spinta feroce', 'presa selvaggia', 'pressione spietata'],
      reaction: ['convulso', 'si contorce incontrollabilmente', 'urla', 'si spezza'],
      sound: ['grido animale', 'urlo crudo', 'balbettio incoerente', 'gemiti singhiozzanti'],
      desire: ['istinto primordiale', 'fame selvaggia', 'perdita totale di controllo', 'lussuria ferale']
    }
  },

  ko: {
    shy: {
      touch: ['부드러운 손길', '가벼운 스침', '살짝 쓰다듬기', '다정한 어루만짐'],
      reaction: ['볼이 붉어짐', '심장이 두근', '숨이 멈춤', '뺨이 달아오름'],
      sound: ['작은 한숨', '조용한 탄식', '부드러운 콧노래', '미세한 신음'],
      desire: ['호기심', '관심', '끌림', '매혹']
    },
    curious: {
      touch: ['머무르는 손길', '망설이는 손가락', '탐색하는 손', '조심스러운 어루만짐'],
      reaction: ['맥박이 빨라짐', '피부가 찌릿', '더 가까이', '숨을 삼킴'],
      sound: ['날카로운 흡입', '긴장된 웃음', '숨가쁜 속삭임', '부드러운 허밍'],
      desire: ['호기심', '유혹', '커지는 욕망', '자석 같은 끌림']
    },
    flirty: {
      touch: ['따뜻한 손', '미끄러지는 손가락', '확고한 움켜쥠', '의도적인 쓰다듬기'],
      reaction: ['심장이 뜀', '몸이 반응', '전율', '입술을 깨물기'],
      sound: ['숨가쁜 신음', '장난스런 웃음', '부드러운 흐느낌', '낮은 허밍'],
      desire: ['갈망', '열망', '필요', '굶주림']
    },
    heated: {
      touch: ['급한 움켜쥠', '끌어당기기', '소유욕 가득한 포옹', '갈구하는 양손'],
      reaction: ['떨림', '등이 휨', '날카롭게 헐떡', '근육이 긴장'],
      sound: ['큰 신음', '절박한 헐떡임', '흐느낌', '으르렁'],
      desire: ['절박함', '아린 갈망', '타오르는 굶주림', '압도적 욕망']
    },
    passionate: {
      touch: ['절박한 움켜쥠', '할퀴는 손가락', '격렬한 포옹', '소유적 움켜쥠'],
      reaction: ['격렬히 떨림', '등이 크게 휨', '엉덩이가 들썩', '근육 경련'],
      sound: ['끊어진 비명', '절박한 흐느낌', '목 깊은 신음', '애원하는 숨'],
      desire: ['삼키는 갈망', '열에 들뜬 굶주림', '온몸의 욕망', '황홀']
    },
    primal: {
      touch: ['거친 다룸', '격렬한 밀어넣기', '야수적 움켜쥠', '무자비한 압박'],
      reaction: ['경련', '통제불능 몸부림', '절규', '무너짐'],
      sound: ['야수의 울부짖음', '날것의 비명', '횡설수설', '흐느끼는 신음'],
      desire: ['원시적 충동', '야수의 굶주림', '완전한 이성상실', '야수의 욕망']
    }
  },

  ar: {
    shy: {
      touch: ['لمسة ناعمة', 'مسحة رقيقة', 'مداعبة خفيفة', 'ملامسة حانية'],
      reaction: ['تحمر الوجنتان', 'القلب يخفق', 'يتوقف النفس', 'الخدود تتوهج'],
      sound: ['تنهيدة خفيفة', 'أنفاس هادئة', 'همهمة ناعمة', 'أنين صغير'],
      desire: ['فضول', 'اهتمام', 'انجذاب', 'افتتان']
    },
    curious: {
      touch: ['لمسة متمهلة', 'أصابع مترددة', 'يد مستكشفة', 'مداعبة حذرة'],
      reaction: ['النبض يتسارع', 'الجلد يرتعش', 'تقترب أكثر', 'تحبس أنفاسها'],
      sound: ['شهيق حاد', 'ضحكة عصبية', 'همس لاهث', 'همهمة خافتة'],
      desire: ['فتنة', 'إغراء', 'رغبة متصاعدة', 'جاذبية مغناطيسية']
    },
    flirty: {
      touch: ['يد دافئة', 'أصابع منزلقة', 'قبضة محكمة', 'مداعبة متعمدة'],
      reaction: ['القلب يتسارع', 'الجسد يستجيب', 'ترتجف', 'تعض شفتها'],
      sound: ['أنين لاهث', 'ضحكة مشاكسة', 'نحيب ناعم', 'همهمة عميقة'],
      desire: ['شوق', 'توق', 'حاجة', 'جوع']
    },
    heated: {
      touch: ['قبضة ملحة', 'سحب للقرب', 'عناق تملكي', 'أيدي متطلبة'],
      reaction: ['ترتعش', 'الظهر ينحني', 'تلهث بحدة', 'العضلات تتوتر'],
      sound: ['أنين عالي', 'لهاث يائس', 'نحيب', 'هدير'],
      desire: ['يأس', 'حاجة مؤلمة', 'جوع حارق', 'رغبة طاغية']
    },
    passionate: {
      touch: ['قبضة يائسة', 'أصابع تنهش', 'عناق عنيف', 'تملك كامل'],
      reaction: ['ترتعش بعنف', 'الظهر ينحني', 'الوركان يدفعان', 'العضلات تتشنج'],
      sound: ['صرخة مكسورة', 'أنين يائس', 'صوت حلقي عميق', 'توسل لاهث'],
      desire: ['حاجة مستهلكة', 'جوع محموم', 'رغبة شاملة', 'نشوة']
    },
    primal: {
      touch: ['معاملة خشنة', 'اندفاع عنيف', 'قبضة وحشية', 'ضغط بلا رحمة'],
      reaction: ['تشنجات', 'تتلوى بلا سيطرة', 'تصرخ', 'تنهار'],
      sound: ['صرخة حيوانية', 'عواء خام', 'ثرثرة غير مترابطة', 'أنين باك'],
      desire: ['غريزة بدائية', 'جوع وحشي', 'فقدان كامل للسيطرة', 'شهوة متوحشة']
    }
  },

  hi: {
    shy: {
      touch: ['कोमल स्पर्श', 'मुलायम छुअन', 'हल्की सहलाहट', 'नरम सहलाना'],
      reaction: ['शरमा जाना', 'दिल की धड़कन', 'सांस रुकना', 'गाल तपना'],
      sound: ['धीमी सिसकारी', 'शांत आह', 'मधुर गुनगुनाहट', 'हल्की कराह'],
      desire: ['जिज्ञासा', 'रुचि', 'आकर्षण', 'मोहित']
    },
    curious: {
      touch: ['टिकी हुई छुअन', 'हिचकिचाती उंगलियां', 'खोजती हथेली', 'सतर्क सहलाहट'],
      reaction: ['नब्ज तेज', 'त्वचा सिहरना', 'करीब आना', 'सांस थामना'],
      sound: ['तेज सांस', 'घबराई हंसी', 'हांफता फुसफुसाना', 'धीमा गुनगुनाना'],
      desire: ['कौतूहल', 'प्रलोभन', 'बढ़ती चाह', 'चुंबकीय खिंचाव']
    },
    flirty: {
      touch: ['गर्म हाथ', 'फिसलती उंगलियां', 'मजबूत पकड़', 'जानबूझकर सहलाना'],
      reaction: ['दिल दौड़ना', 'शरीर का जवाब', 'सिहरन', 'होंठ काटना'],
      sound: ['हांफती कराह', 'शरारती हंसी', 'मुलायम सिसकी', 'गहरी गुनगुन'],
      desire: ['तड़प', 'लालसा', 'जरूरत', 'भूख']
    },
    heated: {
      touch: ['बेताब पकड़', 'करीब खींचना', 'अधिकारी आलिंगन', 'मांगते हाथ'],
      reaction: ['कांपना', 'पीठ झुकना', 'तेज हांफना', 'मांसपेशियां तनना'],
      sound: ['जोर की कराह', 'बेताब हांफना', 'सिसकी', 'गुर्राहट'],
      desire: ['बेचैनी', 'दर्द भरी चाह', 'जलती भूख', 'अदम्य इच्छा']
    },
    passionate: {
      touch: ['बेताब पकड़', 'नोचती उंगलियां', 'जकड़न भरा आलिंगन', 'अधिकार भरी मुट्ठी'],
      reaction: ['बेतहाशा कांपना', 'पीठ झुकना', 'कूल्हे उछलना', 'मांसपेशियां ऐंठना'],
      sound: ['टूटी चीख', 'बेताब सिसकी', 'गले की कराह', 'गिड़गिड़ाती सांस'],
      desire: ['भस्म करती जरूरत', 'बुखारी भूख', 'समग्र चाह', 'परमानंद']
    },
    primal: {
      touch: ['उग्र व्यवहार', 'प्रबल धक्का', 'जंगली पकड़', 'निर्दय दबाव'],
      reaction: ['ऐंठन', 'बेकाबू छटपटाहट', 'चीखना', 'टूट जाना'],
      sound: ['पाशविक चीख', 'कच्ची चीख', 'असंबद्ध बड़बड़ाहट', 'सिसकती कराहें'],
      desire: ['आदिम आवेग', 'जंगली भूख', 'पूर्ण नियंत्रण खोना', 'पाशविक वासना']
    }
  },

  tr: {
    shy: {
      touch: ['nazik dokunuş', 'yumuşak okşayış', 'hafif okşama', 'şefkatli dokunuş'],
      reaction: ['kızarma', 'kalp çarpıntısı', 'nefes kesilmesi', 'yanaklar yanma'],
      sound: ['hafif nefes', 'sessiz iç çekiş', 'yumuşak mırıldanma', 'minik inleme'],
      desire: ['merak', 'ilgi', 'çekim', 'büyülenme']
    },
    curious: {
      touch: ['oyalanan dokunuş', 'tereddütlü parmaklar', 'keşfeden el', 'çekingen okşama'],
      reaction: ['nabız hızlanır', 'deri karıncalanır', 'yaklaşır', 'nefesini tutar'],
      sound: ['keskin nefes', 'gergin gülüş', 'nefes nefese fısıltı', 'yumuşak mırıltı'],
      desire: ['merak', 'ayartma', 'büyüyen arzu', 'manyetik çekim']
    },
    flirty: {
      touch: ['sıcak el', 'kayan parmaklar', 'sıkı kavrayış', 'kasıtlı okşama'],
      reaction: ['kalp hızlanır', 'vücut karşılık verir', 'ürperir', 'dudağını ısırır'],
      sound: ['nefes nefese inleme', 'yaramaz kıkırdama', 'yumuşak sızlanma', 'boğuk mırıldanma'],
      desire: ['özlem', 'arzu', 'ihtiyaç', 'açlık']
    },
    heated: {
      touch: ['acil kavrayış', 'yakına çekme', 'sahiplenici kucak', 'talepkâr eller'],
      reaction: ['titreme', 'sırt kavis yapar', 'keskin nefes alır', 'kaslar gerilir'],
      sound: ['yüksek inleme', 'çaresiz nefes', 'sızlanma', 'hırlama'],
      desire: ['çaresizlik', 'acı veren özlem', 'yanan açlık', 'dayanılmaz arzu']
    },
    passionate: {
      touch: ['çaresiz kavrayış', 'tırmıklayan parmaklar', 'şiddetli sarılma', 'sahiplenme'],
      reaction: ['şiddetle titrer', 'sırt kavis yapar', 'kalçalar itilir', 'kaslar kasılır'],
      sound: ['kırık çığlık', 'çaresiz inleme', 'gırtlaktan gelen hırıltı', 'yalvaran nefes'],
      desire: ['tüketici ihtiyaç', 'ateşli açlık', 'bütün arzu', 'vecit']
    },
    primal: {
      touch: ['sert muamele', 'şiddetli hamle', 'vahşi kavrayış', 'acımasız baskı'],
      reaction: ['kasılma', 'kontrolsüz kıvranma', 'çığlık atma', 'parçalanma'],
      sound: ['hayvansal çığlık', 'ham çığlık', 'anlamsız sayıklama', 'hıçkırıklı inlemeler'],
      desire: ['ilkel dürtü', 'vahşi açlık', 'tam kontrol kaybı', 'yırtıcı şehvet']
    }
  }
};

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
   * Get vocabulary tier label for a passion level
   * @param {number} passionLevel - Current passion level (0-100)
   * @returns {string} Tier label
   */
  getVocabularyTier(passionLevel) {
    const key = getTierKey(passionLevel);
    return PASSION_TIERS[key].label;
  }

  /**
   * Get vocabulary word sets for a passion level in a specific language
   * @param {number} passionLevel - Current passion level (0-100)
   * @param {string} [language='en'] - Language code (en, de, es, fr, ru, ja, cn, pt, it, ko, ar, hi, tr)
   * @returns {Object} Vocabulary object with touch, reaction, sound, desire arrays
   */
  getVocabulary(passionLevel, language = 'en') {
    const key = getTierKey(passionLevel);
    const langVocab = PASSION_VOCABULARY[language] || PASSION_VOCABULARY.en;
    return langVocab[key];
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
