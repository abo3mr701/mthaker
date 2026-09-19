/**
 * reviews.js — "المراجعات": خطط مراجعة الدروس (مستقلة تماماً عن الفلاش كاردز)
 *
 * كل "خطة" تمثّل درساً/موضوعاً يحتاج مراجعته على دفعات متباعدة (1، 3، 7، 21، 40 يوماً).
 * كل خطة يمكن ربطها اختيارياً بمادة موجودة — وحينها يظهر زر "إضافة بطاقات" الذي يفتح
 * نفس نافذة إضافة الفلاش كاردز اليدوية (دون حذف أو التأثير على إمكانية إضافتها بشكل منفصل
 * من صفحة المادة نفسها).
 */

import { reviewPlans as plansDB, subjects as subjectsDB, flashcards as cardsDB, settings } from '../db.js';
import { buildCard, processReview } from '../services/srs.js';
import { uid, showToast, showConfirm, escHtml, todayStr, addDays } from '../utils/helpers.js';
import { refreshSubjectCardCount } from './subjects.js';

const DEFAULT_OFFSETS = [1, 3, 7, 21, 40];
const DEFAULT_MAX_DAILY = 10;

let _allPlans = [];
let _allSubjects = [];
let _allCards = [];
let _filterMode = 'all'; // 'all' | 'today' | 'overdue'
let _maxDaily = DEFAULT_MAX_DAILY;

