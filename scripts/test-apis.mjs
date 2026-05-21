import axios from 'axios';
import dotenv from 'dotenv';
import { logger } from './logger.mjs';

dotenv.config();

// ============================
// ✅ التحقق من المتغيرات المطلوبة
// ============================
const REQUIRED_VARS = {
  GROK_API_KEY    : process.env.GROK_API_KEY,
  GROK_API_URL    : process.env.GROK_API_URL,
  GEMINI_API_KEY  : process.env.GEMINI_API_KEY,
  PIXABAY_API_KEY : process.env.PIXABAY_API_KEY,
  PEXELS_API_KEY  : process.env.PEXELS_API_KEY,
};

function validateEnvVars() {
  const missing  = [];
  const empty    = [];

  for (const [key, value] of Object.entries(REQUIRED_VARS)) {
    if (!value) {
      missing.push(key);
    } else if (value === 'undefined' || value.trim() === '') {
      empty.push(key);
    }
  }

  if (missing.length > 0) {
    logger.error(`❌ متغيرات بيئة مفقودة: ${missing.join(', ')}`);
  }
  if (empty.length > 0) {
    logger.error(`❌ متغيرات بيئة فارغة: ${empty.join(', ')}`);
  }

  return missing.length === 0 && empty.length === 0;
}

// ============================
// ✅ دالة اختبار GET
// ============================
async function testGET(name, url, headers = {}, timeoutMs = 8000) {
  // ✅ تحقق من الـ URL قبل الإرسال
  if (!url || url.includes('undefined')) {
    logger.error(`❌ ${name}: URL غير صالح: "${url}"`);
    return { success: false, reason: 'INVALID_URL' };
  }

  try {
    logger.info(`🧪 اختبار ${name}...`);

    const response = await axios.get(url, {
      headers,
      timeout: timeoutMs,
      validateStatus: null, // ✅ لا ترمي exception على أي status
    });

    return handleResponse(name, response);

  } catch (error) {
    return handleError(name, error);
  }
}

// ============================
// ✅ دالة اختبار POST (مثل Grok/Gemini)
// ============================
async function testPOST(name, url, headers = {}, body = {}, timeoutMs = 10000) {
  if (!url || url.includes('undefined')) {
    logger.error(`❌ ${name}: URL غير صالح: "${url}"`);
    return { success: false, reason: 'INVALID_URL' };
  }

  try {
    logger.info(`🧪 اختبار ${name}...`);

    const response = await axios.post(url, body, {
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      timeout: timeoutMs,
      validateStatus: null,
    });

    return handleResponse(name, response);

  } catch (error) {
    return handleError(name, error);
  }
}

// ============================
// ✅ معالجة الاستجابة
// ============================
function handleResponse(name, response) {
  const { status } = response;

  // ✅ نجاح حقيقي
  if (status >= 200 && status < 300) {
    logger.success(`✅ ${name} يعمل بشكل صحيح (${status})`);
    return { success: true, status };
  }

  // ✅ مفتاح خاطئ أو غير مصرح
  if (status === 401) {
    logger.error(`❌ ${name}: مفتاح API غير صحيح أو منتهي (401)`);
    return { success: false, reason: 'INVALID_KEY', status };
  }

  if (status === 403) {
    logger.error(`❌ ${name}: ليس لديك صلاحية الوصول (403)`);
    return { success: false, reason: 'FORBIDDEN', status };
  }

  // ✅ تجاوز الحصة
  if (status === 429) {
    logger.warn(`⚠️ ${name}: تجاوزت حصة الطلبات (429) - لكن المفتاح صحيح`);
    return { success: true, reason: 'RATE_LIMITED', status }; // المفتاح صحيح
  }

  // ✅ الـ endpoint خاطئ
  if (status === 404) {
    logger.error(`❌ ${name}: الـ URL غير موجود (404)`);
    return { success: false, reason: 'NOT_FOUND', status };
  }

  // ✅ طريقة HTTP خاطئة
  if (status === 405) {
    logger.error(`❌ ${name}: طريقة HTTP غير مدعومة (405)`);
    return { success: false, reason: 'METHOD_NOT_ALLOWED', status };
  }

  logger.warn(`⚠️ ${name}: استجابة غير متوقعة (${status})`);
  return { success: false, reason: 'UNEXPECTED_STATUS', status };
}

