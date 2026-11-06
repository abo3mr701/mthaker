/**
 * settings.js — Settings page: SRS intervals, Pomodoro durations, data management
 */

import {
  settings as settingsDB,
  readStudyBackup,
  restoreStudyBackup,
  clearAllUserData,
} from '../db.js';
import { getMaxDailyReviews, setMaxDailyReviews } from '../services/srs.js';
import { showToast, showConfirm } from '../utils/helpers.js';
import { parseStudyBackup } from '../services/studyBackup.js';

export async function renderSettings(container) {
  container.innerHTML = `<div class="flex-center" style="padding:var(--s10)"><div class="spinner"></div></div>`;

  const [oldKey, maxDaily, studyMins, breakMins] = await Promise.all([
    settingsDB.get('geminiApiKey'),
    getMaxDailyReviews(),
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

    <div class="settings-section">
      <div class="settings-section-title">
        <span class="settings-section-icon">🤖</span> الذكاء الاصطناعي
      </div>
      <p class="text-muted text-sm mb-4">اربط حساب Puter مرة واحدة من صفحة المساعد. الطلبات تُحتسب على حساب Puter الذي تختاره.</p>
      <a class="btn btn-secondary btn-sm" href="#chat">فتح المساعد الذكي</a>
      ${oldKey ? '<button class="btn btn-ghost btn-sm" id="clear-key-btn">حذف المفتاح المحفوظ سابقًا</button>' : ''}
    </div>

    <!-- Review algorithm settings -->
    <div class="settings-section">
      <div class="settings-section-title">
        <span class="settings-section-icon">📅</span> خوارزمية المراجعة (SRS)
      </div>
      <p class="text-muted text-sm mb-4">
        الإجابة الصحيحة تُضاعف الفاصل الزمني حسب معامل السهولة الخاص بكل بطاقة، والإجابة الخاطئة
        تعيد البطاقة لليوم التالي وترفع عداد أخطائها. يمكن أيضاً تعديل الحد الأقصى للمراجعات اليومية
        مباشرة من صفحة «مراجعة البطاقات» نفسها.
      </p>
      <div class="form-group" style="max-width:280px;">
        <label class="form-label">🎚️ الحد الأقصى للمراجعات اليومية</label>
        <input type="number" class="form-input" id="max-daily-setting" min="0" step="5" value="${maxDaily}">
        <span class="form-hint">0 = بلا حد (تظهر كل البطاقات المستحقة دفعة واحدة).</span>
      </div>
      <button class="btn btn-primary btn-sm" id="save-max-daily-btn">💾 حفظ</button>
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
        بيانات الدراسة مرتبطة بحسابك في Firebase. يمكنك تنزيل نسخة تشمل خطط المراجعة ومفردات الإنجليزية وسجل المذاكرة.
        الاستعادة تضيف السجلات الناقصة وتُبقي السجلات الحالية. بيانات ربط المساعد خارج النسخة.
      </p>
      <div style="display:flex;gap:var(--s4);flex-wrap:wrap;">
        <button class="btn btn-secondary" id="export-data-btn">📤 تصدير البيانات (JSON)</button>
        <button class="btn btn-secondary" id="restore-data-btn">📥 استعادة نسخة</button>
        <input type="file" id="restore-data-file" accept=".json,application/json" hidden>
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
        يعمل في المتصفح ويزامن بيانات الدراسة عبر Firebase.<br>
        الإصدار: 1.0.0
      </p>
    </div>
  `;

  bindSettingsEvents(container);
}

/* ─── Event binding ───────────────────────────────────────── */
function bindSettingsEvents(container) {
  const clearKeyBtn = container.querySelector('#clear-key-btn');
  clearKeyBtn?.addEventListener('click', async () => {
    const ok = await showConfirm('حذف المفتاح القديم', 'هل تريد حذف المفتاح المحفوظ سابقًا من حسابك؟');
    if (!ok) return;

    clearKeyBtn.disabled = true;
    try {
      await settingsDB.set('geminiApiKey', '');
      clearKeyBtn.remove();
      showToast('تم حذف المفتاح القديم', 'success');
    } catch {
      showToast('تعذّر حذف المفتاح القديم. حاول مرة أخرى.', 'error');
      clearKeyBtn.disabled = false;
    }
  });

  // Max daily reviews
  container.querySelector('#save-max-daily-btn')?.addEventListener('click', async () => {
    const val = container.querySelector('#max-daily-setting').value;
    await setMaxDailyReviews(val);
    showToast('تم حفظ الحد الأقصى للمراجعات اليومية', 'success');
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
  const restoreButton = container.querySelector('#restore-data-btn');
  const restoreInput = container.querySelector('#restore-data-file');
  restoreButton?.addEventListener('click', () => restoreInput.click());
  restoreInput?.addEventListener('change', async () => {
    const file = restoreInput.files[0];
    restoreInput.value = '';
    if (!file) return;
    restoreButton.disabled = true;
    let importing = false;
    try {
      if (file.size > 25_000_000) throw new Error('حجم الملف أكبر من 25 ميغابايت.');
      const data = parseStudyBackup(await file.text());
      const count = Object.values(data).reduce((sum, rows) => sum + rows.length, 0);
      if (!count) { showToast('النسخة لا تحتوي على سجلات.', 'info'); return; }
      if (!await showConfirm('استعادة نسخة مذاكر', `النسخة تحتوي على ${count} سجل. ستُضاف السجلات الناقصة فقط.`)) return;
      importing = true;
      const added = await restoreStudyBackup(data);
      showToast(`تمت الاستعادة. أضيف ${added} سجل.`, 'success');
    } catch (error) {
      showToast(importing ? 'توقفت الاستعادة. يمكنك المحاولة مجددًا لإضافة السجلات المتبقية.' : error.message, 'error');
    } finally {
      restoreButton.disabled = false;
    }
  });

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
      await clearAllUserData();
      showToast('تم حذف جميع البيانات. سيتم إعادة تحميل الصفحة…', 'info', 3000);
      setTimeout(() => window.location.reload(), 3000);
    } catch (err) {
      showToast(`فشل الحذف: ${err.message}`, 'error');
    }
  });

}

/* ─── Export all data as JSON download ───────────────────── */
async function exportAllData() {
  try {
    const data = await readStudyBackup();

    const payload = JSON.stringify({
      exportedAt: new Date().toISOString(),
      app: 'mthaker',
      version: '2.0',
      ...data,
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
