import axios from 'axios';
import dotenv from 'dotenv';
import { logger, handleError } from './logger.mjs';

dotenv.config();

const PIXABAY_API_KEY = process.env.PIXABAY_API_KEY;
const PIXABAY_URL = process.env.PIXABAY_API_URL;
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const PEXELS_URL = process.env.PEXELS_API_URL;

// تصفية الفيديوهات بناءً على الجودة
function filterQualityVideos(videos) {
  return videos.filter(v => {
    const duration = v.duration || 0;
    const width = v.width || 0;
    
    // تقبل الفيديوهات بين 5-60 ثانية وبدقة 1080p على الأقل
    return duration >= 5 && duration <= 60 && width >= 1920;
  });
}

export async function searchVideosFromPixabay(keywords) {
  try {
    logger.info(`🔍 البحث عن فيديوهات من Pixabay...`);

    const videos = [];
    const searchKeywords = Array.isArray(keywords) ? keywords : [keywords];

    for (const keyword of searchKeywords.slice(0, 5)) {
      try {
        const response = await axios.get(PIXABAY_URL, {
          params: {
            key: PIXABAY_API_KEY,
            q: keyword,
            per_page: 5,
            order: 'popular',
            min_width: 1920,
            min_height: 1080
          },
          timeout: 10000
        });

        if (response.data?.hits && response.data.hits.length > 0) {
          const qualityVideos = filterQualityVideos(response.data.hits);
          
          if (qualityVideos.length > 0) {
            const video = qualityVideos[0];
            videos.push({
              keyword,
              source: 'pixabay',
              id: video.id,
              url: video.videos?.large?.url,
              duration: video.duration,
              width: video.width,
              height: video.height,
              thumbnail: video.picture,
              quality: 'HD'
            });
            logger.success(`✅ وجدنا فيديو من Pixabay: ${keyword}`);
          }
        }
      } catch (err) {
        logger.warn(`⚠️ فشل البحث عن "${keyword}" في Pixabay`, { error: err.message });
      }
    }

    return videos;

  } catch (error) {
    handleError(error, 'البحث في Pixabay');
    return [];
  }
}

export async function searchVideosFromPexels(keywords) {
  if (!PEXELS_API_KEY) {
    logger.warn('⚠️ مفتاح Pexels API غير متوفر');
    return [];
  }

  try {
    logger.info(`🔍 البحث عن فيديوهات من Pexels...`);

    const videos = [];
    const searchKeywords = Array.isArray(keywords) ? keywords : [keywords];

    for (const keyword of searchKeywords.slice(0, 3)) {
      try {
        const response = await axios.get(PEXELS_URL, {
          params: {
            query: keyword,
            per_page: 3
          },
          headers: {
            'Authorization': PEXELS_API_KEY
          },
          timeout: 10000
        });

        if (response.data?.videos && response.data.videos.length > 0) {
          const qualityVideos = filterQualityVideos(response.data.videos);
          
          if (qualityVideos.length > 0) {
            const video = qualityVideos[0];
            videos.push({
              keyword,
              source: 'pexels',
              id: video.id,
              url: video.video_files?.[0]?.link,
              duration: video.duration,
              width: video.width,
              height: video.height,
              thumbnail: video.image,
              quality: 'HD'
            });
            logger.success(`✅ وجدنا فيديو من Pexels: ${keyword}`);
          }
        }
      } catch (err) {
        logger.warn(`⚠️ فشل البحث عن "${keyword}" في Pexels`, { error: err.message });
      }
    }

    return videos;

  } catch (error) {
    handleError(error, 'البحث في Pexels');
    return [];
  }
}

export async function searchAllVideos(keywords) {
  try {
    logger.section('🎥 مرحلة البحث عن الفيديوهات');

    const pixabayVideos = await searchVideosFromPixabay(keywords);
    const pexelsVideos = await searchVideosFromPexels(keywords);

    const allVideos = [...pixabayVideos, ...pexelsVideos];

    if (allVideos.length === 0) {
      logger.warn('⚠️ لم نتمكن من العثور على فيديوهات مناسبة');
      return [];
    }

    logger.success(`✅ تم العثور على ${allVideos.length} فيديو`, {
      pixabay: pixabayVideos.length,
      pexels: pexelsVideos.length
    });

    return allVideos;

  } catch (error) {
    handleError(error, 'البحث عن الفيديوهات');
    return [];
  }
}
