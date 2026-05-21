import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { generateEngagingContent } from './content-generator.mjs';
import { searchAllVideos } from './video-search.mjs';
import { generateAudio } from './audio-generator.mjs';
import { getMusicUrl, getMusicMoodForContentType } from './music-library.mjs';
import { logger } from './logger.mjs';

dotenv.config();

// ============================
// ✅ الإعدادات
// ============================
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT_DIR   = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT_DIR, 'output');
const LOGS_DIR   = path.join(ROOT_DIR, 'logs');

const CONFIG = {
  language    : process.env.LANGUAGE     || 'ar',
  contentType : process.env.CONTENT_TYPE || 'Motivational',
  mainTopic   : process.env.MAIN_TOPIC   || 'النجاح والإصرار',
  videoQuality: process.env.VIDEO_QUALITY || '1080p',
};

// ✅ المفاتيح المطلوبة - محدّثة
const REQUIRED_ENV_KEYS = [
  'DEEPSEEK_API_KEY', // لتوليد النصوص
  'GEMINI_API_KEY_2', // لتوليد الصوت
];

// ============================
// ✅ التحقق من متغيرات البيئة
// ============================
function validateEnvironment() {
  const missing = REQUIRED_ENV_KEYS.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `❌ مفاتيح API مفقودة: ${missing.join(', ')}\n` +
      `تأكد من إضافتها في GitHub Secrets`
    );
  }

  const validLanguages = ['ar', 'en', 'fr'];
  if (!validLanguages.includes(CONFIG.language)) {
    throw new Error(
      `❌ لغة غير مدعومة: "${CONFIG.language}"\n` +
      `اللغات المدعومة: ${validLanguages.join(', ')}`
    );
  }

  logger.success('✅ البيئة سليمة - جميع المفاتيح موجودة');
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
// ✅ التحقق من المحتوى
// ============================
function validateContent(content) {
  const required = ['title', 'segments', 'keywords', 'cta'];
  const missing  = required.filter(key => !content[key]);

  if (missing.length > 0) {
    throw new Error(`❌ المحتوى ناقص - حقول مفقودة: ${missing.join(', ')}`);
  }

  if (!Array.isArray(content.segments) || content.segments.length === 0) {
    throw new Error('❌ segments يجب أن يكون array غير فارغ');
  }

  if (!Array.isArray(content.keywords) || content.keywords.length === 0) {
    throw new Error('❌ keywords يجب أن يكون array غير فارغ');
  }

  const fullText  = content.segments.join(' ');
  const wordCount = fullText.trim().split(/\s+/).filter(w => w).length;

  const wpsMap   = { ar: 2.0, en: 2.5, fr: 2.3 };
  const wps      = wpsMap[CONFIG.language] || 2.5;
  const duration = Math.round(wordCount / wps);

  logger.success(`✅ المحتوى سليم`, {
    segments: content.segments.length,
    words   : wordCount,
    duration: `~${duration}s`,
    status  : duration < 40 ? '⚠️ قصير' : duration > 80 ? '⚠️ طويل' : '✅ مثالي',
  });

  if (duration < 40) {
    logger.warn(
      `⚠️ تحذير: النص قصير جداً!\n` +
      `   المدة المتوقعة: ${duration}s (الحد الأدنى: 40s)\n` +
      `   عدد الكلمات: ${wordCount}`
    );
  }

  return { wordCount, duration };
}

// ============================
// ✅ التحقق من الفيديوهات
// ============================
function validateVideos(videos) {
  if (!Array.isArray(videos) || videos.length === 0) {
    throw new Error('❌ لم يتم العثور على فيديوهات مناسبة');
  }

  const validVideos = videos.filter(v => v && (v.url || v.path));

  if (validVideos.length === 0) {
    throw new Error('❌ جميع الفيديوهات المُرجعة غير صالحة');
  }

  logger.success(`✅ تم العثور على ${validVideos.length} فيديو صالح`);
  return validVideos;
}

// ============================
// ✅ التحقق من الصوت
// ============================
function validateAudio(audioPath) {
  if (!audioPath) {
    throw new Error('❌ فشل توليد الصوت - المسار فارغ');
  }

  if (!fs.existsSync(audioPath)) {
    throw new Error(`❌ ملف الصوت غير موجود: ${audioPath}`);
  }

  const stats = fs.statSync(audioPath);
  if (stats.size === 0) {
    throw new Error(`❌ ملف الصوت فارغ: ${audioPath}`);
  }

  const estimatedDuration = Math.round(stats.size / 48000);

  logger.success(`✅ الصوت جاهز`, {
    path    : audioPath,
    size    : `${(stats.size / 1024).toFixed(1)} KB`,
    duration: `~${estimatedDuration}s`,
  });
}

