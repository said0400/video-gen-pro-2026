import https from 'https';
import http from 'http';
import { logger } from './logger.mjs';

// ============================
// ✅ مكتبة الموسيقى مع بدائل
// ============================
const MUSIC_LIBRARY = {
  inspirational: {
    tracks: [
      {
        url  : 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
        name : 'SoundHelix inspirational 1',
        bpm  : 120,
      },
      {
        url  : 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
        name : 'SoundHelix inspirational 2',
        bpm  : 115,
      },
    ],
    // ✅ روابط بديلة من مصادر أخرى
    fallback: [
      'https://archive.org/download/testmp3testfile/mpthreetest.mp3',
    ],
  },

  calm: {
    tracks: [
      {
        url  : 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
        name : 'SoundHelix calm 1',
        bpm  : 80,
      },
      {
        url  : 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
        name : 'SoundHelix calm 2',
        bpm  : 75,
      },
    ],
    fallback: [],
  },

  dramatic: {
    tracks: [
      {
        url  : 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
        name : 'SoundHelix dramatic 1',
        bpm  : 140,
      },
      {
        url  : 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3',
        name : 'SoundHelix dramatic 2',
        bpm  : 135,
      },
    ],
    fallback: [],
  },

  professional: {
    tracks: [
      {
        url  : 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3',
        name : 'SoundHelix professional 1',
        bpm  : 100,
      },
      {
        url  : 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
        name : 'SoundHelix professional 2',
        bpm  : 95,
      },
    ],
    fallback: [],
  },

  electronic: {
    tracks: [
      {
        url  : 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3',
        name : 'SoundHelix electronic 1',
        bpm  : 128,
      },
      {
        url  : 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3',
        name : 'SoundHelix electronic 2',
        bpm  : 130,
      },
    ],
    fallback: [],
  },

  upbeat: {
    tracks: [
      {
        url  : 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3',
        name : 'SoundHelix upbeat 1',
        bpm  : 145,
      },
      {
        url  : 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3',
        name : 'SoundHelix upbeat 2',
        bpm  : 150,
      },
    ],
    fallback: [],
  },
};

// ✅ الـ Moods المتاحة
const VALID_MOODS = Object.keys(MUSIC_LIBRARY);
const DEFAULT_MOOD = 'inspirational';

// ============================
// ✅ خريطة ContentType → Mood
// ============================
const CONTENT_TYPE_MOOD_MAP = {
  Motivational : 'inspirational',
  Educational  : 'calm',
  Story        : 'dramatic',
  News         : 'professional',
  Tech         : 'electronic',
  Lifestyle    : 'upbeat',
};

// ============================
// ✅ التحقق من الرابط
// ============================
async function checkUrlAccessible(url, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : http;

    const req = protocol.request(url, { method: 'HEAD' }, (res) => {
      const ok = res.statusCode >= 200 && res.statusCode < 400;
      resolve({ accessible: ok, status: res.statusCode });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({ accessible: false, reason: 'timeout' });
    });

    req.on('error', (err) => {
      resolve({ accessible: false, reason: err.message });
    });

    req.end();
  });
}

