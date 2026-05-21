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

  timeoutMs  : 30000,
  maxRetries : 2,
  retryDelay : 10000,

  content: {
    minSegments        : 3,
    maxSegments        : 10,
    minKeywords        : 3,
    minDurationSeconds : 40,
    maxDurationSeconds : 80,
    wordsPerSecond     : {
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
// ✅ القوالب
// ============================
const CONTENT_TEMPLATES = {
  ar: {
    Motivational: {
      systemPrompt: `أنت خبير في كتابة محتوى تحفيزي احترافي يشد المشاهد من البداية.

المتطلبات:
- ابدأ بـ HOOK قوي يجذب المشاهد في أول 3 ثواني
- استخدم قصص حقيقية أو إحصائيات مؤثرة
- خاطب المشاهد مباشرة (أنت، نحن)
- أضف رسالة قيمة تلمس العقل والقلب
- انهِ بـ CALL TO ACTION قوي
- لغة بسيطة وقوية وواضحة
- ⏱️ مدة القراءة يجب أن تكون بين 40-80 ثانية`,

      userPrompt: (topic, language = 'ar') => {
        const { minWds, maxWds } = getWordCountGuide(language);
        return `اكتب نص فيديو تحفيزي احترافي عن: "${topic}"

⚠️ متطلبات الطول - مهم جداً:
- إجمالي الكلمات: بين ${minWds} و ${maxWds} كلمة
- يعادل مدة قراءة بين 40-80 ثانية
- كل مقطع: 15-25 كلمة

الهيكل:
1. HOOK (5-8 ث): 10-16 كلمة
2. المشكلة (8-12 ث): 16-24 كلمة
3. الحل (12-18 ث): 24-36 كلمة
4. الفائدة (8-12 ث): 16-24 كلمة
5. CTA (5-8 ث): 10-16 كلمة

أرجع JSON فقط:
{
  "title": "عنوان جذاب",
  "hook": "جملة الجذب الأولى",
  "segments": ["مقطع1 15-25 كلمة", "مقطع2", "مقطع3", "مقطع4", "مقطع5"],
  "cta": "دعوة للعمل",
  "keywords": ["كلمة1", "كلمة2", "كلمة3"],
  "emotional_triggers": ["مشاعر"],
  "estimated_duration_seconds": 60
}`;
      },
    },

    Educational: {
      systemPrompt: `أنت معلم خبير في إنشاء محتوى تعليمي جذاب وسهل الفهم.

المتطلبات:
- ابدأ بسؤال يشعل الفضول
- اشرح المفهوم ببساطة
- استخدم أمثلة واقعية
- أضف نصائح عملية فورية
- انهِ بـ CTA يشجع على التعلم
- ⏱️ مدة القراءة بين 40-80 ثانية`,

      userPrompt: (topic, language = 'ar') => {
        const { minWds, maxWds } = getWordCountGuide(language);
        return `اكتب نص فيديو تعليمي عن: "${topic}"

⚠️ الطول: بين ${minWds} و ${maxWds} كلمة (40-80 ثانية)

أرجع JSON فقط:
{
  "title": "عنوان",
  "hook": "السؤال الافتتاحي",
  "segments": ["مقطع1", "مقطع2", "مقطع3", "مقطع4", "مقطع5"],
  "cta": "دعوة للعمل",
  "keywords": ["كلمة1", "كلمة2", "كلمة3"],
  "emotional_triggers": ["فضول", "تعلم"],
  "estimated_duration_seconds": 60
}`;
      },
    },

    Story: {
      systemPrompt: `أنت راوي قصص احترافي.
- ⏱️ مدة القراءة بين 40-80 ثانية`,

      userPrompt: (topic, language = 'ar') => {
        const { minWds, maxWds } = getWordCountGuide(language);
        return `اكتب قصة فيديو عن: "${topic}"

⚠️ الطول: بين ${minWds} و ${maxWds} كلمة (40-80 ثانية)

أرجع JSON فقط:
{
  "title": "عنوان",
  "hook": "المشهد الافتتاحي",
  "segments": ["مشهد1", "مشهد2", "مشهد3", "الذروة", "الرسالة"],
  "cta": "دعوة للعمل",
  "keywords": ["كلمة1", "كلمة2", "كلمة3"],
  "emotional_triggers": ["تشويق", "أمل"],
  "estimated_duration_seconds": 60
}`;
      },
    },

    News: {
      systemPrompt: `أنت مذيع أخبار احترافي.
- ⏱️ مدة القراءة بين 40-80 ثانية`,

      userPrompt: (topic, language = 'ar') => {
        const { minWds, maxWds } = getWordCountGuide(language);
        return `اكتب نص فيديو إخباري عن: "${topic}"

⚠️ الطول: بين ${minWds} و ${maxWds} كلمة (40-80 ثانية)

أرجع JSON فقط:
{
  "title": "عنوان الخبر",
  "hook": "الخبر الأبرز",
  "segments": ["الخبر", "التفاصيل", "السياق", "التحليل", "الأثر"],
  "cta": "تابعنا للمزيد",
  "keywords": ["كلمة1", "كلمة2", "كلمة3"],
  "emotional_triggers": ["اهتمام", "وعي"],
  "estimated_duration_seconds": 60
}`;
      },
    },

    Tech: {
      systemPrompt: `أنت خبير تقنية.
- ⏱️ مدة القراءة بين 40-80 ثانية`,

      userPrompt: (topic, language = 'ar') => {
        const { minWds, maxWds } = getWordCountGuide(language);
        return `اكتب نص فيديو تقني عن: "${topic}"

⚠️ الطول: بين ${minWds} و ${maxWds} كلمة (40-80 ثانية)

أرجع JSON فقط:
{
  "title": "عنوان تقني",
  "hook": "حقيقة مثيرة",
  "segments": ["المقدمة", "الشرح", "مثال", "الفوائد", "المستقبل"],
  "cta": "اشترك",
  "keywords": ["كلمة1", "كلمة2", "كلمة3"],
  "emotional_triggers": ["فضول", "إثارة"],
  "estimated_duration_seconds": 60
}`;
      },
    },

    Lifestyle: {
      systemPrompt: `أنت مؤثر في مجال نمط الحياة.
- ⏱️ مدة القراءة بين 40-80 ثانية`,

      userPrompt: (topic, language = 'ar') => {
        const { minWds, maxWds } = getWordCountGuide(language);
        return `اكتب نص فيديو Lifestyle عن: "${topic}"

⚠️ الطول: بين ${minWds} و ${maxWds} كلمة (40-80 ثانية)

أرجع JSON فقط:
{
  "title": "عنوان ملهم",
  "hook": "موقف من الحياة",
  "segments": ["المقدمة", "المشكلة", "النصائح", "التطبيق", "التحدي"],
  "cta": "جرب اليوم",
  "keywords": ["كلمة1", "كلمة2", "كلمة3"],
  "emotional_triggers": ["إلهام", "تحفيز"],
  "estimated_duration_seconds": 60
}`;
      },
    },
  },

  en: {
    Motivational: {
      systemPrompt: `You are an expert in creating professional motivational content.
- ⏱️ Reading duration must be between 40-80 seconds`,

      userPrompt: (topic, language = 'en') => {
        const { minWds, maxWds } = getWordCountGuide(language);
        return `Write a motivational video script about: "${topic}"

⚠️ Length requirement: between ${minWds} and ${maxWds} words (40-80 seconds)
Each segment: 20-30 words

Return JSON only:
{
  "title": "Catchy title",
  "hook": "Opening hook",
  "segments": ["segment1 20-30 words", "segment2", "segment3", "segment4", "segment5"],
  "cta": "Call to action",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "emotional_triggers": ["emotions"],
  "estimated_duration_seconds": 60
}`;
      },
    },

    Educational: {
      systemPrompt: `You are an expert teacher.
- ⏱️ Reading duration: 40-80 seconds`,

      userPrompt: (topic, language = 'en') => {
        const { minWds, maxWds } = getWordCountGuide(language);
        return `Write an educational video script about: "${topic}"

⚠️ Length: between ${minWds} and ${maxWds} words (40-80 seconds)

Return JSON only:
{
  "title": "Title",
  "hook": "Opening question",
  "segments": ["seg1", "seg2", "seg3", "seg4", "seg5"],
  "cta": "Call to action",
  "keywords": ["k1", "k2", "k3"],
  "emotional_triggers": ["curiosity"],
  "estimated_duration_seconds": 60
}`;
      },
    },

    Story: {
      systemPrompt: `You are a professional storyteller.
- ⏱️ Reading duration: 40-80 seconds`,

      userPrompt: (topic, language = 'en') => {
        const { minWds, maxWds } = getWordCountGuide(language);
        return `Write a story video about: "${topic}"

⚠️ Length: between ${minWds} and ${maxWds} words (40-80 seconds)

Return JSON only:
{
  "title": "Title",
  "hook": "Opening scene",
  "segments": ["scene1", "scene2", "climax", "resolution", "message"],
  "cta": "Call to action",
  "keywords": ["k1", "k2", "k3"],
  "emotional_triggers": ["suspense"],
  "estimated_duration_seconds": 60
}`;
      },
    },

    News: {
      systemPrompt: `You are a professional news anchor.
- ⏱️ Reading duration: 40-80 seconds`,

      userPrompt: (topic, language = 'en') => {
        const { minWds, maxWds } = getWordCountGuide(language);
        return `Write a news video script about: "${topic}"

⚠️ Length: between ${minWds} and ${maxWds} words (40-80 seconds)

Return JSON only:
{
  "title": "Headline",
  "hook": "Breaking news",
  "segments": ["news", "details", "context", "analysis", "impact"],
  "cta": "Follow for more",
  "keywords": ["k1", "k2", "k3"],
  "emotional_triggers": ["awareness"],
  "estimated_duration_seconds": 60
}`;
      },
    },

    Tech: {
      systemPrompt: `You are a tech expert.
- ⏱️ Reading duration: 40-80 seconds`,

      userPrompt: (topic, language = 'en') => {
        const { minWds, maxWds } = getWordCountGuide(language);
        return `Write a tech video script about: "${topic}"

⚠️ Length: between ${minWds} and ${maxWds} words (40-80 seconds)

Return JSON only:
{
  "title": "Tech title",
  "hook": "Amazing fact",
  "segments": ["intro", "explanation", "example", "benefits", "future"],
  "cta": "Subscribe",
  "keywords": ["k1", "k2", "k3"],
  "emotional_triggers": ["curiosity"],
  "estimated_duration_seconds": 60
}`;
      },
    },

    Lifestyle: {
      systemPrompt: `You are a lifestyle influencer.
- ⏱️ Reading duration: 40-80 seconds`,

      userPrompt: (topic, language = 'en') => {
        const { minWds, maxWds } = getWordCountGuide(language);
        return `Write a lifestyle video script about: "${topic}"

⚠️ Length: between ${minWds} and ${maxWds} words (40-80 seconds)

Return JSON only:
{
  "title": "Inspiring title",
  "hook": "Everyday situation",
  "segments": ["intro", "problem", "tips", "application", "challenge"],
  "cta": "Try today",
  "keywords": ["k1", "k2", "k3"],
  "emotional_triggers": ["inspiration"],
  "estimated_duration_seconds": 60
}`;
      },
    },
  },

  fr: {
    Motivational: {
      systemPrompt: `Vous êtes un expert en contenu motivationnel.
- ⏱️ Durée de lecture: 40-80 secondes`,

      userPrompt: (topic, language = 'fr') => {
        const { minWds, maxWds } = getWordCountGuide(language);
        return `Écrivez un script vidéo motivationnel sur: "${topic}"

⚠️ Longueur: entre ${minWds} et ${maxWds} mots (40-80 secondes)

Retournez JSON uniquement:
{
  "title": "Titre",
  "hook": "Accroche",
  "segments": ["seg1", "seg2", "seg3", "seg4", "seg5"],
  "cta": "Appel à l'action",
  "keywords": ["mot1", "mot2", "mot3"],
  "emotional_triggers": ["émotions"],
  "estimated_duration_seconds": 60
}`;
      },
    },

    Educational: {
      systemPrompt: `Vous êtes un enseignant expert.
- ⏱️ Durée: 40-80 secondes`,

      userPrompt: (topic, language = 'fr') => {
        const { minWds, maxWds } = getWordCountGuide(language);
        return `Écrivez un script éducatif sur: "${topic}"

⚠️ Longueur: entre ${minWds} et ${maxWds} mots (40-80 secondes)

Retournez JSON uniquement:
{
  "title": "Titre",
  "hook": "Question",
  "segments": ["seg1", "seg2", "seg3", "seg4", "seg5"],
  "cta": "Action",
  "keywords": ["mot1", "mot2", "mot3"],
  "emotional_triggers": ["curiosité"],
  "estimated_duration_seconds": 60
}`;
      },
    },

    Story: {
      systemPrompt: `Vous êtes un conteur professionnel.
- ⏱️ Durée: 40-80 secondes`,

      userPrompt: (topic, language = 'fr') => {
        const { minWds, maxWds } = getWordCountGuide(language);
        return `Écrivez une histoire vidéo sur: "${topic}"

⚠️ Longueur: entre ${minWds} et ${maxWds} mots (40-80 secondes)

Retournez JSON uniquement:
{
  "title": "Titre",
  "hook": "Scène d'ouverture",
  "segments": ["scène1", "scène2", "climax", "résolution", "message"],
  "cta": "Action",
  "keywords": ["mot1", "mot2", "mot3"],
  "emotional_triggers": ["suspense"],
  "estimated_duration_seconds": 60
}`;
      },
    },

    News: {
      systemPrompt: `Vous êtes un présentateur professionnel.
- ⏱️ Durée: 40-80 secondes`,

      userPrompt: (topic, language = 'fr') => {
        const { minWds, maxWds } = getWordCountGuide(language);
        return `Écrivez un script d'actualités sur: "${topic}"

⚠️ Longueur: entre ${minWds} et ${maxWds} mots (40-80 secondes)

Retournez JSON uniquement:
{
  "title": "Titre",
  "hook": "Accroche",
  "segments": ["nouvelles", "détails", "contexte", "analyse", "impact"],
  "cta": "Suivez-nous",
  "keywords": ["mot1", "mot2", "mot3"],
  "emotional_triggers": ["conscience"],
  "estimated_duration_seconds": 60
}`;
      },
    },

    Tech: {
      systemPrompt: `Vous êtes un expert tech.
- ⏱️ Durée: 40-80 secondes`,

      userPrompt: (topic, language = 'fr') => {
        const { minWds, maxWds } = getWordCountGuide(language);
        return `Écrivez un script tech sur: "${topic}"

⚠️ Longueur: entre ${minWds} et ${maxWds} mots (40-80 secondes)

Retournez JSON uniquement:
{
  "title": "Titre tech",
  "hook": "Fait étonnant",
  "segments": ["intro", "explication", "exemple", "avantages", "futur"],
  "cta": "Abonnez-vous",
  "keywords": ["mot1", "mot2", "mot3"],
  "emotional_triggers": ["curiosité"],
  "estimated_duration_seconds": 60
}`;
      },
    },

    Lifestyle: {
      systemPrompt: `Vous êtes un influenceur lifestyle.
- ⏱️ Durée: 40-80 secondes`,

      userPrompt: (topic, language = 'fr') => {
        const { minWds, maxWds } = getWordCountGuide(language);
        return `Écrivez un script lifestyle sur: "${topic}"

⚠️ Longueur: entre ${minWds} et ${maxWds} mots (40-80 secondes)

Retournez JSON uniquement:
{
  "title": "Titre inspirant",
  "hook": "Situation quotidienne",
  "segments": ["intro", "problème", "conseils", "application", "défi"],
  "cta": "Essayez",
  "keywords": ["mot1", "mot2", "mot3"],
  "emotional_triggers": ["inspiration"],
  "estimated_duration_seconds": 60
}`;
      },
    },
  },
};

// ============================
// ✅ استدعاء Groq
// ============================
async function callGroqModel(model, systemPrompt, userPrompt, apiKey, apiUrl) {
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
          temperature    : 0.85,
          max_tokens     : 3000,
          top_p          : 0.95,
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

      return response;

    } catch (error) {
      const status = error.response?.status;

      logger.error('🔍 تفاصيل الخطأ', {
        status,
        model,
        data: JSON.stringify(error.response?.data)?.substring(0, 200),
      });

      if (status === 401 || status === 403) throw error;

      if (status === 404) {
        const err = new Error(`MODEL_NOT_FOUND:${model}`);
        err.isModelNotFound = true;
        throw err;
      }

      if (status === 400) {
        const err = new Error(`BAD_REQUEST:${model}`);
        err.isBadRequest = true;
        throw err;
      }

      if (status === 429) {
        if (attempt < CONFIG.maxRetries) {
          logger.warn(`⚠️ تجاوز الحصة - انتظار ${CONFIG.retryDelay / 1000}s`);
          await new Promise(r => setTimeout(r, CONFIG.retryDelay));
          continue;
        }
        const err = new Error(`QUOTA_EXCEEDED:${model}`);
        err.isQuotaError = true;
        throw err;
      }

      if (attempt < CONFIG.maxRetries) {
        await new Promise(r => setTimeout(r, 3000 * attempt));
      } else {
        throw error;
      }
    }
  }
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

  // ✅ التحقق من طول النص
  const fullText  = data.segments.join(' ');
  const wordCount = fullText.trim().split(/\s+/).filter(w => w).length;
  const wps       = CONFIG.content.wordsPerSecond[language] || 2.5;
  const duration  = Math.round(wordCount / wps);

  logger.info(`📊 إحصائيات النص`, {
    wordCount,
    duration        : `${duration}s`,
    target          : `${CONFIG.content.minDurationSeconds}-${CONFIG.content.maxDurationSeconds}s`,
    status          : duration < CONFIG.content.minDurationSeconds ? '⚠️ قصير' :
                      duration > CONFIG.content.maxDurationSeconds ? '⚠️ طويل' : '✅ مثالي',
  });

  if (duration < CONFIG.content.minDurationSeconds) {
    logger.warn(`⚠️ النص قصير: ${duration}s (الحد الأدنى ${CONFIG.content.minDurationSeconds}s)`);
  }

  if (duration > CONFIG.content.maxDurationSeconds) {
    logger.warn(`⚠️ النص طويل: ${duration}s - سيتم القص`);
    const maxWords   = Math.round(CONFIG.content.maxDurationSeconds * wps);
    const allWords   = fullText.trim().split(/\s+/);
    const segCount   = data.segments.length;
    const wPerSeg    = Math.floor(maxWords / segCount);

    data.segments = Array.from({ length: segCount }, (_, i) => {
      const start = i * wPerSeg;
      const end   = i === segCount - 1 ? maxWords : start + wPerSeg;
      return allWords.slice(start, end).join(' ');
    }).filter(s => s.trim());
  }

  data.estimated_duration_seconds = duration;

  if (errors.length > 0) {
    throw new Error(`❌ المحتوى غير صالح: ${errors.join(', ')}`);
  }

  return data;
}

