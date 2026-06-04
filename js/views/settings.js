/**
 * settings.js — Settings page: Gemini API key, SRS intervals, Pomodoro durations, data management
 */

import {
  settings as settingsDB,
  subjects as subjectsDB_exp,
  flashcards as flashcardsDB_exp,
  files as filesDB_exp,
  sessions as sessionsDB_exp,
  history as historyDB_exp,
} from '../db.js';
import { validateApiKey } from '../services/gemini.js';
import { getIntervals, saveIntervals, DEFAULT_INTERVALS } from '../services/srs.js';
import { showToast, showConfirm, escHtml } from '../utils/helpers.js';

export async function renderSettings(container) {
  container.innerHTML = `<div class="flex-center" style="padding:var(--s10)"><div class="spinner"></div></div>`;

  const [apiKey, intervals, studyMins, breakMins] = await Promise.all([
    settingsDB.get('geminiApiKey'),
    getIntervals(),
    settingsDB.get('pomodoroStudy'),
    settingsDB.get('pomodoroBreak'),
  ]);

  container.innerHTML = `
    <div class="page-hd">
      <div class="page-hd-text">
        <h2>الإعدادات</h2>
        <p>تهيئة التطبيق وإعدادات الذكاء الاصطناعي</p>
      </div>
    </div>

    <!-- Gemini API Key -->
    <div class="settings-section">
      <div class="settings-section-title">
        <span class="settings-section-icon">🤖</span> مفتاح Gemini API
      </div>
      <p class="text-muted text-sm mb-4">
        مطلوب لإنشاء البطاقات تلقائياً من الملفات والمساعد الذكي.
        احصل على مفتاح مجاني من
        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener"
           style="color:var(--primary);">Google AI Studio</a>.
      </p>
      <div class="form-group">
        <label class="form-label" for="api-key-input">مفتاح API</label>
        <div class="input-with-toggle" style="position:relative;">
          <input type="password" class="form-input" id="api-key-input"
            placeholder="AIza…"
            value="${escHtml(apiKey || '')}"
            autocomplete="off" dir="ltr">
          <button class="input-toggle-btn" id="toggle-key-vis" title="إظهار/إخفاء">👁</button>
        </div>
        <span class="form-hint">لا يُشارك مفتاحك مع أي خادم خارجي — يُستخدم مباشرة في متصفحك.</span>
      </div>
      <div id="api-key-status"></div>
      <div style="display:flex;gap:var(--s4);margin-top:var(--s5);">
        <button class="btn btn-primary" id="validate-key-btn">
          🔑 التحقق والحفظ
        </button>
        ${apiKey ? `<button class="btn btn-ghost" id="clear-key-btn">🗑️ حذف المفتاح</button>` : ''}
      </div>
    </div>

    <!-- SRS Intervals -->
    <div class="settings-section">
      <div class="settings-section-title">
        <span class="settings-section-icon">📅</span> فترات المراجعة المتباعدة (SRS)
      </div>
      <p class="text-muted text-sm mb-4">
        حدد عدد الأيام بين كل مرحلة مراجعة. البطاقة تتقدم عند الإجابة الصحيحة وترجع عند الخطأ.
      </p>
      <div id="srs-intervals-list" class="srs-intervals-list">
        ${renderIntervalsUI(intervals)}
      </div>
      <div style="display:flex;gap:var(--s4);flex-wrap:wrap;">
        <button class="btn btn-secondary btn-sm" id="add-interval-btn">➕ إضافة مرحلة</button>
        <button class="btn btn-primary btn-sm" id="save-intervals-btn">💾 حفظ الفترات</button>
        <button class="btn btn-ghost btn-sm" id="reset-intervals-btn">↺ إعادة للافتراضي</button>
      </div>
    </div>

    <!-- Theme -->
    <div class="settings-section">
      <div class="settings-section-title">
        <span class="settings-section-icon">🎨</span> المظهر
      </div>
      <div style="display:flex;gap:var(--s5);">
        <button class="btn btn-secondary" id="theme-light-btn">☀️ فاتح</button>
        <button class="btn btn-secondary" id="theme-dark-btn">🌙 داكن</button>
      </div>
    </div>

    <!-- Data Management -->
    <div class="settings-section">
      <div class="settings-section-title">
        <span class="settings-section-icon">🗄️</span> إدارة البيانات
      </div>
      <p class="text-muted text-sm mb-4">
        جميع بياناتك محفوظة محلياً في متصفحك (IndexedDB). يمكنك تصديرها للنسخ الاحتياطي.
      </p>
      <div style="display:flex;gap:var(--s4);flex-wrap:wrap;">
        <button class="btn btn-secondary" id="export-data-btn">📤 تصدير البيانات (JSON)</button>
        <button class="btn btn-danger" id="clear-data-btn">⚠️ حذف جميع البيانات</button>
      </div>
    </div>

    <!-- About -->
    <div class="settings-section">
      <div class="settings-section-title">
        <span class="settings-section-icon">ℹ️</span> عن التطبيق
      </div>
      <p class="text-muted text-sm">
        <strong>مذاكر</strong> — تطبيق تعليمي ذكي مفتوح المصدر.<br>
        يعمل كلياً في المتصفح بدون خادم خلفي.<br>
        الإصدار: 1.0.0
      </p>
    </div>
  `;

  bindSettingsEvents(container, apiKey, intervals);
}

