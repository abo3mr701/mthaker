/**
 * calendar.js — قسم "التقويم"
 *
 * تقويم شهري موحّد (بروح Google Calendar المبسّطة) يجمع كل شيء له تاريخ
 * بمذاكر في مكان واحد:
 *  - 🃏 بطاقات مراجعة مستحقة (nextReview)
 *  - 🗓️ نقاط مراجعة الدروس (خطط المراجعة)
 *  - 📖 كلمات إنجليزية مستحقة
 *  - 🍅 جلسات بومودورو المكتملة (نشاط الأيام الماضية)
 *
 * الأيام القادمة تعرض "المستحق"، والأيام الماضية تعرض "النشاط الفعلي".
 */

import { flashcards as cardsDB, reviewPlans as plansDB, englishCards as engCardsDB, sessions as pomodoroDB, history as historyDB, subjects as subjectsDB } from '../db.js';
import { escHtml } from '../utils/helpers.js';

const WEEKDAYS = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
const MONTH_NAMES = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

let S = null; // { viewYear, viewMonth (0-11), byDate: Map, subjectsById }

export async function renderCalendar(container) {
  container.innerHTML = `<div class="flex-center" style="padding:var(--s10)"><div class="spinner"></div></div>`;

  const now = new Date();
  if (!S) S = { viewYear: now.getFullYear(), viewMonth: now.getMonth() };

  await loadData();
  paint(container);
}

/* ─── Aggregate every dated item in the app into a single map ────
 * key = 'YYYY-MM-DD' → { due: {cards,plans:[],english}, activity: {pomodoro,pomodoroMin,reviews} }
 * ──────────────────────────────────────────────────────────────── */
async function loadData() {
  const [cards, plans, engCards, sessions, reviewHistory, subjects] = await Promise.all([
    cardsDB.getAll(),
    plansDB.getAll(),
    engCardsDB.getAll(),
    pomodoroDB.getAll(),
    historyDB.getAll(),
    subjectsDB.getAll(),
  ]);

  const byDate = new Map();
  const bucket = (date) => {
    if (!byDate.has(date)) byDate.set(date, { cards: [], plans: [], english: 0, pomodoro: 0, pomodoroMin: 0, reviewsDone: 0 });
    return byDate.get(date);
  };

  cards.forEach(c => {
    if (!c.nextReview) return;
    bucket(c.nextReview).cards.push(c);
  });

  plans.forEach(p => {
    (p.reviews || []).forEach((r, i) => {
      if (r.done || !r.dueDate) return;
      bucket(r.dueDate).plans.push({ planId: p.id, title: p.title, reviewIndex: i + 1 });
    });
  });

  engCards.forEach(c => {
    if (!c.dueDate) return;
    const day = c.dueDate.slice(0, 10);
    bucket(day).english += 1;
  });

  sessions.forEach(s => {
    if (!s.completed || !s.date) return;
    const b = bucket(s.date);
    b.pomodoro += 1;
    b.pomodoroMin += Math.round((s.durationMs || 0) / 60000);
  });

  reviewHistory.forEach(h => {
    if (!h.reviewedAt) return;
    const day = h.reviewedAt.slice(0, 10);
    bucket(day).reviewsDone += 1;
  });

  S.byDate = byDate;
  S.subjectsById = new Map(subjects.map(s => [s.id, s]));
}

