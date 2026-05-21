import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { logger } from './logger.mjs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT_DIR   = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT_DIR, 'output');

// ============================
// ✅ إعدادات الأصوات
// ============================
const VOICE_CONFIG = {
  ar: {
    voiceName    : 'ar-XA-Standard-A',   // ✅ Google Cloud TTS
    languageCode : 'ar-XA',
    pitch        : 0.0,
    speakingRate : 0.9,                   // أبطأ قليلاً للعربية
  },
  en: {
    voiceName    : 'en-US-Neural2-C',
    languageCode : 'en-US',
    pitch        : 0.0,
    speakingRate : 1.0,
  },
  fr: {
    voiceName    : 'fr-FR-Neural2-A',
    languageCode : 'fr-FR',
    pitch        : 0.0,
    speakingRate : 0.95,
  },
};

// ============================
// ✅ الإعدادات العامة
// ============================
const CONFIG = {
  maxCharsPerRequest : 4500,    // حد Google Cloud TTS الآمن
  timeoutMs          : 60000,   // 60 ثانية
  maxRetries         : 3,
  retryDelayMs       : 2000,
};

// ============================
// ✅ التحقق من المتغيرات
// ============================
function getApiConfig() {
  const apiKey = process.env.GEMINI_API_KEY;
  const apiUrl = process.env.GOOGLE_TTS_URL ||
    'https://texttospeech.googleapis.com/v1';

  if (!apiKey) {
    throw new Error('❌ GEMINI_API_KEY غير موجود في متغيرات البيئة');
  }
  if (apiKey === 'undefined' || apiKey.trim() === '') {
    throw new Error('❌ GEMINI_API_KEY فارغ أو غير صالح');
  }

  return { apiKey, apiUrl };
}

// ============================
// ✅ تقسيم النص الطويل
// ============================
function splitTextIntoChunks(text, maxChars = CONFIG.maxCharsPerRequest) {
  if (text.length <= maxChars) {
    return [text];
  }

  logger.warn(`⚠️ النص طويل (${text.length} حرف) - سيتم تقسيمه`);

  const chunks  = [];
  // ✅ قسّم على الجمل لا على الحروف
  const sentences = text.split(/(?<=[.!?؟،,])\s+/);
  let   current   = '';

  for (const sentence of sentences) {
    if ((current + sentence).length > maxChars) {
      if (current) chunks.push(current.trim());
      current = sentence;
    } else {
      current += (current ? ' ' : '') + sentence;
    }
  }

  if (current.trim()) chunks.push(current.trim());

  logger.info(`📝 تم تقسيم النص إلى ${chunks.length} أجزاء`);
  return chunks;
}

// ============================
// ✅ Retry مع Exponential Backoff
// ============================
async function withRetry(fn, retries = CONFIG.maxRetries, delayMs = CONFIG.retryDelayMs) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const status = error.response?.status;

      // ✅ لا تعيد المحاولة على أخطاء غير قابلة للحل
      if (status === 401 || status === 403 || status === 400) {
        logger.error(`❌ خطأ غير قابل للحل (${status}) - لا إعادة محاولة`);
        throw error;
      }

      if (attempt < retries) {
        const waitMs = delayMs * Math.pow(2, attempt - 1); // Exponential backoff
        logger.warn(`⚠️ محاولة ${attempt}/${retries} فشلت - انتظار ${waitMs}ms`);
        await new Promise(r => setTimeout(r, waitMs));
      }
    }
  }

  throw lastError;
}

// ============================
// ✅ توليد صوت لجزء واحد - Google Cloud TTS
// ============================
async function generateChunkAudio(text, voiceConfig, apiKey, apiUrl) {
  const response = await axios.post(
    `${apiUrl}/text:synthesize?key=${apiKey}`,
    {
      input: { text },
      voice: {
        languageCode : voiceConfig.languageCode,
        name         : voiceConfig.voiceName,
      },
      audioConfig: {
        audioEncoding : 'LINEAR16',   // ✅ WAV format
        pitch         : voiceConfig.pitch,
        speakingRate  : voiceConfig.speakingRate,
        sampleRateHertz: 24000,
      },
    },
    {
      headers : { 'Content-Type': 'application/json' },
      timeout : CONFIG.timeoutMs,
    }
  );

  // ✅ التحقق من الاستجابة
  const audioContent = response.data?.audioContent;
  if (!audioContent) {
    throw new Error('❌ لم تُرجع Google TTS بيانات صوتية');
  }

  return Buffer.from(audioContent, 'base64');
}

