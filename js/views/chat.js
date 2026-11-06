/**
 * chat.js — AI Chat with image upload + fixed system prompt display
 */

import { subjects as subjectsDB, files as filesDB } from '../db.js';
import { chat as studyChat, extractTextFromImage } from '../services/studyAI.js';
import { connectPuter, disconnectPuter, hasPuterConnection, loadPuter } from '../services/puterAI.js';
import { escHtml, uid, showToast } from '../utils/helpers.js';

let conversationHistory = [];

export function resetChat() {
  conversationHistory = [];
}

export async function renderChat(container) {
  container.innerHTML = `<div class="flex-center" style="padding:var(--s10)"><div class="spinner"></div></div>`;
  if (!await hasPuterConnection().catch(() => false)) {
    renderConnect(container);
    return;
  }

  const subjects = await subjectsDB.getAll();

  const subjectOptions = subjects.map(s =>
    `<option value="${s.id}">${escHtml(s.name)}</option>`
  ).join('');

  container.innerHTML = `
    <div class="page-hd">
      <div class="page-hd-text">
        <h2>المساعد الذكي</h2>
        <p>اسأل عن أي موضوع أو استعن بمحتوى مادة دراسية</p>
      </div>
      <div>
        <button class="btn btn-ghost btn-sm" id="disconnect-puter-btn">فصل Puter</button>
        <button class="btn btn-ghost btn-sm" id="clear-chat-btn">🗑️ محو</button>
      </div>
    </div>

      <!-- Context bar -->
      <div class="chat-context-bar">
        <span class="chat-context-label">📚 السياق:</span>
        <select class="chat-context-select" id="context-select">
          <option value="">بدون سياق (محادثة عامة)</option>
          ${subjectOptions}
        </select>
        <span class="text-xs text-muted" id="context-status"></span>
      </div>

      <div class="chat-layout">
        <div class="chat-messages" id="chat-messages">
          ${conversationHistory.length === 0 ? welcomeMsg() : rebuildHistory()}
        </div>

        <!-- Image preview -->
        <div id="img-preview-bar" style="display:none;padding:var(--s3) 0;border-top:1px solid var(--border);">
          <div style="display:flex;align-items:center;gap:var(--s4);">
            <img id="img-preview-thumb" style="width:60px;height:60px;object-fit:cover;border-radius:var(--r3);border:1.5px solid var(--border);">
            <span class="text-sm text-muted" id="img-preview-name"></span>
            <button class="btn btn-ghost btn-sm" id="remove-img-btn">✕</button>
          </div>
        </div>

        <!-- Input row -->
        <div class="chat-input-area">
          <!-- Image upload button -->
          <label class="draw-tool-btn" style="cursor:pointer;flex-shrink:0;" title="إرفاق صورة">
            🖼️
            <input type="file" id="chat-img-input" accept="image/*" style="display:none;">
          </label>
          <textarea class="chat-input" id="chat-input"
            placeholder="اكتب سؤالك هنا…"
            rows="1" dir="rtl" aria-label="حقل الرسالة"></textarea>
          <button class="chat-send-btn" id="chat-send" aria-label="إرسال">➤</button>
        </div>
      </div>
  `;

  const messagesEl  = container.querySelector('#chat-messages');
  const inputEl     = container.querySelector('#chat-input');
  const sendBtn     = container.querySelector('#chat-send');
  const contextSel  = container.querySelector('#context-select');
  const contextStat = container.querySelector('#context-status');
  const clearBtn    = container.querySelector('#clear-chat-btn');
  const imgInput    = container.querySelector('#chat-img-input');
  const imgPreviewBar  = container.querySelector('#img-preview-bar');
  const imgPreviewThumb = container.querySelector('#img-preview-thumb');
  const imgPreviewName  = container.querySelector('#img-preview-name');
  const removeImgBtn    = container.querySelector('#remove-img-btn');
  const disconnectBtn   = container.querySelector('#disconnect-puter-btn');

  let pendingImageBase64 = null;
  let pendingImageMime   = null;
  let pendingImageName   = null;
  let subjectContext = '';

  // Subject context
  contextSel?.addEventListener('change', async () => {
    const subjectId = contextSel.value;
    subjectContext = '';
    if (subjectId) {
      contextStat.textContent = 'جاري تحميل السياق…';
      try {
        const context = await loadContext(subjectId);
        if (contextSel.value !== subjectId) return;
        subjectContext = context;
        contextStat.textContent = `✓ ${context.length.toLocaleString()} حرف`;
      } catch {
        if (contextSel.value === subjectId) contextStat.textContent = 'فشل تحميل السياق';
      }
    } else {
      contextStat.textContent = '';
    }
  });

  // Image attachment
  imgInput?.addEventListener('change', () => {
    const file = imgInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const [header, b64] = dataUrl.split(',');
      pendingImageBase64 = b64;
      pendingImageMime   = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
      pendingImageName   = file.name;
      imgPreviewThumb.src = dataUrl;
      imgPreviewName.textContent = file.name;
      imgPreviewBar.style.display = 'block';
    };
    reader.readAsDataURL(file);
    imgInput.value = '';
  });

  removeImgBtn?.addEventListener('click', () => {
    pendingImageBase64 = pendingImageMime = pendingImageName = null;
    imgPreviewBar.style.display = 'none';
  });

  // Auto-resize textarea
  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + 'px';
  });

  sendBtn.addEventListener('click', async () => {
    sendBtn.disabled = clearBtn.disabled = disconnectBtn.disabled = true;
    try {
      await sendMsg(messagesEl, inputEl, subjectContext, pendingImageBase64, pendingImageMime, pendingImageName,
        () => { pendingImageBase64=pendingImageMime=pendingImageName=null; imgPreviewBar.style.display='none'; });
    } finally {
      sendBtn.disabled = clearBtn.disabled = disconnectBtn.disabled = false;
    }
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendBtn.click();
    }
  });

  clearBtn.addEventListener('click', () => {
    conversationHistory = [];
    messagesEl.innerHTML = welcomeMsg();
  });

  disconnectBtn.addEventListener('click', async () => {
    disconnectBtn.disabled = sendBtn.disabled = true;
    try {
      await disconnectPuter();
      resetChat();
      renderConnect(container);
    } catch {
      showToast('تعذّر فصل Puter. حاول مرة أخرى.', 'error');
      disconnectBtn.disabled = sendBtn.disabled = false;
    }
  });

  scrollBottom(messagesEl);
}

