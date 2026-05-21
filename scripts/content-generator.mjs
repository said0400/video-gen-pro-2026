import axios from 'axios';
import dotenv from 'dotenv';
import { logger } from './logger.mjs';

dotenv.config();

// ============================
// ✅ الإعدادات - DeepSeek API
// ============================
const CONFIG = {
  // ✅ نماذج DeepSeek
  models: (process.env.DEEPSEEK_MODELS ||
    'deepseek-chat,deepseek-reasoner')
    .split(',')
    .map(m => m.trim()),

  timeoutMs  : 120000,
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

function getWordCountGuide(language) {
  const wps    = CONFIG.content.wordsPerSecond[language] || 2.5;
  const minWds = Math.round(CONFIG.content.minDurationSeconds * wps);
  const maxWds = Math.round(CONFIG.content.maxDurationSeconds * wps);
  return { minWds, maxWds };
}

// ✅ DeepSeek Config
function getApiConfig() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const apiUrl = process.env.DEEPSEEK_API_URL ||
    'https://api.deepseek.com/v1';

  if (!apiKey || apiKey === 'undefined' || apiKey.trim() === '') {
    throw new Error(
      '❌ DEEPSEEK_API_KEY غير موجود\n' +
      'احصل على مفتاحك من: https://platform.deepseek.com/api_keys'
    );
  }

  return { apiKey, apiUrl };
}

// ============================
// ✅ Prompt واحد لـ 3 لغات
// ============================
function buildTrilingualPrompt(topic, contentType) {
  const ar = getWordCountGuide('ar');
  const en = getWordCountGuide('en');
  const fr = getWordCountGuide('fr');

  return `You are a professional multilingual content writer. Write a ${contentType} video script about: "${topic}"

Generate 3 scripts in one response - Arabic, English, and French.

=== ARABIC SCRIPT ===
Rules:
- Total: ${ar.minWds}-${ar.maxWds} Arabic words (40-80 seconds)
- Each segment: 15-30 words, complete meaningful sentence
- Powerful motivational language

=== ENGLISH SCRIPT ===
Rules:
- Total: ${en.minWds}-${en.maxWds} English words (40-80 seconds)
- Each segment: 20-35 words, complete meaningful sentence
- Powerful impactful language

=== FRENCH SCRIPT ===
Rules:
- Total: ${fr.minWds}-${fr.maxWds} French words (40-80 seconds)
- Each segment: 18-32 words, complete meaningful sentence
- Powerful engaging language

Return ONE JSON object with all 3 languages:
{
  "ar": {
    "title": "عنوان عربي جذاب ومميز",
    "hook": "جملة جذب عربية قوية",
    "segments": [
      "مقطع عربي 1 كامل ومفصل 15-25 كلمة على الأقل",
      "مقطع عربي 2 كامل ومفصل 20-30 كلمة على الأقل",
      "مقطع عربي 3 كامل ومفصل 25-35 كلمة على الأقل",
      "مقطع عربي 4 كامل ومفصل 20-30 كلمة على الأقل",
      "مقطع عربي 5 كامل ومفصل 15-25 كلمة على الأقل"
    ],
    "cta": "دعوة للعمل عربية واضحة",
    "keywords": ["كلمة1", "كلمة2", "كلمة3"],
    "emotional_triggers": ["مشاعر1", "مشاعر2"]
  },
  "en": {
    "title": "Catchy unique English title",
    "hook": "Powerful English opening hook",
    "segments": [
      "English segment 1 complete detailed 20-30 words minimum here",
      "English segment 2 complete detailed 25-35 words minimum here",
      "English segment 3 complete detailed 30-40 words minimum here",
      "English segment 4 complete detailed 25-35 words minimum here",
      "English segment 5 complete detailed 20-30 words minimum here"
    ],
    "cta": "Clear compelling English call to action",
    "keywords": ["keyword1", "keyword2", "keyword3"],
    "emotional_triggers": ["emotion1", "emotion2"]
  },
  "fr": {
    "title": "Titre français accrocheur et unique",
    "hook": "Phrase d'accroche française puissante",
    "segments": [
      "Segment français 1 complet détaillé 18-28 mots minimum ici",
      "Segment français 2 complet détaillé 22-32 mots minimum ici",
      "Segment français 3 complet détaillé 28-38 mots minimum ici",
      "Segment français 4 complet détaillé 22-32 mots minimum ici",
      "Segment français 5 complet détaillé 18-28 mots minimum ici"
    ],
    "cta": "Appel à l'action français clair et convaincant",
    "keywords": ["mot1", "mot2", "mot3"],
    "emotional_triggers": ["émotion1", "émotion2"]
  }
}`;
}