// ============================
// ✅ معالجة الأخطاء
// ============================
function handleError(name, error) {
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    logger.error(`❌ ${name}: انتهت مهلة الاتصال (timeout)`);
    return { success: false, reason: 'TIMEOUT' };
  }

  if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
    logger.error(`❌ ${name}: لا يمكن الوصول للخادم - تحقق من الشبكة`);
    return { success: false, reason: 'NETWORK_ERROR' };
  }

  logger.error(`❌ ${name}: خطأ غير متوقع`, { error: error.message });
  return { success: false, reason: 'UNKNOWN_ERROR', error: error.message };
}

// ============================
// ✅ اختبار Grok API (POST)
// ============================
async function testGrokAPI() {
  const url = `${process.env.GROK_API_URL}/chat/completions`;
  return testPOST(
    'Grok API',
    url,
    { 'Authorization': `Bearer ${process.env.GROK_API_KEY}` },
    {
      model: 'grok-3',
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 5,
    }
  );
}

// ============================
// ✅ اختبار Gemini API (GET)
// ============================
async function testGeminiAPI() {
  const key = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
  return testGET('Gemini API', url);
}

// ============================
// ✅ اختبار Pixabay API (GET)
// ============================
async function testPixabayAPI() {
  const key = process.env.PIXABAY_API_KEY;
  const url = `https://pixabay.com/api/?key=${key}&q=test&per_page=3`;
  return testGET('Pixabay API', url);
}

// ============================
// ✅ اختبار Pexels API (GET)
// ============================
async function testPexelsAPI() {
  const key = process.env.PEXELS_API_KEY;
  const url = `https://api.pexels.com/v1/search?query=test&per_page=1`;
  return testGET('Pexels API', url, { 'Authorization': key });
}

// ============================
// ✅ الدالة الرئيسية
// ============================
export async function testAllAPIs() {
  logger.section('🧪 اختبار جميع الـ APIs');

  // ✅ تحقق من المتغيرات أولاً
  const envValid = validateEnvVars();
  if (!envValid) {
    logger.error('❌ أوقف الاختبار - متغيرات بيئة مفقودة');
    return false;
  }

  // ✅ تشغيل جميع الاختبارات بالتوازي
  const [grok, gemini, pixabay, pexels] = await Promise.all([
    testGrokAPI(),
    testGeminiAPI(),
    testPixabayAPI(),
    testPexelsAPI(),
  ]);

  // ✅ تقرير مفصل
  logger.section('📊 نتائج الاختبار');

  const results = [
    { name: 'Grok API',    ...grok    },
    { name: 'Gemini API',  ...gemini  },
    { name: 'Pixabay API', ...pixabay },
    { name: 'Pexels API',  ...pexels  },
  ];

  let allPassed = true;

  results.forEach(r => {
    if (r.success) {
      logger.success(`✅ ${r.name}: يعمل${r.reason ? ` (${r.reason})` : ''}`);
    } else {
      logger.error(`❌ ${r.name}: فشل - ${r.reason || 'خطأ غير معروف'}`);
      allPassed = false;
    }
  });

  // ✅ ملخص نهائي
  const passed = results.filter(r => r.success).length;
  logger.info(`\n📈 النتيجة: ${passed}/${results.length} APIs تعمل`);

  if (allPassed) {
    logger.success('🎉 جميع الـ APIs جاهزة!');
  } else {
    logger.warn('⚠️ بعض الـ APIs تحتاج مراجعة - راجع GitHub Secrets');
  }

  return allPassed;
}

// ✅ تشغيل مباشر إذا استُدعي الملف مباشرة
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  import { fileURLToPath } from 'url'; // في الأعلى
  testAllAPIs().then(ok => process.exit(ok ? 0 : 1));
}