function renderConnect(container) {
  container.innerHTML = `
    <div class="page-hd">
      <div class="page-hd-text">
        <h2>المساعد الذكي</h2>
        <p>اسأل عن دروسك أو استخرج النص من الصور</p>
      </div>
    </div>
    <div class="empty-state">
      <div class="empty-icon" aria-hidden="true">🤖</div>
      <h3 class="empty-title">فعّل مساعدك الذكي</h3>
      <p class="empty-sub">اربط حسابك في Puter مرة واحدة على هذا المتصفح. طلباتك تُحتسب من رصيد حسابك.</p>
      <p class="text-muted text-sm mb-4">تُرسل أسئلتك والصور والمحتوى الدراسي الذي تختاره إلى Puter لمعالجتها.</p>
      <button class="btn btn-primary" id="connect-puter-btn" disabled>ربط حساب Puter</button>
      <p id="puter-connect-status" class="text-muted text-sm" role="status"></p>
    </div>`;
  const button = container.querySelector('#connect-puter-btn');
  const status = container.querySelector('#puter-connect-status');
  let ready = false;

  async function prepare() {
    button.disabled = true;
    status.textContent = 'جاري تجهيز الربط…';
    try {
      await loadPuter();
      ready = true;
      status.textContent = '';
      button.textContent = 'ربط حساب Puter';
    } catch (error) {
      status.textContent = error.message;
      button.textContent = 'إعادة المحاولة';
    } finally {
      button.disabled = false;
    }
  }

  button.addEventListener('click', async () => {
    if (!ready) return prepare();
    button.disabled = true;
    status.textContent = 'أكمل تسجيل الدخول في نافذة Puter.';
    try {
      await connectPuter();
      await renderChat(container);
    } catch (error) {
      status.textContent = error.message;
      button.disabled = false;
    }
  });
  prepare();
}

async function sendMsg(messagesEl, inputEl, context, imgBase64, imgMime, imgName, clearImg) {
  const text = inputEl.value.trim();
  if (!text && !imgBase64) return;

  const displayText = imgBase64 ? `${text ? text + '\n' : ''}[صورة: ${imgName||'صورة'}]` : text;
  appendBubble(messagesEl, 'user', displayText);
  inputEl.value = ''; inputEl.style.height = 'auto';
  clearImg?.();

  const history = conversationHistory;
  const turn = { role: 'user', text: displayText };

  // Loading bubble
  const loadId = `load-${uid()}`;
  messagesEl.insertAdjacentHTML('beforeend', `
    <div class="chat-bubble chat-bubble-ai loading" id="${loadId}">
      <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
    </div>`);
  scrollBottom(messagesEl);

  try {
    if (imgBase64) {
      // If image attached: use OCR then respond
      const ocrText = await extractTextFromImage(imgBase64, imgMime);
      turn.text = text
        ? `${text}\n\n[نص مستخرج من الصورة]:\n${ocrText}`
        : `شرح محتوى هذه الصورة:\n${ocrText}`;
    }

    const response = await studyChat([...history, turn], context);
    history.push(turn, { role:'assistant', text: response });
    document.getElementById(loadId)?.remove();
    appendBubble(messagesEl, 'ai', response);
  } catch (err) {
    document.getElementById(loadId)?.remove();
    appendBubble(messagesEl, 'ai', `❌ خطأ: ${err.message}`, true);
    showToast(`تعذّر استخدام المساعد: ${err.message}`, 'error', 7000);
  }
  scrollBottom(messagesEl);
}

function appendBubble(container, role, text, isError = false) {
  const cls = role === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai';
  const div = document.createElement('div');
  div.className = `chat-bubble ${cls}`;
  div.setAttribute('dir', 'rtl');
  if (isError) div.style.borderColor = 'var(--danger)';
  // Render newlines as <br>
  div.innerHTML = escHtml(text).replace(/\n/g, '<br>');
  container.appendChild(div);
}

function scrollBottom(el) {
  requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
}

async function loadContext(subjectId) {
  const subjectFiles = await filesDB.getBySubject(subjectId);
  return subjectFiles
    .filter(f => f.extractedText?.trim().length > 0)
    .map(f => `[ملف: ${f.name}]\n${f.extractedText}`)
    .join('\n\n---\n\n');
}

function welcomeMsg() {
  return `<div class="chat-bubble chat-bubble-ai" dir="rtl">
    مرحباً! أنا مساعدك الذكي. يمكنني:<br>
    • الإجابة على أسئلتك الدراسية<br>
    • شرح مفاهيم من ملفاتك المرفوعة<br>
    • تحليل الصور التي ترفقها 🖼️<br><br>
    اختر مادة من القائمة أعلاه لاستخدام محتواها كسياق.
  </div>`;
}

function rebuildHistory() {
  return conversationHistory.map(m => `
    <div class="chat-bubble ${m.role==='user'?'chat-bubble-user':'chat-bubble-ai'}" dir="rtl">
      ${escHtml(m.text).replace(/\n/g,'<br>')}
    </div>`).join('');
}
