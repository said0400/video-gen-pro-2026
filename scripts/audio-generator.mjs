import axios from 'axios';
import dotenv from 'dotenv';
import { logger } from './logger.mjs';

dotenv.config();

// ============================
// ✅ الإعدادات
// ============================
const CONFIG = {
  models: (process.env.GROQ_FALLBACK_MODELS ||
    'llama-3.3-70b-versatile,llama-3.1-8b-instant,gemma2-9b-it')
    .split(',')
    .map(m => m.trim()),

  timeoutMs  : 60000,
  maxRetries : 2,
  retryDelay : 10000,

  content: {
    minSegments        : 5,
    maxSegments        : 10,
    minKeywords        : 3,
    minDurationSeconds : 40,
    maxDurationSeconds : 80,

    wordsPerSecond: {
      ar: 2.0,
      en: 2.5,
      fr: 2.3,
    },
  },
};

// ============================
// ✅ حساب عدد الكلمات المطلوبة
// ============================
function getWordCountGuide(language) {
  const wps    = CONFIG.content.wordsPerSecond[language] || 2.5;
  const minWds = Math.round(CONFIG.content.minDurationSeconds * wps);
  const maxWds = Math.round(CONFIG.content.maxDurationSeconds * wps);
  return { minWds, maxWds, wps };
}

// ============================
// ✅ التحقق من متغيرات البيئة
// ============================
function getApiConfig() {
  const apiKey = process.env.GROQ_API_KEY;
  const apiUrl = process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1';

  if (!apiKey || apiKey === 'undefined' || apiKey.trim() === '') {
    throw new Error('❌ GROQ_API_KEY غير موجود');
  }

  return { apiKey, apiUrl };
}

