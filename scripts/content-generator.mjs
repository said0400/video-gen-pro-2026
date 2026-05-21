import axios from 'axios';
import dotenv from 'dotenv';
import { logger } from './logger.mjs';

dotenv.config();

// ============================
// ✅ الإعدادات
// ============================
const CONFIG = {
  model      : process.env.GROK_MODEL || 'grok-3',
  temperature: 0.85,
  maxTokens  : 3000,
  topP       : 0.95,
  timeoutMs  : 60000,   // ✅ 60 ثانية
  maxRetries : 3,
  retryDelay : 2000,

  content: {
    minSegments: 3,
    maxSegments: 10,
    minKeywords: 3,
  },
};

// ============================
// ✅ التحقق من متغيرات البيئة
// ============================
function getApiConfig() {
  const apiKey = process.env.GROK_API_KEY;
  const apiUrl = process.env.GROK_API_URL || 'https://api.x.ai/v1';

  if (!apiKey || apiKey === 'undefined' || apiKey.trim() === '') {
    throw new Error('❌ GROK_API_KEY غير موجود أو فارغ في متغيرات البيئة');
  }
  if (!apiUrl || apiUrl === 'undefined') {
    throw new Error('❌ GROK_API_URL غير موجود في متغيرات البيئة');
  }

  return { apiKey, apiUrl };
}

// ============================
// ✅ القوالب - كاملة لكل اللغات
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
- الطول: 120-180 كلمة`,

      userPrompt: (topic) => `اكتب نص فيديو تحفيزي احترافي عن: "${topic}"

الهيكل:
1. HOOK (5 ثواني): جملة قوية تجذب الانتباه
2. المشكلة (10 ثواني): المشكلة التي يواجهها المشاهد
3. الحل (15 ثانية): الفكرة الرئيسية
4. الفائدة (10 ثواني): الفائدة الحقيقية
5. CTA (5 ثواني): دعوة للتفاعل

أرجع JSON فقط بدون أي نص إضافي:
{
  "title": "عنوان جذاب",
  "hook": "جملة الجذب الأولى",
  "segments": ["مقطع 1", "مقطع 2", "مقطع 3", "مقطع 4", "مقطع 5"],
  "cta": "دعوة للعمل",
  "keywords": ["كلمة1", "كلمة2", "كلمة3"],
  "emotional_triggers": ["مشاعر مستهدفة"]
}`,
    },

    Educational: {
      systemPrompt: `أنت معلم خبير في إنشاء محتوى تعليمي جذاب وسهل الفهم.

المتطلبات:
- ابدأ بسؤال يشعل الفضول
- اشرح المفهوم ببساطة
- استخدم أمثلة واقعية
- أضف نصائح عملية فورية
- انهِ بـ CTA يشجع على التعلم`,

      userPrompt: (topic) => `اكتب نص فيديو تعليمي احترافي عن: "${topic}"

الهيكل:
1. السؤال الافتتاحي (5 ثواني)
2. شرح المفهوم (20 ثانية)
3. أمثلة عملية (15 ثانية)
4. نصائح قيمة (10 ثواني)
5. الخلاصة والـ CTA (5 ثواني)

أرجع JSON فقط:
{
  "title": "عنوان",
  "hook": "السؤال الافتتاحي",
  "segments": ["مقطع 1", "مقطع 2", "مقطع 3", "مقطع 4", "مقطع 5"],
  "cta": "دعوة للعمل",
  "keywords": ["كلمة1", "كلمة2", "كلمة3"],
  "emotional_triggers": ["فضول", "تعلم"]
}`,
    },

    Story: {
      systemPrompt: `أنت راوي قصص احترافي يجعل المشاهد يشعر بالقصة.

المتطلبات:
- ابدأ بمشهد جذاب
- ابنِ التوتر تدريجياً
- ذروة مؤثرة
- رسالة قيمة في النهاية`,

      userPrompt: (topic) => `اكتب قصة فيديو احترافية عن: "${topic}"

