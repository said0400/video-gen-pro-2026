import axios from 'axios';
import dotenv from 'dotenv';
import { logger, handleError } from './logger.mjs';

dotenv.config();

const GROK_API_KEY = process.env.GROK_API_KEY;
const GROK_API_URL = process.env.GROK_API_URL;

// نماذج النصوص الاحترافية لكل نوع محتوى
const CONTENT_TEMPLATES = {
  ar: {
    Motivational: {
      systemPrompt: `أنت خبير في كتابة محتوى تحفيزي احترافي يشد المشاهد من البداية. 
      
المتطلبات:
- ابدأ بـ HOOK قوي يجذب المشاهد في أول 3 ثواني
- استخدم قصص حقيقية أو إحصائيات مؤثرة
- اخاطب المشاهد مباشرة (أنت، نحن)
- أضف رسالة قيمة تلمس العقل والنفس
- انهِ بـ CALL TO ACTION قوي يجبر على التفاعل والتعليق
- استخدم لغة بسيطة وقوية وواضحة
- كل جملة يجب أن تكون قصيرة وقوية
- الطول: 120-180 كلمة (40-80 ثانية)`,
      
      userPrompt: (topic) => `اكتب نص فيديو تحفيزي احترافي عن: "${topic}"

الهيكل المطلوب:
1. HOOK (أول 5 ثواني): جملة قوية تجذب الانتباه
2. المشكلة (10 ثواني): اشرح المشكلة التي يواجهها المشاهد
3. الحل (15 ثانية): قدم الحل أو الفكرة الرئيسية
4. الفائدة (10 ثواني): اشرح الفائدة الحقيقية
5. CTA (5 ثواني): اطلب منهم التفاعل والتعليق

استجب بصيغة JSON مع الحقول:
{
  "title": "عنوان جذاب",
  "hook": "جملة الجذب الأولى",
  "segments": ["مقطع 1", "مقطع 2", ...],
  "cta": "دعوة للعمل",
  "keywords": ["كلمة مفتاحية 1", ...],
  "emotional_triggers": ["المشاعر المستهدفة"]
}`
    },

    Educational: {
      systemPrompt: `أنت معلم خبير في إنشاء محتوى تعليمي جذاب وسهل الفهم.
      
المتطلبات:
- ابدأ بسؤال يشعل الفضول
- اشرح المفهوم بطريقة بسيطة وواضحة
- استخدم أمثلة واقعية
- أضف نصائح عملية يمكن تطبيقها فوراً
- انهِ بـ CALL TO ACTION يشجع على التعلم المستمر`,
      
      userPrompt: (topic) => `اكتب نص فيديو تعليمي احترافي عن: "${topic}"

الهيكل:
1. السؤال الافتتاحي (5 ثواني)
2. شرح المفهوم (20 ثانية)
3. أمثلة عملية (15 ثانية)
4. نصائح قيمة (10 ثواني)
5. الخلاصة والـ CTA (5 ثواني)

استجب بصيغة JSON.`
    },

    Story: {
      systemPrompt: `أنت راوي قصص احترافي يجعل المشاهد يشعر بالقصة.
      
المتطلبات:
- ابدأ بمشهد جذاب
- بناء التوتر تدريجياً
- ذروة مؤثرة
- رسالة قيمة في النهاية`,
      
      userPrompt: (topic) => `اكتب قصة فيديو احترافية عن: "${topic}"

استجب بصيغة JSON.`
    }
  },

  en: {
    Motivational: {
      systemPrompt: `You are an expert in creating professional motivational content that captivates viewers from the start.

Requirements:
- Start with a POWERFUL HOOK that grabs attention in the first 3 seconds
- Use real stories or impactful statistics
- Address the viewer directly (you, we)
- Add a valuable message that touches mind and soul
- End with a strong CALL TO ACTION that forces engagement
- Use simple, powerful, clear language
- Each sentence must be short and impactful
- Length: 120-180 words (40-80 seconds)`,
      
      userPrompt: (topic) => `Write a professional motivational video script about: "${topic}"

Required structure:
1. HOOK (first 5 seconds): Powerful opening line
2. PROBLEM (10 seconds): Explain the viewer's challenge
3. SOLUTION (15 seconds): Present the main idea
4. BENEFIT (10 seconds): Explain real benefits
5. CTA (5 seconds): Request engagement and comments

Respond in JSON format with fields:
{
  "title": "Catchy title",
  "hook": "Opening hook line",
  "segments": ["Segment 1", "Segment 2", ...],
  "cta": "Call to action",
  "keywords": ["keyword 1", ...],
  "emotional_triggers": ["emotions"]
}`
    },

    Educational: {
      systemPrompt: `You are an expert teacher creating engaging and easy-to-understand educational content.

Requirements:
- Start with a curiosity-sparking question
- Explain concepts simply and clearly
- Use real-world examples
- Add practical tips that can be applied immediately
- End with a CTA that encourages continuous learning`,
      
      userPrompt: (topic) => `Write a professional educational video script about: "${topic}"

Structure:
1. Opening question (5 seconds)
2. Concept explanation (20 seconds)
3. Practical examples (15 seconds)
4. Valuable tips (10 seconds)
5. Summary and CTA (5 seconds)

Respond in JSON format.`
    },

    Story: {
      systemPrompt: `You are a professional storyteller who makes viewers feel the story.

Requirements:
- Start with an engaging scene
- Build tension gradually
- Powerful climax
- Valuable message at the end`,
      
      userPrompt: (topic) => `Write a professional story video about: "${topic}"

Respond in JSON format.`
    }
  },

  fr: {
    Motivational: {
      systemPrompt: `Vous êtes un expert dans la création de contenu motivationnel professionnel qui captive les spectateurs dès le départ.

Exigences:
- Commencez par un CROCHET PUISSANT qui attire l'attention dans les 3 premières secondes
- Utilisez des histoires réelles ou des statistiques percutantes
- Adressez-vous directement au spectateur
- Ajoutez un message de valeur qui touche l'esprit et l'âme
- Terminez par un APPEL À L'ACTION fort
- Utilisez un langage simple, puissant et clair`,
      
      userPrompt: (topic) => `Écrivez un script vidéo motivationnel professionnel sur: "${topic}"

Structure requise:
1. CROCHET (5 premières secondes)
2. PROBLÈME (10 secondes)
3. SOLUTION (15 secondes)
4. AVANTAGE (10 secondes)
5. APPEL À L'ACTION (5 secondes)

Répondez au format JSON.`
    },

    Educational: {
      systemPrompt: `Vous êtes un enseignant expert créant un contenu éducatif engageant et facile à comprendre.`,
      
      userPrompt: (topic) => `Écrivez un script vidéo éducatif professionnel sur: "${topic}"

Répondez au format JSON.`
    },

    Story: {
      systemPrompt: `Vous êtes un conteur professionnel qui fait ressentir l'histoire aux spectateurs.`,
      
      userPrompt: (topic) => `Écrivez une histoire vidéo professionnelle sur: "${topic}"

Répondez au format JSON.`
    }
  }
};

