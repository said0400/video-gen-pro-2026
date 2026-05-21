import { spawn } from 'child_process';
import { logger } from './logger.mjs';

// ============================
// ✅ قراءة الإعدادات من البيئة أولاً
// ============================
const DEFAULT_CONFIGS = {
  ar: {
    CONTENT_TYPE: 'Motivational',
    MAIN_TOPIC: 'النجاح والإصرار - رحلة الألف ميل تبدأ بخطوة واحدة'
  },
  en: {
    CONTENT_TYPE: 'Motivational',
    MAIN_TOPIC: 'Success and Determination - Your Journey Starts Today'
  },
  fr: {
    CONTENT_TYPE: 'Motivational',
    MAIN_TOPIC: "Succès et Détermination - Votre Voyage Commence Aujourd'hui"
  }
};

// ✅ قراءة من البيئة أو استخدام القيم الافتراضية
function getConfig() {
  const langEnv = process.env.LANGUAGES || process.env.LANGUAGE || 'ar,en,fr';
  const languages = langEnv.split(',').map(l => l.trim()).filter(Boolean);

  const contentType = process.env.CONTENT_TYPE;
  const mainTopic   = process.env.MAIN_TOPIC;

  // بناء الإعدادات لكل لغة
  const configs = {};
  for (const lang of languages) {
    configs[lang] = {
      CONTENT_TYPE: contentType || DEFAULT_CONFIGS[lang]?.CONTENT_TYPE || 'Motivational',
      MAIN_TOPIC:   mainTopic   || DEFAULT_CONFIGS[lang]?.MAIN_TOPIC   || 'General Topic'
    };
  }

  return { languages, configs };
}

// ============================
// ✅ تشغيل Script مع Timeout
// ============================
const SCRIPT_TIMEOUT_MS = 10 * 60 * 1000; // 10 دقائق

async function runScript(language, config) {
  return new Promise((resolve, reject) => {
    logger.info(`🚀 بدء تشغيل: ${language.toUpperCase()}`);

    const env = {
      ...process.env,
      LANGUAGE:     language,
      CONTENT_TYPE: config.CONTENT_TYPE,
      MAIN_TOPIC:   config.MAIN_TOPIC
    };

    const child = spawn('node', ['scripts/generate-video.mjs'], {
      env,
      stdio: 'inherit'
    });

    // ✅ Timeout - يوقف العملية إذا تأخرت
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`⏰ Script تجاوز ${SCRIPT_TIMEOUT_MS / 60000} دقيقة للغة: ${language}`));
    }, SCRIPT_TIMEOUT_MS);

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ language, success: true });
      } else {
        reject(new Error(`❌ Script فشل بكود: ${code} للغة: ${language}`));
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`❌ خطأ في تشغيل Script للغة ${language}: ${err.message}`));
    });
  });
}

// ============================
// ✅ تشغيل متوازي مع تتبع النتائج
// ============================
async function runParallel(languages, configs) {
  logger.info(`⚡ تشغيل ${languages.length} فيديوهات بالتوازي...`);

  const promises = languages.map(lang =>
    runScript(lang, configs[lang])
      .then(result => ({ ...result, success: true }))
      .catch(error => ({ language: lang, success: false, error: error.message }))
  );

  return Promise.all(promises);
}

// ============================
// ✅ تشغيل تسلسلي (بديل آمن)
// ============================
async function runSequential(languages, configs) {
  logger.info(`📋 تشغيل ${languages.length} فيديوهات بالتسلسل...`);
  const results = [];

  for (const language of languages) {
    logger.info(`\n${'='.repeat(60)}`);
    logger.info(`🎬 معالجة اللغة: ${language.toUpperCase()}`);
    logger.info('='.repeat(60));

    try {
      const result = await runScript(language, configs[language]);
      results.push({ ...result, success: true });
      logger.success(`✅ اكتمل: ${language}`);
    } catch (error) {
      logger.error(`❌ فشل: ${language}`, { error: error.message });
      results.push({ language, success: false, error: error.message });
    }
  }

  return results;
}

// ============================
// ✅ طباعة تقرير النتائج
// ============================
function printReport(results) {
  logger.section('📊 تقرير النتائج النهائي');

  const succeeded = results.filter(r => r.success);
  const failed    = results.filter(r => !r.success);

  logger.info(`✅ نجح: ${succeeded.length}/${results.length}`);
  logger.info(`❌ فشل: ${failed.length}/${results.length}`);

  if (succeeded.length > 0) {
    logger.info('\n📁 الملفات الناجحة:');
    succeeded.forEach(r => {
      logger.info(`   ✅ output/input-props-${r.language}.json`);
    });
  }

  if (failed.length > 0) {
    logger.info('\n⚠️ الأخطاء:');
    failed.forEach(r => {
      logger.error(`   ❌ ${r.language}: ${r.error}`);
    });
  }

  return failed.length === 0;
}

// ============================
// Main
// ============================
async function main() {
  try {
    logger.section('🚀 توليد الفيديوهات');

    const { languages, configs } = getConfig();

    logger.info('📋 الإعدادات:');
    logger.info(`   اللغات: ${languages.join(', ')}`);
    logger.info(`   النوع: ${Object.values(configs)[0]?.CONTENT_TYPE}`);
    logger.info(`   الموضوع: ${Object.values(configs)[0]?.MAIN_TOPIC}`);

    // ✅ اختر بين parallel و sequential
    const PARALLEL_MODE = process.env.PARALLEL_MODE !== 'false';
    
    const results = PARALLEL_MODE
      ? await runParallel(languages, configs)
      : await runSequential(languages, configs);

    const allSucceeded = printReport(results);

    if (!allSucceeded) {
      const failCount = results.filter(r => !r.success).length;
      logger.error(`❌ فشل ${failCount} فيديو(هات)`);
      process.exit(1);
    }

    logger.section('✨ اكتملت جميع الفيديوهات بنجاح!');

  } catch (error) {
    logger.error('❌ خطأ غير متوقع', { error: error.message });
    process.exit(1);
  }
}

main();
