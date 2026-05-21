import axios from 'axios';
import dotenv from 'dotenv';
import { logger } from './logger.mjs';

dotenv.config();

export async function testAllAPIs() {
  logger.section('🧪 اختبار جميع الـ APIs');

  try {
    logger.info('🧪 اختبار Grok API...');
    await axios.post(
      'https://api.x.ai/v1/chat/completions',
      { model: 'grok-4.3', messages: [{ role: 'user', content: 'test' }] },
      { headers: { 'Authorization': `Bearer ${process.env.GROK_API_KEY}` }, timeout: 5000 }
    );
    logger.success('✅ Grok API يعمل');
  } catch (err) {
    logger.warn('⚠️ Grok API: ' + err.message);
  }

  try {
    logger.info('🧪 اختبار Pixabay API...');
    await axios.get(`https://pixabay.com/api/videos?key=${process.env.PIXABAY_API_KEY}&q=test`, { timeout: 5000 });
    logger.success('✅ Pixabay API يعمل');
  } catch (err) {
    logger.warn('⚠️ Pixabay API: ' + err.message);
  }

  logger.success('✅ اختبار الـ APIs اكتمل');
}

testAllAPIs();