أرجع JSON فقط:
{
  "title": "عنوان القصة",
  "hook": "المشهد الافتتاحي",
  "segments": ["مشهد 1", "مشهد 2", "مشهد 3", "الذروة", "الرسالة"],
  "cta": "دعوة للعمل",
  "keywords": ["كلمة1", "كلمة2", "كلمة3"],
  "emotional_triggers": ["تشويق", "أمل"]
}`,
    },

    // ✅ القوالب المفقودة
    News: {
      systemPrompt: `أنت مذيع أخبار احترافي يقدم الأخبار بأسلوب جذاب وموثوق.

المتطلبات:
- ابدأ بالخبر الأبرز مباشرة
- كن دقيقاً وموضوعياً
- أضف السياق والتحليل
- انهِ بالأثر على المشاهد`,

      userPrompt: (topic) => `اكتب نص فيديو إخباري احترافي عن: "${topic}"

أرجع JSON فقط:
{
  "title": "عنوان الخبر",
  "hook": "الخبر الأبرز",
  "segments": ["الخبر", "التفاصيل", "السياق", "التحليل", "الأثر"],
  "cta": "تابعنا للمزيد",
  "keywords": ["كلمة1", "كلمة2", "كلمة3"],
  "emotional_triggers": ["اهتمام", "وعي"]
}`,
    },

    Tech: {
      systemPrompt: `أنت خبير تقنية يشرح التكنولوجيا بأسلوب مبسط ومثير للاهتمام.

المتطلبات:
- ابدأ بحقيقة تقنية مثيرة
- اشرح التقنية بأمثلة يومية
- أظهر الفائدة العملية
- انهِ بتوقع مستقبلي`,

      userPrompt: (topic) => `اكتب نص فيديو تقني احترافي عن: "${topic}"

أرجع JSON فقط:
{
  "title": "عنوان تقني",
  "hook": "حقيقة مثيرة",
  "segments": ["المقدمة", "الشرح", "مثال عملي", "الفوائد", "المستقبل"],
  "cta": "اشترك لتبقى في الصدارة",
  "keywords": ["كلمة1", "كلمة2", "كلمة3"],
  "emotional_triggers": ["فضول", "إثارة"]
}`,
    },

    Lifestyle: {
      systemPrompt: `أنت مؤثر في مجال نمط الحياة تشارك نصائح عملية وملهمة.

المتطلبات:
- ابدأ بموقف من الحياة اليومية
- شارك نصائح قابلة للتطبيق
- كن صادقاً وقريباً من المشاهد
- انهِ بتحدٍّ عملي`,

      userPrompt: (topic) => `اكتب نص فيديو Lifestyle احترافي عن: "${topic}"

أرجع JSON فقط:
{
  "title": "عنوان ملهم",
  "hook": "موقف من الحياة",
  "segments": ["المقدمة", "المشكلة", "النصائح", "التطبيق", "التحدي"],
  "cta": "جرب هذا اليوم وأخبرنا",
  "keywords": ["كلمة1", "كلمة2", "كلمة3"],
  "emotional_triggers": ["إلهام", "تحفيز"]
}`,
    },
  },

  en: {
    Motivational: {
      systemPrompt: `You are an expert in creating professional motivational content that captivates viewers from the start.

Requirements:
- Start with a POWERFUL HOOK in the first 3 seconds
- Use real stories or impactful statistics
- Address the viewer directly
- Add a valuable message
- End with a strong CALL TO ACTION
- Simple, powerful, clear language`,

      userPrompt: (topic) => `Write a professional motivational video script about: "${topic}"

Return JSON only:
{
  "title": "Catchy title",
  "hook": "Opening hook",
  "segments": ["Segment 1", "Segment 2", "Segment 3", "Segment 4", "Segment 5"],
  "cta": "Call to action",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "emotional_triggers": ["emotions"]
}`,
    },

    Educational: {
      systemPrompt: `You are an expert teacher creating engaging educational content.

