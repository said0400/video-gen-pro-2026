import axios from 'axios';
import dotenv from 'dotenv';
import { logger, handleError } from './logger.mjs';

dotenv.config();

const PIXABAY_API_KEY = process.env.PIXABAY_API_KEY;
const PIXABAY_URL = process.env.PIXABAY_API_URL || 'https://pixabay.com/api/videos';

export async function searchAllVideos(keywords) {
  try {
    logger.section('🎥 مرحلة البحث عن الفيديوهات');

    const videos = [];
    const searchKeywords = Array.isArray(keywords) ? keywords : [keywords];

    for (const keyword of searchKeywords.slice(0, 3)) {
      try {
        const response = await axios.get(PIXABAY_URL, {
          params: {
            key: PIXABAY_API_KEY,
            q: keyword,
            per_page: 3,
            order: 'popular'
          },
          timeout: 10000
        });

        if (response.data?.hits && response.data.hits.length > 0) {
          const video = response.data.hits[0];
          videos.push({
            keyword,
            source: 'pixabay',
            id: video.id,
            url: video.videos?.large?.url,
            duration: video.duration,
            thumbnail: video.picture
          });
          logger.success(`✅ وجدنا فيديو: ${keyword}`);
        }
      } catch (err) {
        logger.warn(`⚠️ فشل البحث عن "${keyword}"`, { error: err.message });
      }
    }

    logger.success(`✅ تم العثور على ${videos.length} فيديو`);
    return videos;

  } catch (error) {
    handleError(error, 'البحث عن الفيديوهات');
    return [];
  }
}
