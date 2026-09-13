/**
 * english.js — قسم "الإنجليزية" المستقل (بنفس روح وتصميم مشروع Lexora)
 *
 * مستقل تماماً عن نظام المواد/الفلاش كاردز/المراجعات العام في مذاكر:
 *  - قاعدة بيانات خاصة (english_srs_cards + english_custom_words في db.js).
 *  - خوارزمية SRS بأسلوب Anki (4 أزرار: مرة أخرى / صعب / جيد / سهل) — englishSrs.js.
 *  - مولّد دفعة يومية ديناميكي (حتى 100 كلمة جديدة يومياً) — englishQueue.js.
 *  - قاموس Oxford 3000 مدمج (405 كلمة، بترجمة + تعريف + 3 أمثلة لكل كلمة).
 *  - بطاقة قلب ثلاثية الأبعاد + نطق صوتي + ترجمة قابلة للإظهار + مساعد ذكاء اصطناعي.
 */

import { oxfordWords } from '../data/oxfordWords.js';
import { englishCards as cardsDB, englishWords as customWordsDB, settings } from '../db.js';
import { createNewCard, applyRating, isDue, forecastLabel, RATINGS } from '../services/englishSrs.js';
import { generateDailyQueue } from '../services/englishQueue.js';
import { generateEnglishWordEntry, askAboutWord } from '../services/gemini.js';
import { uid, showToast, escHtml, todayStr } from '../utils/helpers.js';

const SETTINGS_KEYS = {
  QUEUE:   'englishDailyQueue',
  STATS:   'englishStats',
  SEEN:    'englishSeenIds',
  TARGET:  'englishDailyTarget',
};

const DEFAULT_STATS  = { streak: 0, longestStreak: 0, lastActiveDate: null, totalReviewed: 0 };
const DEFAULT_TARGET = 100;

const RATING_BUTTONS = [
  { key: RATINGS.AGAIN, label: 'مرة أخرى', hint: 'أقل من دقيقة', cls: 'eng-rate-again' },
  { key: RATINGS.HARD,  label: 'صعب',      hint: '~يوم واحد',    cls: 'eng-rate-hard'  },
  { key: RATINGS.GOOD,  label: 'جيد',      hint: '~6 أيام',      cls: 'eng-rate-good'  },
  { key: RATINGS.EASY,  label: 'سهل',      hint: '~10 أيام+',    cls: 'eng-rate-easy'  },
];

const STATUS_FILTERS = [
  { id: 'all',      label: 'الكل'        },
  { id: 'due',      label: 'مستحقة الآن' },
  { id: 'new',      label: 'جديدة'       },
  { id: 'learning', label: 'قيد التعلم'  },
  { id: 'review',   label: 'مراجعة'      },
];

/* ─── Module state (reloaded fresh every time the page renders) ── */
let S = null;

export async function renderEnglish(container) {
  container.innerHTML = `<div class="flex-center" style="padding:var(--s10)"><div class="spinner"></div></div>`;
  await loadState();
  await ensureTodayQueue();
  await persistState();
  S.activeTab = S.activeTab || 'dashboard';
  paint(container);
}

/* ─── State load / persist ───────────────────────────────────── */
async function loadState() {
  const [customWords, allCards, queue, stats, target] = await Promise.all([
    customWordsDB.getAll(),
    cardsDB.getAll(),
    settings.get(SETTINGS_KEYS.QUEUE),
    settings.get(SETTINGS_KEYS.STATS),
    settings.get(SETTINGS_KEYS.TARGET),
  ]);

  const seenArr = await settings.get(SETTINGS_KEYS.SEEN);

  const wordBank = [...oxfordWords, ...customWords];
  const wordById = new Map(wordBank.map(w => [w.id, w]));
  const cardsById = {};
  allCards.forEach(c => { cardsById[c.id] = c; });

  S = {
    wordBank,
    wordById,
    customWords,
    cards: cardsById,
    seenIds: new Set(Array.isArray(seenArr) ? seenArr : []),
    queue: queue || { date: null, wordIds: [] },
    stats: stats || { ...DEFAULT_STATS },
    dailyTarget: target || DEFAULT_TARGET,
    lastGenInfo: null,
    sessionIndex: S?.sessionIndex || 0,
    activeTab: S?.activeTab,
  };
}