// ============================
// ✅ القوالب - System Prompts
// ============================
const SYSTEM_PROMPTS = {
  Motivational: {
    ar: `أنت كاتب محتوى تحفيزي عربي محترف متخصص في كتابة نصوص فيديو قصيرة ومؤثرة.

قواعد صارمة يجب اتباعها:
1. النص يجب أن يكون بين 80 و 160 كلمة عربية (يعادل 40-80 ثانية قراءة)
2. كل مقطع يجب أن يحتوي على 15-30 كلمة
3. لا تكتب مقاطع قصيرة أبداً - كل مقطع جملة كاملة ومعبرة
4. استخدم لغة قوية ومؤثرة تلامس القلب
5. أضف تفاصيل وأمثلة حقيقية تجعل النص غنياً
6. النص يجب أن يقدم قيمة حقيقية للمشاهد`,

    en: `You are a professional English motivational content writer specialized in video scripts.

Strict rules:
1. Text must be between 100 and 200 English words (equals 40-80 seconds reading)
2. Each segment must contain 20-35 words
3. Never write short segments - each must be a complete, meaningful sentence
4. Use powerful, impactful language that touches the heart
5. Add real details and examples to enrich the content
6. Content must provide genuine value to the viewer`,

    fr: `Vous êtes un rédacteur professionnel de contenu motivationnel en français spécialisé dans les scripts vidéo.

Règles strictes:
1. Le texte doit contenir entre 90 et 185 mots français (équivaut à 40-80 secondes de lecture)
2. Chaque segment doit contenir 18-32 mots
3. Ne jamais écrire de segments courts - chaque segment doit être une phrase complète et significative
4. Utilisez un langage puissant et percutant
5. Ajoutez des détails et des exemples réels
6. Le contenu doit apporter une valeur réelle au spectateur`,
  },

  Educational: {
    ar: `أنت معلم ومحاضر عربي محترف متخصص في كتابة محتوى تعليمي للفيديو.

قواعد صارمة:
1. النص بين 80 و 160 كلمة عربية (40-80 ثانية)
2. كل مقطع 15-30 كلمة
3. اشرح بوضوح وعمق مع أمثلة واقعية
4. استخدم أسلوباً سهلاً ومشوقاً`,

    en: `You are a professional English educational content creator for video.

Strict rules:
1. Text between 100 and 200 words (40-80 seconds)
2. Each segment 20-35 words
3. Explain clearly with real examples
4. Use engaging, accessible style`,

    fr: `Vous êtes un créateur professionnel de contenu éducatif en français pour vidéo.

Règles strictes:
1. Texte entre 90 et 185 mots (40-80 secondes)
2. Chaque segment 18-32 mots
3. Expliquez clairement avec des exemples réels
4. Style engageant et accessible`,
  },

  Story: {
    ar: `أنت راوي قصص عربي محترف متخصص في كتابة قصص للفيديو.

قواعد صارمة:
1. النص بين 80 و 160 كلمة عربية (40-80 ثانية)
2. كل مقطع 15-30 كلمة
3. ابنِ التوتر تدريجياً وأضف تفاصيل مؤثرة
4. اجعل المشاهد يشعر بالقصة`,

    en: `You are a professional English storyteller for video.

Strict rules:
1. Text between 100 and 200 words (40-80 seconds)
2. Each segment 20-35 words
3. Build tension gradually with impactful details
4. Make the viewer feel the story`,

    fr: `Vous êtes un conteur professionnel en français pour vidéo.

Règles strictes:
1. Texte entre 90 et 185 mots (40-80 secondes)
2. Chaque segment 18-32 mots
3. Construisez la tension progressivement
4. Faites ressentir l'histoire au spectateur`,
  },

  News: {
    ar: `أنت مذيع أخبار عربي محترف متخصص في كتابة نصوص إخبارية للفيديو.

قواعد صارمة:
1. النص بين 80 و 160 كلمة عربية (40-80 ثانية)
2. كل مقطع 15-30 كلمة
3. ابدأ بالخبر الأبرز وأضف السياق والتحليل
4. أسلوب موضوعي ومهني`,

    en: `You are a professional English news anchor for video.

Strict rules:
1. Text between 100 and 200 words (40-80 seconds)
2. Each segment 20-35 words
3. Start with breaking news, add context and analysis
4. Objective and professional style`,

    fr: `Vous êtes un présentateur de nouvelles professionnel en français pour vidéo.

Règles strictes:
1. Texte entre 90 et 185 mots (40-80 secondes)
2. Chaque segment 18-32 mots
3. Commencez par les nouvelles importantes
4. Style objectif et professionnel`,
  },

  Tech: {
    ar: `أنت خبير تقنية عربي محترف متخصص في شرح التكنولوجيا للفيديو.

قواعد صارمة:
1. النص بين 80 و 160 كلمة عربية (40-80 ثانية)
2. كل مقطع 15-30 كلمة
3. اشرح بأمثلة يومية مبسطة وعملية
4. أبرز الفوائد الحقيقية للمشاهد`,

    en: `You are a professional English tech expert for video.

Strict rules:
1. Text between 100 and 200 words (40-80 seconds)
2. Each segment 20-35 words
3. Explain with simple, practical daily examples
4. Highlight real benefits for the viewer`,

    fr: `Vous êtes un expert tech professionnel en français pour vidéo.

Règles strictes:
1. Texte entre 90 et 185 mots (40-80 secondes)
2. Chaque segment 18-32 mots
3. Expliquez avec des exemples quotidiens simples
4. Mettez en évidence les avantages réels`,
  },

  Lifestyle: {
    ar: `أنت مؤثر في مجال نمط الحياة متخصص في كتابة محتوى للفيديو.

قواعد صارمة:
1. النص بين 80 و 160 كلمة عربية (40-80 ثانية)
2. كل مقطع 15-30 كلمة
3. كن صادقاً وقريباً من المشاهد
4. شارك نصائح عملية وقابلة للتطبيق فوراً`,

    en: `You are a professional English lifestyle influencer for video.

Strict rules:
1. Text between 100 and 200 words (40-80 seconds)
2. Each segment 20-35 words
3. Be authentic and relatable
4. Share practical, immediately applicable tips`,

    fr: `Vous êtes un influenceur lifestyle professionnel en français pour vidéo.

Règles strictes:
1. Texte entre 90 et 185 mots (40-80 secondes)
2. Chaque segment 18-32 mots
3. Soyez authentique et proche du spectateur
4. Partagez des conseils pratiques et immédiatement applicables`,
  },
};

