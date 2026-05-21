import { spawn } from 'child_process';
import { logger } from './logger.mjs';

const LANGUAGES = ['ar', 'en', 'fr'];
const CONTENT_CONFIGS = {
  ar: {
    CONTENT_TYPE: 'Motivational',
    MAIN_TOPIC: 'النجاح والإصرار - رحلة الألف ميل تبدأ بخطوة واحدة'
  },
  en: {
    CONTENT_TYPE: 'Motivational',
    MAIN_TOPIC: 'Success and Determination - Your Journey to Excellence Starts Today'
  },
  fr: {
    CONTENT_TYPE: 'Motivational',
    MAIN_TOPIC: 'Succès et Détermination - Votre Voyage vers l\'Excellence Commence Aujourd\'hui'
  }
};

async function runScript(language) {
  return new Promise((resolve, reject) => {
    const config = CONTENT_CONFIGS[language];
    const env = {
      ...process.env,
      LANGUAGE: language,
      CONTENT_TYPE: config.CONTENT_TYPE,
      MAIN_TOPIC: config.MAIN_TOPIC
    };

    const child = spawn('node', ['scripts/generate-video.mjs'], {
      env,
      stdio: 'inherit'
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script failed with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

async function main() {
  try {
    logger.section('🚀 توليد الفيديوهات الثلاثة');

    for (const language of LANGUAGES) {
      logger.info(`\n${'='.repeat(60)}`);
      logger.info(`🎬 معالجة اللغة: ${language.toUpperCase()}`);
      logger.info('='.repeat(60));

      await runScript(language);

      logger.success(`✅ اكتمل الفيديو بـ ${language}`);
    }

    logger.section('✨ اكتملت جميع الفيديوهات بنجاح!');
    logger.info('📁 الملفات النهائية:');
    logger.info('   - output/input-props-ar.json');
    logger.info('   - output/input-props-en.json');
    logger.info('   - output/input-props-fr.json');

  } catch (error) {
    logger.error('❌ حدث خطأ في توليد الفيديوهات', { error: error.message });
    process.exit(1);
  }
}

main();
