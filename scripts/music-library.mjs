import { logger } from './logger.mjs';

// مكتبة موسيقى مجانية موثوقة
const MUSIC_LIBRARY = {
  inspirational: [
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3'
  ],
  calm: [
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3'
  ],
  dramatic: [
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3'
  ],
  professional: [
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3'
  ],
  electronic: [
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3'
  ],
  upbeat: [
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3'
  ]
};

export function getMusicUrl(musicMood) {
  const musicList = MUSIC_LIBRARY[musicMood] || MUSIC_LIBRARY.inspirational;
  const randomIndex = Math.floor(Math.random() * musicList.length);
  const selectedMusic = musicList[randomIndex];

  logger.info(`🎵 تم اختيار موسيقى ${musicMood}`, { url: selectedMusic });

  return selectedMusic;
}

export function getMusicMoodForContentType(contentType) {
  const moodMap = {
    Motivational: 'inspirational',
    Educational: 'calm',
    Story: 'dramatic',
    News: 'professional',
    Tech: 'electronic',
    Lifestyle: 'upbeat'
  };

  return moodMap[contentType] || 'inspirational';
}
