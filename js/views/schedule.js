/**
 * schedule.js — Upcoming review schedule with date editing and completion toggle
 */

import { flashcards as cardsDB, subjects as subjectsDB } from '../db.js';
import { showToast, formatDate, todayStr, escHtml } from '../utils/helpers.js';

export async function renderSchedule(container) {
  container.innerHTML = `<div class="flex-center" style="padding:var(--s10)"><div class="spinner"></div></div>`;

  const [allCards, allSubjects] = await Promise.all([
    cardsDB.getAll(),
    subjectsDB.getAll(),
  ]);

  const subjectMap = Object.fromEntries(allSubjects.map(s => [s.id, s]));
  const today = todayStr();

  // Sort: overdue first, then by date ascending
  const sorted = [...allCards]
    .filter(c => c.nextReview)
    .sort((a, b) => a.nextReview.localeCompare(b.nextReview));

  const overdue  = sorted.filter(c => c.nextReview < today);
  const dueToday = sorted.filter(c => c.nextReview === today);
  const upcoming = sorted.filter(c => c.nextReview > today);

  container.innerHTML = `
    <div class="page-hd">
      <div class="page-hd-text">
        <h2>جدولة المراجعات</h2>
        <p>جميع البطاقات المجدولة مع إمكانية تعديل التواريخ</p>
      </div>
      <div style="display:flex;gap:var(--s4);flex-wrap:wrap;">
        <select class="form-select" id="filter-subject" style="min-width:160px;">
          <option value="">جميع المواد</option>
          ${allSubjects.map(s => `<option value="${s.id}">${escHtml(s.name)}</option>`).join('')}
        </select>
        <select class="form-select" id="filter-period" style="min-width:140px;">
          <option value="all">جميع المراجعات</option>
          <option value="overdue">متأخرة فقط</option>
          <option value="today">اليوم فقط</option>
          <option value="week">هذا الأسبوع</option>
          <option value="month">هذا الشهر</option>
        </select>
      </div>
    </div>

    <!-- Summary -->
    <div class="stat-grid" style="margin-bottom:var(--s7);">
      <div class="stat-card">
        <div class="stat-icon stat-icon-purple">📅</div>
        <div>
          <div class="stat-val" style="color:var(--danger)">${overdue.length}</div>
          <div class="stat-lbl">بطاقات متأخرة</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon stat-icon-gold">🎯</div>
        <div>
          <div class="stat-val">${dueToday.length}</div>
          <div class="stat-lbl">مستحقة اليوم</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon stat-icon-green">📆</div>
        <div>
          <div class="stat-val">${upcoming.length}</div>
          <div class="stat-lbl">مجدولة قادماً</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon stat-icon-blue">🃏</div>
        <div>
          <div class="stat-val">${allCards.length}</div>
          <div class="stat-lbl">إجمالي البطاقات</div>
        </div>
      </div>
    </div>

    <div id="schedule-table-wrap">
      ${renderTable(sorted, subjectMap, today)}
    </div>
  `;

  bindScheduleEvents(container, sorted, subjectMap, today, allSubjects);
}

