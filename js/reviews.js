/**
 * reviews.js — "المراجعات": خطط مراجعة الدروس (مستقلة تماماً عن الفلاش كاردز)
 *
 * كل "خطة" تمثّل درساً/موضوعاً يحتاج مراجعته على دفعات متباعدة (1، 3، 7، 21، 40 يوماً).
 * كل خطة يمكن ربطها اختيارياً بمادة موجودة — وحينها يظهر زر "إضافة بطاقات" الذي يفتح
 * نفس نافذة إضافة الفلاش كاردز اليدوية (دون حذف أو التأثير على إمكانية إضافتها بشكل منفصل
 * من صفحة المادة نفسها).
 */

import { reviewPlans as plansDB, subjects as subjectsDB, flashcards as cardsDB, settings } from '../db.js';
import { buildCard } from '../services/srs.js';
import { generateWordInsight } from '../services/gemini.js';
import { uid, showToast, showConfirm, escHtml, todayStr, addDays } from '../utils/helpers.js';
import { refreshSubjectCardCount } from './subjects.js';

const DEFAULT_OFFSETS = [1, 3, 7, 21, 40];
const CATEGORY_PRESETS = ['عام', 'إنجليزي'];

let _allPlans = [];
let _allSubjects = [];

export async function renderReviews(container) {
  container.innerHTML = `<div class="flex-center" style="padding:var(--s10)"><div class="spinner"></div></div>`;

  try {
    [_allPlans, _allSubjects] = await Promise.all([
      plansDB.getAll(),
      subjectsDB.getAll(),
    ]);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p class="text-danger">خطأ: ${err.message}</p></div>`;
    return;
  }

  _allPlans.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  renderUI(container);
}

function renderUI(container) {
  const dueTodayCount = _allPlans.filter(p => planHasDueToday(p)).length;

  container.innerHTML = `
    <div class="page-hd">
      <div class="page-hd-text">
        <h2>المراجعات</h2>
        <p>${_allPlans.length ? `${_allPlans.length} خطة مراجعة${dueTodayCount ? ` — ${dueTodayCount} تحتاج مراجعة اليوم` : ''}` : 'خطط مراجعة الدروس — مستقلة عن البطاقات التعليمية'}</p>
      </div>
      <button class="btn btn-primary" id="btn-new-plan">➕ درس جديد للمراجعة</button>
    </div>

    <div class="review-plan-grid" id="plans-grid">
      ${_allPlans.length === 0 ? emptyState() : _allPlans.map(p => renderPlanCard(p)).join('')}
    </div>
  `;

  container.querySelector('#btn-new-plan')?.addEventListener('click', () => openPlanModal(container));
  bindPlanCardEvents(container);
}

function emptyState() {
  return `
    <div class="empty-state" style="grid-column:1/-1;">
      <div class="empty-icon">🗓️</div>
      <h3 class="empty-title">لا توجد خطط مراجعة بعد</h3>
      <p class="empty-sub">أضف درساً جديداً وسيتم جدولة 5 مراجعات متباعدة له تلقائياً (بعد 1، 3، 7، 21، 40 يوماً).</p>
    </div>
  `;
}

function planHasDueToday(plan) {
  const today = todayStr();
  return (plan.reviews || []).some(r => !r.done && r.dueDate <= today);
}

/* ─── Plan card markup (matches the requested design) ─────── */
function renderPlanCard(plan) {
  const reviews  = plan.reviews || [];
  const doneCnt  = reviews.filter(r => r.done).length;
  const pct      = reviews.length ? Math.round((doneCnt / reviews.length) * 100) : 0;
  const subject  = plan.subjectId ? _allSubjects.find(s => s.id === plan.subjectId) : null;

  const boxes = reviews.map((r, i) => {
    const rel = relativeDayLabel(plan.createdAt, r.dueDate);
    return `
      <div class="review-box ${r.done ? 'done' : ''}" data-review-id="${r.id}">
        <button class="review-box-check" data-action="toggle-review" data-plan="${plan.id}" data-review="${r.id}"
          aria-label="تمت المراجعة ${i + 1}">${r.done ? '✓' : ''}</button>
        <div class="review-box-num">المراجعة ${i + 1}</div>
        <div class="review-box-date" data-action="edit-date" data-plan="${plan.id}" data-review="${r.id}" title="اضغط لتعديل التاريخ يدوياً">
          ${formatArabicDate(r.dueDate)}
        </div>
        <div class="review-box-rel">${rel}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="review-plan-card" data-plan-id="${plan.id}">
      <div class="review-plan-head">
        <div>
          <div class="review-plan-title">${escHtml(plan.title)}</div>
          <div class="review-plan-meta">
            <span class="review-plan-date-pill">🗓️ ${formatArabicDate(plan.createdAt)}</span>
            <span class="review-plan-cat-pill">${escHtml(plan.category || 'عام')}</span>
            ${subject ? `<span class="review-plan-subject-pill" style="background:${subject.color}22;color:${subject.color}">${escHtml(subject.name)}</span>` : ''}
          </div>
        </div>
        <button class="review-plan-trash" data-action="delete-plan" data-plan="${plan.id}" title="حذف الدرس">🗑️</button>
      </div>

      <div class="review-plan-progress-row">
        <span class="review-plan-progress-pct">${pct}%</span>
        <span class="review-plan-progress-lbl">نسبة الإنجاز</span>
      </div>
      <div class="review-plan-progress-bar">
        <div class="review-plan-progress-fill" style="width:${pct}%"></div>
      </div>

      <div class="review-boxes-row">${boxes}</div>

      <div class="review-plan-footer">
        <textarea class="review-plan-pages" data-action="edit-pages" data-plan="${plan.id}"
          placeholder="الصفحات / ملاحظات… مثال: pages from 1-7" dir="auto">${escHtml(plan.pages || '')}</textarea>
      </div>

      <div class="review-plan-actions">
        <button class="btn btn-sm btn-secondary" data-action="edit-plan" data-plan="${plan.id}">✏️ تعديل الدرس</button>
        ${subject
          ? `<button class="btn btn-sm btn-primary" data-action="add-card" data-plan="${plan.id}">🃏 إضافة فلاش كاردز لهذا الدرس</button>`
          : `<button class="btn btn-sm btn-ghost" disabled title="اربط الدرس بمادة أولاً من زر «تعديل الدرس»">🃏 إضافة فلاش كاردز (اربط بمادة أولاً)</button>`}
      </div>
    </div>
  `;
}

function relativeDayLabel(createdAt, dueDate) {
  const days = diffDays(createdAt, dueDate);
  if (days === 0) return 'اليوم';
  if (days < 0)   return `منذ ${Math.abs(days)} يوم`;
  return `بعد ${days} يوم`;
}

function diffDays(a, b) {
  const ms = new Date(b) - new Date(a);
  return Math.round(ms / 86_400_000);
}

function formatArabicDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
}

/* ─── Event binding for the grid ─────────────────────────── */
function bindPlanCardEvents(container) {
  const grid = container.querySelector('#plans-grid');
  if (!grid) return;

  grid.addEventListener('click', async (e) => {
    const toggleBtn = e.target.closest('[data-action="toggle-review"]');
    if (toggleBtn) return toggleReview(container, toggleBtn.dataset.plan, toggleBtn.dataset.review);

    const dateBtn = e.target.closest('[data-action="edit-date"]');
    if (dateBtn) return editReviewDate(container, dateBtn);

    const delBtn = e.target.closest('[data-action="delete-plan"]');
    if (delBtn) return deletePlan(container, delBtn.dataset.plan);

    const editBtn = e.target.closest('[data-action="edit-plan"]');
    if (editBtn) {
      const plan = _allPlans.find(p => p.id === editBtn.dataset.plan);
      if (plan) openPlanModal(container, plan);
      return;
    }

    const addCardBtn = e.target.closest('[data-action="add-card"]');
    if (addCardBtn) {
      const plan = _allPlans.find(p => p.id === addCardBtn.dataset.plan);
      if (plan) openQuickCardModal(container, plan);
      return;
    }
  });

  // Pages/notes autosave on blur
  grid.querySelectorAll('[data-action="edit-pages"]').forEach(el => {
    el.addEventListener('blur', async () => {
      const plan = _allPlans.find(p => p.id === el.dataset.plan);
      if (!plan) return;
      plan.pages = el.value.trim();
      await plansDB.save(plan);
    });
  });
}

async function toggleReview(container, planId, reviewId) {
  const plan = _allPlans.find(p => p.id === planId);
  if (!plan) return;
  const rev = (plan.reviews || []).find(r => r.id === reviewId);
  if (!rev) return;
  rev.done = !rev.done;
  rev.completedAt = rev.done ? new Date().toISOString() : null;
  await plansDB.save(plan);
  renderUI(container);
  showToast(rev.done ? 'تم تسجيل المراجعة ✓' : 'تم إلغاء التحديد', 'success', 1800);
}

// Manual date override — editable directly from the review box itself, at any time
function editReviewDate(container, dateEl) {
  if (dateEl.querySelector('input')) return; // already editing
  const planId   = dateEl.dataset.plan;
  const reviewId = dateEl.dataset.review;
  const plan     = _allPlans.find(p => p.id === planId);
  const rev      = plan && (plan.reviews || []).find(r => r.id === reviewId);
  if (!rev) return;

  const original = dateEl.innerHTML;
  dateEl.innerHTML = `<input type="date" class="review-date-input" value="${rev.dueDate}">`;
  const input = dateEl.querySelector('input');
  input.focus();

  const commit = async () => {
    const val = input.value;
    if (val && val !== rev.dueDate) {
      rev.dueDate = val;
      await plansDB.save(plan);
      showToast('تم تحديث تاريخ المراجعة', 'success', 1800);
      renderUI(container);
    } else {
      dateEl.innerHTML = original;
    }
  };
  input.addEventListener('change', commit);
  input.addEventListener('blur', () => { if (dateEl.querySelector('input')) dateEl.innerHTML = original; }, { once: true });
  input.addEventListener('click', (e) => e.stopPropagation());
}

async function deletePlan(container, planId) {
  const ok = await showConfirm('حذف الدرس', 'سيتم حذف خطة المراجعة هذه نهائياً (لن يتم حذف أي بطاقات مرتبطة بها).');
  if (!ok) return;
  await plansDB.delete(planId);
  _allPlans = _allPlans.filter(p => p.id !== planId);
  renderUI(container);
  showToast('تم حذف الدرس', 'success');
}

/* ─── Create / edit plan modal ────────────────────────────── */
function openPlanModal(container, existing = null) {
  const isEdit = !!existing;
  const backdrop = document.getElementById('modal-form');
  const titleEl  = document.getElementById('modal-form-title');
  const bodyEl   = document.getElementById('modal-form-body');
  const closeBtn = document.getElementById('modal-form-close');

  titleEl.textContent = isEdit ? 'تعديل الدرس' : 'درس جديد للمراجعة';
  backdrop.classList.remove('hidden');

  const subjectOptions = _allSubjects.map(s =>
    `<option value="${s.id}" ${existing?.subjectId === s.id ? 'selected' : ''}>${escHtml(s.name)}</option>`
  ).join('');

  const categoryOptions = CATEGORY_PRESETS.map(c =>
    `<option value="${c}" ${existing?.category === c ? 'selected' : ''}>${c}</option>`
  ).join('');

  bodyEl.innerHTML = `
    <div class="form-group">
      <label class="form-label">اسم الدرس / الموضوع *</label>
      <input type="text" class="form-input" id="plan-title" dir="auto"
        placeholder="مثال: الإحصاء 1.1" value="${escHtml(existing?.title || '')}">
      <span class="form-error" id="title-error">يرجى إدخال اسم الدرس.</span>
    </div>
    <div class="form-group">
      <label class="form-label">التصنيف / القسم</label>
      <select class="form-select" id="plan-category">
        ${categoryOptions}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">المادة المرتبطة (اختياري — لتفعيل إضافة الفلاش كاردز)</label>
      <select class="form-select" id="plan-subject">
        <option value="">بدون ربط</option>
        ${subjectOptions}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">الصفحات / ملاحظات</label>
      <input type="text" class="form-input" id="plan-pages" dir="auto"
        placeholder="مثال: pages from 1-7" value="${escHtml(existing?.pages || '')}">
    </div>
    ${!isEdit ? `
    <p class="text-muted text-xs mb-4">
      سيتم جدولة 5 مراجعات تلقائياً بعد 1، 3، 7، 21، 40 يوماً من اليوم — ويمكنك تعديل أي تاريخ لاحقاً من نفس البطاقة.
    </p>` : ''}
    <div style="display:flex;gap:var(--s4);justify-content:flex-end;">
      <button class="btn btn-ghost" id="cancel-plan-btn">إلغاء</button>
      <button class="btn btn-primary" id="save-plan-btn">${isEdit ? '💾 حفظ' : '✅ إضافة'}</button>
    </div>
  `;

  setTimeout(() => bodyEl.querySelector('#plan-title')?.focus(), 50);

  const close = () => {
    backdrop.classList.add('hidden');
    closeBtn.removeEventListener('click', close);
  };
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); }, { once: true });
  bodyEl.querySelector('#cancel-plan-btn').addEventListener('click', close);

  bodyEl.querySelector('#save-plan-btn').addEventListener('click', async () => {
    const title    = bodyEl.querySelector('#plan-title').value.trim();
    const category = bodyEl.querySelector('#plan-category').value;
    const subjectId = bodyEl.querySelector('#plan-subject').value || null;
    const pages    = bodyEl.querySelector('#plan-pages').value.trim();
    const errEl    = bodyEl.querySelector('#title-error');

    if (!title) { errEl.classList.add('visible'); return; }
    errEl.classList.remove('visible');

    if (isEdit) {
      existing.title     = title;
      existing.category  = category;
      existing.subjectId = subjectId;
      existing.pages     = pages;
      await plansDB.save(existing);
    } else {
      const createdAt = todayStr();
      const plan = {
        id: uid(),
        title, category, subjectId, pages,
        createdAt,
        reviews: DEFAULT_OFFSETS.map((offset, i) => ({
          id: uid(),
          n: i + 1,
          offsetDays: offset,
          dueDate: addDays(createdAt, offset),
          done: false,
          completedAt: null,
        })),
      };
      await plansDB.save(plan);
      _allPlans.unshift(plan);
    }

    close();
    renderUI(container);
    showToast(isEdit ? 'تم تعديل الدرس' : 'تم إضافة الدرس وجدولة مراجعاته', 'success');
  });
}

/* ─── Quick "add flashcard" modal, launched from a lesson ────
 * Same manual-card flow as the subject page's flashcard tab — this does
 * NOT replace or remove that page; it's simply a convenient shortcut so
 * cards can be added directly while working on a specific lesson.
 * ──────────────────────────────────────────────────────────── */
function openQuickCardModal(container, plan) {
  const backdrop = document.getElementById('modal-form');
  const titleEl  = document.getElementById('modal-form-title');
  const bodyEl   = document.getElementById('modal-form-body');
  const closeBtn = document.getElementById('modal-form-close');

  const isEnglish = plan.category === 'إنجليزي';
  titleEl.textContent = `إضافة بطاقة — ${plan.title}`;
  backdrop.classList.remove('hidden');

  bodyEl.innerHTML = `
    <div class="form-group">
      <label class="form-label">${isEnglish ? 'الكلمة / العبارة الإنجليزية *' : 'الوجه (السؤال) *'}</label>
      <textarea class="form-textarea" id="qc-front" rows="2" dir="auto"></textarea>
      <span class="form-error" id="qc-front-error">مطلوب.</span>
    </div>
    ${isEnglish ? `
      <div style="display:flex;gap:var(--s3);margin-bottom:var(--s5);">
        <button class="btn btn-secondary btn-sm" id="qc-ai-btn" type="button">✨ توليد ترجمة ومثال بالذكاء الاصطناعي</button>
      </div>
      <div class="form-group">
        <label class="form-label">الترجمة</label>
        <input type="text" class="form-input" id="qc-translation" dir="auto">
      </div>
      <div class="form-group">
        <label class="form-label">مثال عملي (إنجليزي)</label>
        <textarea class="form-textarea" id="qc-example" rows="2" dir="ltr"></textarea>
      </div>
    ` : `
      <div class="form-group">
        <label class="form-label">الظهر (الإجابة) *</label>
        <textarea class="form-textarea" id="qc-back" rows="3" dir="auto"></textarea>
        <span class="form-error" id="qc-back-error">مطلوب.</span>
      </div>
    `}
    <div style="display:flex;gap:var(--s4);justify-content:flex-end;">
      <button class="btn btn-ghost" id="qc-cancel">إلغاء</button>
      <button class="btn btn-primary" id="qc-save">✅ إضافة</button>
    </div>
  `;

  const close = () => { backdrop.classList.add('hidden'); closeBtn.removeEventListener('click', close); };
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); }, { once: true });
  bodyEl.querySelector('#qc-cancel').addEventListener('click', close);

  bodyEl.querySelector('#qc-ai-btn')?.addEventListener('click', async () => {
    const word = bodyEl.querySelector('#qc-front').value.trim();
    if (!word) { showToast('اكتب الكلمة أولاً', 'warning'); return; }
    const apiKey = await settings.get('geminiApiKey');
    if (!apiKey) { showToast('أدخل مفتاح Gemini API في الإعدادات أولاً', 'warning'); return; }
    const btn = bodyEl.querySelector('#qc-ai-btn');
    btn.disabled = true; btn.textContent = '⏳ جاري التوليد…';
    try {
      const insight = await generateWordInsight(apiKey, word);
      bodyEl.querySelector('#qc-translation').value = insight.translation;
      bodyEl.querySelector('#qc-example').value = insight.example;
      showToast('تم توليد الترجمة والمثال', 'success');
    } catch (err) {
      showToast(err.message, 'error', 6000);
    } finally {
      btn.disabled = false; btn.textContent = '✨ توليد ترجمة ومثال بالذكاء الاصطناعي';
    }
  });

  bodyEl.querySelector('#qc-save').addEventListener('click', async () => {
    const front = bodyEl.querySelector('#qc-front').value.trim();
    if (!front) { bodyEl.querySelector('#qc-front-error').classList.add('visible'); return; }

    let card;
    if (isEnglish) {
      const translation = bodyEl.querySelector('#qc-translation').value.trim();
      const example      = bodyEl.querySelector('#qc-example').value.trim();
      card = buildCard({
        front, subjectId: plan.subjectId, category: 'إنجليزي',
        back: translation, translation, example,
      });
    } else {
      const back = bodyEl.querySelector('#qc-back').value.trim();
      if (!back) { bodyEl.querySelector('#qc-back-error').classList.add('visible'); return; }
      card = buildCard({ front, back, subjectId: plan.subjectId, category: plan.category || 'عام' });
    }

    await cardsDB.save(card);
    await refreshSubjectCardCount(plan.subjectId);
    close();
    showToast('تمت إضافة البطاقة إلى المادة المرتبطة بالدرس', 'success');
  });
}
