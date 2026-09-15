/**
 * gemini.js — Google Gemini 1.5 Flash API service
 *
 * Responsibilities:
 *  - Validate an API key with a live call
 *  - Generate flashcards from extracted text
 *  - OCR: send a base64 image → get extracted text
 *  - Chat with optional subject context
 */

const GEMINI_BASE  = 'https://generativelanguage.googleapis.com/v1beta';
const FLASH_MODEL  = 'gemini-2.5-flash';
const TEXT_ENDPOINT = (key) =>
  `${GEMINI_BASE}/models/${FLASH_MODEL}:generateContent?key=${key}`;

/* ─── Internal: raw request ──────────────────────────────── */
async function callGemini(apiKey, contents, generationConfig = {}) {
  if (!apiKey) throw new Error('لم يتم إدخال مفتاح Gemini API. الرجاء الذهاب إلى الإعدادات.');

  const body = {
    contents,
    generationConfig: {
      temperature:    0.4,
      topK:           32,
      topP:           0.95,
      maxOutputTokens: 8192,
      ...generationConfig,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  };

  let res;
  try {
    res = await fetch(TEXT_ENDPOINT(apiKey), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
  } catch (netErr) {
    throw new Error(`خطأ في الشبكة: ${netErr.message}`);
  }

  const json = await res.json();

  if (!res.ok) {
    const msg = json?.error?.message || `خطأ HTTP ${res.status}`;
    throw new Error(`Gemini API: ${msg}`);
  }

  // Extract text content from response
  const parts = json?.candidates?.[0]?.content?.parts;
  if (!parts || parts.length === 0) {
    const reason = json?.candidates?.[0]?.finishReason;
    if (reason === 'SAFETY') throw new Error('تم حظر الاستجابة بسبب إعدادات الأمان.');
    throw new Error('استجابة Gemini فارغة أو غير متوقعة.');
  }

  return parts.map(p => p.text || '').join('');
}

/* ─── Validate API key ────────────────────────────────────── */
export async function validateApiKey(apiKey) {
  try {
    await callGemini(apiKey, [{
      role:  'user',
      parts: [{ text: 'مرحباً' }],
    }]);
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/* ─── Generate flashcards from text ──────────────────────── */
export async function generateFlashcards(apiKey, extractedText, subjectName = '') {
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

  const raw = await callGemini(apiKey, [{
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
    if (!match) throw new Error('تعذّر تحليل الاستجابة من Gemini. تأكد من النص المدخل وأعد المحاولة.');
    cards = JSON.parse(match[0]);
  }

  if (!Array.isArray(cards) || cards.length === 0) {
    throw new Error('لم تُنشئ Gemini أي بطاقات. تأكد من أن النص يحتوي على محتوى تعليمي.');
  }

  // Validate card structure
  return cards
    .filter(c => c && typeof c.front === 'string' && typeof c.back === 'string')
    .filter(c => c.front.trim().length > 0 && c.back.trim().length > 0);
}

/* ─── English word insight: translation + AI example sentence ──
 * Used by the "إنجليزي" (English) deck: given one English word/phrase,
 * ask Gemini for an Arabic translation plus a short practical example
 * sentence (with its Arabic translation) so the flashcard back is
 * filled in automatically instead of the user typing it by hand.
 * ──────────────────────────────────────────────────────────── */
export async function generateWordInsight(apiKey, word) {
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

  const raw = await callGemini(apiKey, [{ role: 'user', parts: [{ text: prompt }] }], { temperature: 0.3 });

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
export async function generateEnglishWordEntry(apiKey, word) {
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

  const raw = await callGemini(apiKey, [{ role: 'user', parts: [{ text: prompt }] }], { temperature: 0.3 });
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
export async function askAboutWord(apiKey, word, question) {
  const q = (question || '').trim();
  if (!q) throw new Error('اكتب سؤالك أولاً.');

  const context = `الكلمة الإنجليزية: "${word.word}" (${word.pos || ''}, مستوى ${word.level || ''})
الترجمة: ${word.ar || '—'}
التعريف: ${word.definition || '—'}
أمثلة: ${[word.examples?.daily, word.examples?.academic, word.examples?.idiom].filter(Boolean).join(' | ') || '—'}`;

  const prompt = `أنت مدرّس لغة إنجليزية ودود يشرح بالعربية. إليك سياق الكلمة:\n${context}\n\nسؤال الطالب: ${q}\n\nأجب بإيجاز ووضوح بالعربية (مع أمثلة إنجليزية عند الحاجة).`;

  return callGemini(apiKey, [{ role: 'user', parts: [{ text: prompt }] }], { temperature: 0.5 });
}

/* ─── English section: extract candidate English words from raw text ──
 * Used by the "استيراد من ملف/صورة" feature — takes whatever text was
 * extracted from an uploaded file/image (via extractor.js / OCR) and
 * returns a clean, de-duplicated list of English words/phrases worth
 * adding as vocabulary (skips common stop-words, numbers, punctuation).
 * ──────────────────────────────────────────────────────────── */
export async function extractEnglishWordList(apiKey, text) {
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

  const raw = await callGemini(apiKey, [{ role: 'user', parts: [{ text: prompt }] }], { temperature: 0.2 });
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
export async function extractTextFromImage(apiKey, base64Data, mimeType = 'image/jpeg') {
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

  const text = await callGemini(apiKey, contents);
  return text.trim();
}

/* ─── AI Chat with optional subject context ──────────────── */
export async function chat(apiKey, conversationHistory, subjectContext = '') {
  const systemPart = subjectContext
    ? `أنت مساعد تعليمي ذكي. لديك المعلومات التالية عن المادة الدراسية الحالية:\n\n${subjectContext.slice(0, 8000)}\n\nأجب بناءً على هذا السياق عندما يكون ذلك مناسباً.`
    : 'أنت مساعد تعليمي ذكي ومفيد. أجب باللغة العربية بشكل واضح ومفصّل.';

  // Build contents array (system message as first user turn is a Gemini pattern)
  const contents = [
    { role: 'user',  parts: [{ text: systemPart }] },
    { role: 'model', parts: [{ text: 'حسناً، أنا جاهز للمساعدة.' }] },
    ...conversationHistory.map(m => ({
      role:  m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }],
    })),
  ];

  return callGemini(apiKey, contents, { temperature: 0.7 });
}