export async function generateEngagingContent(language, contentType, topic) {
  try {
    logger.info(`🎬 جاري توليد محتوى ${contentType} بـ ${language}...`);

    const template = CONTENT_TEMPLATES[language]?.[contentType];
    if (!template) {
      throw new Error(`لا يوجد قالب للغة ${language} أو نوع المحتوى ${contentType}`);
    }

    const response = await axios.post(
      `${GROK_API_URL}/chat/completions`,
      {
        model: 'grok-4.3',
        messages: [
          {
            role: 'system',
            content: template.systemPrompt
          },
          {
            role: 'user',
            content: template.userPrompt(topic)
          }
        ],
        temperature: 0.85,
        max_tokens: 3000,
        top_p: 0.95
      },
      {
        headers: {
          'Authorization': `Bearer ${GROK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    if (!response.data?.choices?.[0]?.message?.content) {
      throw new Error('لم يتم استقبال محتوى من Grok API');
    }

    let content = response.data.choices[0].message.content;
    
    // تنظيف JSON إذا كان محاطاً بـ markdown code blocks
    if (content.includes('```json')) {
      content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    }

    const contentData = JSON.parse(content.trim());

    // التحقق من المتطلبات الأساسية
    if (!contentData.segments || !Array.isArray(contentData.segments)) {
      throw new Error('المحتوى المُولَّد لا يحتوي على segments صحيحة');
    }

    if (contentData.segments.length < 3) {
      throw new Error('عدد المقاطع أقل من المطلوب (3 على الأقل)');
    }

    logger.success(`✅ تم توليد المحتوى بنجاح!`, {
      title: contentData.title,
      segments: contentData.segments.length,
      keywords: contentData.keywords?.length || 0
    });

    return contentData;

  } catch (error) {
    if (error instanceof SyntaxError) {
      logger.error('❌ خطأ في تحليل JSON من Grok API', {
        error: error.message,
        hint: 'تأكد من أن Grok يرسل JSON صحيح'
      });
    } else {
      handleError(error, 'توليد المحتوى');
    }
    throw error;
  }
}
