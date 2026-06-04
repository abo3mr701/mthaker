/**
 * dashboard.js — Dashboard with streak, stats, activity feed
 */

import { getDashboardStats, history as historyDB, flashcards as cardsDB, streak as streakDB } from '../db.js';
import { timeAgo } from '../utils/helpers.js';

export async function renderDashboard(container) {
  container.innerHTML = `<div class="flex-center" style="padding:var(--s10)"><div class="spinner"></div></div>`;

  // Record today as a study day for streak
  await streakDB.recordToday().catch(()=>{});

  let stats, recent;
  try {
    [stats, recent] = await Promise.all([getDashboardStats(), historyDB.getRecent(10)]);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p class="text-danger">خطأ: ${err.message}</p></div>`;
    return;
  }

  // Update sidebar streak badge
  const streakEl = document.getElementById('streak-count');
  if (streakEl) streakEl.textContent = stats.streak;

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
          <div class="welcome-meta-val">🔥 ${stats.streak}</div>
          <div>يوم متواصل</div>
        </div>
        <div class="welcome-meta-item">
          <div class="welcome-meta-val">${stats.pomodoroStats.totalHours}</div>
          <div>ساعة دراسة</div>
        </div>
      </div>
    </div>

    <!-- Stat cards -->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-icon stat-icon-purple">📚</div>
        <div><div class="stat-val">${stats.subjectCount}</div><div class="stat-lbl">مادة دراسية</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon stat-icon-gold">🃏</div>
        <div><div class="stat-val">${stats.cardCount}</div><div class="stat-lbl">بطاقة تعليمية</div></div>
      </div>
      <div class="stat-card" style="cursor:pointer;" onclick="window.location.hash='#study'">
        <div class="stat-icon stat-icon-green">📅</div>
        <div><div class="stat-val" style="${stats.dueCount>0?'color:var(--danger)':''}">${stats.dueCount}</div><div class="stat-lbl">مستحقة اليوم</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon stat-icon-blue">🔥</div>
        <div><div class="stat-val" style="color:var(--gold)">${stats.streak}</div><div class="stat-lbl">يوم streak</div></div>
      </div>
    </div>

    <!-- Two-column -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--s7);" class="dash-grid">
      <div class="card">
        <h3 style="font-size:1rem;font-weight:700;margin-bottom:var(--s6);">⚡ إجراءات سريعة</h3>
        <div style="display:flex;flex-direction:column;gap:var(--s4);">
          <a href="#study"     class="btn btn-primary w-full">🎯 مراجعة اليوم ${stats.dueCount>0?`(${stats.dueCount})`:''}</a>
          <a href="#quiz"      class="btn btn-secondary w-full">📝 اختبار مدمج</a>
          <a href="#flashcards" class="btn btn-secondary w-full">🃏 البطاقات التعليمية</a>
          <a href="#pomodoro"  class="btn btn-secondary w-full">⏱️ مؤقت بومودورو</a>
          <a href="#draw"      class="btn btn-secondary w-full">🎨 لوحة الرسم</a>
        </div>
      </div>
      <div class="card">
        <h3 style="font-size:1rem;font-weight:700;margin-bottom:var(--s6);">📈 آخر المراجعات</h3>
        ${await buildActivity(recent)}
      </div>
    </div>
  `;

  // Responsive grid
  if (window.innerWidth < 680) {
    const grid = container.querySelector('.dash-grid');
    if (grid) grid.style.gridTemplateColumns = '1fr';
  }
}

async function buildActivity(recent) {
  if (!recent?.length) {
    return `<p class="text-muted text-sm text-center" style="padding:var(--s7) 0;">لا توجد مراجعات بعد</p>`;
  }
  const items = await Promise.all(recent.map(async h => {
    const card = await cardsDB.getById(h.cardId);
    return { ...h, cardFront: card?.front || '(محذوفة)' };
  }));
  return `<div class="activity-list">
    ${items.map(h => `
      <div class="activity-item">
        <div class="activity-dot" style="background:${h.correct?'var(--success)':'var(--danger)'}"></div>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${h.cardFront}</span>
        <span class="activity-time">${timeAgo(h.reviewedAt)}</span>
      </div>`).join('')}
  </div>`;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'صباح الخير! 🌅';
  if (h < 17) return 'مساء الخير! ☀️';
  if (h < 21) return 'مساء النور! 🌆';
  return 'طاب ليلك! 🌙';
}
