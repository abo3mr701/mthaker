/** Study prompts and response parsing for chat, OCR, and study tools. */
import { generatePuterContent } from './puterAI.js';

function requestStudyAI(contents) {
  const messages = contents.map(({ role, parts }) => ({
    role: role === 'model' ? 'assistant' : role,
    content: parts.map(({ text, inlineData }) => inlineData
      ? { type: 'image_url', image_url: { url: `data:${inlineData.mimeType};base64,${inlineData.data}` } }
      : { type: 'text', text }),
  }));
  return generatePuterContent(messages);
}

/* ─── Generate flashcards from text ──────────────────────── */
export async function generateFlashcards(extractedText, subjectName = '') {
  if (!extractedText || extractedText.trim().length < 20) {
    throw new Error('النص المستخرج قصير جداً لإنشاء بطاقات تعليمية.');
  }

  const contextLine = subjectName
    ? `المادة الدراسية: "${subjectName}".\n`
    : '';

  const prompt = `
أنت مساعد تعليمي متخصص في إنشاء بطاقات تعليمية (Flashcards) باللغة العربية.

${contextLine}قم بتحليل النص التالي وإنشاء بطاقات تعليمية شاملة ومفيدة.

المتطلبات:
- أنشئ ما بين 5 و 25 بطاقة حسب كمية المحتوى.
- كل بطاقة تحتوي على: سؤال واضح (front) وإجابة مفصّلة (back).
- الأسئلة والإجابات باللغة العربية.
- تنوّع الأسئلة: تعريفات، مفاهيم، تطبيقات، مقارنات.
- لا تكرر المعلومات.
- أجب بـ JSON فقط، بدون أي نص إضافي أو علامات Markdown.

صيغة JSON:
[
  { "front": "السؤال هنا", "back": "الإجابة التفصيلية هنا" },
  ...
]

النص:
${extractedText.slice(0, 12000)}
`.trim();

  const raw = await requestStudyAI([{
    role:  'user',
    parts: [{ text: prompt }],
  }]);

  // Strip potential markdown fences before parsing
  const cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim();

  let cards;
  try {
    cards = JSON.parse(cleaned);
  } catch {
    // Try to extract JSON array from response
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('تعذّر تحليل رد المساعد. تأكد من النص المدخل وأعد المحاولة.');
    cards = JSON.parse(match[0]);
  }

  if (!Array.isArray(cards) || cards.length === 0) {
    throw new Error('تعذّر إنشاء بطاقات من هذا الرد. تأكد من أن النص يحتوي على محتوى تعليمي.');
  }

  // Validate card structure
  return cards
    .filter(c => c && typeof c.front === 'string' && typeof c.back === 'string')
    .filter(c => c.front.trim().length > 0 && c.back.trim().length > 0);
}

/* ─── English word insight: translation + AI example sentence ──
 * Used by the "إنجليزي" (English) deck: given one English word/phrase,
 * ask the assistant for an Arabic translation plus a short practical example
 * sentence (with its Arabic translation) so the flashcard back is
 * filled in automatically instead of the user typing it by hand.
 * ──────────────────────────────────────────────────────────── */
export async function generateWordInsight(word) {
  const clean = (word || '').trim();
  if (!clean) throw new Error('أدخل الكلمة أو العبارة الإنجليزية أولاً.');

  const prompt = `
أنت مساعد لتعلّم اللغة الإنجليزية. لدي الكلمة/العبارة الإنجليزية التالية: "${clean}"

أعطني:
1. الترجمة العربية الدقيقة والمختصرة.
2. جملة مثال عملية وطبيعية بالإنجليزية تستخدم هذه الكلمة في سياق واقعي.
3. ترجمة عربية لجملة المثال.
4. نوع الكلمة (اسم/فعل/صفة/... إلخ) إن أمكن باختصار.

أجب بصيغة JSON فقط بدون أي نص إضافي أو علامات Markdown، بهذا الشكل:
{ "translation": "...", "example": "...", "exampleTranslation": "...", "partOfSpeech": "..." }
`.trim();

  const raw = await requestStudyAI([{ role: 'user', parts: [{ text: prompt }] }]);

  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
  let data;
  try {
    data = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('تعذّر تحليل استجابة الذكاء الاصطناعي. حاول مرة أخرى.');
    data = JSON.parse(match[0]);
  }

  return {
    translation:        (data.translation || '').trim(),
    example:             (data.example || '').trim(),
    exampleTranslation: (data.exampleTranslation || '').trim(),
    partOfSpeech:        (data.partOfSpeech || '').trim(),
  };
}

/* ─── English section: full Oxford-shaped entry for a custom word ──
 * Used when the user adds their own English word in the dedicated
 * "الإنجليزية" section — generates the same shape as the built-in
 * Oxford dataset (level, Arabic translation, definition, 3 examples)
 * so custom words behave identically to the curated ones.
 * ──────────────────────────────────────────────────────────── */
