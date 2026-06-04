/**
 * app.js — Entry point, router, sidebar, theme
 */

import { dbReady, settings as settingsDB, streak as streakDB, flashcards as cardsDB } from './db.js';

import { renderDashboard }     from './views/dashboard.js';
import { renderSubjects }      from './views/subjects.js';
import { renderSubjectDetail } from './views/subject-detail.js';
import { renderStudy }         from './views/study.js';
import { renderSchedule }      from './views/schedule.js';
import { renderFlashcards }    from './views/flashcards.js';
import { renderQuiz }          from './views/quiz.js';
import { renderDraw }          from './views/draw.js';
import { renderPomodoro }      from './views/pomodoro.js';
import { renderChat }          from './views/chat.js';
import { renderSettings }      from './views/settings.js';

window.__appState = { apiKey: '' };

const ROUTES = [
  { pattern: /^#?dashboard$/,        view: 'dashboard',      title: 'لوحة التحكم',        navId: 'dashboard'   },
  { pattern: /^#?subjects$/,         view: 'subjects',       title: 'المواد الدراسية',    navId: 'subjects'    },
  { pattern: /^#?subject\/([^/]+)$/, view: 'subject-detail', title: 'تفاصيل المادة',      navId: 'subjects'    },
  { pattern: /^#?study\/([^/]+)$/,   view: 'study',          title: 'مراجعة اليوم',       navId: 'study'       },
  { pattern: /^#?study$/,            view: 'study',          title: 'مراجعة اليوم',       navId: 'study'       },
  { pattern: /^#?schedule$/,         view: 'schedule',       title: 'جدولة المراجعات',    navId: 'schedule'    },
  { pattern: /^#?flashcards$/,       view: 'flashcards',     title: 'البطاقات التعليمية', navId: 'flashcards'  },
  { pattern: /^#?quiz$/,             view: 'quiz',           title: 'الاختبار المدمج',    navId: 'quiz'        },
  { pattern: /^#?draw$/,             view: 'draw',           title: 'لوحة الرسم',         navId: 'draw'        },
  { pattern: /^#?pomodoro$/,         view: 'pomodoro',       title: 'مؤقت بومودورو',      navId: 'pomodoro'    },
  { pattern: /^#?chat$/,             view: 'chat',           title: 'المساعد الذكي',      navId: 'chat'        },
  { pattern: /^#?settings$/,         view: 'settings',       title: 'الإعدادات',          navId: 'settings'    },
];

async function init() {
  try {
    await dbReady;
  } catch (err) {
    document.getElementById('loading-screen').innerHTML = `
      <div style="text-align:center;padding:2rem;color:#dc2626;">
        <h2>فشل تهيئة قاعدة البيانات</h2>
        <p style="margin-top:.5rem;">${err.message}</p>
      </div>`;
    return;
  }

  const [apiKey, savedTheme] = await Promise.all([
    settingsDB.get('geminiApiKey'),
    settingsDB.get('theme'),
  ]);

  if (apiKey)     window.__appState.apiKey = apiKey;
  if (savedTheme) document.body.dataset.theme = savedTheme;

  await new Promise(r => setTimeout(r, 450));

  document.getElementById('loading-screen').classList.add('fade-out');
  document.getElementById('app').classList.remove('hidden');

  setupSidebar();
  setupThemeToggles();
  await updateStreakBadge();
  await updateDueBadge();

  window.addEventListener('hashchange', route);
  route();
}

async function updateStreakBadge() {
  try {
    const count = await streakDB.getCurrent();
    const el = document.getElementById('streak-count');
    if (el) el.textContent = count;
  } catch { /* non-critical */ }
}

async function updateDueBadge() {
  try {
    const due = await cardsDB.getDueCards();
    const badge = document.getElementById('nav-due-badge');
    if (!badge) return;
    if (due.length > 0) {
      badge.textContent = due.length > 99 ? '99+' : due.length;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  } catch { /* non-critical */ }
}

async function route() {
  const hash    = window.location.hash.replace('#', '') || 'dashboard';
  const viewEl  = document.getElementById('view');
  if (!viewEl) return;

  let matched = null;
  let params  = [];
  for (const r of ROUTES) {
    const m = hash.match(r.pattern);
    if (m) { matched = r; params = m.slice(1); break; }
  }
  if (!matched) { window.location.hash = '#dashboard'; return; }

  document.querySelectorAll('.nav-link').forEach(el => {
    el.classList.toggle('active', el.dataset.view === matched.navId);
  });

  const titleEl = document.getElementById('page-title');
  if (titleEl) titleEl.textContent = matched.title;
  document.title = `${matched.title} — مذاكر`;

  viewEl.style.opacity   = '0';
  viewEl.style.transform = 'translateY(8px)';

  try {
    await renderView(matched.view, viewEl, params);
    await updateDueBadge();
  } catch (err) {
    console.error('Router render error:', err);
    viewEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <h3 class="empty-title">خطأ في تحميل الصفحة</h3>
        <p class="empty-sub">${err.message}</p>
        <button class="btn btn-secondary" onclick="window.location.hash='#dashboard'">← الرئيسية</button>
      </div>`;
  }

  requestAnimationFrame(() => {
    viewEl.style.transition = 'opacity 0.22s ease, transform 0.22s ease';
    viewEl.style.opacity    = '1';
    viewEl.style.transform  = 'translateY(0)';
  });

  closeSidebar();
  viewEl.scrollTop = 0;
  window.scrollTo(0, 0);
}

async function renderView(viewName, container, params) {
  switch (viewName) {
    case 'dashboard':      return renderDashboard(container);
    case 'subjects':       return renderSubjects(container);
    case 'subject-detail': return renderSubjectDetail(container, params[0]);
    case 'study':          return renderStudy(container, params[0] || null);
    case 'schedule':       return renderSchedule(container);
    case 'flashcards':     return renderFlashcards(container);
    case 'quiz':           return renderQuiz(container);
    case 'draw':           return renderDraw(container);
    case 'pomodoro':       return renderPomodoro(container);
    case 'chat':           return renderChat(container);
    case 'settings':       return renderSettings(container);
    default:
      container.innerHTML = `<div class="empty-state"><h3>الصفحة غير موجودة</h3></div>`;
  }
}

function setupSidebar() {
  document.getElementById('menu-btn')?.addEventListener('click', openSidebar);
  document.getElementById('sidebar-close')?.addEventListener('click', closeSidebar);
  document.getElementById('overlay')?.addEventListener('click', closeSidebar);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSidebar(); });
}

function openSidebar() {
  document.getElementById('sidebar')?.classList.add('open');
  document.getElementById('overlay')?.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('overlay')?.classList.remove('active');
  document.body.style.overflow = '';
}

function setupThemeToggles() {
  document.querySelectorAll('#theme-toggle, #theme-toggle-mob').forEach(btn => {
    btn.addEventListener('click', async () => {
      const next = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
      document.body.dataset.theme = next;
      await settingsDB.set('theme', next);
    });
  });
}

init().catch(err => {
  console.error('Fatal init error:', err);
  document.body.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:Tajawal,sans-serif;direction:rtl;text-align:center;padding:2rem;">
      <div>
        <h1 style="font-size:2rem;margin-bottom:1rem;">⚠️ خطأ</h1>
        <p style="opacity:.7;">${err.message}</p>
        <button onclick="location.reload()" style="margin-top:1.5rem;padding:.75rem 1.5rem;background:#7C3AED;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:1rem;">
          🔄 إعادة التحميل
        </button>
      </div>
    </div>`;
});