// ============================
// ✅ حفظ النتائج
// ============================
function saveResults(inputProps) {
  const propsPath = path.join(OUTPUT_DIR, `input-props-${CONFIG.language}.json`);
  fs.writeFileSync(propsPath, JSON.stringify(inputProps, null, 2), 'utf8');
  logger.success(`✅ تم حفظ البيانات: ${propsPath}`);
  return propsPath;
}

// ============================
// ✅ Main
// ============================
async function main() {
  const startTime = Date.now();

  try {
    logger.section(`🚀 توليد فيديو - ${CONFIG.language.toUpperCase()}`);
    logger.info(`📋 النوع     : ${CONFIG.contentType}`);
    logger.info(`🎯 الموضوع   : ${CONFIG.mainTopic}`);
    logger.info(`📺 الجودة    : ${CONFIG.videoQuality}`);
    logger.info(`🌍 اللغة     : ${CONFIG.language}`);
    logger.info(`🔑 النصوص    : DeepSeek API`);
    logger.info(`🔑 الصوت     : GEMINI_API_KEY_2`);

    // ✅ 0: التحقق من البيئة
    validateEnvironment();
    ensureDirectories();

    // ✅ 1: توليد المحتوى بـ DeepSeek
    logger.section('📝 الخطوة 1: توليد المحتوى (DeepSeek)');
    const content = await generateEngagingContent(
      CONFIG.language,
      CONFIG.contentType,
      CONFIG.mainTopic
    );

    const { wordCount, duration } = validateContent(content);

    // ✅ 2: البحث عن الفيديوهات
    logger.section('🎥 الخطوة 2: البحث عن الفيديوهات');
    const rawVideos = await searchAllVideos(content.keywords);
    const videos    = validateVideos(rawVideos);

    // ✅ 3: توليد الصوت بـ Gemini TTS
    logger.section('🎙️ الخطوة 3: توليد الصوت (Gemini TTS - API Key 2)');
    const fullScript = content.segments
      .filter(s => typeof s === 'string' && s.trim())
      .join(' ');

    if (!fullScript) {
      throw new Error('❌ النص الكامل فارغ بعد دمج المقاطع');
    }

    logger.info(`📝 طول النص: ${fullScript.length} حرف | ${wordCount} كلمة | ~${duration}s`);

    const audioPath = await generateAudio(fullScript, CONFIG.language);
    validateAudio(audioPath);

    // ✅ 4: اختيار الموسيقى
    logger.section('🎵 الخطوة 4: اختيار الموسيقى');
    const musicMood = getMusicMoodForContentType(CONFIG.contentType);
    const musicUrl  = await getMusicUrl(musicMood);
    logger.info(`🎵 المود : ${musicMood}`);
    logger.info(`🔗 الرابط: ${musicUrl}`);

    // ✅ 5: حفظ البيانات
    logger.section('💾 الخطوة 5: حفظ البيانات');
    const inputProps = {
      title             : content.title,
      segments          : content.segments,
      keywords          : content.keywords,
      cta               : content.cta,
      emotional_triggers: content.emotional_triggers || [],
      word_count        : wordCount,
      estimated_duration_seconds: duration,
      videos,
      audioPath,
      musicUrl,
      language          : CONFIG.language,
      contentType       : CONFIG.contentType,
      topic             : CONFIG.mainTopic,
      quality           : CONFIG.videoQuality,
      generatedAt       : new Date().toISOString(),
      processingMs      : Date.now() - startTime,
    };

    const propsPath = saveResults(inputProps);

    // ✅ ملخص نهائي
    const elapsed  = ((Date.now() - startTime) / 1000).toFixed(1);
    const audioDur = Math.round(fs.statSync(audioPath).size / 48000);

    logger.section('✨ اكتمل التوليد بنجاح!');
    logger.info(`⏱️  وقت المعالجة  : ${elapsed} ثانية`);
    logger.info(`📝 كلمات النص    : ${wordCount} كلمة`);
    logger.info(`🎙️  مدة الصوت     : ~${audioDur}s`);
    logger.info(`📊 الهدف         : 40-80 ثانية`);
    logger.info(`✅ الحالة        : ${audioDur < 40 ? '⚠️ قصير' : audioDur > 80 ? '⚠️ طويل' : '✅ مثالي'}`);
    logger.info(`📁 المجلد        : ${OUTPUT_DIR}`);
    logger.info(`📄 البيانات      : ${propsPath}`);
    logger.info(`🎙️  الصوت         : ${audioPath}`);
    logger.info(`🎥 فيديوهات      : ${videos.length} مقطع`);
    logger.info(`🎵 موسيقى        : ${musicUrl}`);

  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.error('❌ فشل توليد الفيديو', {
      error  : error.message,
      elapsed: `${elapsed}s`,
      lang   : CONFIG.language,
    });
    process.exit(1);
  }
}

main();