// ============================
// ✅ الدالة الرئيسية
// ============================
export async function generateEngagingContent(language, contentType, topic) {
  logger.info(`🎬 توليد محتوى: ${contentType} | ${language} | "${topic}"`);

  const { apiKey, apiUrl } = getApiConfig();
  const { minWds, maxWds } = getWordCountGuide(language);

  logger.info(`🌐 Groq API URL: ${apiUrl}`);
  logger.info(`🤖 النماذج المتاحة: ${CONFIG.models.join(', ')}`);
  logger.info(`⏱️  الهدف: ${minWds}-${maxWds} كلمة (40-80 ثانية)`);

  const template = CONTENT_TEMPLATES[language]?.[contentType];
  if (!template) {
    throw new Error(
      `❌ لا يوجد قالب للغة "${language}" أو النوع "${contentType}"\n` +
      `اللغات المتاحة: ${Object.keys(CONTENT_TEMPLATES).join(', ')}`
    );
  }

  // ✅ تمرير language للـ userPrompt
  const userPromptText = template.userPrompt(topic, language);

  for (const model of CONFIG.models) {
    try {
      logger.info(`🤖 جرب النموذج: ${model}`);

      const response = await callGroqModel(
        model,
        template.systemPrompt,
        userPromptText,
        apiKey,
        apiUrl
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

      // ✅ تمرير language للتحقق
      const validatedContent = validateContentData(contentData, language);

      logger.success(`✅ تم التوليد بنجاح`, {
        model,
        title   : validatedContent.title,
        segments: validatedContent.segments.length,
        duration: `${validatedContent.estimated_duration_seconds}s`,
        language,
      });

      return validatedContent;

    } catch (error) {
      if (error.isModelNotFound) { logger.warn(`⚠️ ${model}: غير موجود`); continue; }
      if (error.isQuotaError)    { logger.warn(`⚠️ ${model}: تجاوز الحصة`); continue; }
      if (error.isBadRequest)    { logger.warn(`⚠️ ${model}: طلب خاطئ`); continue; }

      const status = error.response?.status;
      if (status === 401 || status === 403) {
        logger.error(`❌ خطأ مصادقة - تحقق من GROQ_API_KEY`);
        throw error;
      }

      logger.warn(`⚠️ ${model}: فشل - جرب التالي`);
    }
  }

  throw new Error(`❌ جميع نماذج Groq فشلت!`);
}

// ============================
// ✅ دوال مساعدة
// ============================
export function getSupportedLanguages() {
  return Object.keys(CONTENT_TEMPLATES);
}

export function getSupportedContentTypes(language = 'ar') {
  return Object.keys(CONTENT_TEMPLATES[language] || {});
}

export function isSupported(language, contentType) {
  return !!CONTENT_TEMPLATES[language]?.[contentType];
}