async function persistState() {
  await Promise.all([
    settings.set(SETTINGS_KEYS.QUEUE, S.queue),
    settings.set(SETTINGS_KEYS.STATS, S.stats),
    settings.set(SETTINGS_KEYS.SEEN, Array.from(S.seenIds)),
    settings.set(SETTINGS_KEYS.TARGET, S.dailyTarget),
  ]);
}

function touchStreak() {
  const today = todayStr();
  if (S.stats.lastActiveDate === today) return;
  let streak = 1;
  if (S.stats.lastActiveDate) {
    const gap = daysBetween(S.stats.lastActiveDate, today);
    streak = gap === 1 ? S.stats.streak + 1 : 1;
  }
  S.stats = { ...S.stats, streak, longestStreak: Math.max(S.stats.longestStreak, streak), lastActiveDate: today };
}

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86_400_000);
}

async function ensureTodayQueue() {
  const today = todayStr();
  touchStreak();
  if (S.queue.date === today) return;

  const result = generateDailyQueue(oxfordWords.concat(S.customWords), S.seenIds, S.dailyTarget, { min: 0.6, max: 0.7 });
  S.lastGenInfo = result;

  if (result.selected.length === 0) {
    S.queue = { date: today, wordIds: [] };
    return;
  }

  result.selected.forEach(w => {
    S.seenIds.add(w.id);
    if (!S.cards[w.id]) S.cards[w.id] = createNewCard(w.id);
  });
  await cardsDB.bulkSave(result.selected.map(w => S.cards[w.id]));

  S.queue = { date: today, wordIds: result.selected.map(w => w.id) };
  S.sessionIndex = 0;
}

/* ─── Shell + tab switching ───────────────────────────────────── */
function paint(container) {
  const dueCount = Object.values(S.cards).filter(c => isDue(c)).length;

  container.innerHTML = `
    <div class="eng-page">
      <div class="eng-header">
        <div class="eng-brand">
          <span class="eng-brand-icon">📖</span>
          <span class="eng-brand-name">الإنجليزية</span>
          <span class="eng-brand-sub">Oxford 3000 · SRS بأسلوب Anki</span>
        </div>
        <div class="eng-streak-pill">🔥 <b>${S.stats.streak}</b> يوم متتالي</div>
      </div>

      <div class="eng-tabs">
        <button class="eng-tab ${S.activeTab === 'dashboard' ? 'active' : ''}" data-tab="dashboard">لوحة التحكم</button>
        <button class="eng-tab ${S.activeTab === 'today' ? 'active' : ''}" data-tab="today">كلمات اليوم${dueCount ? ` (${dueCount})` : ''}</button>
        <button class="eng-tab ${S.activeTab === 'mydeck' ? 'active' : ''}" data-tab="mydeck">مفرداتي</button>
      </div>

      <div class="eng-content" id="eng-content"></div>
    </div>
  `;

  container.querySelectorAll('.eng-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      S.activeTab = btn.dataset.tab;
      S.sessionIndex = 0;
      paint(container);
    });
  });

  const content = container.querySelector('#eng-content');
  if (S.activeTab === 'today') renderTodayTab(container, content);
  else if (S.activeTab === 'mydeck') renderMyDeckTab(container, content);
  else renderDashboardTab(container, content);
}

