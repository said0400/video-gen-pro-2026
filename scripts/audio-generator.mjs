import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { logger, handleError } from './logger.mjs';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta/models';

const VOICE_CONFIG = {
  ar: { voiceName: 'ar-SA-Neural2-A', languageCode: 'ar-SA' },
  en: { voiceName: 'en-US-Neural2-C', languageCode: 'en-US' },
  fr: { voiceName: 'fr-FR-Neural2-A', languageCode: 'fr-FR' }
};

export async function generateAudio(scriptText, language) {
  try {
    logger.section('🎙️ مرحلة توليد الصوت');
    logger.info(`جاري توليد صوت احترافي بـ ${language}...`);

    const voiceConfig = VOICE_CONFIG[language];
    if (!voiceConfig) {
      throw new Error(`لا يوجد إعداد صوت للغة ${language}`);
    }

    if (!scriptText || scriptText.trim().length === 0) {
      throw new Error('النص المطلوب فارغ');
    }

    const response = await axios.post(
      `${GEMINI_URL}/gemini-3.1-flash-tts:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: scriptText
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
            }
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

    if (!response.data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
      throw new Error('لم يتم استقبال بيانات صوتية من Gemini API');
    }

    const audioData = response.data.candidates[0].content.parts[0].inlineData.data;
    const audioBuffer = Buffer.from(audioData, 'base64');

    const outputDir = path.join(__dirname, '..', 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const audioPath = path.join(outputDir, `audio-${language}.wav`);
    fs.writeFileSync(audioPath, audioBuffer);

    logger.success(`✅ تم توليد الصوت بنجاح!`, {
      language,
      size: `${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB`
    });

    return audioPath;

  } catch (error) {
    handleError(error, 'توليد الصوت');
    throw error;
  }
}
