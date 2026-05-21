import axios from 'axios';
import fs    from 'fs';
import path  from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { logger } from './logger.mjs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT_DIR   = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT_DIR, 'output');
const LOGS_DIR   = path.join(ROOT_DIR, 'logs');

// ============================
// ✅ الإعدادات
// ============================
const CONFIG = {
  model     : 'gemini-2.5-flash-preview-tts',
  timeoutMs : 120000,   // دقيقتان
  maxRetries: 3,
  retryDelay: 5000,
  maxChars  : 4500,     // الحد الأقصى للحروف في كل طلب
};

// ============================
// ✅ إعدادات الأصوات لكل لغة
// ============================
const VOICE_CONFIG = {
  ar: {
    voiceName  : 'Alnilam',
    audioPrompt: `Read the following text in Arabic with a professional,
clear and engaging voice. Style: Natural. Pace: Medium. Accent: Modern Standard Arabic.`,
  },
  en: {
    voiceName  : 'Charon',
    audioPrompt: `Read the following text with a smooth, premium commercial voice.
Style: Promo/Hype. Pace: Natural. Accent: Neutral American.`,
  },
  fr: {
    voiceName  : 'Aoede',
    audioPrompt: `Lisez le texte suivant avec une voix professionnelle et claire.
Style: Naturel. Rythme: Modéré. Accent: Français standard.`,
  },
};

// ✅ قائمة الأصوات المتاحة في Gemini TTS:
// Puck, Charon, Kore, Fenrir, Aoede, Alnilam

// ============================
// ✅ التحقق من متغيرات البيئة
// ============================
function getApiConfig() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === 'undefined' || apiKey.trim() === '') {
    throw new Error(
      '❌ GEMINI_API_KEY غير موجود\n' +
      'احصل على مفتاحك من: https://aistudio.google.com/'
    );
  }

  return {
    apiKey,
    apiUrl: 'https://generativelanguage.googleapis.com/v1beta',
  };
}

// ============================
// ✅ تحويل PCM إلى WAV - بدون مكتبات خارجية
// ============================
function convertToWav(audioData, mimeType) {
  // استخراج المعاملات من mime type
  // مثال: "audio/L16;rate=24000"
  let bitsPerSample = 16;
  let sampleRate    = 24000;

  const parts = mimeType.split(';');
  for (const part of parts) {
    const p = part.trim();
    if (p.toLowerCase().startsWith('rate=')) {
      sampleRate = parseInt(p.split('=')[1]) || 24000;
    }
    if (p.startsWith('audio/L')) {
      bitsPerSample = parseInt(p.split('L')[1]) || 16;
    }
  }

  const numChannels    = 1;
  const dataSize       = audioData.length;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign     = numChannels * bytesPerSample;
  const byteRate       = sampleRate * blockAlign;
  const chunkSize      = 36 + dataSize;

  // ✅ بناء WAV header بـ Node.js Buffer فقط
  const header = Buffer.alloc(44);

  // RIFF chunk descriptor
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(chunkSize, 4);
  header.write('WAVE', 8, 'ascii');

  // fmt sub-chunk
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);            // Subchunk1Size
  header.writeUInt16LE(1, 20);             // AudioFormat (PCM = 1)
  header.writeUInt16LE(numChannels, 22);   // NumChannels
  header.writeUInt32LE(sampleRate, 24);    // SampleRate
  header.writeUInt32LE(byteRate, 28);      // ByteRate
  header.writeUInt16LE(blockAlign, 32);    // BlockAlign
  header.writeUInt16LE(bitsPerSample, 34); // BitsPerSample

  // data sub-chunk
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataSize, 40);      // Subchunk2Size

  return Buffer.concat([header, audioData]);
}

// ============================
// ✅ تقسيم النص الطويل إلى أجزاء
// ============================
function splitTextIntoChunks(text, maxChars = CONFIG.maxChars) {
  if (text.length <= maxChars) return [text];

  logger.warn(`⚠️ النص طويل (${text.length} حرف) - سيتم تقسيمه`);

  const chunks    = [];
  // ✅ تقسيم على الجمل لا على الحروف
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
async function withRetry(fn, retries = CONFIG.maxRetries) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError    = error;
      const status = error.response?.status;
      const msg    = error.response?.data?.error?.message || error.message;

      logger.error(`🔍 خطأ TTS`, {
        status,
        attempt,
        message: msg?.substring(0, 200),
      });

      // ✅ لا تعيد على هذه الأخطاء
      if (status === 400 || status === 401 || status === 403) {
        logger.error(`❌ خطأ (${status}) - لا إعادة محاولة`);
        throw error;
      }

      // ✅ تجاوز الحصة - انتظر أطول
      if (status === 429) {
        const waitMs = 30000;
        logger.warn(`⚠️ تجاوز الحصة (429) - انتظار ${waitMs / 1000}s`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      // ✅ أخطاء شبكة - انتظر قليلاً
      if (attempt < retries) {
        const waitMs = CONFIG.retryDelay * attempt;
        logger.warn(`⚠️ محاولة ${attempt}/${retries} - انتظار ${waitMs}ms`);
        await new Promise(r => setTimeout(r, waitMs));
      }
    }
  }

  throw lastError;
}