/* ─── Dashboard tab ───────────────────────────────────────────── */
function renderDashboardTab(container, el) {
  const dueCount   = Object.values(S.cards).filter(c => isDue(c)).length;
  const totalSeen  = S.seenIds.size;
  const totalBank  = S.wordBank.length;
  const remaining  = Math.max(0, totalBank - totalSeen);
  const todayTotal = S.queue.wordIds.length;
  const todayDone  = S.queue.wordIds.filter(id => wasReviewedToday(S.cards[id])).length;
  const pct = todayTotal ? Math.min(100, Math.round((todayDone / todayTotal) * 100)) : 0;

  el.innerHTML = `
    <div class="eng-stat-grid">
      <div class="eng-stat-card accent">
        <div class="eng-stat-top"><span>سلسلة الأيام</span><span>🔥</span></div>
        <div class="eng-stat-val">${S.stats.streak}</div>
        <div class="eng-stat-sub">الأطول: ${S.stats.longestStreak} يوم</div>
      </div>
      <div class="eng-stat-card">
        <div class="eng-stat-top"><span>إجمالي المراجعات</span><span>✅</span></div>
        <div class="eng-stat-val">${S.stats.totalReviewed}</div>
        <div class="eng-stat-sub">بطاقة تمت مراجعتها</div>
      </div>
      <div class="eng-stat-card">
        <div class="eng-stat-top"><span>مستحقة الآن</span><span>⏰</span></div>
        <div class="eng-stat-val">${dueCount}</div>
        <div class="eng-stat-sub">جاهزة للمراجعة</div>
      </div>
      <div class="eng-stat-card">
        <div class="eng-stat-top"><span>رصيد الكلمات</span><span>📚</span></div>
        <div class="eng-stat-val">${totalSeen}/${totalBank}</div>
        <div class="eng-stat-sub">${remaining} كلمة متبقية</div>
      </div>
    </div>

    <div class="eng-two-col">
      <div class="eng-card">
        <div class="eng-card-head">
          <h3>تقدّم اليوم</h3>
          <span class="text-muted text-sm">${todayDone} / ${todayTotal} كلمة</span>
        </div>
        <div class="eng-progress-bar"><div class="eng-progress-fill" style="width:${pct}%"></div></div>
        <p class="text-muted text-sm" style="margin-top:var(--s4)">
          ${todayTotal === 0
            ? 'تم تقديم كل الكلمات المتاحة حالياً — أضف كلمات خاصة بك من «مفرداتي» لتكمل.'
            : pct === 100
              ? 'أنجزت كل شيء اليوم! 🎉'
              : `تبقّى ${todayTotal - todayDone} كلمة في دفعة اليوم.`}
        </p>
        <button class="btn btn-primary" id="eng-go-today" style="margin-top:var(--s5)">اذهب لكلمات اليوم ←</button>
      </div>

      <div class="eng-card">
        <h3 style="margin-bottom:var(--s5)">✨ إجراءات سريعة</h3>
        <button class="eng-quick-btn" id="eng-go-mydeck">📚 أضف كلماتك الخاصة</button>
        <button class="eng-quick-btn" id="eng-go-target">🎯 عدّل الحد اليومي (${S.dailyTarget} كلمة)</button>
        ${S.lastGenInfo ? `<p class="text-muted text-xs" style="margin-top:var(--s4);padding-top:var(--s4);border-top:1px solid var(--border);">
          آخر دفعة: ${S.lastGenInfo.easyCount} سهلة + ${S.lastGenInfo.hardCount} متوسطة</p>` : ''}
      </div>
    </div>
  `;

  el.querySelector('#eng-go-today')?.addEventListener('click', () => switchTab(container, 'today'));
  el.querySelector('#eng-go-mydeck')?.addEventListener('click', () => switchTab(container, 'mydeck'));
  el.querySelector('#eng-go-target')?.addEventListener('click', () => openTargetModal(container));
}

function switchTab(container, tab) {
  S.activeTab = tab;
  S.sessionIndex = 0;
  paint(container);
}