/* ─── SRS Intervals UI ───────────────────────────────────── */
function renderIntervalsUI(intervals) {
  return intervals.map((days, i) => `
    <div class="srs-interval-row" data-index="${i}">
      <span class="srs-interval-label">المرحلة ${i + 1}</span>
      <input type="number" class="srs-interval-input"
        min="1" max="365" value="${days}"
        aria-label="أيام المرحلة ${i + 1}">
      <span class="srs-unit">يوم</span>
      ${intervals.length > 1
        ? `<button class="btn btn-danger btn-sm btn-icon-only remove-interval" data-index="${i}" title="حذف">✕</button>`
        : ''
      }
    </div>
  `).join('');
}

/* ─── Event binding ───────────────────────────────────────── */
function bindSettingsEvents(container, currentApiKey, intervals) {
  const keyInput    = container.querySelector('#api-key-input');
  const toggleBtn   = container.querySelector('#toggle-key-vis');
  const validateBtn = container.querySelector('#validate-key-btn');
  const clearKeyBtn = container.querySelector('#clear-key-btn');

  // Toggle API key visibility
  toggleBtn?.addEventListener('click', () => {
    const isPass = keyInput.type === 'password';
    keyInput.type = isPass ? 'text' : 'password';
    toggleBtn.textContent = isPass ? '🙈' : '👁';
  });

  // Validate & save API key
  validateBtn?.addEventListener('click', async () => {
    const key = keyInput.value.trim();
    if (!key) { showToast('الرجاء إدخال مفتاح API', 'warning'); return; }

    setApiStatus(container, 'checking');
    validateBtn.disabled = true;

    const result = await validateApiKey(key);

    validateBtn.disabled = false;
    if (result.valid) {
      await settingsDB.set('geminiApiKey', key);
      // Update app-level state
      if (window.__appState) window.__appState.apiKey = key;
      setApiStatus(container, 'valid');
      showToast('✅ تم التحقق من المفتاح وحفظه', 'success');
    } else {
      setApiStatus(container, 'invalid', result.error);
      showToast(`فشل التحقق: ${result.error}`, 'error', 7000);
    }
  });

  // Clear API key
  clearKeyBtn?.addEventListener('click', async () => {
    const ok = await showConfirm('حذف المفتاح', 'هل تريد حذف مفتاح Gemini API؟');
    if (!ok) return;
    await settingsDB.set('geminiApiKey', '');
    if (window.__appState) window.__appState.apiKey = '';
    keyInput.value = '';
    setApiStatus(container, null);
    showToast('تم حذف المفتاح', 'info');
    clearKeyBtn.remove();
  });

  // SRS: add interval
  container.querySelector('#add-interval-btn')?.addEventListener('click', () => {
    const listEl = container.querySelector('#srs-intervals-list');
    const count  = listEl.querySelectorAll('.srs-interval-row').length;
    const last   = parseInt(listEl.querySelector('.srs-interval-row:last-child .srs-interval-input')?.value || 30, 10);
    const newRow = document.createElement('div');
    newRow.className = 'srs-interval-row';
    newRow.dataset.index = count;
    newRow.innerHTML = `
      <span class="srs-interval-label">المرحلة ${count + 1}</span>
      <input type="number" class="srs-interval-input" min="1" max="365" value="${last * 2}">
      <span class="srs-unit">يوم</span>
      <button class="btn btn-danger btn-sm btn-icon-only remove-interval" data-index="${count}" title="حذف">✕</button>
    `;
    listEl.appendChild(newRow);
    newRow.querySelector('.remove-interval')?.addEventListener('click', () => removeInterval(newRow));
  });

  // SRS: remove interval rows (existing)
  container.querySelectorAll('.remove-interval').forEach(btn => {
    btn.addEventListener('click', (e) => removeInterval(e.target.closest('.srs-interval-row')));
  });

  function removeInterval(row) {
    const list = container.querySelector('#srs-intervals-list');
    if (list.querySelectorAll('.srs-interval-row').length <= 1) {
      showToast('يجب أن تكون هناك مرحلة واحدة على الأقل', 'warning');
      return;
    }
    row.remove();
    // Re-number labels
    list.querySelectorAll('.srs-interval-row').forEach((r, i) => {
      r.querySelector('.srs-interval-label').textContent = `المرحلة ${i + 1}`;
    });
  }

  // SRS: save
  container.querySelector('#save-intervals-btn')?.addEventListener('click', async () => {
    const inputs = container.querySelectorAll('.srs-interval-input');
    const vals   = Array.from(inputs).map(inp => parseInt(inp.value, 10) || 1);
    try {
      await saveIntervals(vals);
      showToast('تم حفظ فترات المراجعة', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // SRS: reset
  container.querySelector('#reset-intervals-btn')?.addEventListener('click', async () => {
    const ok = await showConfirm('إعادة تعيين', 'إعادة فترات المراجعة للقيم الافتراضية؟');
    if (!ok) return;
    await saveIntervals(DEFAULT_INTERVALS);
    container.querySelector('#srs-intervals-list').innerHTML = renderIntervalsUI(DEFAULT_INTERVALS);
    showToast('تمت إعادة الفترات للافتراضي', 'success');
  });

  // Theme buttons
  container.querySelector('#theme-light-btn')?.addEventListener('click', () => {
    document.body.dataset.theme = 'light';
    settingsDB.set('theme', 'light');
    showToast('تم التبديل للمظهر الفاتح', 'info');
  });
  container.querySelector('#theme-dark-btn')?.addEventListener('click', () => {
    document.body.dataset.theme = 'dark';
    settingsDB.set('theme', 'dark');
    showToast('تم التبديل للمظهر الداكن', 'info');
  });

  // Export data
  container.querySelector('#export-data-btn')?.addEventListener('click', exportAllData);

  // Clear all data
  container.querySelector('#clear-data-btn')?.addEventListener('click', async () => {
    const ok = await showConfirm(
      '⚠️ حذف جميع البيانات',
      'سيتم حذف جميع المواد والبطاقات والملفات والإحصائيات نهائياً. هذا الإجراء لا يمكن التراجع عنه!'
    );
    if (!ok) return;
    const ok2 = await showConfirm('تأكيد نهائي', 'هل أنت متأكد تماماً؟ ستُفقد جميع بياناتك.');
    if (!ok2) return;

    try {
      const dbs = await indexedDB.databases?.();
      if (dbs) {
        for (const d of dbs) {
          if (d.name === 'mudhakir_db') indexedDB.deleteDatabase(d.name);
        }
      } else {
        indexedDB.deleteDatabase('mudhakir_db');
      }
      showToast('تم حذف جميع البيانات. سيتم إعادة تحميل الصفحة…', 'info', 3000);
      setTimeout(() => window.location.reload(), 3000);
    } catch (err) {
      showToast(`فشل الحذف: ${err.message}`, 'error');
    }
  });

  // Show current key status on load
  if (currentApiKey) setApiStatus(container, 'valid');
}

function setApiStatus(container, state, errorMsg = '') {
  const el = container.querySelector('#api-key-status');
  if (!el) return;
  if (!state) { el.innerHTML = ''; return; }
  const labels = {
    valid:    '✅ المفتاح صالح ومحفوظ',
    invalid:  `❌ مفتاح غير صالح${errorMsg ? ': ' + errorMsg : ''}`,
    checking: '⏳ جاري التحقق…',
  };
  el.innerHTML = `<span class="api-status ${state}">${labels[state]}</span>`;
}

/* ─── Export all data as JSON download ───────────────────── */
async function exportAllData() {
  try {
    const [s, c, f, se, h] = await Promise.all([
      subjectsDB_exp.getAll(),
      flashcardsDB_exp.getAll(),
      filesDB_exp.getAll(),
      sessionsDB_exp.getAll(),
      historyDB_exp.getAll(),
    ]);

    // Strip extracted text from files (can be large) for export
    const cleanFiles = f.map(({ extractedText, ...rest }) => rest);

    const payload = JSON.stringify({
      exportedAt: new Date().toISOString(),
      version: '1.0',
      subjects: s,
      flashcards: c,
      files: cleanFiles,
      sessions: se,
      history: h,
    }, null, 2);

    const blob = new Blob([payload], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `mudhakir_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('تم تصدير البيانات', 'success');
  } catch (err) {
    showToast(`فشل التصدير: ${err.message}`, 'error');
  }
}
