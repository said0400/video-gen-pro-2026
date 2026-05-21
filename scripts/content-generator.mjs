import axios from 'axios';
import dotenv from 'dotenv';
import { logger } from './logger.mjs';

dotenv.config();

// ============================
// ✅ الإعدادات
// ============================
const CONFIG = {
  // ✅ أسماء النماذج الصحيحة
  models: (process.env.GEMINI_TEXT_MODELS ||
    'gemini-2.0-flash,gemini-2.0-flash-lite,gemini-1.5-flash-latest,gemini-1.5-pro-latest')
    .split(',')
    .map(m => m.trim()),

  timeoutMs  : 60000,
  maxRetries : 3,
  retryDelay : 60000, // ✅ 60 ثانية عند 429

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
  const apiKey = process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY;
  const apiUrl = process.env.GEMINI_API_URL ||
    'https://generativelanguage.googleapis.com/v1beta';

  if (!apiKey || apiKey === 'undefined' || apiKey.trim() === '') {
    throw new Error(
      '❌ GEMINI_API_KEY_1 غير موجود\n' +
      'احصل على مفتاحك من: https://aistudio.google.com/'
    );
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
3. Ne jamais écrire de segments courts
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
// ✅ بناء User Prompt
// ============================
function buildUserPrompt(topic, contentType, language) {
  const { minWds, maxWds } = getWordCountGuide(language);

  const prompts = {
    ar: `اكتب نص فيديو ${contentType} احترافي وكامل عن: "${topic}"

⚠️ متطلبات الطول - هذا إلزامي:
- الحد الأدنى: ${minWds} كلمة عربية
- الحد الأقصى: ${maxWds} كلمة عربية
- يعادل 40-80 ثانية قراءة بصوت طبيعي
- كل مقطع جملة كاملة ومعبرة (15-30 كلمة)

الهيكل (5 مقاطع على الأقل):
1. HOOK (15-25 كلمة): سؤال مثير أو إحصائية صادمة
2. المشكلة (20-30 كلمة): التحدي بتفاصيل
3. الحل (25-35 كلمة): مع أمثلة عملية
4. الفائدة (20-30 كلمة): كيف ستتغير الحياة
5. CTA (15-25 كلمة): تفاعل محدد مع سبب مقنع

أرجع JSON فقط:
{
  "title": "عنوان جذاب",
  "hook": "جملة الجذب الأولى",
  "segments": [
    "مقطع 1 كامل 15-25 كلمة",
    "مقطع 2 كامل 20-30 كلمة",
    "مقطع 3 كامل 25-35 كلمة",
    "مقطع 4 كامل 20-30 كلمة",
    "مقطع 5 كامل 15-25 كلمة"
  ],
  "cta": "دعوة للعمل",
  "keywords": ["كلمة1", "كلمة2", "كلمة3", "كلمة4"],
  "emotional_triggers": ["مشاعر1", "مشاعر2"],
  "word_count": ${minWds},
  "estimated_duration_seconds": 60
}`,

    en: `Write a complete ${contentType} video script about: "${topic}"

⚠️ Length MANDATORY:
- Minimum: ${minWds} words
- Maximum: ${maxWds} words
- Each segment: complete sentence (20-35 words)

Structure (5 segments minimum):
1. HOOK (20-30 words)
2. Problem (25-35 words)
3. Solution (30-40 words)
4. Benefits (25-35 words)
5. CTA (20-30 words)

Return JSON only:
{
  "title": "Catchy title",
  "hook": "Opening hook",
  "segments": [
    "Segment 1 complete 20-30 words",
    "Segment 2 complete 25-35 words",
    "Segment 3 complete 30-40 words",
    "Segment 4 complete 25-35 words",
    "Segment 5 complete 20-30 words"
  ],
  "cta": "Call to action",
  "keywords": ["k1", "k2", "k3", "k4"],
  "emotional_triggers": ["e1", "e2"],
  "word_count": ${minWds},
  "estimated_duration_seconds": 60
}`,

    fr: `Écrivez un script vidéo ${contentType} complet sur: "${topic}"

⚠️ Longueur OBLIGATOIRE:
- Minimum: ${minWds} mots
- Maximum: ${maxWds} mots
- Chaque segment: phrase complète (18-32 mots)

Structure (5 segments minimum):
1. ACCROCHE (18-28 mots)
2. Problème (22-32 mots)
3. Solution (28-38 mots)
4. Avantages (22-32 mots)
5. APPEL À L'ACTION (18-28 mots)

Retournez JSON uniquement:
{
  "title": "Titre accrocheur",
  "hook": "Phrase d'accroche",
  "segments": [
    "Segment 1 complet 18-28 mots",
    "Segment 2 complet 22-32 mots",
    "Segment 3 complet 28-38 mots",
    "Segment 4 complet 22-32 mots",
    "Segment 5 complet 18-28 mots"
  ],
  "cta": "Appel à l'action",
  "keywords": ["m1", "m2", "m3", "m4"],
  "emotional_triggers": ["é1", "é2"],
  "word_count": ${minWds},
  "estimated_duration_seconds": 60
}`,
  };

  return prompts[language] || prompts['en'];
}

// ============================
// ✅ استدعاء Gemini - مع انتظار 60s عند 429
// ============================
async function callGeminiModel(model, systemPrompt, userPrompt, apiKey, apiUrl) {
  let lastError;

  for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
    try {
      const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

      const response = await axios.post(
        `${apiUrl}/models/${model}:generateContent?key=${apiKey}`,
        {
          contents: [
            {
              role : 'user',
              parts: [{ text: fullPrompt }],
            },
          ],
          generationConfig: {
            temperature     : 0.7,
            maxOutputTokens : 4000,
            topP            : 0.9,
            responseMimeType: 'application/json',
          },
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: CONFIG.timeoutMs,
        }
      );

      return response;

    } catch (error) {
      lastError    = error;
      const status = error.response?.status;

      logger.error('🔍 خطأ Gemini النصوص', {
        status,
        model,
        attempt,
        data: JSON.stringify(error.response?.data)?.substring(0, 200),
      });

      if (status === 401 || status === 403) throw error;

      if (status === 404) {
        const err           = new Error(`MODEL_NOT_FOUND:${model}`);
        err.isModelNotFound = true;
        throw err;
      }

      if (status === 400) {
        const err        = new Error(`BAD_REQUEST:${model}`);
        err.isBadRequest = true;
        throw err;
      }

      if (status === 429) {
        if (attempt < CONFIG.maxRetries) {
          // ✅ انتظار تدريجي: 60s, 120s
          const waitMs = CONFIG.retryDelay * attempt;
          logger.warn(`⚠️ تجاوز الحصة (429) - انتظار ${waitMs / 1000}s (محاولة ${attempt}/${CONFIG.maxRetries})`);
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }
        const err        = new Error(`QUOTA_EXCEEDED:${model}`);
        err.isQuotaError = true;
        throw err;
      }

      if (attempt < CONFIG.maxRetries) {
        await new Promise(r => setTimeout(r, 5000 * attempt));
      }
    }
  }

  throw lastError;
}

// ============================
// ✅ استخراج JSON
// ============================
function extractJSON(text) {
  if (!text || typeof text !== 'string') {
    throw new SyntaxError('النص فارغ أو غير صالح');
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

  const fullText  = data.segments.join(' ');
  const wordCount = fullText.trim().split(/\s+/).filter(w => w).length;
  const wps       = CONFIG.content.wordsPerSecond[language] || 2.5;
  const duration  = Math.round(wordCount / wps);

  logger.info(`📊 إحصائيات النص`, {
    wordCount,
    duration: `${duration}s`,
    target  : `${CONFIG.content.minDurationSeconds}-${CONFIG.content.maxDurationSeconds}s`,
    status  :
      duration < CONFIG.content.minDurationSeconds ? '⚠️ قصير' :
      duration > CONFIG.content.maxDurationSeconds ? '⚠️ طويل' :
      '✅ مثالي',
  });

  if (duration < CONFIG.content.minDurationSeconds) {
    logger.warn(`⚠️ النص قصير: ${duration}s | كلمات: ${wordCount}`);
  }

  if (duration > CONFIG.content.maxDurationSeconds) {
    const maxWords = Math.round(CONFIG.content.maxDurationSeconds * wps);
    const allWords = fullText.trim().split(/\s+/);
    const segCount = data.segments.length;
    const wPerSeg  = Math.floor(maxWords / segCount);

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
    throw new Error(`❌ لا يوجد قالب للغة "${language}" والنوع "${contentType}"`);
  }

  const userPrompt        = buildUserPrompt(topic, contentType, language);
  const { minWds, maxWds } = getWordCountGuide(language);

  logger.info(`🌍 توليد ${language}: هدف ${minWds}-${maxWds} كلمة`);

  for (const model of CONFIG.models) {
    try {
      logger.info(`🤖 ${language} | النموذج: ${model}`);

      const response = await callGeminiModel(
        model, systemPrompt, userPrompt, apiKey, apiUrl
      );

      const rawContent = response?.data?.candidates?.[0]?.content?.parts?.[0]?.text;
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
      if (error.isModelNotFound) { logger.warn(`⚠️ ${model}: غير موجود`);    continue; }
      if (error.isQuotaError)    { logger.warn(`⚠️ ${model}: تجاوز الحصة`); continue; }
      if (error.isBadRequest)    { logger.warn(`⚠️ ${model}: طلب خاطئ`);    continue; }

      const status = error.response?.status;
      if (status === 401 || status === 403) {
        logger.error(`❌ خطأ مصادقة - تحقق من GEMINI_API_KEY_1`);
        throw error;
      }

      logger.warn(`⚠️ ${model}: فشل - جرب التالي`);
    }
  }

  throw new Error(`❌ فشل توليد المحتوى بـ ${language} - جميع النماذج فشلت`);
}

// ============================
// ✅ الدالة الرئيسية
// ============================
export async function generateEngagingContent(language, contentType, topic) {
  logger.info(`🎬 توليد محتوى: ${contentType} | ${language} | "${topic}"`);

  const { apiKey, apiUrl }  = getApiConfig();
  const { minWds, maxWds }  = getWordCountGuide(language);

  logger.info(`🌐 Gemini URL  : ${apiUrl}`);
  logger.info(`🤖 النماذج    : ${CONFIG.models.join(', ')}`);
  logger.info(`⏱️  الهدف      : ${minWds}-${maxWds} كلمة (40-80 ثانية)`);
  logger.info(`🔑 المفتاح    : GEMINI_API_KEY_1`);

  if (!SYSTEM_PROMPTS[contentType]) {
    throw new Error(
      `❌ نوع المحتوى غير مدعوم: "${contentType}"\n` +
      `المتاح: ${Object.keys(SYSTEM_PROMPTS).join(', ')}`
    );
  }

  return generateForLanguage(language, contentType, topic, apiKey, apiUrl);
}

// ============================
// ✅ دوال مساعدة
// ============================
export function getSupportedLanguages() {
  return Object.keys(SYSTEM_PROMPTS.Motivational);
}

export function getSupportedContentTypes() {
  return Object.keys(SYSTEM_PROMPTS);
}

export function isSupported(language, contentType) {
  return !!(SYSTEM_PROMPTS[contentType]?.[language]);
}