// ============================
// ✅ دمج أجزاء الصوت
// ============================
function mergeAudioBuffers(buffers) {
  if (buffers.length === 1) return buffers[0];

  // ✅ دمج WAV buffers بشكل صحيح
  // كل WAV له header (44 bytes) + data
  // نحتاج header واحد + كل الـ data

  const HEADER_SIZE = 44;
  const firstHeader = buffers[0].slice(0, HEADER_SIZE);

  // جمع كل الـ data بدون headers
  const dataBuffers = buffers.map(b => b.slice(HEADER_SIZE));
  const totalDataSize = dataBuffers.reduce((sum, b) => sum + b.length, 0);

  // ✅ تحديث حجم الملف في الـ header
  const mergedHeader = Buffer.from(firstHeader);
  mergedHeader.writeUInt32LE(36 + totalDataSize, 4);   // ChunkSize
  mergedHeader.writeUInt32LE(totalDataSize, 40);        // Subchunk2Size

  logger.info(`🔗 دمج ${buffers.length} أجزاء صوتية`);
  return Buffer.concat([mergedHeader, ...dataBuffers]);
}

// ============================
// ✅ الدالة الرئيسية
// ============================
export async function generateAudio(scriptText, language = 'ar') {
  logger.section('🎙️ توليد الصوت');

  // ✅ التحقق من المدخلات
  if (!scriptText || scriptText.trim().length === 0) {
    throw new Error('❌ النص المطلوب توليد صوت له فارغ');
  }

  const voiceConfig = VOICE_CONFIG[language];
  if (!voiceConfig) {
    throw new Error(
      `❌ لغة غير مدعومة: "${language}"\n` +
      `اللغات المتاحة: ${Object.keys(VOICE_CONFIG).join(', ')}`
    );
  }

  // ✅ قراءة الـ API config عند الاستدعاء (ليس عند التحميل)
  const { apiKey, apiUrl } = getApiConfig();

  logger.info(`🌍 اللغة: ${language} | الصوت: ${voiceConfig.voiceName}`);
  logger.info(`📝 طول النص: ${scriptText.length} حرف`);

  // ✅ تقسيم النص إذا كان طويلاً
  const chunks = splitTextIntoChunks(scriptText.trim());

  // ✅ توليد صوت لكل جزء مع Retry
  const audioBuffers = [];

  for (let i = 0; i < chunks.length; i++) {
    logger.info(`🎙️ توليد الجزء ${i + 1}/${chunks.length}...`);

    const buffer = await withRetry(() =>
      generateChunkAudio(chunks[i], voiceConfig, apiKey, apiUrl)
    );

    audioBuffers.push(buffer);
    logger.success(`✅ الجزء ${i + 1} جاهز (${(buffer.length / 1024).toFixed(1)} KB)`);
  }

  // ✅ دمج الأجزاء
  const finalBuffer = mergeAudioBuffers(audioBuffers);

  // ✅ إنشاء مجلد الإخراج
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const audioPath = path.join(OUTPUT_DIR, `audio-${language}.wav`);
  fs.writeFileSync(audioPath, finalBuffer);

  // ✅ التحقق من الملف الناتج
  const fileSize = fs.statSync(audioPath).size;
  if (fileSize === 0) {
    throw new Error('❌ ملف الصوت الناتج فارغ');
  }

  logger.success(`✅ تم توليد الصوت بنجاح`, {
    language,
    voice   : voiceConfig.voiceName,
    chunks  : chunks.length,
    size    : `${(fileSize / 1024 / 1024).toFixed(2)} MB`,
    path    : audioPath,
  });

  return audioPath;
}

// ============================
// ✅ دالة للتحقق من دعم اللغة
// ============================
export function isSupportedLanguage(language) {
  return language in VOICE_CONFIG;
}

// ============================
// ✅ دالة لعرض اللغات المدعومة
// ============================
export function getSupportedLanguages() {
  return Object.entries(VOICE_CONFIG).map(([lang, config]) => ({
    language     : lang,
    voiceName    : config.voiceName,
    languageCode : config.languageCode,
  }));
}
