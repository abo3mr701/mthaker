/**
 * dashboard.js — Dashboard view
 */

import { getDashboardStats, history as historyDB, flashcards as cardsDB, reviewPlans as plansDB, englishCards as engCardsDB, settings } from '../db.js';
import { formatDate, timeAgo, arabicCount, escHtml, todayStr } from '../utils/helpers.js';
import { isDue as engIsDue } from '../services/englishSrs.js';

export async function renderDashboard(container) {
  container.innerHTML = `<div class="flex-center" style="padding:var(--s10)"><div class="spinner"></div></div>`;

  let stats, recent, duePlans, engStats;
  try {
    [stats, recent, duePlans, engStats] = await Promise.all([
      getDashboardStats(),
      historyDB.getRecent(10),
      getPlansDueToday(),
      getEnglishStats(),
    ]);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p class="text-danger">خطأ في تحميل البيانات: ${err.message}</p></div>`;
    return;
  }

  const today    = new Date().toLocaleDateString('ar-SA', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  const greeting = getGreeting();

  container.innerHTML = `
    <!-- Welcome banner -->
    <div class="welcome-banner">
      <p class="welcome-sub">${today}</p>
      <h2 class="welcome-title">${greeting}</h2>
      <div class="welcome-meta">
        <div class="welcome-meta-item">
          <div class="welcome-meta-val">${stats.dueCount}</div>
          <div>بطاقة للمراجعة اليوم</div>
        </div>
        <div class="welcome-meta-item">
          <div class="welcome-meta-val">${stats.pomodoroStats.todayCount}</div>
          <div>جلسة بومودورو اليوم</div>
        </div>
        <div class="welcome-meta-item">
          <div class="welcome-meta-val">${stats.pomodoroStats.totalHours}</div>
          <div>ساعة إجمالية</div>
        </div>
      </div>
    </div>

    <!-- Stats grid -->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-icon stat-icon-purple">📚</div>
        <div>
          <div class="stat-val">${stats.subjectCount}</div>
          <div class="stat-lbl">مادة دراسية</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon stat-icon-gold">🃏</div>
        <div>
          <div class="stat-val">${stats.cardCount}</div>
          <div class="stat-lbl">بطاقة تعليمية</div>
        </div>
      </div>
      <div class="stat-card" id="dash-due-card" style="cursor:pointer">
        <div class="stat-icon stat-icon-green">📅</div>
        <div>
          <div class="stat-val">${stats.dueCount}</div>
          <div class="stat-lbl">بطاقة مستحقة اليوم</div>
        </div>
      </div>
      <div class="stat-card" id="dash-plans-card" style="cursor:pointer">
        <div class="stat-icon stat-icon-blue">🗓️</div>
        <div>
          <div class="stat-val">${stats.planCount}</div>
          <div class="stat-lbl">خطة مراجعة دروس${stats.plansDueToday ? ` (${stats.plansDueToday} اليوم)` : ''}</div>
        </div>
      </div>
      <div class="stat-card" id="dash-english-card" style="cursor:pointer">
        <div class="stat-icon" style="background:var(--info-soft);">📖</div>
        <div>
          <div class="stat-val">${engStats.streak} 🔥</div>
          <div class="stat-lbl">سلسلة الإنجليزية${engStats.due ? ` — ${engStats.due} مستحقة` : ''}</div>
        </div>
      </div>
    </div>

    <!-- Two-column layout: recent activity + quick actions -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--s7);" class="dash-grid">

      <!-- Quick actions -->
      <div class="card">
        <h3 style="font-size:1rem;font-weight:700;margin-bottom:var(--s6);">⚡ إجراءات سريعة</h3>
        <div style="display:flex;flex-direction:column;gap:var(--s4);">
          <button class="btn btn-primary w-full" id="dash-start-review">
            🎯 ابدأ المراجعة ${stats.dueCount > 0 ? `(${stats.dueCount})` : ''}
          </button>
          <button class="btn btn-secondary w-full" id="dash-new-subject">
            ➕ مادة جديدة
          </button>
          <button class="btn btn-secondary w-full" id="dash-goto-pomodoro">
            ⏱️ مؤقت بومودورو
          </button>
          <button class="btn btn-secondary w-full" id="dash-goto-reviews">
            🗓️ خطط مراجعة الدروس
          </button>
          <button class="btn btn-secondary w-full" id="dash-goto-english">
            📖 قسم الإنجليزية${engStats.due ? ` (${engStats.due})` : ''}
          </button>
        </div>
      </div>

      <!-- Recent activity -->
      <div class="card">
        <h3 style="font-size:1rem;font-weight:700;margin-bottom:var(--s6);">📈 آخر المراجعات</h3>
        ${await renderRecentActivity(recent)}
      </div>
    </div>

    <!-- Lessons due today (المراجعات) -->
    ${duePlans.length > 0 ? `
    <div class="card" style="margin-top:var(--s7);">
      <h3 style="font-size:1rem;font-weight:700;margin-bottom:var(--s6);">🗓️ دروس تحتاج مراجعة اليوم</h3>
      <div style="display:flex;flex-direction:column;gap:var(--s3);">
        ${duePlans.map(p => `
          <a href="#reviews" class="dash-due-plan-row">
            <span>${escHtml(p.title)}</span>
            <span class="dash-due-plan-badge">مراجعة رقم ${p.dueReviewIndex}</span>
          </a>
        `).join('')}
      </div>
    </div>` : ''}
  `;

  // Wire up quick-action buttons
  container.querySelector('#dash-start-review')?.addEventListener('click', () => {
    window.location.hash = '#study';
  });
  container.querySelector('#dash-new-subject')?.addEventListener('click', () => {
    window.location.hash = '#subjects';
    // Signal subjects view to open new-subject modal
    setTimeout(() => document.dispatchEvent(new CustomEvent('open-new-subject')), 100);
  });
  container.querySelector('#dash-goto-pomodoro')?.addEventListener('click', () => {
    window.location.hash = '#pomodoro';
  });
  container.querySelector('#dash-due-card')?.addEventListener('click', () => {
    window.location.hash = '#study';
  });
  container.querySelector('#dash-plans-card')?.addEventListener('click', () => {
    window.location.hash = '#reviews';
  });
  container.querySelector('#dash-goto-reviews')?.addEventListener('click', () => {
    window.location.hash = '#reviews';
  });
  container.querySelector('#dash-english-card')?.addEventListener('click', () => {
    window.location.hash = '#english';
  });
  container.querySelector('#dash-goto-english')?.addEventListener('click', () => {
    window.location.hash = '#english';
  });

  // Responsive: stack on mobile
  const grid = container.querySelector('.dash-grid');
  if (window.innerWidth < 680 && grid) {
    grid.style.gridTemplateColumns = '1fr';
  }
}

async function renderRecentActivity(recent) {
  if (!recent || recent.length === 0) {
    return `<p class="text-muted text-sm text-center" style="padding:var(--s7) 0;">لا توجد مراجعات بعد</p>`;
  }

  // Enrich with card fronts
  const items = await Promise.all(
    recent.map(async (h) => {
      const card = await cardsDB.getById(h.cardId);
      return { ...h, cardFront: card?.front || '(بطاقة محذوفة)' };
    })
  );

  return `
    <div class="activity-list">
      ${items.map(h => `
        <div class="activity-item">
          <div class="activity-dot" style="background:${h.correct ? 'var(--success)' : 'var(--danger)'}"></div>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${h.cardFront}</span>
          <span class="activity-time">${timeAgo(h.reviewedAt)}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'صباح الخير! 🌅';
  if (h < 17) return 'مساء الخير! ☀️';
  if (h < 21) return 'مساء النور! 🌆';
  return 'طاب ليلك! 🌙';
}

/* ─── Lessons (خطط المراجعة) due today — surfaced right on the dashboard ── */
async function getPlansDueToday() {
  const plans = await plansDB.getAll();
  const today = todayStr();
  const due = [];
  for (const p of plans) {
    const idx = (p.reviews || []).findIndex(r => !r.done && r.dueDate <= today);
    if (idx !== -1) due.push({ ...p, dueReviewIndex: idx + 1 });
  }
  return due;
}

/* ─── English section (قسم الإنجليزية) quick stats ────────────── */
async function getEnglishStats() {
  const [allCards, stats] = await Promise.all([
    engCardsDB.getAll(),
    settings.get('englishStats'),
  ]);
  const due = allCards.filter(c => engIsDue(c)).length;
  return { due, streak: stats?.streak || 0 };
}