Requirements:
- Start with a curiosity-sparking question
- Explain concepts simply
- Use real-world examples
- Add immediately applicable tips
- End with a learning CTA`,

      userPrompt: (topic) => `Write a professional educational video script about: "${topic}"

Return JSON only:
{
  "title": "Title",
  "hook": "Opening question",
  "segments": ["Segment 1", "Segment 2", "Segment 3", "Segment 4", "Segment 5"],
  "cta": "Call to action",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "emotional_triggers": ["curiosity", "learning"]
}`,
    },

    Story: {
      systemPrompt: `You are a professional storyteller who makes viewers feel the story.`,
      userPrompt: (topic) => `Write a professional story video about: "${topic}"

Return JSON only:
{
  "title": "Story title",
  "hook": "Opening scene",
  "segments": ["Scene 1", "Scene 2", "Climax", "Resolution", "Message"],
  "cta": "Call to action",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "emotional_triggers": ["suspense", "hope"]
}`,
    },

    News: {
      systemPrompt: `You are a professional news anchor presenting news in an engaging way.`,
      userPrompt: (topic) => `Write a professional news video script about: "${topic}"

Return JSON only:
{
  "title": "News headline",
  "hook": "Breaking news",
  "segments": ["News", "Details", "Context", "Analysis", "Impact"],
  "cta": "Follow for more",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "emotional_triggers": ["awareness", "concern"]
}`,
    },

    Tech: {
      systemPrompt: `You are a tech expert explaining technology in a simplified, exciting way.`,
      userPrompt: (topic) => `Write a professional tech video script about: "${topic}"

Return JSON only:
{
  "title": "Tech title",
  "hook": "Amazing tech fact",
  "segments": ["Intro", "Explanation", "Example", "Benefits", "Future"],
  "cta": "Subscribe to stay ahead",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "emotional_triggers": ["curiosity", "excitement"]
}`,
    },

    Lifestyle: {
      systemPrompt: `You are a lifestyle influencer sharing practical and inspiring tips.`,
      userPrompt: (topic) => `Write a professional lifestyle video script about: "${topic}"

Return JSON only:
{
  "title": "Inspiring title",
  "hook": "Everyday situation",
  "segments": ["Intro", "Problem", "Tips", "Application", "Challenge"],
  "cta": "Try this today and tell us",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "emotional_triggers": ["inspiration", "motivation"]
}`,
    },
  },

  fr: {
    Motivational: {
      systemPrompt: `Vous êtes un expert en création de contenu motivationnel professionnel.

