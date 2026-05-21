import axios from 'axios';
import dotenv from 'dotenv';
import { logger } from './logger.mjs';

dotenv.config();

// ============================
// ✅ الإعدادات
// ============================
const CONFIG = {
  pixabay: {
    maxKeywords : 5,
    perPage     : 5,
    minWidth    : 1920,
    minHeight   : 1080,
    minDuration : 5,
    maxDuration : 60,
    timeoutMs   : 15000,
  },
  pexels: {
    maxKeywords : 3,
    perPage     : 5,
    minWidth    : 1920,
    minDuration : 5,
    maxDuration : 60,
    timeoutMs   : 15000,
  },
  retry: {
    maxAttempts : 3,
    delayMs     : 1500,
  },
};

// ============================
// ✅ التحقق من المتغيرات عند الاستدعاء
// ============================
function getPixabayConfig() {
  const apiKey = process.env.PIXABAY_API_KEY;
  const apiUrl = process.env.PIXABAY_API_URL || 'https://pixabay.com/api/videos/';

  if (!apiKey || apiKey === 'undefined') {
    throw new Error('❌ PIXABAY_API_KEY غير موجود في متغيرات البيئة');
  }
  return { apiKey, apiUrl };
}

function getPexelsConfig() {
  const apiKey = process.env.PEXELS_API_KEY;
  const apiUrl = process.env.PEXELS_API_URL || 'https://api.pexels.com/videos/search';

  if (!apiKey || apiKey === 'undefined') {
    throw new Error('❌ PEXELS_API_KEY غير موجود في متغيرات البيئة');
  }
  return { apiKey, apiUrl };
}

// ============================
// ✅ Retry مع Exponential Backoff
// ============================
async function withRetry(fn, label, maxAttempts = CONFIG.retry.maxAttempts) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const status = error.response?.status;

      // ✅ لا تعيد على أخطاء غير قابلة للحل
      if (status === 401 || status === 403 || status === 400) {
        logger.error(`❌ ${label}: خطأ (${status}) - لا إعادة محاولة`);
        throw error;
      }

      if (attempt < maxAttempts) {
        const waitMs = CONFIG.retry.delayMs * attempt;
        logger.warn(`⚠️ ${label}: محاولة ${attempt}/${maxAttempts} - انتظار ${waitMs}ms`);
        await new Promise(r => setTimeout(r, waitMs));
      }
    }
  }
  throw lastError;
}

// ============================
// ✅ فلترة جودة Pixabay
// ============================
function filterPixabayVideos(hits) {
  return hits
    .filter(v => {
      const duration = v.duration || 0;
      const width    = v.width    || 0;
      const url      = v.videos?.large?.url || v.videos?.medium?.url;

      return (
        duration >= CONFIG.pixabay.minDuration &&
        duration <= CONFIG.pixabay.maxDuration &&
        width    >= CONFIG.pixabay.minWidth    &&
        !!url    // ✅ تأكد من وجود URL
      );
    })
    // ✅ رتب بالأفضل أولاً (أطول مدة ضمن الحد)
    .sort((a, b) => b.duration - a.duration);
}

// ============================
// ✅ فلترة جودة Pexels
// ============================
function filterPexelsVideos(videos) {
  return videos
    .filter(v => {
      const duration = v.duration || 0;
      const width    = v.width    || 0;

      // ✅ تحقق من وجود ملف HD على الأقل
      const hdFile = getBestPexelsFile(v.video_files);

      return (
        duration >= CONFIG.pexels.minDuration &&
        duration <= CONFIG.pexels.maxDuration &&
        width    >= CONFIG.pexels.minWidth    &&
        !!hdFile
      );
    })
    .sort((a, b) => b.duration - a.duration);
}

// ============================
// ✅ اختيار أفضل ملف Pexels
// ============================
function getBestPexelsFile(videoFiles) {
  if (!Array.isArray(videoFiles) || videoFiles.length === 0) return null;

  // ✅ رتب حسب العرض (الأعلى جودة أولاً) واختر HD كحد أدنى
  const hdFiles = videoFiles
    .filter(f => f.link && f.width >= 1920)
    .sort((a, b) => b.width - a.width);

  // ✅ إذا لم يوجد HD، اقبل SD كـ fallback
  if (hdFiles.length === 0) {
    return videoFiles
      .filter(f => f.link && f.width >= 1280)
      .sort((a, b) => b.width - a.width)[0] || null;
  }

  return hdFiles[0];
}

// ============================
// ✅ بناء كائن الفيديو الموحد
// ============================
function buildVideoObject(source, keyword, video, url) {
  return {
    keyword,
    source,
    id        : video.id,
    url,
    duration  : video.duration,
    width     : video.width,
    height    : video.height,
    thumbnail : video.picture || video.image || null,
    quality   : video.width >= 3840 ? '4K' : video.width >= 1920 ? 'HD' : 'SD',
  };
}