function wasReviewedToday(card) {
  if (!card?.lastReviewed) return false;
  const d = new Date(card.lastReviewed);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function openTargetModal(container) {
  const backdrop = document.getElementById('modal-form');
  const titleEl  = document.getElementById('modal-form-title');
  const bodyEl   = document.getElementById('modal-form-body');
  const closeBtn = document.getElementById('modal-form-close');

  titleEl.textContent = 'الحد الأقصى اليومي للكلمات الجديدة';
  backdrop.classList.remove('hidden');
  bodyEl.innerHTML = `
    <div class="form-group">
      <label class="form-label">عدد الكلمات الجديدة يومياً</label>
      <input type="number" class="form-input" id="eng-target-input" min="5" step="5" value="${S.dailyTarget}">
    </div>
    <div style="display:flex;gap:var(--s4);justify-content:flex-end;">
      <button class="btn btn-ghost" id="eng-target-cancel">إلغاء</button>
      <button class="btn btn-primary" id="eng-target-save">💾 حفظ</button>
    </div>
  `;
  const close = () => backdrop.classList.add('hidden');
  closeBtn.addEventListener('click', close, { once: true });
  bodyEl.querySelector('#eng-target-cancel').addEventListener('click', close);
  bodyEl.querySelector('#eng-target-save').addEventListener('click', async () => {
    const val = Math.max(5, parseInt(bodyEl.querySelector('#eng-target-input').value, 10) || DEFAULT_TARGET);
    S.dailyTarget = val;
    await persistState();
    close();
    paint(container);
    showToast('تم تحديث الحد اليومي', 'success');
  });
}

/* ─── "كلمات اليوم" tab — flip card + Anki-style rating ─────────── */
function renderTodayTab(container, el) {
  const words = S.queue.wordIds.map(id => S.wordById.get(id)).filter(Boolean);
  const total = words.length;

  if (total === 0) {
    el.innerHTML = `
      <div class="eng-empty">
        <div class="eng-empty-icon">🎉</div>
        <h3>لا توجد كلمات جديدة متاحة الآن</h3>
        <p>تم تقديم كل كلمة في القاموس الحالي. أضف كلماتك الخاصة من «مفرداتي»، أو ارجع لاحقاً.</p>
      </div>
    `;
    return;
  }

  const index    = Math.min(S.sessionIndex, total);
  const complete = index >= total;
  const easyCount = words.filter(w => w.level === 'A1' || w.level === 'A2').length;

  if (complete) {
    el.innerHTML = `
      <div class="eng-empty">
        <div class="eng-empty-icon">🏆</div>
        <h3>انتهت الجلسة!</h3>
        <p>راجعت ${total} من ${total} كلمة اليوم. الكلمات اللي قيّمتها "مرة أخرى" أو "صعب" بترجع أقرب.</p>
        <button class="btn btn-primary" id="eng-restart">🔄 راجع مرة أخرى</button>
      </div>
    `;
    el.querySelector('#eng-restart')?.addEventListener('click', () => { S.sessionIndex = 0; renderTodayTab(container, el); });
    return;
  }

  const word = words[index];

  el.innerHTML = `
    <div class="eng-today-head">
      <div>
        <h2 class="eng-serif">كلمات اليوم — ${total}</h2>
        <p class="text-muted text-sm">${easyCount} سهلة (A1-A2) · ${total - easyCount} متوسطة (B1-B2)</p>
      </div>
      <span class="text-muted text-sm">${index + 1} من ${total}</span>
    </div>
    <div class="eng-progress-bar" style="margin-bottom:var(--s6);">
      <div class="eng-progress-fill" style="width:${Math.round((index / total) * 100)}%"></div>
    </div>

    <div class="eng-flip-outer" id="eng-flip-outer">
      <div class="eng-flip-inner" id="eng-flip-inner">
        ${flashcardFrontHtml(word)}
        ${flashcardBackHtml(word)}
      </div>
    </div>

    <div class="eng-rate-grid" id="eng-rate-grid" style="display:none;">
      ${RATING_BUTTONS.map(b => `
        <button class="eng-rate-btn ${b.cls}" data-rating="${b.key}">
          ${b.label}<span>${b.hint}</span>
        </button>
      `).join('')}
    </div>
    <p class="text-muted text-xs text-center" style="margin-top:var(--s4);">اضغط البطاقة لقلبها وكشف الترجمة والأمثلة</p>
  `;

  bindFlashcard(container, el, word);
}

function flashcardFrontHtml(word) {
  return `
    <div class="eng-face eng-face-front">
      <span class="eng-level-badge level-${(word.level || 'A1').toLowerCase()}">${word.level || 'A1'} · ${escHtml(word.pos || '—')}</span>
      <h2 class="eng-word-serif">${escHtml(word.word)}</h2>
      <button class="eng-speak-btn" data-speak="${escHtml(word.word)}" title="نطق">🔊</button>
      <p class="eng-hint">انقر على البطاقة لقلبها</p>
    </div>
  `;
}

function flashcardBackHtml(word) {
  const examples = word.examples || {};
  return `
    <div class="eng-face eng-face-back">
      <div class="eng-back-head">
        <div>
          <h3 class="eng-serif" style="font-size:1.3rem;">${escHtml(word.word)}</h3>
          <span class="text-muted text-xs">${escHtml(word.pos || '')} · ${word.level || ''}</span>
        </div>
        <button class="eng-flip-back-btn" title="رجوع">↺</button>
      </div>

      <button class="eng-toggle-translation-btn" id="eng-toggle-tr">👁️ إظهار الترجمة</button>
      <p class="eng-translation hidden" id="eng-translation" dir="rtl">${escHtml(word.ar || '—')}</p>

      <p class="eng-definition">${escHtml(word.definition || 'لا يوجد تعريف بعد.')}</p>

      ${exampleRowHtml('حياة يومية', examples.daily)}
      ${exampleRowHtml('أكاديمي / مهني', examples.academic)}
      ${exampleRowHtml('اصطلاحي / ثقافي', examples.idiom, '✨')}

      <button class="eng-ask-ai-btn" data-word-id="${word.id}">💬 اسأل الذكاء الاصطناعي عن هذه الكلمة</button>
    </div>
  `;
}

function exampleRowHtml(label, text, icon = '') {
  if (!text) return '';
  return `
    <div class="eng-example-row">
      <div class="eng-example-head">
        <span>${icon} ${label}</span>
        <button class="eng-speak-btn-sm" data-speak="${escHtml(text)}" title="نطق">🔊</button>
      </div>
      <p dir="ltr">${escHtml(text)}</p>
    </div>
  `;
}

function bindFlashcard(container, el, word) {
  const outer   = el.querySelector('#eng-flip-outer');
  const inner   = el.querySelector('#eng-flip-inner');
  const rateGrid = el.querySelector('#eng-rate-grid');
  let flipped = false;

  function speak(text) {
    if (!('speechSynthesis' in window) || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  }

  function flip() {
    flipped = !flipped;
    inner.classList.toggle('flipped', flipped);
    if (flipped) setTimeout(() => { rateGrid.style.display = 'grid'; }, 300);
    else rateGrid.style.display = 'none';
  }

  outer.addEventListener('click', (e) => {
    if (e.target.closest('[data-speak]') || e.target.closest('.eng-toggle-translation-btn') ||
        e.target.closest('.eng-ask-ai-btn') || e.target.closest('.eng-flip-back-btn')) return;
    flip();
  });

  el.querySelectorAll('[data-speak]').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); speak(btn.dataset.speak); });
  });

  el.querySelector('.eng-flip-back-btn')?.addEventListener('click', (e) => { e.stopPropagation(); if (flipped) flip(); });

  el.querySelector('#eng-toggle-tr')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const tr = el.querySelector('#eng-translation');
    const btn = e.currentTarget;
    const showing = !tr.classList.contains('hidden');
    tr.classList.toggle('hidden');
    btn.textContent = showing ? '👁️ إظهار الترجمة' : '🙈 إخفاء الترجمة';
  });

  el.querySelector('.eng-ask-ai-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openAskAiModal(word);
  });

  rateGrid.querySelectorAll('[data-rating]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const current = S.cards[word.id] || createNewCard(word.id);
      const updated = applyRating(current, btn.dataset.rating);
      S.cards[word.id] = updated;
      S.stats.totalReviewed += 1;
      touchStreak();
      await Promise.all([cardsDB.save(updated), persistState()]);
      S.sessionIndex += 1;
      renderTodayTab(container, el);
    });
  });
}