// ============================
// ✅ استدعاء DeepSeek - متوافق مع OpenAI
// ============================
async function callDeepSeekModel(model, prompt, apiKey, apiUrl) {
  let lastError;

  for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
    try {
      const response = await axios.post(
        `${apiUrl}/chat/completions`,
        {
          model,
          messages: [
            {
              role   : 'system',
              content: 'You are a professional multilingual video script writer. Always respond with valid JSON only.',
            },
            {
              role   : 'user',
              content: prompt,
            },
          ],
          temperature    : 0.7,
          max_tokens     : 8000,
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
      lastError    = error;
      const status = error.response?.status;

      logger.error('🔍 خطأ DeepSeek', {
        status,
        model,
        attempt,
        data: JSON.stringify(error.response?.data)?.substring(0, 200),
      });

      // ✅ توقف فوراً
      if (status === 401 || status === 403) {
        logger.error('❌ مفتاح DeepSeek غير صحيح');
        throw error;
      }

      // ✅ نموذج غير موجود
      if (status === 404) {
        const err           = new Error(`MODEL_NOT_FOUND:${model}`);
        err.isModelNotFound = true;
        throw err;
      }

      // ✅ تجاوز الحصة
      if (status === 429) {
        if (attempt < CONFIG.maxRetries) {
          logger.warn(`⚠️ تجاوز الحصة - انتظار ${CONFIG.retryDelay / 1000}s`);
          await new Promise(r => setTimeout(r, CONFIG.retryDelay));
          continue;
        }
        const err        = new Error(`QUOTA_EXCEEDED:${model}`);
        err.isQuotaError = true;
        throw err;
      }

      // ✅ خطأ خادم
      if (status >= 500) {
        if (attempt < CONFIG.maxRetries) {
          logger.warn(`⚠️ خطأ خادم - انتظار ${5000 * attempt}ms`);
          await new Promise(r => setTimeout(r, 5000 * attempt));
          continue;
        }
      }

      if (attempt < CONFIG.maxRetries) {
        await new Promise(r => setTimeout(r, 3000 * attempt));
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

  const fullText  = data.segments.join(' ');
  const wordCount = fullText.trim().split(/\s+/).filter(w => w).length;
  const wps       = CONFIG.content.wordsPerSecond[language] || 2.5;
  const duration  = Math.round(wordCount / wps);

  logger.info(`📊 ${language}: ${wordCount} كلمة | ~${duration}s | ${
    duration < 40 ? '⚠️ قصير' : duration > 80 ? '⚠️ طويل' : '✅ مثالي'
  }`);

  if (!Array.isArray(data.keywords))           data.keywords           = [data.title];
  if (!Array.isArray(data.emotional_triggers)) data.emotional_triggers = [];

  data.word_count                 = wordCount;
  data.estimated_duration_seconds = duration;

  return data;
}

// ============================
// ✅ توليد 3 لغات بطلب واحد
// ============================
export async function generateAllLanguagesAtOnce(contentType, topic) {
  logger.section('🌍 توليد 3 لغات بطلب DeepSeek واحد');
  logger.info(`📝 النوع  : ${contentType}`);
  logger.info(`🎯 الموضوع: ${topic}`);

  const { apiKey, apiUrl } = getApiConfig();
  const prompt = buildTrilingualPrompt(topic, contentType);

  logger.info(`🤖 النماذج: ${CONFIG.models.join(', ')}`);

  for (const model of CONFIG.models) {
    try {
      logger.info(`🤖 جرب: ${model}`);

      const response   = await callDeepSeekModel(model, prompt, apiKey, apiUrl);
      const rawContent = response?.data?.choices?.[0]?.message?.content;

      if (!rawContent) {
        logger.warn(`⚠️ ${model}: استجابة فارغة`);
        continue;
      }

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
        logger.error(`❌ ${lang}: فشل`);
      });

      if (successful.length === 0) {
        logger.warn(`⚠️ ${model}: جميع اللغات فشلت`);
        continue;
      }

      logger.success(`🎉 تم توليد ${successful.length}/3 لغات بطلب واحد!`);
      return results;

    } catch (error) {
      if (error.isModelNotFound) { logger.warn(`⚠️ ${model}: غير موجود`);    continue; }
      if (error.isQuotaError)    { logger.warn(`⚠️ ${model}: تجاوز الحصة`); continue; }

      const status = error.response?.status;
      if (status === 401 || status === 403) {
        logger.error('❌ خطأ مصادقة - تحقق من DEEPSEEK_API_KEY');
        throw error;
      }

      logger.warn(`⚠️ ${model}: فشل`);
    }
  }

  throw new Error(
    '❌ فشل توليد المحتوى!\n' +
    `النماذج المجربة: ${CONFIG.models.join(', ')}\n` +
    'تحقق من DEEPSEEK_API_KEY'
  );
}

// ============================
// ✅ توليد لغة واحدة (للتوافق)
// ============================
export async function generateEngagingContent(language, contentType, topic) {
  logger.info(`🎬 توليد: ${contentType} | ${language} | "${topic}"`);

  const allResults = await generateAllLanguagesAtOnce(contentType, topic);

  const content = allResults[language];
  if (!content) {
    throw new Error(`❌ فشل توليد ${language}`);
  }

  logger.success(`✅ ${language} جاهز`, {
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