// ============================
// ✅ Pixabay - بحث لكلمة واحدة
// ============================
async function searchPixabayKeyword(keyword, apiKey, apiUrl) {
  return withRetry(async () => {
    const response = await axios.get(apiUrl, {
      params: {
        key        : apiKey,
        q          : keyword,
        per_page   : CONFIG.pixabay.perPage,
        order      : 'popular',
        min_width  : CONFIG.pixabay.minWidth,
        min_height : CONFIG.pixabay.minHeight,
      },
      timeout: CONFIG.pixabay.timeoutMs,
    });

    const hits         = response.data?.hits || [];
    const qualityHits  = filterPixabayVideos(hits);

    if (qualityHits.length === 0) return null;

    const best = qualityHits[0];
    const url  = best.videos?.large?.url || best.videos?.medium?.url;

    if (!url) return null;

    return buildVideoObject('pixabay', keyword, best, url);

  }, `Pixabay:"${keyword}"`);
}

// ============================
// ✅ Pexels - بحث لكلمة واحدة
// ============================
async function searchPexelsKeyword(keyword, apiKey, apiUrl) {
  return withRetry(async () => {
    const response = await axios.get(apiUrl, {
      params  : { query: keyword, per_page: CONFIG.pexels.perPage },
      headers : { 'Authorization': apiKey },
      timeout : CONFIG.pexels.timeoutMs,
    });

    const videos        = response.data?.videos || [];
    const qualityVideos = filterPexelsVideos(videos);

    if (qualityVideos.length === 0) return null;

    const best     = qualityVideos[0];
    const bestFile = getBestPexelsFile(best.video_files);

    if (!bestFile?.link) return null;

    return buildVideoObject('pexels', keyword, best, bestFile.link);

  }, `Pexels:"${keyword}"`);
}

// ============================
// ✅ البحث في Pixabay
// ============================
export async function searchVideosFromPixabay(keywords) {
  let pixabayConfig;
  try {
    pixabayConfig = getPixabayConfig();
  } catch (error) {
    logger.warn(`⚠️ تخطي Pixabay: ${error.message}`);
    return [];
  }

  logger.info(`🔍 Pixabay: بحث عن ${Math.min(keywords.length, CONFIG.pixabay.maxKeywords)} كلمات...`);

  const searchKeywords = (Array.isArray(keywords) ? keywords : [keywords])
    .slice(0, CONFIG.pixabay.maxKeywords);

  // ✅ بالتوازي
  const results = await Promise.allSettled(
    searchKeywords.map(kw =>
      searchPixabayKeyword(kw, pixabayConfig.apiKey, pixabayConfig.apiUrl)
    )
  );

  const videos = results
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);

  logger.info(`📊 Pixabay: وجدنا ${videos.length}/${searchKeywords.length} فيديو`);
  return videos;
}

// ============================
// ✅ البحث في Pexels
// ============================
export async function searchVideosFromPexels(keywords) {
  let pexelsConfig;
  try {
    pexelsConfig = getPexelsConfig();
  } catch (error) {
    logger.warn(`⚠️ تخطي Pexels: ${error.message}`);
    return [];
  }

  logger.info(`🔍 Pexels: بحث عن ${Math.min(keywords.length, CONFIG.pexels.maxKeywords)} كلمات...`);

  const searchKeywords = (Array.isArray(keywords) ? keywords : [keywords])
    .slice(0, CONFIG.pexels.maxKeywords);

  // ✅ بالتوازي
  const results = await Promise.allSettled(
    searchKeywords.map(kw =>
      searchPexelsKeyword(kw, pexelsConfig.apiKey, pexelsConfig.apiUrl)
    )
  );

  const videos = results
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);

  logger.info(`📊 Pexels: وجدنا ${videos.length}/${searchKeywords.length} فيديو`);
  return videos;
}

// ============================
// ✅ البحث في كل المصادر
// ============================
export async function searchAllVideos(keywords) {
  logger.section('🎥 البحث عن الفيديوهات');

  if (!Array.isArray(keywords) || keywords.length === 0) {
    throw new Error('❌ keywords يجب أن يكون array غير فارغ');
  }

  logger.info(`🔑 الكلمات المفتاحية: ${keywords.join(', ')}`);

  // ✅ Pixabay و Pexels بالتوازي
  const [pixabayVideos, pexelsVideos] = await Promise.all([
    searchVideosFromPixabay(keywords),
    searchVideosFromPexels(keywords),
  ]);

  const allVideos = [...pixabayVideos, ...pexelsVideos];

  // ✅ تصفية نهائية - تأكد من أن كل الفيديوهات لها URL
  const validVideos = allVideos.filter(v => v?.url);

  // ✅ إزالة المكررات (نفس الـ URL)
  const uniqueVideos = validVideos.filter(
    (v, i, arr) => arr.findIndex(x => x.url === v.url) === i
  );

  // ✅ تقرير مفصل
  logger.section('📊 نتائج البحث');
  logger.info(`Pixabay : ${pixabayVideos.length} فيديو`);
  logger.info(`Pexels  : ${pexelsVideos.length} فيديو`);
  logger.info(`المكررات: ${validVideos.length - uniqueVideos.length}`);
  logger.info(`الإجمالي: ${uniqueVideos.length} فيديو فريد`);

  if (uniqueVideos.length === 0) {
    logger.warn('⚠️ لم يتم العثور على فيديوهات - تحقق من API keys والكلمات المفتاحية');
    return [];
  }

  // ✅ ملخص الجودات
  const byQuality = uniqueVideos.reduce((acc, v) => {
    acc[v.quality] = (acc[v.quality] || 0) + 1;
    return acc;
  }, {});
  logger.info(`الجودات: ${JSON.stringify(byQuality)}`);

  return uniqueVideos;
}