// ============================
// ✅ بناء User Prompt لكل لغة
// ============================
function buildUserPrompt(topic, contentType, language) {
  const { minWds, maxWds } = getWordCountGuide(language);

  const prompts = {
    ar: `اكتب نص فيديو ${contentType} احترافي وكامل عن: "${topic}"

⚠️ متطلبات الطول - هذا إلزامي وليس اختيارياً:
- الحد الأدنى: ${minWds} كلمة عربية
- الحد الأقصى: ${maxWds} كلمة عربية
- هذا يعادل 40-80 ثانية قراءة بصوت طبيعي
- كل مقطع يجب أن يكون جملة كاملة ومعبرة (15-30 كلمة)
- لا تكتب مقاطع قصيرة أو ناقصة

الهيكل المطلوب (5 مقاطع على الأقل):
1. HOOK قوي يجذب الانتباه (15-25 كلمة): ابدأ بسؤال مثير أو إحصائية صادمة
2. المشكلة أو السياق (20-30 كلمة): وضّح التحدي الذي يواجهه المشاهد بتفاصيل
3. الحل والأفكار الرئيسية (25-35 كلمة): قدم الحل مع أمثلة وتفاصيل عملية
4. الفائدة والقيمة (20-30 كلمة): اشرح كيف ستتغير حياة المشاهد مع تفاصيل
5. CTA قوي (15-25 كلمة): اطلب تفاعلاً محدداً مع سبب مقنع

أرجع JSON فقط بهذا الشكل الدقيق:
{
  "title": "عنوان جذاب ومميز",
  "hook": "جملة الجذب الأولى القوية",
  "segments": [
    "المقطع الأول كامل ومفصل يحتوي على 15-25 كلمة على الأقل",
    "المقطع الثاني كامل ومفصل يحتوي على 20-30 كلمة على الأقل",
    "المقطع الثالث كامل ومفصل يحتوي على 25-35 كلمة على الأقل",
    "المقطع الرابع كامل ومفصل يحتوي على 20-30 كلمة على الأقل",
    "المقطع الخامس كامل ومفصل يحتوي على 15-25 كلمة على الأقل"
  ],
  "cta": "دعوة للعمل واضحة ومقنعة",
  "keywords": ["كلمة1", "كلمة2", "كلمة3", "كلمة4"],
  "emotional_triggers": ["مشاعر1", "مشاعر2"],
  "word_count": ${minWds},
  "estimated_duration_seconds": 60
}`,

    en: `Write a complete and professional ${contentType} video script about: "${topic}"

⚠️ Length requirements - MANDATORY not optional:
- Minimum: ${minWds} English words
- Maximum: ${maxWds} English words
- This equals 40-80 seconds of natural speaking
- Each segment must be a complete, meaningful sentence (20-35 words)
- Never write short or incomplete segments

Required structure (minimum 5 segments):
1. Strong HOOK (20-30 words): Start with a compelling question or shocking statistic
2. Problem/Context (25-35 words): Clearly explain the challenge with details
3. Solution/Key ideas (30-40 words): Present the solution with practical examples
4. Benefits/Value (25-35 words): Explain how viewer's life will change with details
5. Strong CTA (20-30 words): Request specific engagement with compelling reason

Return JSON only in this exact format:
{
  "title": "Catchy and unique title",
  "hook": "Powerful opening hook sentence",
  "segments": [
    "First segment complete and detailed with at least 20-30 words minimum",
    "Second segment complete and detailed with at least 25-35 words minimum",
    "Third segment complete and detailed with at least 30-40 words minimum",
    "Fourth segment complete and detailed with at least 25-35 words minimum",
    "Fifth segment complete and detailed with at least 20-30 words minimum"
  ],
  "cta": "Clear and compelling call to action",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4"],
  "emotional_triggers": ["emotion1", "emotion2"],
  "word_count": ${minWds},
  "estimated_duration_seconds": 60
}`,

    fr: `Écrivez un script vidéo ${contentType} complet et professionnel sur: "${topic}"

⚠️ Exigences de longueur - OBLIGATOIRE pas optionnel:
- Minimum: ${minWds} mots français
- Maximum: ${maxWds} mots français
- Cela équivaut à 40-80 secondes de lecture naturelle
- Chaque segment doit être une phrase complète et significative (18-32 mots)
- Ne jamais écrire de segments courts ou incomplets

Structure requise (minimum 5 segments):
1. ACCROCHE puissante (18-28 mots): Commencez par une question captivante
2. Problème/Contexte (22-32 mots): Expliquez clairement le défi avec des détails
3. Solution/Idées clés (28-38 mots): Présentez la solution avec des exemples pratiques
4. Avantages/Valeur (22-32 mots): Expliquez comment la vie du spectateur va changer
5. APPEL À L'ACTION (18-28 mots): Demandez un engagement spécifique

Retournez JSON uniquement dans ce format exact:
{
  "title": "Titre accrocheur et unique",
  "hook": "Phrase d'accroche puissante",
  "segments": [
    "Premier segment complet et détaillé avec au moins 18-28 mots minimum",
    "Deuxième segment complet et détaillé avec au moins 22-32 mots minimum",
    "Troisième segment complet et détaillé avec au moins 28-38 mots minimum",
    "Quatrième segment complet et détaillé avec au moins 22-32 mots minimum",
    "Cinquième segment complet et détaillé avec au moins 18-28 mots minimum"
  ],
  "cta": "Appel à l'action clair et convaincant",
  "keywords": ["mot1", "mot2", "mot3", "mot4"],
  "emotional_triggers": ["émotion1", "émotion2"],
  "word_count": ${minWds},
  "estimated_duration_seconds": 60
}`,
  };

  return prompts[language] || prompts['en'];
}

