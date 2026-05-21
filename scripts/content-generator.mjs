import axios from 'axios';
import dotenv from 'dotenv';
import { logger } from './logger.mjs';

dotenv.config();

// ============================
// ✅ الإعدادات
// ============================
const CONFIG = {
  models: (process.env.GEMINI_TEXT_MODELS ||
    'gemini-2.0-flash,gemini-2.0-flash-lite')
    .split(',')
    .map(m => m.trim()),

  timeoutMs  : 120000, // ✅ دقيقتان - لأن الطلب أكبر
  maxRetries : 2,
  retryDelay : 60000,

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

function getWordCountGuide(language) {
  const wps    = CONFIG.content.wordsPerSecond[language] || 2.5;
  const minWds = Math.round(CONFIG.content.minDurationSeconds * wps);
  const maxWds = Math.round(CONFIG.content.maxDurationSeconds * wps);
  return { minWds, maxWds };
}

function getApiConfig() {
  const apiKey = process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY;
  const apiUrl = process.env.GEMINI_API_URL ||
    'https://generativelanguage.googleapis.com/v1beta';

  if (!apiKey || apiKey === 'undefined' || apiKey.trim() === '') {
    throw new Error('❌ GEMINI_API_KEY_1 غير موجود');
  }

  return { apiKey, apiUrl };
}

// ============================
// ✅ Prompt واحد يطلب 3 لغات معاً
// ============================
function buildTrilingualPrompt(topic, contentType) {
  const ar = getWordCountGuide('ar');
  const en = getWordCountGuide('en');
  const fr = getWordCountGuide('fr');

  const systemPrompts = {
    Motivational: {
      ar: `كاتب محتوى تحفيزي عربي: ${ar.minWds}-${ar.maxWds} كلمة، كل مقطع 15-30 كلمة`,
      en: `English motivational writer: ${en.minWds}-${en.maxWds} words, each segment 20-35 words`,
      fr: `Rédacteur motivationnel français: ${fr.minWds}-${fr.maxWds} mots, chaque segment 18-32 mots`,
    },
    Educational: {
      ar: `معلم عربي محترف: ${ar.minWds}-${ar.maxWds} كلمة، كل مقطع 15-30 كلمة`,
      en: `English educator: ${en.minWds}-${en.maxWds} words, each segment 20-35 words`,
      fr: `Éducateur français: ${fr.minWds}-${fr.maxWds} mots, chaque segment 18-32 mots`,
    },
    Story: {
      ar: `راوي قصص عربي: ${ar.minWds}-${ar.maxWds} كلمة، كل مقطع 15-30 كلمة`,
      en: `English storyteller: ${en.minWds}-${en.maxWds} words, each segment 20-35 words`,
      fr: `Conteur français: ${fr.minWds}-${fr.maxWds} mots, chaque segment 18-32 mots`,
    },
    News: {
      ar: `مذيع أخبار عربي: ${ar.minWds}-${ar.maxWds} كلمة، كل مقطع 15-30 كلمة`,
      en: `English news anchor: ${en.minWds}-${en.maxWds} words, each segment 20-35 words`,
      fr: `Présentateur français: ${fr.minWds}-${fr.maxWds} mots, chaque segment 18-32 mots`,
    },
    Tech: {
      ar: `خبير تقنية عربي: ${ar.minWds}-${ar.maxWds} كلمة، كل مقطع 15-30 كلمة`,
      en: `English tech expert: ${en.minWds}-${en.maxWds} words, each segment 20-35 words`,
      fr: `Expert tech français: ${fr.minWds}-${fr.maxWds} mots, chaque segment 18-32 mots`,
    },
    Lifestyle: {
      ar: `مؤثر lifestyle عربي: ${ar.minWds}-${ar.maxWds} كلمة، كل مقطع 15-30 كلمة`,
      en: `English lifestyle influencer: ${en.minWds}-${en.maxWds} words, each segment 20-35 words`,
      fr: `Influenceur lifestyle français: ${fr.minWds}-${fr.maxWds} mots, chaque segment 18-32 mots`,
    },
  };

  const sp = systemPrompts[contentType] || systemPrompts.Motivational;

  return `أنت خبير في كتابة المحتوى بثلاث لغات. اكتب نص فيديو ${contentType} احترافي عن: "${topic}"

⚠️ مهم جداً - اكتب 3 نصوص مختلفة في طلب واحد:

=== النص العربي ===
${sp.ar}
القواعد: كل مقطع جملة كاملة 15-30 كلمة، لغة قوية ومؤثرة

=== English Text ===
${sp.en}
Rules: Each segment complete sentence 20-35 words, powerful impactful language

=== Texte Français ===
${sp.fr}
Règles: Chaque segment phrase complète 18-32 mots, langage puissant

أرجع JSON واحد يحتوي على النصوص الثلاثة:
{
  "ar": {
    "title": "عنوان عربي جذاب",
    "hook": "جملة الجذب العربية",
    "segments": [
      "مقطع عربي 1 كامل 15-25 كلمة",
      "مقطع عربي 2 كامل 20-30 كلمة",
      "مقطع عربي 3 كامل 25-35 كلمة",
      "مقطع عربي 4 كامل 20-30 كلمة",
      "مقطع عربي 5 كامل 15-25 كلمة"
    ],
    "cta": "دعوة للعمل عربية",
    "keywords": ["كلمة1", "كلمة2", "كلمة3"],
    "emotional_triggers": ["مشاعر1", "مشاعر2"]
  },
  "en": {
    "title": "Catchy English title",
    "hook": "English opening hook",
    "segments": [
      "English segment 1 complete 20-30 words minimum required",
      "English segment 2 complete 25-35 words minimum required",
      "English segment 3 complete 30-40 words minimum required",
      "English segment 4 complete 25-35 words minimum required",
      "English segment 5 complete 20-30 words minimum required"
    ],
    "cta": "English call to action",
    "keywords": ["k1", "k2", "k3"],
    "emotional_triggers": ["e1", "e2"]
  },
  "fr": {
    "title": "Titre français accrocheur",
    "hook": "Phrase d'accroche française",
    "segments": [
      "Segment français 1 complet 18-28 mots minimum requis",
      "Segment français 2 complet 22-32 mots minimum requis",
      "Segment français 3 complet 28-38 mots minimum requis",
      "Segment français 4 complet 22-32 mots minimum requis",
      "Segment français 5 complet 18-28 mots minimum requis"
    ],
    "cta": "Appel à l'action français",
    "keywords": ["m1", "m2", "m3"],
    "emotional_triggers": ["é1", "é2"]
  }
}`;
}

// ============================
// ✅ استدعاء Gemini
// ============================
async function callGeminiModel(model, prompt, apiKey, apiUrl) {
  let lastError;

  for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
    try {
      const response = await axios.post(
        `${apiUrl}/models/${model}:generateContent?key=${apiKey}`,
        {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature     : 0.7,
            maxOutputTokens : 8000, // ✅ أكبر لأن 3 لغات
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

      logger.error('🔍 خطأ Gemini', {
        status, model, attempt,
        data: JSON.stringify(error.response?.data)?.substring(0, 200),
      });

      if (status === 401 || status === 403) throw error;

      if (status === 404) {
        const err = new Error(`MODEL_NOT_FOUND:${model}`);
        err.isModelNotFound = true;
        throw err;
      }

      if (status === 429) {
        if (attempt < CONFIG.maxRetries) {
          logger.warn(`⚠️ 429 - انتظار ${CONFIG.retryDelay / 1000}s`);
          await new Promise(r => setTimeout(r, CONFIG.retryDelay));
          continue;
        }
        const err = new Error(`QUOTA_EXCEEDED:${model}`);
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
  if (!text || typeof text !== 'string') throw new SyntaxError('النص فارغ');

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
// ✅ التحقق من محتوى لغة واحدة
// ============================
function validateSingleLanguage(data, language) {
  if (!data || typeof data !== 'object') return null;

  const errors = [];
  if (!data.title    || typeof data.title !== 'string') errors.push('title مفقود');
  if (!data.hook     || typeof data.hook  !== 'string') errors.push('hook مفقود');
  if (!data.cta      || typeof data.cta   !== 'string') errors.push('cta مفقود');
  if (!Array.isArray(data.segments) || data.segments.length < CONFIG.content.minSegments) {
    errors.push('segments ناقص');
  }

  if (errors.length > 0) {
    logger.warn(`⚠️ ${language}: ${errors.join(', ')}`);
    return null;
  }

  // ✅ حساب الطول
  const fullText  = data.segments.join(' ');
  const wordCount = fullText.trim().split(/\s+/).filter(w => w).length;
  const wps       = CONFIG.content.wordsPerSecond[language] || 2.5;
  const duration  = Math.round(wordCount / wps);

  logger.info(`📊 ${language}: ${wordCount} كلمة | ~${duration}s | ${
    duration < 40 ? '⚠️ قصير' : duration > 80 ? '⚠️ طويل' : '✅ مثالي'
  }`);

  if (!Array.isArray(data.keywords))        data.keywords        = [data.title];
  if (!Array.isArray(data.emotional_triggers)) data.emotional_triggers = [];

  data.word_count                 = wordCount;
  data.estimated_duration_seconds = duration;

  return data;
}

// ============================
// ✅ الدالة الرئيسية - طلب واحد لـ 3 لغات
// ============================
export async function generateAllLanguagesAtOnce(contentType, topic) {
  logger.section('🌍 توليد 3 لغات بطلب واحد');
  logger.info(`📝 النوع  : ${contentType}`);
  logger.info(`🎯 الموضوع: ${topic}`);

  const { apiKey, apiUrl } = getApiConfig();
  const prompt = buildTrilingualPrompt(topic, contentType);

  logger.info(`📤 إرسال طلب واحد لـ Gemini يحتوي 3 لغات...`);

  // ✅ جرب كل النماذج
  for (const model of CONFIG.models) {
    try {
      logger.info(`🤖 النموذج: ${model}`);

      const response   = await callGeminiModel(model, prompt, apiKey, apiUrl);
      const rawContent = response?.data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawContent) {
        logger.warn(`⚠️ ${model}: استجابة فارغة`);
        continue;
      }

      // ✅ استخراج JSON
      let allData;
      try {
        allData = extractJSON(rawContent);
      } catch (e) {
        logger.warn(`⚠️ ${model}: JSON غير صالح - ${e.message}`);
        continue;
      }

      // ✅ التحقق من كل لغة
      const results = {
        ar: validateSingleLanguage(allData.ar, 'ar'),
        en: validateSingleLanguage(allData.en, 'en'),
        fr: validateSingleLanguage(allData.fr, 'fr'),
      };

      const successful = Object.entries(results).filter(([, v]) => v !== null);
      const failed     = Object.entries(results).filter(([, v]) => v === null);

      logger.section('📊 نتيجة الطلب');
      successful.forEach(([lang, data]) => {
        logger.success(`✅ ${lang}: "${data.title}" | ${data.word_count} كلمة | ~${data.estimated_duration_seconds}s`);
      });
      failed.forEach(([lang]) => {
        logger.error(`❌ ${lang}: فشل التحقق`);
      });

      if (successful.length === 0) {
        logger.warn(`⚠️ ${model}: جميع اللغات فشلت - جرب التالي`);
        continue;
      }

      logger.success(`🎉 تم توليد ${successful.length}/3 لغات بطلب واحد!`);
      return results;

    } catch (error) {
      if (error.isModelNotFound) { logger.warn(`⚠️ ${model}: غير موجود`);    continue; }
      if (error.isQuotaError)    { logger.warn(`⚠️ ${model}: تجاوز الحصة`); continue; }

      const status = error.response?.status;
      if (status === 401 || status === 403) {
        logger.error(`❌ خطأ مصادقة - تحقق من GEMINI_API_KEY_1`);
        throw error;
      }

      logger.warn(`⚠️ ${model}: فشل`);
    }
  }

  throw new Error('❌ فشل توليد المحتوى - جميع النماذج فشلت');
}

// ============================
// ✅ توليد لغة واحدة (للتوافق مع generate-video.mjs)
// ============================
export async function generateEngagingContent(language, contentType, topic) {
  logger.info(`🎬 توليد محتوى: ${contentType} | ${language} | "${topic}"`);

  // ✅ نولد الـ 3 لغات دفعة واحدة ونرجع اللغة المطلوبة
  const allResults = await generateAllLanguagesAtOnce(contentType, topic);

  const content = allResults[language];
  if (!content) {
    throw new Error(`❌ فشل توليد المحتوى بـ ${language}`);
  }

  logger.success(`✅ تم توليد ${language}`, {
    title   : content.title,
    words   : content.word_count,
    duration: `${content.estimated_duration_seconds}s`,
  });

  return content;
}

// ============================
// ✅ دوال مساعدة
// ============================
export function getSupportedLanguages()            { return ['ar', 'en', 'fr']; }
export function getSupportedContentTypes()         { return ['Motivational', 'Educational', 'Story', 'News', 'Tech', 'Lifestyle']; }
export function isSupported(language, contentType) { return getSupportedLanguages().includes(language) && getSupportedContentTypes().includes(contentType); }