function dateKey(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function paint(container) {
  const { viewYear, viewMonth } = S;
  const todayKey = dateKey(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startWeekday = firstOfMonth.getDay(); // 0 = Sunday
  const daysInMonth  = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;

  const cells = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - startWeekday + 1;
    let y = viewYear, m = viewMonth, d = dayNum, faded = false;
    if (dayNum < 1) { m = viewMonth - 1; d = daysInPrevMonth + dayNum; faded = true; if (m < 0) { m = 11; y -= 1; } }
    else if (dayNum > daysInMonth) { m = viewMonth + 1; d = dayNum - daysInMonth; faded = true; if (m > 11) { m = 0; y += 1; } }
    cells.push({ y, m, d, faded, key: dateKey(y, m, d) });
  }

  container.innerHTML = `
    <div class="page-hd">
      <div class="page-hd-text">
        <h2>التقويم</h2>
        <p>كل مواعيد المراجعة والمذاكرة بمكان واحد — القادم يعرض المستحق، والماضي يعرض نشاطك الفعلي</p>
      </div>
      <div class="flex gap-3 wrap">
        <button class="btn btn-secondary btn-sm" id="cal-today-btn">اليوم</button>
        <button class="btn btn-secondary btn-sm btn-icon-only" id="cal-prev-btn">›</button>
        <button class="btn btn-secondary btn-sm btn-icon-only" id="cal-next-btn">‹</button>
      </div>
    </div>

    <h3 class="cal-month-title">${MONTH_NAMES[viewMonth]} ${viewYear}</h3>

    <div class="cal-legend">
      <span class="cal-legend-item"><i class="cal-dot cal-dot-cards"></i> بطاقات مستحقة</span>
      <span class="cal-legend-item"><i class="cal-dot cal-dot-plans"></i> مراجعة درس</span>
      <span class="cal-legend-item"><i class="cal-dot cal-dot-eng"></i> كلمات إنجليزية</span>
      <span class="cal-legend-item"><i class="cal-dot cal-dot-pomo"></i> بومودورو</span>
    </div>

    <div class="cal-grid cal-grid-head">
      ${WEEKDAYS.map(w => `<div class="cal-weekday">${w}</div>`).join('')}
    </div>
    <div class="cal-grid" id="cal-grid">
      ${cells.map(c => renderDayCell(c, todayKey)).join('')}
    </div>

    <div id="cal-day-detail"></div>
  `;

  container.querySelector('#cal-prev-btn').addEventListener('click', () => changeMonth(container, -1));
  container.querySelector('#cal-next-btn').addEventListener('click', () => changeMonth(container, 1));
  container.querySelector('#cal-today-btn').addEventListener('click', () => {
    const now = new Date();
    S.viewYear = now.getFullYear();
    S.viewMonth = now.getMonth();
    paint(container);
  });

  container.querySelectorAll('.cal-day').forEach(cell => {
    cell.addEventListener('click', () => showDayDetail(container, cell.dataset.key));
  });

  // Auto-open today's detail on first load of the current month
  if (cells.some(c => c.key === todayKey)) {
    showDayDetail(container, todayKey);
  }
}

function changeMonth(container, delta) {
  S.viewMonth += delta;
  if (S.viewMonth < 0) { S.viewMonth = 11; S.viewYear -= 1; }
  if (S.viewMonth > 11) { S.viewMonth = 0; S.viewYear += 1; }
  paint(container);
}

function renderDayCell(cell, todayKey) {
  const data = S.byDate.get(cell.key);
  const isToday = cell.key === todayKey;
  const isFuture = cell.key >= todayKey;

  let dotsHtml = '';
  if (data) {
    if (isFuture) {
      if (data.cards.length) dotsHtml += `<span class="cal-pill cal-pill-cards">🃏${data.cards.length}</span>`;
      if (data.plans.length) dotsHtml += `<span class="cal-pill cal-pill-plans">🗓️${data.plans.length}</span>`;
      if (data.english)      dotsHtml += `<span class="cal-pill cal-pill-eng">📖${data.english}</span>`;
    } else {
      if (data.pomodoro)    dotsHtml += `<span class="cal-pill cal-pill-pomo">🍅${data.pomodoro}</span>`;
      if (data.reviewsDone) dotsHtml += `<span class="cal-pill cal-pill-cards">✅${data.reviewsDone}</span>`;
    }
  }

  return `
    <div class="cal-day ${cell.faded ? 'faded' : ''} ${isToday ? 'today' : ''}" data-key="${cell.key}">
      <span class="cal-day-num">${cell.d}</span>
      <div class="cal-day-dots">${dotsHtml}</div>
    </div>
  `;
}

function showDayDetail(container, key) {
  const panel = container.querySelector('#cal-day-detail');
  if (!panel) return;

  const data = S.byDate.get(key) || { cards: [], plans: [], english: 0, pomodoro: 0, pomodoroMin: 0, reviewsDone: 0 };
  const d = new Date(key);
  const label = d.toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const today = new Date(); today.setHours(0,0,0,0);
  const isFuture = d >= today;

  const cardsBySubject = {};
  data.cards.forEach(c => {
    const name = S.subjectsById.get(c.subjectId)?.name || 'بدون مادة';
    cardsBySubject[name] = (cardsBySubject[name] || 0) + 1;
  });

  panel.innerHTML = `
    <div class="card" style="margin-top:var(--s6);">
      <h3 style="font-size:1.05rem;font-weight:700;margin-bottom:var(--s5);">${label}</h3>

      ${isFuture ? `
        ${data.cards.length ? `
          <div class="cal-detail-row">
            <span class="cal-dot cal-dot-cards"></span>
            <div>
              <b>${data.cards.length} بطاقة مراجعة مستحقة</b>
              <p class="text-muted text-sm">${Object.entries(cardsBySubject).map(([n, c]) => `${escHtml(n)} (${c})`).join('، ')}</p>
            </div>
            <a href="#study" class="btn btn-sm btn-secondary">افتح ←</a>
          </div>` : ''}
        ${data.plans.length ? `
          <div class="cal-detail-row">
            <span class="cal-dot cal-dot-plans"></span>
            <div>
              <b>${data.plans.length} مراجعة درس</b>
              <p class="text-muted text-sm">${data.plans.map(p => `${escHtml(p.title)} (مراجعة ${p.reviewIndex})`).join('، ')}</p>
            </div>
            <a href="#reviews" class="btn btn-sm btn-secondary">افتح ←</a>
          </div>` : ''}
        ${data.english ? `
          <div class="cal-detail-row">
            <span class="cal-dot cal-dot-eng"></span>
            <div><b>${data.english} كلمة إنجليزية مستحقة</b></div>
            <a href="#english" class="btn btn-sm btn-secondary">افتح ←</a>
          </div>` : ''}
        ${!data.cards.length && !data.plans.length && !data.english ? `<p class="text-muted text-sm">ما فيه شيء مستحق هذا اليوم 🎉</p>` : ''}
      ` : `
        ${data.pomodoro ? `
          <div class="cal-detail-row">
            <span class="cal-dot cal-dot-pomo"></span>
            <div><b>${data.pomodoro} جلسة بومودورو</b><p class="text-muted text-sm">${data.pomodoroMin} دقيقة تركيز</p></div>
          </div>` : ''}
        ${data.reviewsDone ? `
          <div class="cal-detail-row">
            <span class="cal-dot cal-dot-cards"></span>
            <div><b>${data.reviewsDone} مراجعة بطاقة تمت</b></div>
          </div>` : ''}
        ${!data.pomodoro && !data.reviewsDone ? `<p class="text-muted text-sm">ما فيه نشاط مسجّل هذا اليوم.</p>` : ''}
      `}
    </div>
  `;

  container.querySelectorAll('.cal-day').forEach(c => c.classList.toggle('selected', c.dataset.key === key));
}