// ============================
// ✅ توليد صوت جزء واحد - Gemini TTS
// ============================
async function generateChunkAudio(text, voiceConfig, apiKey, apiUrl) {
  // ✅ بناء الـ prompt الكامل
  const fullText = `${voiceConfig.audioPrompt}\n\n## Transcript:\n${text}`;

  const response = await axios.post(
    `${apiUrl}/models/${CONFIG.model}:generateContent?key=${apiKey}`,
    {
      contents: [
        {
          role : 'user',
          parts: [{ text: fullText }],
        },
      ],
      generationConfig: {
        temperature       : 1,
        responseModalities: ['AUDIO'],
        speechConfig      : {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voiceConfig.voiceName,
            },
          },
        },
      },
    },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: CONFIG.timeoutMs,
    }
  );

  // ✅ استخراج البيانات الصوتية
  const candidates = response.data?.candidates;
  if (!candidates || candidates.length === 0) {
    throw new Error('❌ لم تُرجع Gemini TTS أي candidates');
  }

  const parts = candidates[0]?.content?.parts;
  if (!parts || parts.length === 0) {
    throw new Error('❌ لم تُرجع Gemini TTS أي parts');
  }

  const inlineData = parts[0]?.inlineData;
  if (!inlineData?.data) {
    throw new Error('❌ لم تُرجع Gemini TTS بيانات صوتية');
  }

  const audioBuffer = Buffer.from(inlineData.data, 'base64');
  const mimeType    = inlineData.mimeType || 'audio/L16;rate=24000';

  logger.debug(`📊 mimeType: ${mimeType} | size: ${audioBuffer.length} bytes`);

  // ✅ تحويل إلى WAV إذا كان PCM
  if (mimeType.includes('audio/L') || mimeType.includes('audio/pcm')) {
    return convertToWav(audioBuffer, mimeType);
  }

  // ✅ إرجاع كما هو إذا كان WAV أو MP3
  return audioBuffer;
}

// ============================
// ✅ دمج WAV buffers
// ============================
function mergeWavBuffers(buffers) {
  if (buffers.length === 1) return buffers[0];

  const HEADER_SIZE = 44;

  // ✅ استخدم header الأول
  const firstHeader = Buffer.from(buffers[0].slice(0, HEADER_SIZE));

  // ✅ جمع data بدون headers
  const dataBuffers   = buffers.map(b => b.slice(HEADER_SIZE));
  const totalDataSize = dataBuffers.reduce((sum, b) => sum + b.length, 0);

  // ✅ تحديث الحجم في الـ header
  firstHeader.writeUInt32LE(36 + totalDataSize, 4);  // ChunkSize
  firstHeader.writeUInt32LE(totalDataSize, 40);       // Subchunk2Size

  logger.info(`🔗 دمج ${buffers.length} أجزاء صوتية`);
  return Buffer.concat([firstHeader, ...dataBuffers]);
}

// ============================
// ✅ التحقق من الصوت المولّد
// ============================
function validateAudioFile(audioPath) {
  if (!fs.existsSync(audioPath)) {
    throw new Error(`❌ ملف الصوت غير موجود: ${audioPath}`);
  }

  const stats = fs.statSync(audioPath);
  if (stats.size === 0) {
    throw new Error(`❌ ملف الصوت فارغ: ${audioPath}`);
  }

  return stats.size;
}

// ============================
// ✅ إنشاء المجلدات
// ============================
function ensureDirectories() {
  [OUTPUT_DIR, LOGS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.info(`📁 تم إنشاء المجلد: ${dir}`);
    }
  });
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

  // ✅ قراءة الـ API config
  const { apiKey, apiUrl } = getApiConfig();

  logger.info(`🌍 اللغة  : ${language}`);
  logger.info(`🎤 الصوت  : ${voiceConfig.voiceName}`);
  logger.info(`🤖 النموذج: ${CONFIG.model}`);
  logger.info(`📝 النص   : ${scriptText.length} حرف`);

  // ✅ إنشاء المجلدات
  ensureDirectories();

  // ✅ تقسيم النص إذا كان طويلاً
  const chunks = splitTextIntoChunks(scriptText.trim());

  // ✅ توليد صوت لكل جزء
  const audioBuffers = [];

  for (let i = 0; i < chunks.length; i++) {
    logger.info(`🎙️ توليد الجزء ${i + 1}/${chunks.length}...`);
    logger.info(`📝 طول الجزء: ${chunks[i].length} حرف`);

    const buffer = await withRetry(() =>
      generateChunkAudio(chunks[i], voiceConfig, apiKey, apiUrl)
    );

    audioBuffers.push(buffer);
    logger.success(`✅ الجزء ${i + 1} جاهز (${(buffer.length / 1024).toFixed(1)} KB)`);
  }

  // ✅ دمج الأجزاء
  const finalBuffer = mergeWavBuffers(audioBuffers);

  // ✅ حفظ الملف
  const audioPath = path.join(OUTPUT_DIR, `audio-${language}.wav`);
  fs.writeFileSync(audioPath, finalBuffer);

  // ✅ التحقق من الملف الناتج
  const fileSize = validateAudioFile(audioPath);

  logger.success(`✅ تم توليد الصوت بنجاح`, {
    language,
    voice : voiceConfig.voiceName,
    model : CONFIG.model,
    chunks: chunks.length,
    size  : `${(fileSize / 1024).toFixed(1)} KB`,
    path  : audioPath,
  });

  return audioPath;
}

// ============================
// ✅ دوال مساعدة - exports
// ============================
export function isSupportedLanguage(language) {
  return language in VOICE_CONFIG;
}

export function getSupportedLanguages() {
  return Object.entries(VOICE_CONFIG).map(([lang, config]) => ({
    language   : lang,
    voice      : config.voiceName,
    audioPrompt: config.audioPrompt,
  }));
}

export function getVoiceForLanguage(language) {
  const config = VOICE_CONFIG[language];
  if (!config) return null;
  return {
    language,
    voice      : config.voiceName,
    audioPrompt: config.audioPrompt,
  };
}
