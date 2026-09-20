/**
 * app.js — Main entry point for مذاكر
 *
 * Responsibilities:
 *  - Database initialization
 *  - Hash-based client-side router
 *  - Sidebar & theme management
 *  - Page title updates
 *  - Global state accessible to all views
 */

import { dbReady, settings as settingsDB } from './db.js';
import { watchAuthState, signOutUser, getCurrentUser } from './services/authService.js';
import { renderAuthScreen } from './views/auth.js';
import { showConfirm } from './utils/helpers.js';

import { renderDashboard }     from './views/dashboard.js';
import { renderSubjects }      from './views/subjects.js';
import { renderSubjectDetail } from './views/subject-detail.js';
import { renderStudy }         from './views/study.js';
import { renderReviews }       from './views/reviews.js';
import { renderEnglish }       from './views/english.js';
import { renderPomodoro }      from './views/pomodoro.js';
import { renderSettings }      from './views/settings.js';
import { renderChat }          from './views/chat.js';

/* ─── Global app state (readable by other modules) ────────── */
window.__appState = {
  apiKey: '',
};

/* ─── Route definitions ────────────────────────────────────── */
const ROUTES = [
  { pattern: /^#?dashboard$/,         view: 'dashboard',      title: 'لوحة التحكم',     navId: 'dashboard'  },
  { pattern: /^#?subjects$/,          view: 'subjects',       title: 'المواد الدراسية', navId: 'subjects'   },
  { pattern: /^#?subject\/([^/]+)$/,  view: 'subject-detail', title: 'تفاصيل المادة',   navId: 'subjects'   },
  { pattern: /^#?study\/([^/]+)$/,    view: 'study',          title: 'مراجعة البطاقات',  navId: 'study'      },
  { pattern: /^#?study$/,             view: 'study',          title: 'مراجعة البطاقات',  navId: 'study'      },
  { pattern: /^#?reviews$/,           view: 'reviews',        title: 'المراجعات',        navId: 'reviews'    },
  { pattern: /^#?english$/,           view: 'english',        title: 'الإنجليزية',       navId: 'english'    },
  { pattern: /^#?pomodoro$/,          view: 'pomodoro',       title: 'مؤقت بومودورو',   navId: 'pomodoro'   },
  { pattern: /^#?chat$/,              view: 'chat',           title: 'المساعد الذكي',   navId: 'chat'       },
  { pattern: /^#?settings$/,          view: 'settings',       title: 'الإعدادات',       navId: 'settings'   },
];

/* ─── Init ─────────────────────────────────────────────────── */
let _appStarted = false;

async function init() {
  // Step 1: Make sure Firebase itself is ready
  try {
    await dbReady;
  } catch (err) {
    document.getElementById('loading-screen').innerHTML = `
      <div style="text-align:center;padding:2rem;color:#dc2626;">
        <h2>فشل تهيئة التطبيق</h2>
        <p style="margin-top:.5rem;">${err.message}</p>
      </div>
    `;
    return;
  }

  const loaderBar = document.getElementById('loader-bar');
  if (loaderBar) {
    loaderBar.style.animationDuration = '0.4s';
    await new Promise(r => setTimeout(r, 450));
  }

  // Step 2: Gate everything on the sign-in state. This fires once
  // immediately with the current state, then again on every login/logout.
  watchAuthState(async (user) => {
    if (user) {
      document.getElementById('auth-screen')?.classList.add('hidden');
      if (!_appStarted) {
        _appStarted = true;
        await startApp();
      }
    } else {
      _appStarted = false;
      document.getElementById('app')?.classList.add('hidden');
      document.getElementById('loading-screen')?.classList.add('fade-out');
      const authEl = document.getElementById('auth-screen');
      if (authEl) {
        authEl.classList.remove('hidden');
        renderAuthScreen(authEl);
      }
    }
  });
}

async function startApp() {
  // Load persisted settings (per-account, from Firestore)
  const [apiKey, savedTheme] = await Promise.all([
    settingsDB.get('geminiApiKey'),
    settingsDB.get('theme'),
  ]);

  if (apiKey)     window.__appState.apiKey = apiKey;
  if (savedTheme) document.body.dataset.theme = savedTheme;

  // Reveal the app
  document.getElementById('loading-screen')?.classList.add('fade-out');
  document.getElementById('app')?.classList.remove('hidden');

  // Wire up global UI
  setupSidebar();
  setupThemeToggles();
  setupSignOut();

  // Start router
  window.addEventListener('hashchange', route);
  route();
}

function setupSignOut() {
  const btn   = document.getElementById('sign-out-btn');
  const label = document.getElementById('sign-out-label');
  const user  = getCurrentUser();
  if (label && user) {
    const who = user.displayName || user.email || user.phoneNumber || '';
    label.textContent = who ? `تسجيل الخروج (${who})` : 'تسجيل الخروج';
  }
  btn?.addEventListener('click', async () => {
    const ok = await showConfirm('تسجيل الخروج', 'هل تريد تسجيل الخروج من حسابك على هذا الجهاز؟');
    if (!ok) return;
    await signOutUser();
  });
}

/* ─── Router ───────────────────────────────────────────────── */
async function route() {
  const hash   = window.location.hash.replace('#', '') || 'dashboard';
  const viewEl = document.getElementById('view');
  if (!viewEl) return;

  let matched = null;
  let params  = [];

  for (const r of ROUTES) {
    const m = hash.match(r.pattern);
    if (m) {
      matched = r;
      params  = m.slice(1);
      break;
    }
  }

  // Default to dashboard for unknown routes
  if (!matched) {
    window.location.hash = '#dashboard';
    return;
  }

  // Update active nav link
  document.querySelectorAll('.nav-link').forEach(el => {
    el.classList.toggle('active', el.dataset.view === matched.navId);
  });

  // Update page title (topbar + document)
  const titleEl = document.getElementById('page-title');
  if (titleEl) titleEl.textContent = matched.title;
  document.title = `${matched.title} — مذاكر`;

  // Animate view out, render, animate in
  viewEl.style.opacity   = '0';
  viewEl.style.transform = 'translateY(8px)';

  try {
    await renderView(matched.view, viewEl, params);
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

  // Animate in
  requestAnimationFrame(() => {
    viewEl.style.transition = 'opacity 0.22s ease, transform 0.22s ease';
    viewEl.style.opacity    = '1';
    viewEl.style.transform  = 'translateY(0)';
  });

  // Close mobile sidebar after navigation
  closeSidebar();

  // Scroll view to top
  viewEl.scrollTop = 0;
  window.scrollTo(0, 0);
}

async function renderView(viewName, container, params) {
  switch (viewName) {
    case 'dashboard':
      return renderDashboard(container);

    case 'subjects':
      return renderSubjects(container);

    case 'subject-detail':
      return renderSubjectDetail(container, params[0]);

    case 'study':
      return renderStudy(container, params[0] || null);

    case 'reviews':
      return renderReviews(container);

    case 'english':
      return renderEnglish(container);

    case 'pomodoro':
      return renderPomodoro(container);

    case 'settings':
      return renderSettings(container);

    case 'chat':
      return renderChat(container);

    default:
      container.innerHTML = `<div class="empty-state"><h3>الصفحة غير موجودة</h3></div>`;
  }
}

/* ─── Sidebar ───────────────────────────────────────────────── */
function setupSidebar() {
  const sidebar    = document.getElementById('sidebar');
  const menuBtn    = document.getElementById('menu-btn');
  const closeBtn   = document.getElementById('sidebar-close');
  const overlay    = document.getElementById('overlay');
  const reopenBtn  = document.getElementById('sidebar-reopen');

  menuBtn?.addEventListener('click', openSidebar);

  // The X button: on mobile it closes the slide-over overlay; on desktop it
  // collapses the sidebar entirely (a floating ☰ button brings it back).
  closeBtn?.addEventListener('click', () => {
    closeSidebar();
    document.body.classList.add('sidebar-collapsed');
    reopenBtn?.classList.remove('hidden');
  });

  overlay?.addEventListener('click', closeSidebar);

  reopenBtn?.addEventListener('click', () => {
    document.body.classList.remove('sidebar-collapsed');
    reopenBtn.classList.add('hidden');
  });

  // Close sidebar on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSidebar();
  });
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

/* ─── Theme ─────────────────────────────────────────────────── */
function setupThemeToggles() {
  const toggles = document.querySelectorAll('#theme-toggle, #theme-toggle-mob');
  toggles.forEach(btn => {
    btn.addEventListener('click', async () => {
      const current = document.body.dataset.theme;
      const next    = current === 'dark' ? 'light' : 'dark';
      document.body.dataset.theme = next;
      await settingsDB.set('theme', next);
    });
  });
}

/* ─── Boot ──────────────────────────────────────────────────── */
init().catch(err => {
  console.error('Fatal init error:', err);
  document.body.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:Tajawal,sans-serif;direction:rtl;text-align:center;padding:2rem;">
      <div>
        <h1 style="font-size:2rem;margin-bottom:1rem;">⚠️ خطأ في تشغيل التطبيق</h1>
        <p style="opacity:.7;">${err.message}</p>
        <button onclick="location.reload()" style="margin-top:1.5rem;padding:.75rem 1.5rem;background:#7C3AED;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:1rem;">
          🔄 إعادة التحميل
        </button>
      </div>
    </div>
  `;
});
