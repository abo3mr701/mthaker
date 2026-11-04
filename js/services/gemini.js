/**
 * gemini.js — Google Gemini API service with automatic model discovery
 *
 * Responsibilities:
 *  - Validate an API key with a live call
 *  - Generate flashcards from extracted text
 *  - OCR: send a base64 image → get extracted text
 *  - Chat with optional subject context
 */

const GEMINI_BASE  = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL_CACHE_MS = 5 * 60 * 1000;
let modelCache = null;

function apiError(message, kind, status = 0) {
  return Object.assign(new Error(message), { kind, status });
}

function normalizeKey(apiKey) {
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!key) throw apiError('لم يتم إدخال مفتاح Gemini API. الرجاء الذهاب إلى الإعدادات.', 'missing_key');
  return key;
}

async function requestGemini(apiKey, path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(`${GEMINI_BASE}/${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      signal: controller.signal,
    });
    let json;
    try {
      json = await res.json();
    } catch (err) {
      if (controller.signal.aborted) throw err;
      throw apiError(`تعذّر قراءة رد Google (HTTP ${res.status}). حاول مرة أخرى.`, 'response', res.status);
    }
    if (res.ok) return json;

    const error = json?.error;
    const invalidKey = res.status === 401 || (Array.isArray(error?.details) && error.details.some(detail =>
      ['API_KEY_INVALID', 'API_KEY_EXPIRED'].includes(detail?.reason)));
    const kind = invalidKey ? 'invalid_key'
      : res.status === 403 ? 'permission'
      : res.status === 429 ? 'quota'
      : res.status === 404 ? 'not_found'
      : res.status >= 500 ? 'service' : 'request';
    const messages = {
      invalid_key: 'مفتاح Gemini غير صالح أو منتهي الصلاحية. راجع المفتاح في Google AI Studio.',
      permission: 'Google رفضت الوصول. راجع صلاحيات المفتاح وقيود الموقع وحالة المشروع؛ هذا لا يعني أن المفتاح غير صالح.',
      quota: 'تم بلوغ حد الاستخدام أو الحصة. راجع الحصة والفوترة في Google AI Studio، ثم أعد المحاولة.',
      not_found: 'الموديل المطلوب لم يعد متاحاً لهذا الطلب.',
      service: 'خدمة Gemini غير متاحة مؤقتاً. حاول مرة أخرى لاحقاً.',
      request: 'تعذّر تنفيذ طلب Gemini. راجع تفاصيل الخطأ.',
    };
    const detail = String(error?.message || '').split(apiKey).join('[API KEY]');
    throw apiError(`${messages[kind]}${detail ? ` (${detail})` : ''}`, kind, res.status);
  } catch (err) {
    if (err.kind) throw err;
    if (controller.signal.aborted) {
      throw apiError('انتهت مهلة الاتصال بـ Gemini. حاول مرة أخرى.', 'timeout');
    }
    throw apiError('تعذّر الاتصال بـ Gemini. تحقق من اتصال الإنترنت وإعدادات المتصفح.', 'network');
  } finally {
    clearTimeout(timer);
  }
}

// Only general-purpose Gemini text/image models suit chat, flashcards and OCR.
function modelRank(model) {
  const id = model.name.slice('models/'.length);
  const family = /flash-lite/.test(id) ? 1 : /flash/.test(id) ? 0 : 2;
  const version = id.match(/^gemini-(\d+)(?:\.(\d+))?/);
  return [/(?:preview|exp|experimental)/.test(id) ? 1 : 0,
    family, -(Number(version?.[1] || 0) * 100 + Number(version?.[2] || 0))];
}

async function discoverModel(apiKey, refresh = false) {
  if (!refresh && modelCache?.key === apiKey && modelCache.expires > Date.now()) {
    return modelCache.model;
  }
  const models = [];
  let pageToken = '';
  const seenTokens = new Set();
  do {
    const query = new URLSearchParams({ pageSize: '1000' });
    if (pageToken) query.set('pageToken', pageToken);
    const json = await requestGemini(apiKey, `models?${query}`);
    models.push(...(Array.isArray(json.models) ? json.models : []));
    pageToken = json.nextPageToken || '';
    if (pageToken && seenTokens.has(pageToken)) {
      throw apiError('تعذّر إكمال قائمة موديلات Gemini. أعد المحاولة.', 'response');
    }
    seenTokens.add(pageToken);
  } while (pageToken);

  const available = models.filter(model =>
    typeof model.name === 'string' &&
    !/(?:image|tts|audio|live|native|embedding|robotics|computer-use)/i.test(model.name) &&
    /^models\/gemini-(?:\d+(?:\.\d+)?-(?:flash(?:-lite)?|pro)|flash(?:-lite)?|pro)(?:-(?:latest|\d+|preview(?:-[\w-]+)?|exp(?:erimental)?(?:-[\w-]+)?))?$/.test(model.name) &&
    model.supportedGenerationMethods?.includes('generateContent'));
  available.sort((a, b) => {
    const ar = modelRank(a), br = modelRank(b);
    for (let i = 0; i < ar.length; i++) if (ar[i] !== br[i]) return ar[i] - br[i];
    return a.name.localeCompare(b.name);
  });
  if (!available.length) {
    throw apiError('لم يظهر موديل Gemini مناسب للمحادثة وإنشاء البطاقات. راجع الموديلات المتاحة لمشروعك في Google AI Studio.', 'no_model');
  }
  modelCache = { key: apiKey, model: available[0], expires: Date.now() + MODEL_CACHE_MS };
  return modelCache.model;
}

/* ─── Internal: raw request ──────────────────────────────── */
async function callGemini(apiKey, contents, generationConfig = {}) {
  apiKey = normalizeKey(apiKey);
  let model = await discoverModel(apiKey);

  const body = {
    contents,
    generationConfig: {
      temperature:    0.4,
      topP:           0.95,
      maxOutputTokens: Math.min(8192, model.outputTokenLimit || 8192),
      ...generationConfig,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  };

  const generate = () => requestGemini(apiKey, `${model.name}:generateContent`, {
    method:  'POST',
    body:    JSON.stringify(body),
  });
  let json;
  try {
    json = await generate();
  } catch (err) {
    if (err.kind !== 'not_found') throw err;
    // Refresh once if a cached model has been removed. Never retry quota errors.
    model = await discoverModel(apiKey, true);
    json = await generate();
  }

  // Extract text content from response
  const parts = json?.candidates?.[0]?.content?.parts;
  if (!parts || parts.length === 0) {
    const reason = json?.candidates?.[0]?.finishReason;
    if (reason === 'SAFETY') throw new Error('تم حظر الاستجابة بسبب إعدادات الأمان.');
    throw new Error('استجابة Gemini فارغة أو غير متوقعة.');
  }

  return parts.filter(p => !p.thought).map(p => p.text || '').join('');
}

/* ─── Validate API key ────────────────────────────────────── */
export async function validateApiKey(apiKey) {
  try {
    const model = await discoverModel(normalizeKey(apiKey), true);
    // Listing models checks access without spending generation tokens.
    return { valid: true, model: model.name.slice('models/'.length) };
  } catch (err) {
    return { valid: false, kind: err.kind, error: err.message };
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
