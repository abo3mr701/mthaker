/**
 * chat.js — AI Chat with optional subject context via Gemini
 */

import { subjects as subjectsDB, files as filesDB, settings } from '../db.js';
import { chat as geminiChat } from '../services/gemini.js';
import { escHtml, uid, showToast } from '../utils/helpers.js';

let conversationHistory = [];
let currentSubjectId    = null;
let subjectContextCache = '';

export async function renderChat(container) {
  container.innerHTML = `<div class="flex-center" style="padding:var(--s10)"><div class="spinner"></div></div>`;

  const [apiKey, subjects] = await Promise.all([
    settings.get('geminiApiKey'),
    subjectsDB.getAll(),
  ]);

  const subjectOptions = subjects.map(s =>
    `<option value="${s.id}">${escHtml(s.name)}</option>`
  ).join('');

  container.innerHTML = `
    <div class="page-hd">
      <div class="page-hd-text">
        <h2>المساعد الذكي</h2>
        <p>اسأل عن أي موضوع أو استعن بمحتوى مادة دراسية</p>
      </div>
      <button class="btn btn-ghost btn-sm" id="clear-chat-btn">🗑️ محو المحادثة</button>
    </div>

    ${!apiKey ? `
      <div class="empty-state">
        <div class="empty-icon">🔑</div>
        <h3 class="empty-title">مفتاح API مطلوب</h3>
        <p class="empty-sub">أدخل مفتاح Gemini API في الإعدادات لاستخدام المساعد الذكي.</p>
        <a href="#settings" class="btn btn-primary">⚙️ الذهاب للإعدادات</a>
      </div>
    ` : `
      <!-- Subject context bar -->
      <div class="chat-context-bar">
        <span class="chat-context-label">📚 السياق:</span>
        <select class="chat-context-select" id="context-select">
          <option value="">بدون سياق (محادثة عامة)</option>
          ${subjectOptions}
        </select>
        <span class="text-xs text-muted" id="context-status"></span>
      </div>

      <!-- Chat layout -->
      <div class="chat-layout">
        <div class="chat-messages" id="chat-messages">
          ${conversationHistory.length === 0 ? renderWelcomeMessage() : renderHistoryMessages()}
        </div>

        <!-- Input area -->
        <div class="chat-input-area">
          <textarea class="chat-input" id="chat-input"
            placeholder="اكتب سؤالك هنا…"
            rows="1" dir="rtl"
            aria-label="حقل الرسالة"></textarea>
          <button class="chat-send-btn" id="chat-send" aria-label="إرسال">
            ➤
          </button>
        </div>
      </div>
    `}
  `;

  if (!apiKey) return;

  const messagesEl  = container.querySelector('#chat-messages');
  const inputEl     = container.querySelector('#chat-input');
  const sendBtn     = container.querySelector('#chat-send');
  const contextSel  = container.querySelector('#context-select');
  const contextStat = container.querySelector('#context-status');
  const clearBtn    = container.querySelector('#clear-chat-btn');

  // Subject context change
  contextSel?.addEventListener('change', async () => {
    currentSubjectId    = contextSel.value || null;
    subjectContextCache = '';

    if (currentSubjectId) {
      contextStat.textContent = 'جاري تحميل السياق…';
      try {
        subjectContextCache = await loadSubjectContext(currentSubjectId);
        const subj = await subjectsDB.getById(currentSubjectId);
        contextStat.textContent = `✓ ${subj?.name} (${subjectContextCache.length.toLocaleString()} حرف)`;
      } catch (err) {
        contextStat.textContent = 'فشل تحميل السياق';
      }
    } else {
      contextStat.textContent = '';
    }
  });

  // Auto-resize textarea
  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + 'px';
  });

  // Send on button click or Ctrl/Cmd + Enter
  sendBtn.addEventListener('click', () => sendMessage(messagesEl, inputEl, apiKey));
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(messagesEl, inputEl, apiKey);
    }
  });

  // Clear chat
  clearBtn.addEventListener('click', () => {
    conversationHistory = [];
    messagesEl.innerHTML = renderWelcomeMessage();
  });
}

async function sendMessage(messagesEl, inputEl, apiKey) {
  const text = inputEl.value.trim();
  if (!text) return;

  // Append user bubble
  appendBubble(messagesEl, 'user', text);
  inputEl.value       = '';
  inputEl.style.height = 'auto';

  // Add to history
  conversationHistory.push({ role: 'user', text });

  // Loading bubble
  const loadingId = 'loading-' + uid();
  messagesEl.insertAdjacentHTML('beforeend', `
    <div class="chat-bubble chat-bubble-ai loading" id="${loadingId}">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `);
  scrollToBottom(messagesEl);

  try {
    const response = await geminiChat(apiKey, conversationHistory, subjectContextCache);
    conversationHistory.push({ role: 'assistant', text: response });

    const loadingEl = document.getElementById(loadingId);
    if (loadingEl) loadingEl.remove();
    appendBubble(messagesEl, 'ai', response);
  } catch (err) {
    const loadingEl = document.getElementById(loadingId);
    if (loadingEl) loadingEl.remove();
    appendBubble(messagesEl, 'ai', `❌ خطأ: ${err.message}`, true);
    showToast(`فشل الاتصال بـ Gemini: ${err.message}`, 'error', 7000);
  }

  scrollToBottom(messagesEl);
}

function appendBubble(container, role, text, isError = false) {
  const cls    = role === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai';
  const style  = isError ? 'style="border-color:var(--danger);"' : '';
  const div    = document.createElement('div');
  div.className = `chat-bubble ${cls}`;
  div.setAttribute('dir', 'rtl');
  if (isError) div.style.borderColor = 'var(--danger)';
  div.textContent = text;
  container.appendChild(div);
}

function scrollToBottom(el) {
  requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
}

async function loadSubjectContext(subjectId) {
  const subjectFiles = await filesDB.getBySubject(subjectId);
  const texts = subjectFiles
    .filter(f => f.extractedText && f.extractedText.trim().length > 0)
    .map(f => `[ملف: ${f.name}]\n${f.extractedText}`)
    .join('\n\n---\n\n');
  return texts;
}

function renderWelcomeMessage() {
  return `
    <div class="chat-bubble chat-bubble-ai" dir="rtl">
      مرحباً! أنا مساعدك الذكي. يمكنني الإجابة على أسئلتك، مساعدتك في المذاكرة، وشرح المفاهيم.
      يمكنك أيضاً اختيار مادة دراسية من القائمة أعلاه حتى أتمكن من الإجابة بناءً على محتواها. 🎓
    </div>
  `;
}

function renderHistoryMessages() {
  return conversationHistory.map(m => `
    <div class="chat-bubble ${m.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'}" dir="rtl">
      ${escHtml(m.text)}
    </div>
  `).join('');
}