// ============================
// ✅ استدعاء Groq - مُصحّح
// ============================
async function callGroqModel(model, systemPrompt, userPrompt, apiKey, apiUrl) {
  let lastError;

  for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
    try {
      const response = await axios.post(
        `${apiUrl}/chat/completions`,
        {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userPrompt   },
          ],
          temperature    : 0.7,
          max_tokens     : 4000,
          top_p          : 0.9,
          response_format: { type: 'json_object' },
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type' : 'application/json',
          },
          timeout: CONFIG.timeoutMs,
        }
      );

      // ✅ إرجاع الاستجابة عند النجاح
      return response;

    } catch (error) {
      lastError    = error;
      const status = error.response?.status;

      logger.error('🔍 تفاصيل الخطأ', {
        status,
        model,
        attempt,
        data: JSON.stringify(error.response?.data)?.substring(0, 200),
      });

      // ✅ أخطاء لا تستحق إعادة المحاولة
      if (status === 401 || status === 403) {
        throw error;
      }

      if (status === 404) {
        const err       = new Error(`MODEL_NOT_FOUND:${model}`);
        err.isModelNotFound = true;
        throw err;
      }

      if (status === 400) {
        const err      = new Error(`BAD_REQUEST:${model}`);
        err.isBadRequest = true;
        throw err;
      }

      // ✅ تجاوز الحصة - انتظر ثم أعد المحاولة
      if (status === 429) {
        if (attempt < CONFIG.maxRetries) {
          logger.warn(`⚠️ تجاوز الحصة (429) - انتظار ${CONFIG.retryDelay / 1000}s`);
          await new Promise(r => setTimeout(r, CONFIG.retryDelay));
          continue;
        }
        const err      = new Error(`QUOTA_EXCEEDED:${model}`);
        err.isQuotaError = true;
        throw err;
      }

      // ✅ أخطاء شبكة - انتظر قليلاً
      if (attempt < CONFIG.maxRetries) {
        const waitMs = 3000 * attempt;
        logger.warn(`⚠️ محاولة ${attempt}/${CONFIG.maxRetries} - انتظار ${waitMs}ms`);
        await new Promise(r => setTimeout(r, waitMs));
      }
    }
  }

  // ✅ رمي آخر خطأ إذا فشلت كل المحاولات
  throw lastError;
}

// ============================
// ✅ استخراج JSON
// ============================
function extractJSON(text) {
  if (!text || typeof text !== 'string') {
    throw new SyntaxError('النص فارغ');
  }

  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return JSON.parse(trimmed);

  const jsonBlock = trimmed.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonBlock) return JSON.parse(jsonBlock[1].trim());

  const codeBlock = trimmed.match(/```\s*([\s\S]*?)\s*```/);
  if (codeBlock) return JSON.parse(codeBlock[1].trim());

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch) return JSON.parse(jsonMatch[0]);

  throw new SyntaxError('لا يمكن استخراج JSON');
}

