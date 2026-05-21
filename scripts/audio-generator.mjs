import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { logger, handleError } from './logger.mjs';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = process.env.GEMINI_API_URL;

const VOICE_CONFIG = {
  ar: {
    voiceName: 'ar-SA-Neural2-A',
    languageCode: 'ar-SA',
    audioTags: '[احترافي][متحمس][واضح]',
    pitch: 1.0,
    speakingRate: 1.0
  },
  en: {
    voiceName: 'en-US-Neural2-C',
    languageCode: 'en-US',
    audioTags: '[professional][engaging][clear]',
    pitch: 1.0,
    speakingRate: 1.0
  },
  fr: {
    voiceName: 'fr-FR-Neural2-A',
    languageCode: 'fr-FR',
    audioTags: '[professionnel][éloquent][clair]',
    pitch: 1.0,
    speakingRate: 1.0
  }
};

export async function generateAudio(scriptText, language) {
  try {
    logger.section('🎙️ مرحلة توليد الصوت');
    logger.info(`جاري توليد صوت احترافي بـ ${language}...`);

    const voiceConfig = VOICE_CONFIG[language];
    if (!voiceConfig) {
      throw new Error(`لا يوجد إعداد صوت للغة ${language}`);
    }

    // التحقق من طول النص
    if (!scriptText || scriptText.trim().length === 0) {
      throw new Error('النص المطلوب فارغ');
    }

    if (scriptText.length > 5000) {
      logger.warn('⚠️ النص طويل جداً، قد يتم قطعه');
    }

    const response = await axios.post(
      `${GEMINI_URL}/gemini-3.1-flash-tts:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: `${voiceConfig.audioTags}\n\n${scriptText}`
              }
            ]
          }
        ],
        generationConfig: {
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: voiceConfig.voiceName
              }
            },
            pitch: voiceConfig.pitch,
            speakingRate: voiceConfig.speakingRate
          }
        }
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    // التحقق من الاستجابة
    if (!response.data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
      throw new Error('لم يتم استقبال بيانات صوتية من Gemini API');
    }

    const audioData = response.data.candidates[0].content.parts[0].inlineData.data;
    const audioBuffer = Buffer.from(audioData, 'base64');

    // إنشاء مجلد الإخراج
    const outputDir = path.join(__dirname, '..', 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const audioPath = path.join(outputDir, `audio-${language}.wav`);
    fs.writeFileSync(audioPath, audioBuffer);

    logger.success(`✅ تم توليد الصوت بنجاح!`, {
      language,
      size: `${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB`,
      path: audioPath
    });

    return audioPath;

  } catch (error) {
    if (error.response?.status === 401) {
      logger.error('❌ خطأ في المصادقة - تحقق من GEMINI_API_KEY', { status: 401 });
    } else if (error.response?.status === 429) {
      logger.error('❌ تم تجاوز حد الطلبات - انتظر قليلاً', { status: 429 });
    } else {
      handleError(error, 'توليد الصوت');
    }
    throw error;
  }
}
