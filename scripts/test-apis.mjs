import axios from 'axios';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url'; // ✅ هنا في الأعلى
import { logger } from './logger.mjs';

dotenv.config();

// ============================
// ✅ التحقق من المتغيرات المطلوبة
// ============================
const REQUIRED_VARS = {
  GROK_API_KEY   : process.env.GROK_API_KEY,
  GROK_API_URL   : process.env.GROK_API_URL,
  GEMINI_API_KEY : process.env.GEMINI_API_KEY,
  PIXABAY_API_KEY: process.env.PIXABAY_API_KEY,
  PEXELS_API_KEY : process.env.PEXELS_API_KEY,
};

function validateEnvVars() {
  const missing = [];
  const empty   = [];

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
  if (!url || url.includes('undefined')) {
    logger.error(`❌ ${name}: URL غير صالح: "${url}"`);
    return { success: false, reason: 'INVALID_URL' };
  }

  try {
    logger.info(`🧪 اختبار ${name}...`);

    const response = await axios.get(url, {
      headers,
      timeout       : timeoutMs,
      validateStatus: null,
    });

    return handleResponse(name, response);

  } catch (error) {
    return handleNetworkError(name, error);
  }
}

// ============================
// ✅ دالة اختبار POST
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
      timeout       : timeoutMs,
      validateStatus: null,
    });

    return handleResponse(name, response);

  } catch (error) {
    return handleNetworkError(name, error);
  }
}

// ============================
// ✅ معالجة الاستجابة
// ============================
function handleResponse(name, response) {
  const { status } = response;

  if (status >= 200 && status < 300) {
    logger.success(`✅ ${name} يعمل (${status})`);
    return { success: true, status };
  }

  if (status === 401) {
    logger.error(`❌ ${name}: مفتاح API غير صحيح (401)`);
    return { success: false, reason: 'INVALID_KEY', status };
  }

  if (status === 403) {
    logger.error(`❌ ${name}: ليس لديك صلاحية (403)`);
    return { success: false, reason: 'FORBIDDEN', status };
  }

  if (status === 429) {
    logger.warn(`⚠️ ${name}: تجاوز الحصة (429) - المفتاح صحيح`);
    return { success: true, reason: 'RATE_LIMITED', status };
  }

  if (status === 404) {
    logger.error(`❌ ${name}: URL غير موجود (404)`);
    return { success: false, reason: 'NOT_FOUND', status };
  }

  if (status === 405) {
    logger.error(`❌ ${name}: طريقة HTTP غير مدعومة (405)`);
    return { success: false, reason: 'METHOD_NOT_ALLOWED', status };
  }

  // ✅ طباعة تفاصيل الخطأ للـ debug
  logger.warn(`⚠️ ${name}: استجابة غير متوقعة (${status})`, {
    data: JSON.stringify(response.data)?.substring(0, 200),
  });
  return { success: false, reason: 'UNEXPECTED_STATUS', status };
}

// ============================
// ✅ معالجة أخطاء الشبكة
// ============================
function handleNetworkError(name, error) {
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    logger.error(`❌ ${name}: انتهت مهلة الاتصال`);
    return { success: false, reason: 'TIMEOUT' };
  }

  if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
    logger.error(`❌ ${name}: لا يمكن الوصول للخادم`);
    return { success: false, reason: 'NETWORK_ERROR' };
  }

  logger.error(`❌ ${name}: خطأ غير متوقع`, { error: error.message });
  return { success: false, reason: 'UNKNOWN_ERROR', error: error.message };
}

// ============================
// ✅ اختبار Grok API
// ============================
async function testGrokAPI() {
  const url = `${process.env.GROK_API_URL}/chat/completions`;
  return testPOST(
    'Grok API',
    url,
    { 'Authorization': `Bearer ${process.env.GROK_API_KEY}` },
    {
      model    : process.env.GROK_MODEL || 'grok-4', // ✅ من البيئة
      messages : [{ role: 'user', content: 'ping' }],
      max_tokens: 5,
    }
  );
}

// ============================
// ✅ اختبار Gemini API
// ============================
async function testGeminiAPI() {
  const key = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
  return testGET('Gemini API', url);
}

// ============================
// ✅ اختبار Pixabay API
// ============================
async function testPixabayAPI() {
  const key = process.env.PIXABAY_API_KEY;
  const url = `https://pixabay.com/api/?key=${key}&q=test&per_page=3`;
  return testGET('Pixabay API', url);
}

// ============================
// ✅ اختبار Pexels API
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

  const envValid = validateEnvVars();
  if (!envValid) {
    logger.error('❌ أوقف الاختبار - متغيرات بيئة مفقودة');
    return false;
  }

  const [grok, gemini, pixabay, pexels] = await Promise.all([
    testGrokAPI(),
    testGeminiAPI(),
    testPixabayAPI(),
    testPexelsAPI(),
  ]);

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

  const passed = results.filter(r => r.success).length;
  logger.info(`📈 النتيجة: ${passed}/${results.length} APIs تعمل`);

  if (allPassed) {
    logger.success('🎉 جميع الـ APIs جاهزة!');
  } else {
    logger.warn('⚠️ بعض الـ APIs تحتاج مراجعة - راجع GitHub Secrets');
  }

  return allPassed;
}

// ============================
// ✅ تشغيل مباشر - مصحح
// ============================
const currentFile = fileURLToPath(import.meta.url);
const isMain      = process.argv[1] === currentFile;

if (isMain) {
  testAllAPIs().then(ok => process.exit(ok ? 0 : 1));
}
