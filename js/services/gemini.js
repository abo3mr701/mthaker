/**
 * gemini.js — Gemini API service (v2 — fixed chat, image support)
 */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL       = 'gemini-2.5-flash';
const ENDPOINT    = (key) => `${GEMINI_BASE}/models/${MODEL}:generateContent?key=${key}`;

async function callGemini(apiKey, contents, config = {}) {
  if (!apiKey) throw new Error('لم يتم إدخال مفتاح Gemini API. الرجاء الذهاب إلى الإعدادات.');

  let res;
  try {
    res = await fetch(ENDPOINT(apiKey), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        contents,
        generationConfig: {
          temperature:     0.4,
          topK:            32,
          topP:            0.95,
          maxOutputTokens: 8192,
          ...config,
        },
        safetySettings: [
          { category:'HARM_CATEGORY_HARASSMENT',        threshold:'BLOCK_NONE' },
          { category:'HARM_CATEGORY_HATE_SPEECH',       threshold:'BLOCK_NONE' },
          { category:'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold:'BLOCK_NONE' },
          { category:'HARM_CATEGORY_DANGEROUS_CONTENT', threshold:'BLOCK_NONE' },
        ],
      }),
    });
  } catch (netErr) {
    throw new Error(`خطأ في الشبكة: ${netErr.message}`);
  }

  const json = await res.json();
  if (!res.ok) {
    const msg = json?.error?.message || `خطأ HTTP ${res.status}`;
    throw new Error(`Gemini API: ${msg}`);
  }

  const parts = json?.candidates?.[0]?.content?.parts;
  if (!parts?.length) {
    const reason = json?.candidates?.[0]?.finishReason;
    if (reason === 'SAFETY') throw new Error('تم حظر الاستجابة بسبب إعدادات الأمان.');
    throw new Error('استجابة Gemini فارغة أو غير متوقعة.');
  }

  return parts.map(p => p.text || '').join('');
}

/* ── Validate API key ──────────────────────────────────── */
export async function validateApiKey(apiKey) {
  try {
    await callGemini(apiKey, [{ role:'user', parts:[{ text:'مرحباً' }] }]);
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/* ── Generate flashcards from text ────────────────────── */
export async function generateFlashcards(apiKey, extractedText, subjectName = '', options = {}) {
  if (!extractedText || extractedText.trim().length < 20) {
    throw new Error('النص المستخرج قصير جداً لإنشاء بطاقات تعليمية.');
  }

  const { maxCards = 20, types = ['text'] } = options;
  const hasText = types.includes('text');
  const hasMcq  = types.includes('mcq');
  const hasTf   = types.includes('tf');
  const contextLine = subjectName ? `المادة: "${subjectName}".\n` : '';

  const typeInstructions = [
    hasText ? `- بطاقات نصية: {"type":"text","front":"سؤال","back":"إجابة"}` : '',
    hasMcq  ? `- اختيار متعدد: {"type":"mcq","front":"سؤال","options":["أ","ب","ج","د"],"answer":"الإجابة الصحيحة"}` : '',
    hasTf   ? `- صح وخطأ: {"type":"tf","front":"عبارة للحكم عليها","answer":"صح أو خطأ"}` : '',
  ].filter(Boolean).join('\n');

  const prompt = `
أنت مساعد تعليمي متخصص في إنشاء بطاقات تعليمية (Flashcards) باللغة العربية.

${contextLine}أنشئ ما يصل إلى ${maxCards} بطاقة من الأنواع التالية:
${typeInstructions}

قواعد:
- الأسئلة والإجابات باللغة العربية فقط.
- تنوّع الأسئلة: تعريفات، تطبيقات، مقارنات.
- للاختيار المتعدد: أضف 4 خيارات دائماً.
- أجب بـ JSON مصفوفة فقط، بدون أي نص إضافي أو Markdown.

النص:
${extractedText.slice(0, 12000)}
`.trim();

  const raw = await callGemini(apiKey, [{ role:'user', parts:[{ text:prompt }] }]);
  const cleaned = raw.replace(/\`\`\`json\s*/gi,'').replace(/\`\`\`\s*/gi,'').trim();

  let cards;
  try {
    cards = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('تعذّر تحليل استجابة Gemini. تأكد من النص المدخل وأعد المحاولة.');
    cards = JSON.parse(match[0]);
  }

  if (!Array.isArray(cards) || cards.length === 0) {
    throw new Error('لم تُنشئ Gemini أي بطاقات. تأكد من أن النص يحتوي على محتوى تعليمي.');
  }

  return cards.filter(c => c && typeof c.front === 'string' && c.front.trim().length > 0);
}

/* ── OCR: extract text from base64 image ──────────────── */
export async function extractTextFromImage(apiKey, base64Data, mimeType = 'image/jpeg') {
  const contents = [{
    role:  'user',
    parts: [
      { inlineData: { mimeType, data: base64Data } },
      { text: 'استخرج جميع النصوص الموجودة في هذه الصورة بدقة. أجب بالنص المستخرج فقط.' },
    ],
  }];
  return (await callGemini(apiKey, contents)).trim();
}

/* ── Chat — NO system prompt leaking into responses ───── */
export async function chat(apiKey, conversationHistory, subjectContext = '') {
  // Inject context as the very first user/model exchange so it never appears in output
  const contents = [];

  if (subjectContext) {
    contents.push({
      role:  'user',
      parts: [{ text: `لديك المحتوى التالي من المادة الدراسية للرجوع إليه عند الإجابة:\n\n${subjectContext.slice(0, 8000)}` }],
    });
    contents.push({
      role:  'model',
      parts: [{ text: 'حسناً، لقد استوعبت المحتوى وسأستخدمه في إجاباتي.' }],
    });
  } else {
    contents.push({
      role:  'user',
      parts: [{ text: 'أنت مساعد تعليمي ذكي. أجب باللغة العربية.' }],
    });
    contents.push({
      role:  'model',
      parts: [{ text: 'حسناً، أنا جاهز للمساعدة.' }],
    });
  }

  // Append actual conversation — map roles to Gemini format
  for (const msg of conversationHistory) {
    contents.push({
      role:  msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }],
    });
  }

  return callGemini(apiKey, contents, { temperature: 0.7 });
}