// ============================
// ✅ التحقق من المحتوى والطول
// ============================
function validateContentData(data, language = 'ar') {
  const errors = [];

  if (!data.title || typeof data.title !== 'string') errors.push('title مفقود');
  if (!data.hook  || typeof data.hook  !== 'string') errors.push('hook مفقود');
  if (!data.cta   || typeof data.cta   !== 'string') errors.push('cta مفقود');

  if (!Array.isArray(data.segments)) {
    errors.push('segments يجب أن يكون array');
  } else if (data.segments.length < CONFIG.content.minSegments) {
    errors.push(`segments أقل من ${CONFIG.content.minSegments}`);
  } else if (data.segments.length > CONFIG.content.maxSegments) {
    data.segments = data.segments.slice(0, CONFIG.content.maxSegments);
  }

  if (!Array.isArray(data.keywords) || data.keywords.length < CONFIG.content.minKeywords) {
    data.keywords = data.keywords || [data.title || 'general'];
  }

  if (!Array.isArray(data.emotional_triggers)) {
    data.emotional_triggers = [];
  }

  // ✅ التحقق من الطول
  const fullText  = data.segments.join(' ');
  const wordCount = fullText.trim().split(/\s+/).filter(w => w).length;
  const wps       = CONFIG.content.wordsPerSecond[language] || 2.5;
  const duration  = Math.round(wordCount / wps);

  logger.info(`📊 إحصائيات النص`, {
    wordCount,
    duration: `${duration}s`,
    target  : `${CONFIG.content.minDurationSeconds}-${CONFIG.content.maxDurationSeconds}s`,
    status  :
      duration < CONFIG.content.minDurationSeconds ? '⚠️ قصير جداً' :
      duration > CONFIG.content.maxDurationSeconds ? '⚠️ طويل جداً' :
      '✅ مثالي',
  });

  if (duration < CONFIG.content.minDurationSeconds) {
    logger.warn(
      `⚠️ النص قصير: ${duration}s | كلمات: ${wordCount} | ` +
      `الحد الأدنى: ${CONFIG.content.minDurationSeconds}s`
    );
  }

  if (duration > CONFIG.content.maxDurationSeconds) {
    const maxWords = Math.round(CONFIG.content.maxDurationSeconds * wps);
    const allWords = fullText.trim().split(/\s+/);
    const segCount = data.segments.length;
    const wPerSeg  = Math.floor(maxWords / segCount);

    logger.warn(`⚠️ النص طويل: ${duration}s - سيتم القص`);

    data.segments = Array.from({ length: segCount }, (_, i) => {
      const start = i * wPerSeg;
      const end   = i === segCount - 1 ? maxWords : start + wPerSeg;
      return allWords.slice(start, end).join(' ');
    }).filter(s => s.trim());
  }

  data.estimated_duration_seconds = duration;
  data.word_count                 = wordCount;

  if (errors.length > 0) {
    throw new Error(`❌ المحتوى غير صالح: ${errors.join(', ')}`);
  }

  return data;
}

// ============================
// ✅ توليد محتوى للغة واحدة
// ============================
async function generateForLanguage(language, contentType, topic, apiKey, apiUrl) {
  const systemPrompt = SYSTEM_PROMPTS[contentType]?.[language];
  if (!systemPrompt) {
    throw new Error(`❌ لا يوجد system prompt للغة "${language}" والنوع "${contentType}"`);
  }

  const userPrompt        = buildUserPrompt(topic, contentType, language);
  const { minWds, maxWds } = getWordCountGuide(language);

  logger.info(`🌍 توليد ${language}: هدف ${minWds}-${maxWds} كلمة`);

  for (const model of CONFIG.models) {
    try {
      logger.info(`🤖 ${language} | النموذج: ${model}`);

      const response = await callGroqModel(
        model, systemPrompt, userPrompt, apiKey, apiUrl
      );

      const rawContent = response?.data?.choices?.[0]?.message?.content;
      if (!rawContent) {
        logger.warn(`⚠️ ${model}: استجابة فارغة`);
        continue;
      }

      let contentData;
      try {
        contentData = extractJSON(rawContent);
      } catch {
        logger.warn(`⚠️ ${model}: JSON غير صالح`);
        continue;
      }

      const validatedContent = validateContentData(contentData, language);

      logger.success(`✅ ${language} تم بنجاح`, {
        model,
        title   : validatedContent.title,
        words   : validatedContent.word_count,
        duration: `${validatedContent.estimated_duration_seconds}s`,
      });

      return validatedContent;

    } catch (error) {
      if (error.isModelNotFound) { logger.warn(`⚠️ ${model}: غير موجود`);      continue; }
      if (error.isQuotaError)    { logger.warn(`⚠️ ${model}: تجاوز الحصة`);   continue; }
      if (error.isBadRequest)    { logger.warn(`⚠️ ${model}: طلب خاطئ`);      continue; }

      const status = error.response?.status;
      if (status === 401 || status === 403) {
        logger.error(`❌ خطأ مصادقة - تحقق من GROQ_API_KEY`);
        throw error;
      }

      logger.warn(`⚠️ ${model}: فشل - جرب التالي`);
    }
  }

  throw new Error(`❌ فشل توليد المحتوى بـ ${language} - جميع النماذج فشلت`);
}

