import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger, handleError } from './logger.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

ffmpeg.setFfmpegPath(ffmpegStatic);

export async function processVideo(inputPath, outputPath, language) {
  return new Promise((resolve, reject) => {
    try {
      logger.section('⚙️ مرحلة معالجة الفيديو بـ FFmpeg');
      logger.info(`جاري معالجة الفيديو: ${inputPath}`);

      // التحقق من وجود الملف
      if (!fs.existsSync(inputPath)) {
        throw new Error(`ملف الفيديو غير موجود: ${inputPath}`);
      }

      ffmpeg(inputPath)
        .outputOptions([
          '-c:v libx264',           // Codec
          '-preset fast',            // Speed vs quality
          '-crf 20',                 // Quality (0-51, lower = better)
          '-c:a aac',                // Audio codec
          '-b:a 320k',               // Audio bitrate
          '-movflags +faststart',    // Optimize for streaming
          '-pix_fmt yuv420p',        // Pixel format
          '-y'                       // Overwrite output
        ])
        .on('start', (commandLine) => {
          logger.debug(`🚀 FFmpeg command: ${commandLine}`);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            const percent = Math.round(progress.percent);
            process.stdout.write(`\r⏳ معالجة: ${percent}%`);
          }
        })
        .on('end', () => {
          console.log(''); // New line after progress
          logger.success(`✅ تم معالجة الفيديو بنجاح!`, {
            output: outputPath,
            size: `${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(2)} MB`
          });
          resolve(outputPath);
        })
        .on('error', (err) => {
          logger.error(`❌ خطأ في معالجة الفيديو`, { error: err.message });
          reject(err);
        })
        .save(outputPath);

    } catch (error) {
      handleError(error, 'معالجة الفيديو');
      reject(error);
    }
  });
}
