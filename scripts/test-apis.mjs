import axios from 'axios';
import dotenv from 'dotenv';
import { logger } from './logger.mjs';

dotenv.config();

async function testAPI(name, url, headers = {}) {
  try {
    logger.info(`🧪 اختبار ${name}...`);
    
    const response = await axios.get(url, {
      headers,
      timeout: 5000
    });

    if (response.status === 200 || response.status === 401) {
      logger.success(`✅ ${name} يعمل بشكل صحيح`);
      return true;
    }
  } catch (error) {
    if (error.response?.status === 401 || error.response?.status === 403) {
      logger.warn(`⚠️ ${name} يحتاج مصادقة صحيحة`);
      return false;
    }
    logger.error(`❌ ${name} غير متاح`, { error: error.message });
    return false;
  }
}

export async function testAllAPIs() {
  logger.section('🧪 اختبار جميع الـ APIs');

  const tests = [
    testAPI('Grok 4.3 API', `${process.env.GROK_API_URL}/chat/completions`, {
      'Authorization': `Bearer ${process.env.GROK_API_KEY}`
    }),
    testAPI('Pixabay API', `${process.env.PIXABAY_API_URL}?key=${process.env.PIXABAY_API_KEY}&q=test`)
  ];

  const results = await Promise.all(tests);
  const allPassed = results.every(r => r);

  if (allPassed) {
    logger.success('✅ جميع الـ APIs تعمل بشكل صحيح!');
  } else {
    logger.warn('⚠️ بعض الـ APIs قد تحتاج إلى فحص');
  }

  return allPassed;
}