export async function renderReviews(container) {
  container.innerHTML = `<div class="flex-center" style="padding:var(--s10)"><div class="spinner"></div></div>`;

  try {
    [_allPlans, _allSubjects, _allCards, _maxDaily] = await Promise.all([
      plansDB.getAll(),
      subjectsDB.getAll(),
      cardsDB.getAll(),
      loadMaxDaily(),
    ]);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p class="text-danger">خطأ: ${err.message}</p></div>`;
    return;
  }

  _allPlans.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  renderUI(container);
}

async function loadMaxDaily() {
  const val = await settings.get('reviewsMaxDaily');
  return Number.isFinite(val) && val > 0 ? val : DEFAULT_MAX_DAILY;
}

// كل "مراجعة" (checkpoint) غير منجزة عبر كل الدروس — تُصنّف اليوم/فائتة
function collectReviewItems() {
  const today = todayStr();
  const todayItems = [];
  const overdueItems = [];

  _allPlans.forEach(plan => {
    (plan.reviews || []).forEach((r, i) => {
      if (r.done) return;
      const item = { plan, review: r, index: i };
      if (r.dueDate === today) todayItems.push(item);
      else if (r.dueDate < today) overdueItems.push(item);
    });
  });

  // الأولوية للفائتة: الأقدم أولاً (أطول انتظار = أولوية أعلى)
  overdueItems.sort((a, b) => a.review.dueDate.localeCompare(b.review.dueDate));

  return { todayItems, overdueItems };
}

function renderUI(container) {
  const { todayItems, overdueItems } = collectReviewItems();
  const todayCount   = todayItems.length;
  const overdueCount = overdueItems.length;

  let visiblePlans;
  let cappedNote = '';
  if (_filterMode === 'today' || _filterMode === 'overdue') {
    const items = _filterMode === 'today' ? todayItems : overdueItems;
    const capped = items.slice(0, _maxDaily);
    const planIds = new Set(capped.map(it => it.plan.id));
    visiblePlans = _allPlans.filter(p => planIds.has(p.id));
    if (items.length > _maxDaily) {
      cappedNote = `⏳ عرض ${_maxDaily} من أصل ${items.length} — ارفع "الحد اليومي" لعرض المزيد.`;
    }
  } else {
    visiblePlans = _allPlans;
  }

  container.innerHTML = `
    <div class="page-hd">
      <div class="page-hd-text">
        <h2>المراجعات</h2>
        <p>${_allPlans.length ? `${_allPlans.length} خطة مراجعة` : 'خطط مراجعة الدروس — مستقلة عن البطاقات التعليمية'}</p>
      </div>
      <button class="btn btn-primary" id="btn-new-plan">➕ درس جديد للمراجعة</button>
    </div>

    <div class="max-daily-box" id="reviews-max-daily-box">
      <span class="max-daily-lbl">🎚️ الحد اليومي للمراجعات</span>
      <input type="number" id="reviews-max-daily-input" class="max-daily-input" min="1" step="1" value="${_maxDaily}">
      <button class="btn btn-sm btn-secondary" id="reviews-max-daily-save">حفظ</button>
      ${cappedNote ? `<span class="max-daily-note">${cappedNote}</span>` : ''}
    </div>

    <div class="flex gap-3 wrap" style="margin-bottom:var(--s6);">
      <button class="btn ${_filterMode === 'all' ? 'btn-primary' : 'btn-secondary'}" data-filter="all">📋 الكل (${_allPlans.length})</button>
      <button class="btn ${_filterMode === 'today' ? 'btn-warning-active' : 'btn-secondary'}" data-filter="today">📅 اليوم (${todayCount})</button>
      <button class="btn ${_filterMode === 'overdue' ? 'btn-danger' : 'btn-secondary'}" data-filter="overdue">⚠️ الفائتة (${overdueCount})</button>
    </div>

    <div class="review-plan-grid" id="plans-grid">
      ${visiblePlans.length === 0
        ? (_filterMode !== 'all'
            ? `<div class="empty-state" style="grid-column:1/-1;"><div class="empty-icon">✅</div><h3 class="empty-title">${_filterMode === 'today' ? 'ما فيه شي مستحق اليوم' : 'ما فيه مراجعات فائتة 🎉'}</h3></div>`
            : emptyState())
        : visiblePlans.map(p => renderPlanCard(p)).join('')
      }
    </div>
  `;

  container.querySelector('#btn-new-plan')?.addEventListener('click', () => openPlanModal(container));
  container.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      _filterMode = btn.dataset.filter;
      renderUI(container);
    });
  });
  container.querySelector('#reviews-max-daily-save')?.addEventListener('click', async () => {
    const val = Math.max(1, parseInt(container.querySelector('#reviews-max-daily-input').value, 10) || DEFAULT_MAX_DAILY);
    _maxDaily = val;
    await settings.set('reviewsMaxDaily', val);
    showToast('تم تحديث الحد اليومي للمراجعات', 'success');
    renderUI(container);
  });
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

function isCardDue(c) {
  return !c.nextReview || c.nextReview <= todayStr();
}

/* ─── Plan card markup (matches the requested design) ─────── */
function renderPlanCard(plan) {
  const reviews  = plan.reviews || [];
  const doneCnt  = reviews.filter(r => r.done).length;
  const pct      = reviews.length ? Math.round((doneCnt / reviews.length) * 100) : 0;
  const subject  = plan.subjectId ? _allSubjects.find(s => s.id === plan.subjectId) : null;

  const linkedCards  = _allCards.filter(c => c.planId === plan.id);
  const pendingCards = linkedCards.filter(isCardDue);
  const isLocked = pendingCards.length > 0;

  const boxes = reviews.map((r, i) => {
    const rel = relativeDayLabel(plan.createdAt, r.dueDate);
    const today = todayStr();
    const isOverdue  = !r.done && r.dueDate < today;
    const isDueToday = !r.done && r.dueDate === today;
    return `
      <div class="review-box ${r.done ? 'done' : ''} ${isDueToday ? 'due-today' : ''} ${isOverdue ? 'overdue' : ''}" data-review-id="${r.id}">
        <button class="review-box-check ${isLocked && !r.done ? 'locked' : ''}" data-action="toggle-review" data-plan="${plan.id}" data-review="${r.id}"
          aria-label="تمت المراجعة ${i + 1}" ${isLocked && !r.done ? 'disabled title="أنهِ بطاقات الدرس أولاً"' : ''}>${r.done ? '✓' : ''}</button>
        <div class="review-box-num">المراجعة ${i + 1}${isDueToday ? ' 🔶' : ''}${isOverdue ? ' ⚠️' : ''}</div>
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

      ${linkedCards.length > 0 ? `
        <div class="plan-cards-banner ${isLocked ? 'locked' : 'clear'}">
          <span>${isLocked
            ? `📇 عندك ${pendingCards.length} بطاقة فلاش كاردز مستحقة بهذا الدرس — أنهِها قبل ما تقدر تحدّد أي مراجعة كمكتملة.`
            : `✅ كل بطاقات هذا الدرس (${linkedCards.length}) منتهية اليوم.`}</span>
          <button class="btn btn-sm ${isLocked ? 'btn-primary' : 'btn-secondary'}" data-action="review-cards" data-plan="${plan.id}">
            🃏 ${isLocked ? `راجع البطاقات (${pendingCards.length})` : 'مراجعة البطاقات مرة أخرى'}
          </button>
        </div>
      ` : ''}

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

    const reviewCardsBtn = e.target.closest('[data-action="review-cards"]');
    if (reviewCardsBtn) {
      const plan = _allPlans.find(p => p.id === reviewCardsBtn.dataset.plan);
      if (plan) openLessonCardsSession(container, plan);
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

  // Defensive re-check: block completing a review while linked flashcards
  // are still pending, even if the click somehow reached a "disabled" button.
  if (!rev.done) {
    const stillPending = _allCards.some(c => c.planId === plan.id && isCardDue(c));
    if (stillPending) {
      showToast('أنهِ بطاقات الفلاش كاردز الخاصة بهذا الدرس أولاً', 'warning');
      return;
    }
  }

  rev.done = !rev.done;
  rev.completedAt = rev.done ? new Date().toISOString() : null;
  await plansDB.save(plan);
  renderUI(container);
  showToast(rev.done ? 'تم تسجيل المراجعة ✓' : 'تم إلغاء التحديد', 'success', 1800);
}

/* ─── Mini review session for a lesson's linked flashcards ─────────
 * Launched from the "🃏 راجع البطاقات" button on a plan card. Goes through
 * every flashcard linked to this specific lesson (not the whole subject,
 * and not limited by the general daily cap), using the normal SRS grading
 * (processReview) so scheduling stays consistent with "بطاقات المراجعة".
 * Once all of them are cleared, the plan's checkboxes unlock automatically.
 * ──────────────────────────────────────────────────────────────── */
function openLessonCardsSession(container, plan) {
  const cards = _allCards.filter(c => c.planId === plan.id && isCardDue(c));
  if (cards.length === 0) { renderUI(container); return; }

  let index = 0;
  let flipped = false;

  function showCard() {
    if (index >= cards.length) { finish(); return; }
    const card = cards[index];
    flipped = false;
    container.innerHTML = `
      <div class="page-hd">
        <div class="page-hd-text">
          <h2>🃏 بطاقات درس: ${escHtml(plan.title)}</h2>
          <p>بطاقة ${index + 1} من ${cards.length}</p>
        </div>
        <button class="btn btn-secondary" id="lesson-session-exit">← رجوع للمراجعات</button>
      </div>
      <div class="study-progress-bar" style="margin-bottom:var(--s6);">
        <div class="study-progress-fill" style="width:${Math.round((index / cards.length) * 100)}%"></div>
      </div>
      <div class="study-scene" id="lesson-scene" role="button" tabindex="0">
        <div class="study-card-inner" id="lesson-card-inner">
          <div class="study-card-face study-card-front">
            <p class="study-card-text" dir="auto">${escHtml(card.front)}</p>
            <p class="study-card-hint">انقر للكشف عن الإجابة</p>
          </div>
          <div class="study-card-face study-card-back">
            <p class="study-card-text" dir="auto">${escHtml(card.back || '')}</p>
            <p class="study-card-hint">كيف كانت إجابتك؟</p>
          </div>
        </div>
      </div>
      <div class="study-actions" id="lesson-actions" style="display:none;">
        <button class="btn btn-wrong" id="lesson-btn-wrong">✗ لم أتذكر</button>
        <button class="btn btn-correct" id="lesson-btn-correct">✓ أتذكرتها</button>
      </div>
    `;

    const scene = container.querySelector('#lesson-scene');
    const inner = container.querySelector('#lesson-card-inner');
    const actions = container.querySelector('#lesson-actions');

    scene.addEventListener('click', () => {
      if (flipped) return;
      flipped = true;
      inner.classList.add('flipped');
      setTimeout(() => { actions.style.display = 'flex'; }, 300);
    });

    container.querySelector('#lesson-session-exit').addEventListener('click', () => renderUI(container));

    container.querySelector('#lesson-btn-correct').addEventListener('click', () => rate(card, true));
    container.querySelector('#lesson-btn-wrong').addEventListener('click', () => rate(card, false));
  }

  async function rate(card, correct) {
    await processReview(card, correct);
    index += 1;
    showCard();
  }

  async function finish() {
    // Re-fetch cards so due/lapse state is accurate before returning to the grid
    _allCards = await cardsDB.getAll();
    showToast('أنهيت بطاقات هذا الدرس ✓ — تقدر تحدّد المراجعة كمكتملة الآن', 'success');
    renderUI(container);
  }

  showCard();
}

// Manual date override — editable directly from the review box itself, at any time
function editReviewDate(container, dateEl) {
  const planId   = dateEl.dataset.plan;
  const reviewId = dateEl.dataset.review;
  const plan     = _allPlans.find(p => p.id === planId);
  const rev      = plan && (plan.reviews || []).find(r => r.id === reviewId);
  if (!rev) return;

  // Opens in the shared modal (plenty of room for the native calendar
  // picker) instead of a cramped inline box — and only commits when you
  // explicitly press "حفظ", never on a stray keystroke.
  const backdrop = document.getElementById('modal-form');
  const titleEl  = document.getElementById('modal-form-title');
  const bodyEl   = document.getElementById('modal-form-body');
  const closeBtn = document.getElementById('modal-form-close');

  titleEl.textContent = `تعديل تاريخ المراجعة — ${escHtml(plan.title)}`;
  backdrop.classList.remove('hidden');
  bodyEl.innerHTML = `
    <div class="form-group">
      <label class="form-label">التاريخ الجديد</label>
      <input type="date" class="form-input" id="rev-date-input" value="${rev.dueDate}">
    </div>
    <div style="display:flex;gap:var(--s4);justify-content:flex-end;">
      <button class="btn btn-ghost" id="rev-date-cancel">إلغاء</button>
      <button class="btn btn-primary" id="rev-date-save">💾 حفظ</button>
    </div>
  `;

  const close = () => backdrop.classList.add('hidden');
  closeBtn.addEventListener('click', close, { once: true });
  bodyEl.querySelector('#rev-date-cancel').addEventListener('click', close);

  setTimeout(() => bodyEl.querySelector('#rev-date-input')?.focus(), 50);

  bodyEl.querySelector('#rev-date-save').addEventListener('click', async () => {
    const val = bodyEl.querySelector('#rev-date-input').value;
    if (!val) { showToast('اختر تاريخاً صالحاً', 'warning'); return; }
    if (val !== rev.dueDate) {
      rev.dueDate = val;
      await plansDB.save(plan);
      showToast('تم تحديث تاريخ المراجعة', 'success', 1800);
    }
    close();
    renderUI(container);
  });
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

  bodyEl.innerHTML = `
    <div class="form-group">
      <label class="form-label">اسم الدرس / الموضوع *</label>
      <input type="text" class="form-input" id="plan-title" dir="auto"
        placeholder="مثال: الإحصاء 1.1" value="${escHtml(existing?.title || '')}">
      <span class="form-error" id="title-error">يرجى إدخال اسم الدرس.</span>
    </div>
    ${!isEdit ? `
    <div class="form-group">
      <label class="form-label">تاريخ بدء الدرس</label>
      <input type="date" class="form-input" id="plan-start-date" value="${todayStr()}">
      <span class="form-hint">المراجعات الخمس تُجدوَل بناءً على هذا التاريخ (1، 3، 7، 21، 40 يوماً بعده) — تقدر تغيّر أي تاريخ لاحقاً من نفس البطاقة.</span>
    </div>` : ''}
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
    const category = 'عام';
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
      const createdAt = bodyEl.querySelector('#plan-start-date')?.value || todayStr();
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
 * English vocabulary has its own dedicated section now (see english.js),
 * so lesson-linked cards here are always general-purpose.
 * ──────────────────────────────────────────────────────────── */
function openQuickCardModal(container, plan) {
  const backdrop = document.getElementById('modal-form');
  const titleEl  = document.getElementById('modal-form-title');
  const bodyEl   = document.getElementById('modal-form-body');
  const closeBtn = document.getElementById('modal-form-close');

  titleEl.textContent = `إضافة بطاقة — ${plan.title}`;
  backdrop.classList.remove('hidden');

  bodyEl.innerHTML = `
    <div class="form-group">
      <label class="form-label">الوجه (السؤال) *</label>
      <textarea class="form-textarea" id="qc-front" rows="2" dir="auto"></textarea>
      <span class="form-error" id="qc-front-error">مطلوب.</span>
    </div>
    <div class="form-group">
      <label class="form-label">الظهر (الإجابة) *</label>
      <textarea class="form-textarea" id="qc-back" rows="3" dir="auto"></textarea>
      <span class="form-error" id="qc-back-error">مطلوب.</span>
    </div>
    <div style="display:flex;gap:var(--s4);justify-content:flex-end;">
      <button class="btn btn-ghost" id="qc-cancel">إلغاء</button>
      <button class="btn btn-primary" id="qc-save">✅ إضافة</button>
    </div>
  `;

  const close = () => { backdrop.classList.add('hidden'); closeBtn.removeEventListener('click', close); };
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); }, { once: true });
  bodyEl.querySelector('#qc-cancel').addEventListener('click', close);

  bodyEl.querySelector('#qc-save').addEventListener('click', async () => {
    const front = bodyEl.querySelector('#qc-front').value.trim();
    const back  = bodyEl.querySelector('#qc-back').value.trim();
    if (!front) { bodyEl.querySelector('#qc-front-error').classList.add('visible'); return; }
    if (!back)  { bodyEl.querySelector('#qc-back-error').classList.add('visible'); return; }

    const card = buildCard({ front, back, subjectId: plan.subjectId, category: 'عام' });
    card.planId = plan.id; // يربط البطاقة بهذا الدرس تحديداً (لبوابة "أنهِ البطاقات أولاً")

    await cardsDB.save(card);
    _allCards.push(card);
    await refreshSubjectCardCount(plan.subjectId);
    close();
    renderUI(container);
    showToast('تمت إضافة البطاقة إلى المادة المرتبطة بالدرس', 'success');
  });
}
