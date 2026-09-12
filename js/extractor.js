/**
 * extractor.js — File text/content extraction
 *
 * Supports:
 *  - PDF  → PDF.js (text layer, page by page)
 *  - Images (PNG, JPG, JPEG, WEBP, GIF) → base64 for Gemini Vision OCR
 *  - TXT / plain text files → direct read
 *
 * Returns: { text, base64, mimeType, method }
 */

/* ─── Configure PDF.js worker ────────────────────────────── */
function ensurePdfWorker() {
  if (typeof pdfjsLib === 'undefined') {
    throw new Error('مكتبة PDF.js غير محملة. تأكد من اتصالك بالإنترنت.');
  }
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
}

/* ─── Read file as ArrayBuffer ────────────────────────────── */
function readAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result);
    r.onerror = () => reject(new Error(`فشل قراءة الملف: ${file.name}`));
    r.readAsArrayBuffer(file);
  });
}

/* ─── Read file as DataURL (base64) ──────────────────────── */
function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result);
    r.onerror = () => reject(new Error(`فشل قراءة الملف: ${file.name}`));
    r.readAsDataURL(file);
  });
}

/* ─── Read file as plain text ────────────────────────────── */
function readAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result);
    r.onerror = () => reject(new Error(`فشل قراءة الملف: ${file.name}`));
    r.readAsText(file, 'UTF-8');
  });
}

/* ─── Extract text from PDF ──────────────────────────────── */
async function extractFromPDF(file) {
  ensurePdfWorker();

  const buffer = await readAsArrayBuffer(file);
  const pdf    = await pdfjsLib.getDocument({ data: buffer }).promise;

  const pageTexts = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text    = content.items.map(item => item.str).join(' ');
    if (text.trim()) pageTexts.push(text.trim());
  }

  const combinedText = pageTexts.join('\n\n');
  return {
    text:     combinedText,
    base64:   null,
    mimeType: 'application/pdf',
    method:   'pdf.js',
    pages:    pdf.numPages,
  };
}

/* ─── Extract base64 from image ──────────────────────────── */
async function extractFromImage(file) {
  const dataUrl = await readAsDataURL(file);
  // dataUrl format: "data:image/jpeg;base64,XXXX..."
  const [header, base64] = dataUrl.split(',');
  const mimeType = header.match(/:(.*?);/)?.[1] || file.type;

  return {
    text:     null,         // Text will be filled by Gemini OCR
    base64,
    mimeType,
    method:   'gemini-vision',
  };
}

/* ─── Extract plain text ─────────────────────────────────── */
async function extractFromText(file) {
  const text = await readAsText(file);
  return {
    text,
    base64:   null,
    mimeType: 'text/plain',
    method:   'plain-text',
  };
}

/* ─── Main export: dispatch by file type ─────────────────── */
export async function extractFileContent(file) {
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();

  if (type === 'application/pdf' || name.endsWith('.pdf')) {
    return extractFromPDF(file);
  }

  if (
    type.startsWith('image/') ||
    name.match(/\.(png|jpg|jpeg|gif|webp|bmp|tiff?)$/i)
  ) {
    return extractFromImage(file);
  }

  if (
    type === 'text/plain' ||
    name.match(/\.(txt|md|markdown|csv|rtf)$/i)
  ) {
    return extractFromText(file);
  }

  // Fallback: attempt plain text read for unknown types
  try {
    return await extractFromText(file);
  } catch {
    throw new Error(
      `نوع الملف "${file.name}" غير مدعوم. الأنواع المدعومة: PDF، صور (PNG/JPG)، نص عادي.`
    );
  }
}

/* ─── Check if a file needs Gemini Vision for OCR ────────── */
export function needsVisionOCR(extractionResult) {
  return extractionResult.method === 'gemini-vision';
}

/* ─── Validate file before processing ────────────────────── */
export function validateFile(file) {
  const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

  if (!file) return { ok: false, error: 'لم يتم اختيار ملف.' };

  if (file.size > MAX_SIZE) {
    return { ok: false, error: `حجم الملف كبير جداً (الحد الأقصى 20 ميغابايت).` };
  }

  const name = file.name.toLowerCase();
  const allowed = /\.(pdf|png|jpg|jpeg|gif|webp|bmp|tiff?|txt|md|csv|rtf)$/i;
  if (!allowed.test(name)) {
    return { ok: false, error: `نوع الملف "${file.name.split('.').pop()}" غير مدعوم.` };
  }

  return { ok: true };
}
