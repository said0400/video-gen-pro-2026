import axios from 'axios';
import dotenv from 'dotenv';
import { logger } from './logger.mjs';

dotenv.config();

// ============================
// ✅ الإعدادات - Groq API
// ============================
const CONFIG = {
  // ✅ نماذج Groq المتاحة مجاناً
  models: (process.env.GROQ_FALLBACK_MODELS ||
    'llama-3.3-70b-versatile,llama-3.1-8b-instant,gemma2-9b-it')
    .split(',')
    .map(m => m.trim()),

  timeoutMs  : 30000,  // Groq أسرع بكثير
  maxRetries : 2,
  retryDelay : 10000,  // 10 ثواني كافية لـ Groq

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
  const apiKey = process.env.GROQ_API_KEY;
  const apiUrl = process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1';

  if (!apiKey || apiKey === 'undefined' || apiKey.trim() === '') {
    throw new Error('❌ GROQ_API_KEY غير موجود - احصل عليه من https://console.groq.com/keys');
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
      systemPrompt: `You are an expert in creating professional motivational content.

Requirements:
- Start with a POWERFUL HOOK in the first 3 seconds
- Use real stories or impactful statistics
- Address the viewer directly
- End with a strong CALL TO ACTION`,

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
      systemPrompt: `You are an expert teacher creating engaging educational content.`,
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
      systemPrompt: `You are a professional news anchor presenting news engagingly.`,
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
      systemPrompt: `You are a tech expert explaining technology in a simplified way.`,
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
      systemPrompt: `You are a lifestyle influencer sharing practical tips.`,
      userPrompt: (topic) => `Write a professional lifestyle video script about: "${topic}"

Return JSON only:
{
  "title": "Inspiring title",
  "hook": "Everyday situation",
  "segments": ["Intro", "Problem", "Tips", "Application", "Challenge"],
  "cta": "Try this today",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "emotional_triggers": ["inspiration", "motivation"]
}`,
    },
  },

  fr: {
    Motivational: {
      systemPrompt: `Vous êtes un expert en création de contenu motivationnel professionnel.`,
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
// ✅ استدعاء Groq - متوافق مع OpenAI
// ============================
async function callGroqModel(model, fullPrompt, apiKey, apiUrl) {
  for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
    try {
      const response = await axios.post(
        `${apiUrl}/chat/completions`,
        {
          model,
          messages: [
            { role: 'user', content: fullPrompt }
          ],
          temperature    : 0.85,
          max_tokens     : 3000,
          top_p          : 0.95,
          response_format: { type: 'json_object' }, // ✅ إجبار على JSON
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

      // ✅ توقف فوراً
      if (status === 401 || status === 403) {
        throw error;
      }

      // ✅ 404 - نموذج غير موجود
      if (status === 404) {
        const err = new Error(`MODEL_NOT_FOUND:${model}`);
        err.isModelNotFound = true;
        throw err;
      }

      // ✅ 400 - طلب خاطئ
      if (status === 400) {
        const err = new Error(`BAD_REQUEST:${model}`);
        err.isBadRequest = true;
        throw err;
      }

      // ✅ 429 - تجاوز الحصة
      if (status === 429) {
        if (attempt < CONFIG.maxRetries) {
          logger.warn(`⚠️ ${model}: تجاوز الحصة - انتظار ${CONFIG.retryDelay / 1000}s`);
          await new Promise(r => setTimeout(r, CONFIG.retryDelay));
          continue;
        }
        const err = new Error(`QUOTA_EXCEEDED:${model}`);
        err.isQuotaError = true;
        throw err;
      }

      // ✅ أخطاء شبكة
      if (attempt < CONFIG.maxRetries) {
        logger.warn(`⚠️ ${model}: محاولة ${attempt}/${CONFIG.maxRetries}`);
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
// ✅ التحقق من المحتوى
// ============================
function validateContentData(data) {
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
  logger.info(`🌐 Groq API URL: ${apiUrl}`);
  logger.info(`🤖 النماذج المتاحة: ${CONFIG.models.join(', ')}`);

  const template = CONTENT_TEMPLATES[language]?.[contentType];
  if (!template) {
    throw new Error(
      `❌ لا يوجد قالب للغة "${language}" أو النوع "${contentType}"\n` +
      `اللغات المتاحة: ${Object.keys(CONTENT_TEMPLATES).join(', ')}`
    );
  }

  const fullPrompt = `${template.systemPrompt}\n\n${template.userPrompt(topic)}`;

  // ✅ جرب كل نموذج
  for (const model of CONFIG.models) {
    try {
      logger.info(`🤖 جرب النموذج: ${model}`);

      const response = await callGroqModel(model, fullPrompt, apiKey, apiUrl);

      // ✅ استخراج النص - Groq متوافق مع OpenAI
      const rawContent = response?.data?.choices?.[0]?.message?.content;
      if (!rawContent) {
        logger.warn(`⚠️ ${model}: استجابة فارغة - جرب التالي`);
        continue;
      }

      let contentData;
      try {
        contentData = extractJSON(rawContent);
      } catch {
        logger.warn(`⚠️ ${model}: JSON غير صالح - جرب التالي`);
        continue;
      }

      const validatedContent = validateContentData(contentData);

      logger.success(`✅ تم التوليد بنجاح`, {
        model,
        title   : validatedContent.title,
        segments: validatedContent.segments.length,
        language,
      });

      return validatedContent;

    } catch (error) {
      if (error.isModelNotFound) {
        logger.warn(`⚠️ ${model}: غير موجود - جرب التالي`);
        continue;
      }
      if (error.isQuotaError) {
        logger.warn(`⚠️ ${model}: تجاوز الحصة - جرب التالي`);
        continue;
      }
      if (error.isBadRequest) {
        logger.warn(`⚠️ ${model}: طلب خاطئ - جرب التالي`);
        continue;
      }

      const status = error.response?.status;
      if (status === 401 || status === 403) {
        logger.error(`❌ خطأ مصادقة - تحقق من GROQ_API_KEY`);
        throw error;
      }

      logger.warn(`⚠️ ${model}: فشل - جرب التالي`);
      continue;
    }
  }

  throw new Error(
    `❌ جميع نماذج Groq فشلت!\n` +
    `النماذج المجربة: ${CONFIG.models.join(', ')}\n` +
    `الحل: تحقق من GROQ_API_KEY على https://console.groq.com/keys`
  );
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