// ============================
// ✅ اختيار موسيقى مع التحقق
// ============================
export async function getMusicUrl(musicMood, options = {}) {
  const {
    verify    = true,   // هل نتحقق من الرابط؟
    language  = 'ar',   // للـ logging
    seed      = null,   // للاختيار الثابت (reproducible)
  } = options;

  // ✅ تحقق من الـ mood
  const mood = VALID_MOODS.includes(musicMood) ? musicMood : DEFAULT_MOOD;

  if (!musicMood) {
    logger.warn(`⚠️ musicMood غير محدد - استخدام "${DEFAULT_MOOD}"`);
  } else if (mood !== musicMood) {
    logger.warn(`⚠️ mood غير معروف "${musicMood}" - استخدام "${DEFAULT_MOOD}"`);
  }

  const library = MUSIC_LIBRARY[mood];
  const tracks  = library.tracks;

  if (!tracks || tracks.length === 0) {
    throw new Error(`❌ لا توجد مقاطع موسيقية لـ mood: ${mood}`);
  }

  // ✅ اختيار ثابت أو عشوائي
  const index = seed !== null
    ? seed % tracks.length                          // ثابت وقابل للتكرار
    : Math.floor(Math.random() * tracks.length);    // عشوائي

  const selected = tracks[index];

  logger.info(`🎵 تم اختيار: ${selected.name}`, {
    mood,
    url : selected.url,
    bpm : selected.bpm,
  });

  // ✅ التحقق من إمكانية الوصول
  if (verify) {
    logger.info(`🔍 التحقق من الرابط...`);
    const check = await checkUrlAccessible(selected.url);

    if (!check.accessible) {
      logger.warn(`⚠️ الرابط الأساسي غير متاح (${check.reason || check.status})`);

      // ✅ جرب الـ fallback
      const fallbackUrls = library.fallback || [];
      for (const fallbackUrl of fallbackUrls) {
        const fallbackCheck = await checkUrlAccessible(fallbackUrl);
        if (fallbackCheck.accessible) {
          logger.warn(`⚠️ استخدام fallback: ${fallbackUrl}`);
          return fallbackUrl;
        }
      }

      // ✅ جرب mood مختلف
      logger.warn(`⚠️ جميع الـ fallbacks فشلت - جرب mood آخر`);
      if (mood !== DEFAULT_MOOD) {
        logger.warn(`⚠️ استخدام "${DEFAULT_MOOD}" كحل أخير`);
        return getMusicUrl(DEFAULT_MOOD, { ...options, verify: false });
      }

      // ✅ أرجع الرابط حتى لو غير متاح (أفضل من crash)
      logger.error(`❌ لا يمكن التحقق من أي رابط - استخدام الرابط الافتراضي`);
      return selected.url;
    }

    logger.success(`✅ الرابط يعمل (${check.status})`);
  }

  return selected.url;
}

// ============================
// ✅ دالة متزامنة (بدون verify) للاستخدام السريع
// ============================
export function getMusicUrlSync(musicMood) {
  const mood    = VALID_MOODS.includes(musicMood) ? musicMood : DEFAULT_MOOD;
  const tracks  = MUSIC_LIBRARY[mood].tracks;
  const index   = Math.floor(Math.random() * tracks.length);
  return tracks[index].url;
}

// ============================
// ✅ getMusicMoodForContentType
// ============================
export function getMusicMoodForContentType(contentType) {
  if (!contentType) {
    logger.warn(`⚠️ contentType غير محدد - استخدام "${DEFAULT_MOOD}"`);
    return DEFAULT_MOOD;
  }

  const mood = CONTENT_TYPE_MOOD_MAP[contentType];

  if (!mood) {
    logger.warn(`⚠️ contentType غير معروف "${contentType}" - استخدام "${DEFAULT_MOOD}"`);
    return DEFAULT_MOOD;
  }

  logger.info(`🎭 ContentType "${contentType}" → Mood "${mood}"`);
  return mood;
}

// ============================
// ✅ دالة لعرض جميع الموسيقى المتاحة
// ============================
export function listAvailableMusic() {
  logger.section('🎵 الموسيقى المتاحة');
  for (const [mood, library] of Object.entries(MUSIC_LIBRARY)) {
    logger.info(`${mood}: ${library.tracks.length} مقطع`);
    library.tracks.forEach((t, i) => {
      logger.info(`  ${i + 1}. ${t.name} (${t.bpm} BPM)`);
    });
  }
}

// ============================
// ✅ export الثوابت للاستخدام الخارجي
// ============================
export { VALID_MOODS, CONTENT_TYPE_MOOD_MAP, DEFAULT_MOOD };