Exigences:
- Commencez par un CROCHET PUISSANT dans les 3 premières secondes
- Utilisez des histoires réelles ou des statistiques percutantes
- Adressez-vous directement au spectateur
- Terminez par un APPEL À L'ACTION fort`,

      userPrompt: (topic) => `Écrivez un script vidéo motivationnel sur: "${topic}"

Retournez JSON uniquement:
{
  "title": "Titre accrocheur",
  "hook": "Phrase d'accroche",
  "segments": ["Segment 1", "Segment 2", "Segment 3", "Segment 4", "Segment 5"],
  "cta": "Appel à l'action",
  "keywords": ["mot1", "mot2", "mot3"],
  "emotional_triggers": ["émotions"]
}`,
    },

    Educational: {
      systemPrompt: `Vous êtes un enseignant expert créant du contenu éducatif engageant.`,
      userPrompt: (topic) => `Écrivez un script vidéo éducatif sur: "${topic}"

Retournez JSON uniquement:
{
  "title": "Titre",
  "hook": "Question d'ouverture",
  "segments": ["Segment 1", "Segment 2", "Segment 3", "Segment 4", "Segment 5"],
  "cta": "Appel à l'action",
  "keywords": ["mot1", "mot2", "mot3"],
  "emotional_triggers": ["curiosité", "apprentissage"]
}`,
    },

    Story: {
      systemPrompt: `Vous êtes un conteur professionnel.`,
      userPrompt: (topic) => `Écrivez une histoire vidéo sur: "${topic}"

Retournez JSON uniquement:
{
  "title": "Titre",
  "hook": "Scène d'ouverture",
  "segments": ["Scène 1", "Scène 2", "Climax", "Résolution", "Message"],
  "cta": "Appel à l'action",
  "keywords": ["mot1", "mot2", "mot3"],
  "emotional_triggers": ["suspense", "espoir"]
}`,
    },

    News: {
      systemPrompt: `Vous êtes un présentateur de nouvelles professionnel.`,
      userPrompt: (topic) => `Écrivez un script vidéo d'actualités sur: "${topic}"

Retournez JSON uniquement:
{
  "title": "Titre",
  "hook": "Accroche",
  "segments": ["Nouvelles", "Détails", "Contexte", "Analyse", "Impact"],
  "cta": "Suivez-nous",
  "keywords": ["mot1", "mot2", "mot3"],
  "emotional_triggers": ["conscience", "intérêt"]
}`,
    },

    Tech: {
      systemPrompt: `Vous êtes un expert tech expliquant la technologie simplement.`,
      userPrompt: (topic) => `Écrivez un script vidéo tech sur: "${topic}"

Retournez JSON uniquement:
{
  "title": "Titre tech",
  "hook": "Fait étonnant",
  "segments": ["Intro", "Explication", "Exemple", "Avantages", "Futur"],
  "cta": "Abonnez-vous",
  "keywords": ["mot1", "mot2", "mot3"],
  "emotional_triggers": ["curiosité", "excitement"]
}`,
    },

    Lifestyle: {
      systemPrompt: `Vous êtes un influenceur lifestyle partageant des conseils pratiques.`,
      userPrompt: (topic) => `Écrivez un script vidéo lifestyle sur: "${topic}"

Retournez JSON uniquement:
{
  "title": "Titre inspirant",
  "hook": "Situation quotidienne",
  "segments": ["Intro", "Problème", "Conseils", "Application", "Défi"],
  "cta": "Essayez aujourd'hui",
  "keywords": ["mot1", "mot2", "mot3"],
  "emotional_triggers": ["inspiration", "motivation"]
}`,
    },
  },
};

// ============================
// ✅ Retry مع Exponential Backoff
// ============================
async function withRetry(fn, maxRetries = CONFIG.maxRetries) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const status = error.response?.status;

      // ✅ لا تعيد على أخطاء غير قابلة للحل
      if (status === 401 || status === 403 || status === 400) {
        logger.error(`❌ خطأ (${status}) - لا إعادة محاولة`);
        throw error;
      }

      if (attempt < maxRetries) {
        const waitMs = CONFIG.retryDelay * Math.pow(2, attempt - 1);
        logger.warn(`⚠️ محاولة ${attempt}/${maxRetries} فشلت - انتظار ${waitMs}ms`);
        await new Promise(r => setTimeout(r, waitMs));
      }
    }
  }

  throw lastError;
}

// ============================
// ✅ استخراج JSON من النص
// ============================
function extractJSON(text) {
  if (!text || typeof text !== 'string') {
    throw new SyntaxError('النص فارغ أو غير صالح');
  }

  // ✅ حالة 1: JSON نظيف
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed);
  }

  // ✅ حالة 2: ```json ... ```
  const jsonBlock = trimmed.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonBlock) {
    return JSON.parse(jsonBlock[1].trim());
  }

  // ✅ حالة 3: ``` ... ``` بدون json
  const codeBlock = trimmed.match(/```\s*([\s\S]*?)\s*```/);
  if (codeBlock) {
    return JSON.parse(codeBlock[1].trim());
  }

  // ✅ حالة 4: JSON مدفون في نص عادي
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }

  throw new SyntaxError('لا يمكن استخراج JSON من الاستجابة');
}