function renderTable(cards, subjectMap, today) {
  if (cards.length === 0) {
    return `<div class="empty-state">
      <div class="empty-icon">📅</div>
      <h3 class="empty-title">لا توجد بطاقات مجدولة</h3>
      <p class="empty-sub">أضف مواد وارفع ملفات لبدء المراجعة</p>
    </div>`;
  }

  const rows = cards.map(card => {
    const subject  = subjectMap[card.subjectId];
    const subColor = subject?.color || '#7C3AED';
    const subName  = subject?.name  || 'غير معروف';
    const isOverdue = card.nextReview < today;
    const isToday   = card.nextReview === today;
    const isDone    = !!card.doneToday;

    let rowClass = '';
    if (isOverdue) rowClass = 'schedule-row-overdue';
    if (isToday)   rowClass = 'schedule-row-today';

    const stageLabel = ['جديدة','م1','م2','م3','م4','م5','متقنة'][Math.min(card.stage||0, 6)];

    return `
      <tr class="${rowClass}" data-card-id="${card.id}">
        <td>
          <div style="display:flex;align-items:center;gap:var(--s3);">
            <button class="done-toggle ${isDone ? 'checked' : ''}" data-id="${card.id}" title="تحديد كمراجع">
              ${isDone ? '✓' : ''}
            </button>
            <span style="${isDone ? 'text-decoration:line-through;opacity:.5;' : ''}">${escHtml(card.front.slice(0,60))}${card.front.length>60?'…':''}</span>
          </div>
        </td>
        <td>
          <span style="display:inline-flex;align-items:center;gap:var(--s2);">
            <span style="width:10px;height:10px;border-radius:50%;background:${subColor};flex-shrink:0;"></span>
            ${escHtml(subName)}
          </span>
        </td>
        <td>
          <span class="stage-badge">${stageLabel}</span>
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:var(--s3);">
            <input type="date" class="date-input-inline date-edit"
              value="${card.nextReview || today}"
              data-id="${card.id}"
              title="تعديل تاريخ المراجعة">
            ${isOverdue ? '<span style="color:var(--danger);font-size:.75rem;">متأخرة</span>' : ''}
            ${isToday   ? '<span style="color:var(--primary);font-size:.75rem;">اليوم</span>' : ''}
          </div>
        </td>
        <td style="color:var(--text3);font-size:.82rem;">
          ${card.reviewCount || 0} مرة
        </td>
        <td style="color:var(--text3);font-size:.82rem;">
          ${card.reviewCount > 0 ? Math.round((card.correctCount||0)/card.reviewCount*100)+'%' : '—'}
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div style="overflow-x:auto;">
      <table class="schedule-table">
        <thead>
          <tr>
            <th>البطاقة</th>
            <th>المادة</th>
            <th>المرحلة</th>
            <th>موعد المراجعة</th>
            <th>المراجعات</th>
            <th>الدقة</th>
          </tr>
        </thead>
        <tbody id="schedule-tbody">
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

function bindScheduleEvents(container, allCards, subjectMap, today, allSubjects) {
  let currentCards = [...allCards];

  // Date edit
  container.addEventListener('change', async (e) => {
    const input = e.target.closest('.date-edit');
    if (!input) return;
    const id      = input.dataset.id;
    const newDate = input.value;
    if (!newDate) return;
    const card = await cardsDB.getById(id);
    if (!card) return;
    await cardsDB.save({ ...card, nextReview: newDate });
    showToast('تم تعديل تاريخ المراجعة', 'success');
    // Update local array
    const idx = currentCards.findIndex(c => c.id === id);
    if (idx !== -1) currentCards[idx] = { ...currentCards[idx], nextReview: newDate };
  });

  // Done toggle
  container.addEventListener('click', async (e) => {
    const btn = e.target.closest('.done-toggle');
    if (!btn) return;
    const id   = btn.dataset.id;
    const card = await cardsDB.getById(id);
    if (!card) return;
    const isDone = !card.doneToday;
    await cardsDB.save({ ...card, doneToday: isDone });
    btn.classList.toggle('checked', isDone);
    btn.textContent = isDone ? '✓' : '';
    const row = btn.closest('tr');
    const textSpan = row?.querySelector('td:first-child span:last-child');
    if (textSpan) {
      textSpan.style.textDecoration = isDone ? 'line-through' : '';
      textSpan.style.opacity        = isDone ? '.5' : '';
    }
  });

  // Filters
  const subjectFilter = container.querySelector('#filter-subject');
  const periodFilter  = container.querySelector('#filter-period');

  function applyFilters() {
    const subjectId = subjectFilter.value;
    const period    = periodFilter.value;
    const now       = new Date(); now.setHours(0,0,0,0);
    const weekEnd   = new Date(now); weekEnd.setDate(now.getDate() + 7);
    const monthEnd  = new Date(now); monthEnd.setMonth(now.getMonth() + 1);

    let filtered = [...allCards];
    if (subjectId) filtered = filtered.filter(c => c.subjectId === subjectId);
    if (period === 'overdue') filtered = filtered.filter(c => c.nextReview < today);
    if (period === 'today')   filtered = filtered.filter(c => c.nextReview === today);
    if (period === 'week')    filtered = filtered.filter(c => c.nextReview >= today && c.nextReview <= weekEnd.toISOString().slice(0,10));
    if (period === 'month')   filtered = filtered.filter(c => c.nextReview >= today && c.nextReview <= monthEnd.toISOString().slice(0,10));

    const wrap = container.querySelector('#schedule-table-wrap');
    if (wrap) { wrap.innerHTML = renderTable(filtered, subjectMap, today); }
  }

  subjectFilter?.addEventListener('change', applyFilters);
  periodFilter?.addEventListener('change', applyFilters);
}