function openAskAiModal(word) {
  const backdrop = document.getElementById('modal-form');
  const titleEl  = document.getElementById('modal-form-title');
  const bodyEl   = document.getElementById('modal-form-body');
  const closeBtn = document.getElementById('modal-form-close');

  titleEl.textContent = `اسأل عن: ${word.word}`;
  backdrop.classList.remove('hidden');
  bodyEl.innerHTML = `
    <div class="form-group">
      <label class="form-label">سؤالك</label>
      <textarea class="form-textarea" id="eng-ai-question" rows="2" dir="auto"
        placeholder="مثال: وش الفرق بين هذي الكلمة وكلمة مشابهة لها؟"></textarea>
    </div>
    <div id="eng-ai-answer" class="text-sm" style="margin:var(--s4) 0; white-space:pre-wrap;"></div>
    <div style="display:flex;gap:var(--s4);justify-content:flex-end;">
      <button class="btn btn-ghost" id="eng-ai-cancel">إغلاق</button>
      <button class="btn btn-primary" id="eng-ai-send">✨ إرسال</button>
    </div>
  `;
  const close = () => backdrop.classList.add('hidden');
  closeBtn.addEventListener('click', close, { once: true });
  bodyEl.querySelector('#eng-ai-cancel').addEventListener('click', close);

  bodyEl.querySelector('#eng-ai-send').addEventListener('click', async () => {
    const q = bodyEl.querySelector('#eng-ai-question').value.trim();
    if (!q) { showToast('اكتب سؤالك أولاً', 'warning'); return; }
    const apiKey = await settings.get('geminiApiKey');
    if (!apiKey) { showToast('أدخل مفتاح Gemini API في الإعدادات أولاً', 'warning', 5000); return; }

    const btn = bodyEl.querySelector('#eng-ai-send');
    const answerEl = bodyEl.querySelector('#eng-ai-answer');
    btn.disabled = true; btn.textContent = '⏳ جاري التفكير…';
    try {
      const answer = await askAboutWord(apiKey, word, q);
      answerEl.textContent = answer;
    } catch (err) {
      showToast(err.message, 'error', 6000);
    } finally {
      btn.disabled = false; btn.textContent = '✨ إرسال';
    }
  });
}