// ============================
// ✅ الدالة الرئيسية - لغة واحدة
// ============================
export async function generateEngagingContent(language, contentType, topic) {
  logger.info(`🎬 توليد محتوى: ${contentType} | ${language} | "${topic}"`);

  const { apiKey, apiUrl }  = getApiConfig();
  const { minWds, maxWds }  = getWordCountGuide(language);

  logger.info(`🌐 Groq URL : ${apiUrl}`);
  logger.info(`🤖 النماذج : ${CONFIG.models.join(', ')}`);
  logger.info(`⏱️  الهدف   : ${minWds}-${maxWds} كلمة (40-80 ثانية)`);

  if (!SYSTEM_PROMPTS[contentType]) {
    throw new Error(
      `❌ نوع المحتوى غير مدعوم: "${contentType}"\n` +
      `المتاح: ${Object.keys(SYSTEM_PROMPTS).join(', ')}`
    );
  }

  return generateForLanguage(language, contentType, topic, apiKey, apiUrl);
}

// ============================
// ✅ الدالة الجديدة - 3 لغات معاً
// ============================
export async function generateAllLanguages(contentType, topic) {
  logger.section('🌍 توليد المحتوى لجميع اللغات');
  logger.info(`📝 النوع  : ${contentType}`);
  logger.info(`🎯 الموضوع: ${topic}`);

  const { apiKey, apiUrl } = getApiConfig();

  if (!SYSTEM_PROMPTS[contentType]) {
    throw new Error(`❌ نوع المحتوى غير مدعوم: "${contentType}"`);
  }

  const languages = ['ar', 'en', 'fr'];
  const results   = {};

  for (const lang of languages) {
    logger.info(`\n${'─'.repeat(50)}`);
    logger.info(`🌍 توليد: ${lang.toUpperCase()}`);

    try {
      results[lang] = await generateForLanguage(
        lang, contentType, topic, apiKey, apiUrl
      );

      // ✅ انتظار بين الطلبات لتجنب 429
      if (lang !== 'fr') {
        logger.info('⏳ انتظار 2s...');
        await new Promise(r => setTimeout(r, 2000));
      }

    } catch (error) {
      logger.error(`❌ فشل ${lang}: ${error.message}`);
      results[lang] = null;
    }
  }

  // ✅ تقرير النتائج
  logger.section('📊 تقرير التوليد');
  for (const lang of languages) {
    if (results[lang]) {
      logger.success(
        `✅ ${lang}: "${results[lang].title}" | ` +
        `${results[lang].word_count} كلمة | ` +
        `${results[lang].estimated_duration_seconds}s`
      );
    } else {
      logger.error(`❌ ${lang}: فشل التوليد`);
    }
  }

  return results;
}

// ============================
// ✅ دوال مساعدة
// ============================
export function getSupportedLanguages() {
  return ['ar', 'en', 'fr'];
}

export function getSupportedContentTypes() {
  return Object.keys(SYSTEM_PROMPTS);
}

export function isSupported(language, contentType) {
  return !!(SYSTEM_PROMPTS[contentType]?.[language]);
}
