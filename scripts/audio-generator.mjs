import axios from 'axios';
import fs    from 'fs';
import path  from 'path';
import struct from 'python-struct'; // ❌ لا يوجد في Node
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { logger } from './logger.mjs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT_DIR   = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT_DIR, 'output');

// ============================
// ✅ الإعدادات
// ============================
const CONFIG = {
  model     : 'gemini-2.5-flash-preview-tts', // ✅ نموذج TTS
  timeoutMs : 120000,  // دقيقتان
  maxRetries: 3,
  retryDelay: 5000,
  maxChars  : 4500,
};

// ============================
// ✅ إعدادات الأصوات لكل لغة
// ============================
const VOICE_CONFIG = {
  ar: {
    // ✅ أصوات Gemini TTS تدعم العربية
    voiceName  : 'Alnilam',   // صوت أنثى ناعم
    audioPrompt: `Read the following text in Arabic with a professional, 
clear and engaging voice. Style: Natural. Pace: Medium. Accent: Modern Standard Arabic.`,
  },
  en: {
    voiceName  : 'Charon',    // صوت ذكر احترافي
    audioPrompt: `Read the following text with a smooth, premium commercial voice.
Style: Promo/Hype. Pace: Natural. Accent: Neutral American.`,
  },
  fr: {
    voiceName  : 'Aoede',     // صوت أنثى فرنسي
    audioPrompt: `Lisez le texte suivant avec une voix professionnelle et claire.
Style: Naturel. Rythme: Modéré. Accent: Français standard.`,
  },
};

// ✅ قائمة الأصوات المتاحة في Gemini TTS
// Puck, Charon, Kore, Fenrir, Aoede, Alnilam

// ============================
// ✅ التحقق من المتغيرات
// ============================
function getApiConfig() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === 'undefined' || apiKey.trim() === '') {
    throw new Error(
      '❌ GEMINI_API_KEY غير موجود\n' +
      'احصل على مفتاحك من: https://aistudio.google.com/'
    );
  }

  const apiUrl = 'https://generativelanguage.googleapis.com/v1beta';

  return { apiKey, apiUrl };
}

// ============================
// ✅ تحويل PCM إلى WAV (بدون مكتبات خارجية)
// ============================
function convertToWav(audioData, mimeType) {
  // ✅ استخراج المعاملات من mime type
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

  const numChannels  = 1;
  const dataSize     = audioData.length;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign   = numChannels * bytesPerSample;
  const byteRate     = sampleRate * blockAlign;
  const chunkSize    = 36 + dataSize;

  // ✅ بناء WAV header يدوياً (بدون python-struct)
  const header = Buffer.alloc(44);

  // RIFF chunk
  header.write('RIFF', 0);
  header.writeUInt32LE(chunkSize, 4);
  header.write('WAVE', 8);

  // fmt chunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);          // Subchunk1Size
  header.writeUInt16LE(1, 20);           // AudioFormat (PCM)
  header.writeUInt16LE(numChannels, 22); // NumChannels
  header.writeUInt32LE(sampleRate, 24);  // SampleRate
  header.writeUInt32LE(byteRate, 28);    // ByteRate
  header.writeUInt16LE(blockAlign, 32);  // BlockAlign
  header.writeUInt16LE(bitsPerSample, 34); // BitsPerSample

  // data chunk
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, audioData]);
}

// ============================
// ✅ تقسيم النص
// ============================
function splitTextIntoChunks(text, maxChars = CONFIG.maxChars) {
  if (text.length <= maxChars) return [text];

  logger.warn(`⚠️ النص طويل (${text.length} حرف) - سيتم تقسيمه`);

  const chunks    = [];
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
// ✅ Retry
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

      if (status === 400 || status === 401 || status === 403) {
        logger.error(`❌ خطأ (${status}) - لا إعادة محاولة`);
        throw error;
      }

      if (status === 429) {
        const waitMs = 30000;
        logger.warn(`⚠️ تجاوز الحصة - انتظار ${waitMs / 1000}s`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

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
        temperature        : 1,
        responseModalities : ['AUDIO'],
        speechConfig       : {
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

  // ✅ تحويل إلى WAV إذا لزم
  if (mimeType.includes('audio/L') || mimeType.includes('audio/pcm')) {
    return convertToWav(audioBuffer, mimeType);
  }

  return audioBuffer;
}

// ============================
// ✅ الدالة الرئيسية
// ============================
export async function generateAudio(scriptText, language = 'ar') {
  logger.section('🎙️ توليد الصوت');

  if (!scriptText || scriptText.trim().length === 0) {
    throw new Error('❌ النص فارغ');
  }

  const voiceConfig = VOICE_CONFIG[language];
  if (!voiceConfig) {
    throw new Error(
      `❌ لغة غير مدعومة: "${language}"\n` +
      `اللغات المتاحة: ${Object.keys(VOICE_CONFIG).join(', ')}`
    );
  }

  const { apiKey, apiUrl } = getApiConfig();

  logger.info(`🌍 اللغة  : ${language}`);
  logger.info(`🎤 الصوت  : ${voiceConfig.voiceName}`);
  logger.info(`🤖 النموذج: ${CONFIG.model}`);
  logger.info(`📝 النص   : ${scriptText.length} حرف`);

  // ✅ تقسيم النص
  const chunks = splitTextIntoChunks(scriptText.trim());

  // ✅ توليد صوت لكل جزء
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
  const finalBuffer = audioBuffers.length === 1
    ? audioBuffers[0]
    : mergeWavBuffers(audioBuffers);

  // ✅ حفظ الملف
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const audioPath = path.join(OUTPUT_DIR, `audio-${language}.wav`);
  fs.writeFileSync(audioPath, finalBuffer);

  // ✅ التحقق
  const fileSize = fs.statSync(audioPath).size;
  if (fileSize === 0) {
    throw new Error('❌ ملف الصوت الناتج فارغ');
  }

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
// ✅ دمج WAV buffers
// ============================
function mergeWavBuffers(buffers) {
  if (buffers.length === 1) return buffers[0];

  const HEADER_SIZE = 44;

  // ✅ استخدم header الأول
  const firstHeader = Buffer.from(buffers[0].slice(0, HEADER_SIZE));

  // ✅ جمع data بدون headers
  const dataBuffers  = buffers.map(b => b.slice(HEADER_SIZE));
  const totalDataSize = dataBuffers.reduce((sum, b) => sum + b.length, 0);

  // ✅ تحديث الحجم في الـ header
  firstHeader.writeUInt32LE(36 + totalDataSize, 4);
  firstHeader.writeUInt32LE(totalDataSize, 40);

  logger.info(`🔗 دمج ${buffers.length} أجزاء صوتية`);
  return Buffer.concat([firstHeader, ...dataBuffers]);
}

// ============================
// ✅ دوال مساعدة
// ============================
export function isSupportedLanguage(language) {
  return language in VOICE_CONFIG;
}

export function getSupportedLanguages() {
  return Object.entries(VOICE_CONFIG).map(([lang, config]) => ({
    language : lang,
    voice    : config.voiceName,
  }));
}