/* ─── "مفرداتي" tab — search, filters, add custom word ─────────── */
function renderMyDeckTab(container, el) {
  const entries = S.wordBank
    .filter(w => S.cards[w.id])
    .map(w => ({ word: w, card: S.cards[w.id] }));

  el.innerHTML = `
    <div class="eng-mydeck-head">
      <div>
        <h2 class="eng-serif">مفرداتي</h2>
        <p class="text-muted text-sm">${entries.length} كلمة في مجموعتك النشطة</p>
      </div>
      <button class="btn btn-primary" id="eng-add-word-btn">➕ إضافة كلمة</button>
    </div>

    <div class="eng-filters-row">
      <div class="search-wrap" style="flex:1;">
        <span class="search-icon">🔍</span>
        <input type="text" class="form-input" id="eng-search" placeholder="ابحث عن كلمة أو ترجمة…" dir="auto">
      </div>
      <div class="eng-filter-pills">
        ${STATUS_FILTERS.map(f => `<button class="eng-filter-pill" data-filter="${f.id}">${f.label}</button>`).join('')}
      </div>
    </div>

    <div id="eng-deck-grid" class="eng-deck-grid"></div>
  `;

  let query = '';
  let statusFilter = 'all';

  function applyAndRender() {
    const filtered = entries.filter(({ word, card }) => {
      const matchesQ = !query || word.word.toLowerCase().includes(query.toLowerCase()) || (word.ar || '').includes(query);
      let matchesStatus = true;
      if (statusFilter === 'due') matchesStatus = isDue(card);
      else if (statusFilter !== 'all') matchesStatus = card.status === statusFilter;
      return matchesQ && matchesStatus;
    });

    const grid = el.querySelector('#eng-deck-grid');
    grid.innerHTML = filtered.length === 0
      ? `<p class="text-muted text-sm" style="padding:var(--s7) 0;">لا توجد كلمات مطابقة</p>`
      : filtered.map(({ word, card }) => deckRowHtml(word, card)).join('');

    grid.querySelectorAll('.eng-deck-row').forEach(row => {
      const wordId = row.dataset.wordId;
      row.addEventListener('click', (e) => {
        if (e.target.closest('[data-speak]')) return;
        row.classList.toggle('open');
      });
      row.querySelector('[data-speak]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const text = e.currentTarget.dataset.speak;
        if (!('speechSynthesis' in window)) return;
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-US';
        window.speechSynthesis.speak(u);
      });
    });
  }

  el.querySelector('#eng-search').addEventListener('input', (e) => { query = e.target.value.trim(); applyAndRender(); });
  el.querySelectorAll('.eng-filter-pill').forEach((btn, i) => {
    if (i === 0) btn.classList.add('active');
    btn.addEventListener('click', () => {
      statusFilter = btn.dataset.filter;
      el.querySelectorAll('.eng-filter-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyAndRender();
    });
  });
  el.querySelector('#eng-add-word-btn').addEventListener('click', () => openAddWordModal(container));

  applyAndRender();
}

