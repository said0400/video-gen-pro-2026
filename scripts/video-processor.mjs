import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ============================
// ✅ إعداد FFmpeg - نظام أولاً
// ============================
function setupFFmpeg() {
  // ✅ استخدم system ffmpeg إذا كان متاحاً
  const systemFFmpeg = process.env.FFMPEG_PATH || '/usr/bin/ffmpeg';

  if (fs.existsSync(systemFFmpeg)) {
    ffmpeg.setFfmpegPath(systemFFmpeg);
    logger.info(`✅ استخدام system FFmpeg: ${systemFFmpeg}`);
  } else if (ffmpegStatic) {
    // ✅ fallback لـ ffmpeg-static
    ffmpeg.setFfmpegPath(ffmpegStatic);
    logger.warn(`⚠️ استخدام ffmpeg-static (fallback): ${ffmpegStatic}`);
  } else {
    throw new Error('❌ FFmpeg غير موجود! ثبّت ffmpeg أو أضف ffmpeg-static');
  }
}

// استدعاء مرة واحدة عند تحميل الملف
setupFFmpeg();

// ============================
// ✅ إعدادات الجودة
// ============================
const QUALITY_PRESETS = {
  '720p': {
    resolution : '1280x720',
    crf        : 23,
    preset     : 'fast',
    audioBitrate: '192k',
  },
  '1080p': {
    resolution : '1920x1080',
    crf        : 20,
    preset     : 'fast',
    audioBitrate: '320k',
  },
  '4K': {
    resolution : '3840x2160',
    crf        : 18,
    preset     : 'slow',     // ✅ جودة أعلى للـ 4K
    audioBitrate: '320k',
  },
};

const DEFAULT_QUALITY  = '1080p';
const TIMEOUT_MS       = 30 * 60 * 1000; // 30 دقيقة

// ============================
// ✅ التحقق من المدخلات
// ============================
function validateInputs(inputPath, outputPath) {
  // تحقق من inputPath
  if (!inputPath) {
    throw new Error('❌ inputPath فارغ أو غير محدد');
  }
  if (!fs.existsSync(inputPath)) {
    throw new Error(`❌ ملف المدخل غير موجود: ${inputPath}`);
  }

  const inputStats = fs.statSync(inputPath);
  if (inputStats.size === 0) {
    throw new Error(`❌ ملف المدخل فارغ: ${inputPath}`);
  }

  // تحقق من outputPath
  if (!outputPath) {
    throw new Error('❌ outputPath فارغ أو غير محدد');
  }

  // ✅ إنشاء مجلد الـ output إذا لم يكن موجوداً
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    logger.info(`📁 تم إنشاء مجلد: ${outputDir}`);
  }

  logger.info(`📂 المدخل: ${inputPath} (${(inputStats.size / 1024 / 1024).toFixed(2)} MB)`);
  logger.info(`📂 المخرج: ${outputPath}`);
}

// ============================
// ✅ بناء خيارات FFmpeg
// ============================
function buildFFmpegOptions(quality = DEFAULT_QUALITY, language = 'ar') {
  const preset = QUALITY_PRESETS[quality] || QUALITY_PRESETS[DEFAULT_QUALITY];

  if (!QUALITY_PRESETS[quality]) {
    logger.warn(`⚠️ جودة غير معروفة "${quality}" - استخدام ${DEFAULT_QUALITY}`);
  }

  const options = [
    `-vf scale=${preset.resolution}`,  // ✅ الدقة الصحيحة
    '-c:v libx264',
    `-preset ${preset.preset}`,
    `-crf ${preset.crf}`,
    '-c:a aac',
    `-b:a ${preset.audioBitrate}`,
    '-movflags +faststart',
    '-pix_fmt yuv420p',
    '-y',
  ];

  // ✅ دعم اللغة العربية في الـ metadata
  if (language === 'ar') {
    options.push('-metadata:s:a:0 language=ara');
  } else if (language === 'fr') {
    options.push('-metadata:s:a:0 language=fra');
  } else {
    options.push('-metadata:s:a:0 language=eng');
  }

  return options;
}

// ============================
// ✅ الدالة الرئيسية
// ============================
export async function processVideo(
  inputPath,
  outputPath,
  language = 'ar',
  quality  = DEFAULT_QUALITY
) {
  // ✅ التحقق خارج الـ Promise
  validateInputs(inputPath, outputPath);

  const options   = buildFFmpegOptions(quality, language);
  const startTime = Date.now();

  logger.section('⚙️ معالجة الفيديو بـ FFmpeg');
  logger.info(`🎬 الجودة: ${quality} | اللغة: ${language}`);

  return new Promise((resolve, reject) => {
    let lastPercent = 0;
    let timeoutId;

    // ✅ Timeout
    timeoutId = setTimeout(() => {
      command.kill('SIGTERM');
      reject(new Error(`❌ FFmpeg تجاوز ${TIMEOUT_MS / 60000} دقيقة`));
    }, TIMEOUT_MS);

    const command = ffmpeg(inputPath)
      .outputOptions(options)

      .on('start', (cmd) => {
        logger.debug(`🚀 FFmpeg: ${cmd}`);
      })

      .on('progress', (progress) => {
        const percent = Math.round(progress.percent || 0);
        // ✅ لا تطبع كل مرة - فقط كل 10%
        if (percent >= lastPercent + 10) {
          lastPercent = percent;
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
          process.stdout.write(`\r⏳ معالجة: ${percent}% | ${elapsed}s`);
        }
      })

      .on('end', () => {
        clearTimeout(timeoutId);
        console.log(''); // سطر جديد بعد progress

        // ✅ تحقق من الملف الناتج
        if (!fs.existsSync(outputPath)) {
          reject(new Error('❌ FFmpeg انتهى لكن الملف الناتج غير موجود'));
          return;
        }

        const outputSize = fs.statSync(outputPath).size;
        if (outputSize === 0) {
          reject(new Error('❌ الملف الناتج فارغ'));
          return;
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        logger.success(`✅ تم معالجة الفيديو`, {
          output : outputPath,
          size   : `${(outputSize / 1024 / 1024).toFixed(2)} MB`,
          elapsed: `${elapsed}s`,
          quality,
        });

        resolve(outputPath);
      })

      .on('error', (err, stdout, stderr) => {
        clearTimeout(timeoutId);
        console.log('');

        // ✅ تمييز أنواع الأخطاء
        let reason = err.message;
        if (stderr?.includes('No such file'))      reason = 'ملف المدخل غير موجود';
        if (stderr?.includes('Invalid data'))      reason = 'ملف الفيديو تالف';
        if (stderr?.includes('Encoder not found')) reason = 'codec غير مدعوم';
        if (stderr?.includes('Out of memory'))     reason = 'نفدت الذاكرة';

        logger.error(`❌ خطأ في FFmpeg: ${reason}`);
        if (stderr) logger.debug(`FFmpeg stderr:\n${stderr}`);

        reject(new Error(`FFmpeg فشل: ${reason}`));
      })

      .save(outputPath);
  });
}

// ============================
// ✅ دالة مساعدة للتحقق من FFmpeg
// ============================
export async function checkFFmpegVersion() {
  return new Promise((resolve) => {
    ffmpeg.getAvailableFormats((err, formats) => {
      if (err) {
        logger.error('❌ FFmpeg غير متاح');
        resolve(false);
      } else {
        logger.success(`✅ FFmpeg جاهز - ${Object.keys(formats).length} format متاح`);
        resolve(true);
      }
    });
  });
}
