import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { generateEngagingContent } from './content-generator.mjs';
import { searchAllVideos } from './video-search.mjs';
import { generateAudio } from './audio-generator.mjs';
import { getMusicUrl, getMusicMoodForContentType } from './music-library.mjs';
import { processVideo } from './video-processor.mjs';
import { logger } from './logger.mjs';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// الحصول على المتغيرات من البيئة
const LANGUAGE = process.env.LANGUAGE || 'ar';
const CONTENT_TYPE = process.env.CONTENT_TYPE || 'Motivational';
const MAIN_TOPIC = process.env.MAIN_TOPIC || 'النجاح والإصرار';
const VIDEO_QUALITY = process.env.VIDEO_QUALITY || '1080p';

async function main() {
  try {
    logger.section(`🚀 توليد فيديو احترافي - ${LANGUAGE.toUpperCase()}`);
    logger.info(`النوع: ${CONTENT_TYPE} | الموضوع: ${MAIN_TOPIC}`);

    // الخطوة 1: توليد المحتوى
    logger.section('📝 الخطوة 1: توليد المحتوى الاحترافي');
    const content = await generateEngagingContent(LANGUAGE, CONTENT_TYPE, MAIN_TOPIC);

    // الخطوة 2: البحث عن الفيديوهات
    logger.section('🎥 الخطوة 2: البحث عن الفيديوهات');
    const videos = await searchAllVideos(content.keywords);

    if (videos.length === 0) {
      throw new Error('لم نتمكن من العثور على فيديوهات مناسبة');
    }

    // الخطوة 3: توليد الصوت
    logger.section('🎙️ الخطوة 3: توليد الصوت');
    const fullScript = content.segments.join(' ');
    const audioPath = await generateAudio(fullScript, LANGUAGE);

    // الخطوة 4: اختيار الموسيقى
    logger.section('🎵 الخطوة 4: اختيار الموسيقى');
    const musicMood = getMusicMoodForContentType(CONTENT_TYPE);
    const musicUrl = getMusicUrl(musicMood);

    // الخطوة 5: حفظ البيانات
    logger.section('💾 الخطوة 5: حفظ البيانات');
    const outputDir = path.join(__dirname, '..', 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const inputProps = {
      title: content.title,
      segments: content.segments,
      keywords: content.keywords,
      cta: content.cta,
      emotional_triggers: content.emotional_triggers,
      videos: videos,
      audioPath: audioPath,
      musicUrl: musicUrl,
      language: LANGUAGE,
      contentType: CONTENT_TYPE,
      topic: MAIN_TOPIC,
      quality: VIDEO_QUALITY
    };

    const propsPath = path.join(outputDir, `input-props-${LANGUAGE}.json`);
    fs.writeFileSync(propsPath, JSON.stringify(inputProps, null, 2));

    logger.success(`✅ تم إعداد جميع البيانات بنجاح!`, {
      title: content.title,
      segments: content.segments.length,
      videos: videos.length,
      audio: audioPath,
      props: propsPath
    });

    logger.section('✨ اكتمل توليد الفيديو بنجاح!');
    logger.info(`الملفات جاهزة في: ${outputDir}`);

  } catch (error) {
    logger.error(`❌ حدث خطأ في توليد الفيديو`, { error: error.message });
    process.exit(1);
  }
}

main();