function deckRowHtml(word, card) {
  const due = isDue(card);
  const statusLabel = due ? 'مستحقة الآن' : `بعد ${forecastLabel(daysUntil(card.dueDate))}`;
  return `
    <div class="eng-deck-row" data-word-id="${word.id}">
      <div class="eng-deck-row-top">
        <div>
          <span class="eng-serif" style="font-size:1.05rem;font-weight:700;">${escHtml(word.word)}</span>
          <span class="eng-level-badge-sm level-${(word.level || 'A1').toLowerCase()}">${word.level || 'A1'}</span>
          ${word.custom ? `<span class="eng-custom-badge">مخصصة</span>` : ''}
        </div>
        <button class="eng-speak-btn-sm" data-speak="${escHtml(word.word)}">🔊</button>
      </div>
      <p class="text-muted text-xs" style="margin-top:var(--s2);">
        ${due ? `<span style="color:#e6a82b;">${statusLabel}</span>` : statusLabel} · ${card.status}
      </p>
      <div class="eng-deck-row-detail">
        ${word.ar ? `<p dir="rtl" class="eng-translation" style="margin:var(--s3) 0;">${escHtml(word.ar)}</p>` : ''}
        ${word.definition ? `<p class="text-sm text-muted">${escHtml(word.definition)}</p>` : ''}
        ${word.examples?.daily ? `<p class="text-xs text-muted" style="font-style:italic;" dir="ltr">"${escHtml(word.examples.daily)}"</p>` : ''}
      </div>
    </div>
  `;
}

function daysUntil(iso) {
  return Math.max(0, Math.round((new Date(iso) - new Date()) / 86_400_000));
}