// ============================
// ✅ التحقق من المحتوى
// ============================
function validateContentData(data, language) {
  const errors = [];

  // ✅ الحقول المطلوبة
  if (!data.title || typeof data.title !== 'string') {
    errors.push('title مفقود أو غير صالح');
  }
  if (!data.hook || typeof data.hook !== 'string') {
    errors.push('hook مفقود أو غير صالح');
  }
  if (!data.cta || typeof data.cta !== 'string') {
    errors.push('cta مفقود أو غير صالح');
  }

  // ✅ segments
  if (!Array.isArray(data.segments)) {
    errors.push('segments يجب أن يكون array');
  } else if (data.segments.length < CONFIG.content.minSegments) {
    errors.push(`segments أقل من ${CONFIG.content.minSegments} (وجدنا ${data.segments.length})`);
  } else if (data.segments.length > CONFIG.content.maxSegments) {
    // ✅ قص الزيادة بدلاً من رفضها
    data.segments = data.segments.slice(0, CONFIG.content.maxSegments);
    logger.warn(`⚠️ تم قص segments إلى ${CONFIG.content.maxSegments}`);
  }

  // ✅ keywords
  if (!Array.isArray(data.keywords) || data.keywords.length < CONFIG.content.minKeywords) {
    logger.warn(`⚠️ keywords ناقصة - سيتم استخدام عنوان الموضوع`);
    data.keywords = data.keywords || [data.title || 'general'];
  }

  // ✅ emotional_triggers (اختياري)
  if (!Array.isArray(data.emotional_triggers)) {
    data.emotional_triggers = [];
  }

  if (errors.length > 0) {
    throw new Error(`❌ المحتوى غير صالح:\n${errors.map(e => `  - ${e}`).join('\n')}`);
  }

  return data;
}

// ============================
// ✅ الدالة الرئيسية
// ============================
export async function generateEngagingContent(language, contentType, topic) {
  logger.info(`🎬 توليد محتوى: ${contentType} | ${language} | "${topic}"`);

  // ✅ التحقق من المتغيرات عند الاستدعاء
  const { apiKey, apiUrl } = getApiConfig();

  // ✅ التحقق من القالب
  const template = CONTENT_TEMPLATES[language]?.[contentType];
  if (!template) {
    const availableLangs  = Object.keys(CONTENT_TEMPLATES).join(', ');
    const availableTypes  = Object.keys(CONTENT_TEMPLATES[language] || {}).join(', ');
    throw new Error(
      `❌ لا يوجد قالب للغة "${language}" أو النوع "${contentType}"\n` +
      `اللغات المتاحة: ${availableLangs}\n` +
      `الأنواع المتاحة للغة "${language}": ${availableTypes}`
    );
  }

  // ✅ استدعاء API مع Retry
  const response = await withRetry(async () => {
    return axios.post(
      `${apiUrl}/chat/completions`,
      {
        model      : CONFIG.model,
        messages   : [
          { role: 'system', content: template.systemPrompt        },
          { role: 'user',   content: template.userPrompt(topic)   },
        ],
        temperature: CONFIG.temperature,
        max_tokens : CONFIG.maxTokens,
        top_p      : CONFIG.topP,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type' : 'application/json',
        },
        timeout: CONFIG.timeoutMs,
      }
    );
  });

  // ✅ التحقق من الاستجابة
  const rawContent = response.data?.choices?.[0]?.message?.content;
  if (!rawContent) {
    throw new Error('❌ Grok API رجع استجابة فارغة أو بتركيبة غير متوقعة');
  }

  logger.debug(`📥 Raw response length: ${rawContent.length} chars`);

  // ✅ استخراج JSON بشكل موثوق
  let contentData;
  try {
    contentData = extractJSON(rawContent);
  } catch (parseError) {
    logger.error('❌ فشل تحليل JSON', {
      error   : parseError.message,
      preview : rawContent.substring(0, 200),
    });
    throw new Error(`❌ Grok لم يرجع JSON صالح: ${parseError.message}`);
  }

  // ✅ التحقق الشامل من المحتوى
  const validatedContent = validateContentData(contentData, language);

  logger.success(`✅ تم توليد المحتوى`, {
    title    : validatedContent.title,
    segments : validatedContent.segments.length,
    keywords : validatedContent.keywords.length,
    language,
  });

  return validatedContent;
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