export async function generateEnglishWordEntry(word) {
  const clean = (word || '').trim();
  if (!clean) throw new Error('أدخل الكلمة الإنجليزية أولاً.');

  const prompt = `
أنت مساعد متخصص في قواميس اللغة الإنجليزية. لدي الكلمة/العبارة الإنجليزية: "${clean}"

أعطني بصيغة JSON فقط (بدون أي نص إضافي أو Markdown):
{
  "pos": "نوع الكلمة اختصاراً بالإنجليزي (مثل n. أو v. أو adj.)",
  "level": "أحد المستويات التالية بالضبط: A1 أو A2 أو B1 أو B2 أو C1 أو C2",
  "ar": "الترجمة العربية الدقيقة والمختصرة",
  "definition": "تعريف بسيط بالإنجليزية",
  "examples": {
    "daily": "جملة مثال من الحياة اليومية بالإنجليزية",
    "academic": "جملة مثال أكاديمية/مهنية بالإنجليزية",
    "idiom": "جملة مثال اصطلاحية أو ثقافية بالإنجليزية"
  }
}
`.trim();

  const raw = await requestStudyAI([{ role: 'user', parts: [{ text: prompt }] }]);
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

  let data;
  try {
    data = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('تعذّر تحليل استجابة الذكاء الاصطناعي. حاول مرة أخرى.');
    data = JSON.parse(match[0]);
  }

  const validLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  return {
    pos:        (data.pos || '').trim(),
    level:      validLevels.includes(data.level) ? data.level : 'A1',
    ar:         (data.ar || '').trim(),
    definition: (data.definition || '').trim(),
    examples: {
      daily:    data.examples?.daily || '',
      academic: data.examples?.academic || '',
      idiom:    data.examples?.idiom || '',
    },
  };
}

/* ─── English section: ask the AI tutor a free-form question about a word ── */
export async function askAboutWord(word, question) {
  const q = (question || '').trim();
  if (!q) throw new Error('اكتب سؤالك أولاً.');

  const context = `الكلمة الإنجليزية: "${word.word}" (${word.pos || ''}, مستوى ${word.level || ''})
الترجمة: ${word.ar || '—'}
التعريف: ${word.definition || '—'}
أمثلة: ${[word.examples?.daily, word.examples?.academic, word.examples?.idiom].filter(Boolean).join(' | ') || '—'}`;

  const prompt = `أنت مدرّس لغة إنجليزية ودود يشرح بالعربية. إليك سياق الكلمة:\n${context}\n\nسؤال الطالب: ${q}\n\nأجب بإيجاز ووضوح بالعربية (مع أمثلة إنجليزية عند الحاجة).`;

  return requestStudyAI([{ role: 'user', parts: [{ text: prompt }] }]);
}

/* ─── English section: extract candidate English words from raw text ──
 * Used by the "استيراد من ملف/صورة" feature — takes whatever text was
 * extracted from an uploaded file/image (via extractor.js / OCR) and
 * returns a clean, de-duplicated list of English words/phrases worth
 * adding as vocabulary (skips common stop-words, numbers, punctuation).
 * ──────────────────────────────────────────────────────────── */
export async function extractEnglishWordList(text) {
  const clean = (text || '').trim();
  if (!clean) throw new Error('لا يوجد نص لاستخراج الكلمات منه.');

  const prompt = `
من النص الإنجليزي التالي، استخرج قائمة بأهم الكلمات أو العبارات الإنجليزية
المفيدة لتعلّم المفردات (تجاهل الكلمات الشائعة جداً مثل the, is, a, and، وتجاهل
الأرقام والأسماء العلمية). أعد حتى 60 كلمة كحد أقصى، بدون تكرار.

النص:
"""${clean.slice(0, 6000)}"""

أجب بصيغة JSON فقط بدون أي نص إضافي، بهذا الشكل:
{ "words": ["word1", "word2", "..."] }
`.trim();

  const raw = await requestStudyAI([{ role: 'user', parts: [{ text: prompt }] }]);
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

  let data;
  try {
    data = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('تعذّر تحليل استجابة الذكاء الاصطناعي. حاول مرة أخرى.');
    data = JSON.parse(match[0]);
  }

  const words = Array.isArray(data.words) ? data.words : [];
  return Array.from(new Set(words.map(w => (w || '').trim()).filter(Boolean)));
}

/* ─── OCR: extract text from a base64 image ──────────────── */
export async function extractTextFromImage(base64Data, mimeType = 'image/jpeg') {
  const contents = [{
    role:  'user',
    parts: [
      {
        inlineData: { mimeType, data: base64Data },
      },
      {
        text: `استخرج جميع النصوص الموجودة في هذه الصورة بدقة.
إذا كانت الصورة تحتوي على جداول أو قوائم، احتفظ بتنسيقها.
أجب بالنص المستخرج فقط، بدون أي تعليق أو شرح.`,
      },
    ],
  }];

  const text = await requestStudyAI(contents);
  return text.trim();
}

/* ─── AI Chat with optional subject context ──────────────── */
export async function chat(conversationHistory, subjectContext = '') {
  const systemPart = subjectContext
    ? `أنت مساعد تعليمي ذكي. لديك المعلومات التالية عن المادة الدراسية الحالية:\n\n${subjectContext.slice(0, 8000)}\n\nأجب بناءً على هذا السياق عندما يكون ذلك مناسباً.`
    : 'أنت مساعد تعليمي ذكي ومفيد. أجب باللغة العربية بشكل واضح ومفصّل.';

  const contents = [
    { role: 'system', parts: [{ text: systemPart }] },
    ...conversationHistory.map(m => ({
      role:  m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }],
    })),
  ];

  return requestStudyAI(contents);
}