/* ─── Add a custom word (manual + optional AI auto-fill) ─────────── */
function openAddWordModal(container) {
  const backdrop = document.getElementById('modal-form');
  const titleEl  = document.getElementById('modal-form-title');
  const bodyEl   = document.getElementById('modal-form-body');
  const closeBtn = document.getElementById('modal-form-close');

  titleEl.textContent = 'إضافة كلمة إنجليزية جديدة';
  backdrop.classList.remove('hidden');
  bodyEl.innerHTML = `
    <div class="form-group">
      <label class="form-label">الكلمة الإنجليزية *</label>
      <input type="text" class="form-input" id="w-word" dir="ltr">
      <span class="form-error" id="w-word-error">مطلوب.</span>
    </div>
    <div style="margin-bottom:var(--s5);">
      <button type="button" class="btn btn-secondary btn-sm" id="w-ai-btn">✨ تعبئة تلقائية بالذكاء الاصطناعي</button>
    </div>
    <div class="form-group">
      <label class="form-label">المستوى</label>
      <select class="form-select" id="w-level">
        <option value="A1">A1</option><option value="A2">A2</option>
        <option value="B1">B1</option><option value="B2">B2</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">نوع الكلمة (اختياري)</label>
      <input type="text" class="form-input" id="w-pos" dir="ltr" placeholder="مثال: n. / v. / adj.">
    </div>
    <div class="form-group">
      <label class="form-label">الترجمة العربية</label>
      <input type="text" class="form-input" id="w-ar" dir="rtl">
    </div>
    <div class="form-group">
      <label class="form-label">التعريف</label>
      <textarea class="form-textarea" id="w-def" rows="2" dir="ltr"></textarea>
    </div>
    <div class="form-group">
      <label class="form-label">مثال (حياة يومية)</label>
      <input type="text" class="form-input" id="w-ex-daily" dir="ltr">
    </div>
    <div class="form-group">
      <label class="form-label">مثال (أكاديمي)</label>
      <input type="text" class="form-input" id="w-ex-academic" dir="ltr">
    </div>
    <div class="form-group">
      <label class="form-label">مثال (اصطلاحي)</label>
      <input type="text" class="form-input" id="w-ex-idiom" dir="ltr">
    </div>
    <div style="display:flex;gap:var(--s4);justify-content:flex-end;">
      <button class="btn btn-ghost" id="w-cancel">إلغاء</button>
      <button class="btn btn-primary" id="w-save">✅ إضافة</button>
    </div>
  `;
  const close = () => backdrop.classList.add('hidden');
  closeBtn.addEventListener('click', close, { once: true });
  bodyEl.querySelector('#w-cancel').addEventListener('click', close);

  bodyEl.querySelector('#w-ai-btn').addEventListener('click', async () => {
    const word = bodyEl.querySelector('#w-word').value.trim();
    if (!word) { showToast('اكتب الكلمة أولاً', 'warning'); return; }
    const apiKey = await settings.get('geminiApiKey');
    if (!apiKey) { showToast('أدخل مفتاح Gemini API في الإعدادات أولاً', 'warning', 5000); return; }

    const btn = bodyEl.querySelector('#w-ai-btn');
    btn.disabled = true; const original = btn.textContent; btn.textContent = '⏳ جاري التوليد…';
    try {
      const entry = await generateEnglishWordEntry(apiKey, word);
      bodyEl.querySelector('#w-level').value = entry.level;
      bodyEl.querySelector('#w-pos').value = entry.pos;
      bodyEl.querySelector('#w-ar').value = entry.ar;
      bodyEl.querySelector('#w-def').value = entry.definition;
      bodyEl.querySelector('#w-ex-daily').value = entry.examples.daily;
      bodyEl.querySelector('#w-ex-academic').value = entry.examples.academic;
      bodyEl.querySelector('#w-ex-idiom').value = entry.examples.idiom;
      showToast('تم التوليد بنجاح ✨', 'success');
    } catch (err) {
      showToast(err.message, 'error', 6000);
    } finally {
      btn.disabled = false; btn.textContent = original;
    }
  });

  bodyEl.querySelector('#w-save').addEventListener('click', async () => {
    const wordText = bodyEl.querySelector('#w-word').value.trim();
    if (!wordText) { bodyEl.querySelector('#w-word-error').classList.add('visible'); return; }

    const newWord = {
      id: `custom-${uid()}`,
      word: wordText,
      pos: bodyEl.querySelector('#w-pos').value.trim(),
      level: bodyEl.querySelector('#w-level').value,
      ar: bodyEl.querySelector('#w-ar').value.trim(),
      definition: bodyEl.querySelector('#w-def').value.trim(),
      examples: {
        daily:    bodyEl.querySelector('#w-ex-daily').value.trim(),
        academic: bodyEl.querySelector('#w-ex-academic').value.trim(),
        idiom:    bodyEl.querySelector('#w-ex-idiom').value.trim(),
      },
      custom: true,
    };

    await customWordsDB.save(newWord);
    const card = createNewCard(newWord.id);
    await cardsDB.save(card);

    S.customWords.push(newWord);
    S.wordBank.push(newWord);
    S.wordById.set(newWord.id, newWord);
    S.cards[newWord.id] = card;
    S.seenIds.add(newWord.id);
    await persistState();

    close();
    paint(container);
    showToast('تمت إضافة الكلمة إلى مفرداتك', 'success');
  });
}
