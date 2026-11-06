/**
 * english.js — قسم "الإنجليزية"
 *
 * نفس منطق Lexora (قاموس Oxford 3000 + دفعة يومية ديناميكية + SRS بأسلوب
 * Anki بـ4 أزرار تقييم) لكن بنفس هوية تصميم باقي أقسام مذاكر بالضبط
 * (نفس البطاقات، الألوان، التبويبات، وبطاقة القلب المستخدمة في "بطاقات
 * المراجعة") — بدون أي ثيم منفصل.
 */

import { oxfordWords, legacyOxfordWords } from '../data/oxfordWords.js';
import { englishCards as cardsDB, englishWords as customWordsDB, settings } from '../db.js';
import { createNewCard, applyRating, isDue, isReviewActive, forecastLabel, RATINGS } from '../services/englishSrs.js';
import { englishMessageForDay } from '../data/dailyMotivation.js';
import { localStudyDay } from '../services/reviewPlanSchedule.js';
import { generateDailyQueue, buildReviewQueue } from '../services/englishQueue.js';
import { mergeVocabulary, normalizeWord, activeWordKeys } from '../services/englishVocabulary.js';
import { renderEnglishCatalog, creditHtml } from './englishCatalog.js';
import { generateEnglishWordEntry, askAboutWord, extractEnglishWordList, extractTextFromImage } from '../services/studyAI.js';
import { extractFileContent, needsVisionOCR, validateFile } from '../services/extractor.js';
import { uid, showToast, escHtml, todayStr } from '../utils/helpers.js';

const SETTINGS_KEYS = {
  QUEUE:  'englishDailyQueue',
  STATS:  'englishStats',
  SEEN:   'englishSeenIds',
  TARGET: 'englishDailyTarget',
};

const DEFAULT_STATS  = { streak: 0, longestStreak: 0, lastActiveDate: null, totalReviewed: 0 };
const DEFAULT_TARGET = 10; // يدوي بالكامل — المستخدم يقدر يغيّره من لوحة التحكم

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const RATING_BUTTONS = [
  { key: RATINGS.HARD,      label: 'صعب جدًا', cls: 'btn-rate-again' },
  { key: RATINGS.GOOD,      label: 'متوسط',   cls: 'btn-rate-hard'  },
  { key: RATINGS.EASY,      label: 'سهل',     cls: 'btn-rate-good'  },
  { key: RATINGS.VERY_EASY, label: 'سهل جدًا', cls: 'btn-rate-easy'  },
];

const STATUS_FILTERS = [
  { id: 'all',      label: 'كل الحالات'  },
  { id: 'due',      label: 'مستحقة الآن' },
  { id: 'new',      label: 'جديدة'       },
  { id: 'learning', label: 'قيد التعلم'  },
  { id: 'review',   label: 'مراجعة'      },
  { id: 'mastered', label: 'متقنة'       },
];

function speakEnglish(text) {
  if (!window.speechSynthesis || !text) return;
  const speech = window.speechSynthesis;
  const voices = speech.getVoices().filter(voice => /^en(?:-|$)/i.test(voice.lang));
  const american = voices.filter(voice => /^en-US$/i.test(voice.lang));
  const voice = american.find(voice => /natural|neural|premium|enhanced|google us english/i.test(voice.name))
    || american.find(voice => !voice.localService)
    || voices.find(voice => /natural|neural|premium|enhanced/i.test(voice.name))
    || american.find(voice => /samantha|aria|jenny|zira/i.test(voice.name))
    || american[0] || voices[0];
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = voice?.lang || 'en-US';
  if (voice) utterance.voice = voice;
  utterance.rate = 0.87;
  speech.cancel();
  speech.speak(utterance);
}

async function removeWord(word, button, onRemoved) {
  if (!window.confirm(`حذف «${word.word}» من مفرداتك ومراجعاتك؟`)) return;
  button.disabled = true;
  const card = S.cards[word.id] || createNewCard(word.id);
  const removed = { ...card, status: 'removed', dueDate: null };
  try {
    await cardsDB.save(removed);
    S.cards[word.id] = removed;
    showToast('تم حذف الكلمة من مفرداتك ومراجعاتك.', 'success');
    onRemoved();
  } catch {
    showToast('تعذّر حذف الكلمة. حاول مرة أخرى.', 'error');
    button.disabled = false;
  }
}

/* ─── Module state (reloaded fresh every time the page renders) ── */
let S = null;

export async function renderEnglish(container) {
  container.innerHTML = `<div class="flex-center" style="padding:var(--s10)"><div class="spinner"></div></div>`;
  await loadState();
  await ensureTodayQueue();
  await persistState();
  S.activeTab    = S.activeTab || 'dashboard';
  S.levelFilter  = S.levelFilter || 'all';
  S.statusFilter = S.statusFilter || 'all';
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

  const cardsById = {};
  allCards.forEach(c => { cardsById[c.id] = c; });
  const wordBank = mergeVocabulary(dictionaryWords(cardsById), customWords, cardsById);
  const wordById = new Map(wordBank.map(w => [w.id, w]));

  S = {
    wordBank,
    wordById,
    customWords,
    cards: cardsById,
    seenIds: new Set([...(Array.isArray(seenArr) ? seenArr : []), ...Object.keys(cardsById)]),
    queue: queue || { date: null, wordIds: [] },
    stats: stats || { ...DEFAULT_STATS },
    dailyTarget: target || DEFAULT_TARGET,
    sessionIndex: 0,
    activeTab: S?.activeTab,
    levelFilter: S?.levelFilter,
    statusFilter: S?.statusFilter,
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

function dictionaryWords(cards) {
  return [...oxfordWords, ...legacyOxfordWords.filter(word => cards[word.id])];
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

// يبني دفعة اليوم فقط إذا ما جهزناها من قبل اليوم — الحد يدوي بالكامل من الإعدادات (افتراضي 10)
async function ensureTodayQueue() {
  const today = todayStr();
  touchStreak();
  if (S.queue.date === today) return;

  const result = generateDailyQueue(S.wordBank, S.seenIds, S.dailyTarget, { min: 0.6, max: 0.7 });

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

/* ─── Shell + tab switching (نفس مكوّن .tabs المستخدم بصفحة المادة) ── */
function paint(container) {
  const dueCount = Object.values(S.cards).filter(c => isDue(c)).length;

  container.innerHTML = `
    <div class="page-hd">
      <div class="page-hd-text">
        <h2>الإنجليزية</h2>
        <p lang="en" dir="ltr">${englishMessageForDay(localStudyDay())}</p>
      </div>
    </div>

    <div class="tabs" id="eng-tabs">
      <button class="tab-btn ${S.activeTab === 'dashboard' ? 'active' : ''}" data-tab="dashboard">📊 لوحة التحكم</button>
      <button class="tab-btn ${S.activeTab === 'today' ? 'active' : ''}" data-tab="today">🎯 كلمات اليوم${dueCount ? ` (${dueCount})` : ''}</button>
      <button class="tab-btn ${S.activeTab === 'mydeck' ? 'active' : ''}" data-tab="mydeck">📚 مفرداتي</button>
      <button class="tab-btn ${S.activeTab === 'catalog' ? 'active' : ''}" data-tab="catalog">📖 معجم Oxford</button>
    </div>

    <div id="eng-content" style="margin-top:var(--s7);"></div>
  `;

  container.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      S.activeTab = btn.dataset.tab;
      S.sessionIndex = 0;
      paint(container);
    });
  });

  const content = container.querySelector('#eng-content');
  if (S.activeTab === 'today') renderTodayTab(container, content);
  else if (S.activeTab === 'mydeck') renderMyDeckTab(container, content);
  else if (S.activeTab === 'catalog') renderCatalogTab(container, content);
  else renderDashboardTab(container, content);
}

/* ─── Dashboard tab ───────────────────────────────────────────── */
function renderDashboardTab(container, el) {
  const dueCount   = Object.values(S.cards).filter(c => isDue(c)).length;
  const totalSeen  = S.seenIds.size;
  const totalBank  = S.wordBank.length;
  const remaining  = Math.max(0, totalBank - totalSeen);
  const todayIds = new Set([
    ...S.queue.wordIds,
    ...Object.values(S.cards).filter(c => c.status !== 'removed' && (isDue(c) || wasReviewedToday(c))).map(c => c.id),
  ]);
  const todayCards = [...todayIds].filter(id => S.wordById.has(id) && S.cards[id]?.status !== 'removed');
  const todayTotal = todayCards.length;
  const todayDone  = todayCards.filter(id => wasReviewedToday(S.cards[id]) && !isDue(S.cards[id])).length;
  const pct = todayTotal ? Math.min(100, Math.round((todayDone / todayTotal) * 100)) : 0;

  el.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--warning-soft, rgba(245,158,11,.12));">🔥</div>
        <div>
          <div class="stat-val">${S.stats.streak}</div>
          <div class="stat-lbl">يوم متتالي (الأطول: ${S.stats.longestStreak})</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon stat-icon-green">✅</div>
        <div>
          <div class="stat-val">${S.stats.totalReviewed}</div>
          <div class="stat-lbl">إجمالي المراجعات</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--danger-soft);">⏰</div>
        <div>
          <div class="stat-val">${dueCount}</div>
          <div class="stat-lbl">مستحقة الآن</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon stat-icon-blue">📚</div>
        <div>
          <div class="stat-val">${totalSeen}/${totalBank}</div>
          <div class="stat-lbl">${remaining} كلمة متبقية</div>
        </div>
      </div>
    </div>

    <div class="dash-grid" style="display:grid;grid-template-columns:2fr 1fr;gap:var(--s7);">
      <div class="card">
        <div class="flex" style="justify-content:space-between;align-items:center;margin-bottom:var(--s5);">
          <h3 style="font-size:1rem;font-weight:700;">تقدّم اليوم</h3>
          <span class="text-muted text-sm">${todayDone} / ${todayTotal} كلمة</span>
        </div>
        <div class="study-progress-bar"><div class="study-progress-fill" style="width:${pct}%"></div></div>
        <p class="text-muted text-sm" style="margin-top:var(--s4)">
          ${todayTotal === 0
            ? 'لا توجد مراجعات مستحقة أو كلمات جديدة الآن. ستعود كلماتك عند موعد مراجعتها.'
            : pct === 100
              ? 'أنجزت كل شيء اليوم! 🎉'
              : `تبقّى ${todayTotal - todayDone} كلمة في دفعة اليوم.`}
        </p>
        <button class="btn btn-primary" id="eng-go-today" style="margin-top:var(--s5)">اذهب لكلمات اليوم ←</button>
      </div>

      <div class="card">
        <h3 style="font-size:1rem;font-weight:700;margin-bottom:var(--s5);">✨ إجراءات سريعة</h3>
        <button class="btn btn-secondary w-full" id="eng-go-mydeck" style="margin-bottom:var(--s3);">📚 مفرداتي</button>
        <button class="btn btn-secondary w-full" id="eng-go-target" style="margin-bottom:var(--s3);">🎯 الحد اليومي (${S.dailyTarget} كلمة)</button>
        <button class="btn btn-secondary w-full" id="eng-go-import">📥 استيراد من ملف/صورة</button>
      </div>
    </div>
  `;

  el.querySelector('#eng-go-today')?.addEventListener('click', () => switchTab(container, 'today'));
  el.querySelector('#eng-go-mydeck')?.addEventListener('click', () => switchTab(container, 'mydeck'));
  el.querySelector('#eng-go-target')?.addEventListener('click', () => openTargetModal(container));
  el.querySelector('#eng-go-import')?.addEventListener('click', () => openImportModal(container));
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

  titleEl.textContent = 'الحد اليومي للكلمات الجديدة';
  backdrop.classList.remove('hidden');
  bodyEl.innerHTML = `
    <div class="form-group">
      <label class="form-label">عدد الكلمات الجديدة يومياً (يدوي بالكامل)</label>
      <input type="number" class="form-input" id="eng-target-input" min="1" step="1" value="${S.dailyTarget}">
      <span class="form-hint">افتراضياً 10 كلمات — غيّره لأي رقم تناسبه.</span>
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
    const val = Math.max(1, parseInt(bodyEl.querySelector('#eng-target-input').value, 10) || DEFAULT_TARGET);
    S.dailyTarget = val;
    await persistState();
    close();
    paint(container);
    showToast('تم تحديث الحد اليومي', 'success');
  });
}

/* ─── "كلمات اليوم" tab — نفس بطاقة القلب المستخدمة في «بطاقات المراجعة» ── */
function renderTodayTab(container, el) {
  const words = buildReviewQueue(S.wordBank, S.cards, S.queue.wordIds);
  const index = S.sessionIndex;
  const total = index + words.length;

  if (words.length === 0) {
    const nextDue = Object.values(S.cards)
      .filter(card => S.wordById.has(card.id) && isReviewActive(card) && card.dueDate && !isDue(card) && Number.isFinite(new Date(card.dueDate).getTime()))
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];
    const nextLabel = nextDue ? new Date(nextDue.dueDate).toLocaleString('ar-SA') : '';
    el.innerHTML = `
      <div class="study-done">
        <div class="study-done-icon">🎉</div>
        <h3 class="study-done-title">${index ? 'انتهت الجلسة!' : 'لا توجد كلمات مستحقة الآن'}</h3>
        <p class="text-muted">${index ? `راجعت ${index} كلمة في هذه الجلسة. ` : ''}ستعود كلماتك عند موعد مراجعتها.</p>
        ${nextLabel ? `<p class="text-muted">أقرب مراجعة: ${escHtml(nextLabel)}</p>` : ''}
        <div style="margin-top:var(--s6);">
          <button class="btn btn-secondary" id="eng-refresh">🔄 تحديث المراجعات</button>
          <button class="btn btn-primary" id="eng-empty-go-mydeck">📚 اذهب لمفرداتي</button>
        </div>
      </div>
    `;
    el.querySelector('#eng-refresh')?.addEventListener('click', () => renderEnglish(container));
    el.querySelector('#eng-empty-go-mydeck')?.addEventListener('click', () => switchTab(container, 'mydeck'));
    return;
  }

  const word = words[0];
  const currentCard = S.cards[word.id] || createNewCard(word.id);

  el.innerHTML = `
    <p class="study-counter" id="eng-counter">البطاقة ${index + 1} من ${total}</p>
    <div class="study-progress-bar">
      <div class="study-progress-fill" style="width:${Math.round((index / total) * 100)}%"></div>
    </div>

    <div class="study-scene eng-study-scene" id="eng-scene" role="button" tabindex="0" aria-label="اقلب البطاقة بعد كتابة إجابتك">
      <div class="study-card-inner" id="eng-card-inner">
        <div class="study-card-face study-card-front">
          <span class="stage-badge level-badge level-${(word.level || 'A1').toLowerCase()}">${word.level || 'A1'} · ${escHtml(word.pos || '—')}</span>
          <p class="study-card-text" dir="ltr">${escHtml(word.word)}</p>
          <button class="btn btn-sm btn-secondary" id="eng-speak-front" type="button">🔊 نطق</button>
          <p class="study-card-hint">اضغط البطاقة لكشف الترجمة</p>
        </div>
        <div class="study-card-face study-card-back">
          <p class="study-card-text" dir="rtl">${escHtml(word.ar || '—')}</p>
          <p class="text-muted text-sm" dir="ltr">${escHtml(word.definition || '')}</p>
          ${exampleRowHtml(word.exampleLabels?.[0] || 'حياة يومية', word.examples?.daily, word.exampleCredits?.[0])}
          ${exampleRowHtml(word.exampleLabels?.[1] || 'أكاديمي', word.examples?.academic, word.exampleCredits?.[1])}
          ${exampleRowHtml(word.exampleLabels?.[2] || 'اصطلاحي', word.examples?.idiom, word.exampleCredits?.[2])}
          <button class="btn btn-sm btn-secondary" id="eng-ask-ai" type="button">💬 اسأل الذكاء الاصطناعي</button>
        </div>
      </div>
    </div>

    <form class="eng-writing-practice" id="eng-writing-practice">
      <div class="eng-writing-fields">
        <label>اكتب الترجمة <span class="text-muted">(مطلوب)</span>
          <input class="form-input" id="eng-answer-translation" required autocomplete="off" dir="rtl">
        </label>
        <label>اكتب الكلمة بالإنجليزي <span class="text-muted">(مطلوب)</span>
          <input class="form-input" id="eng-answer-word" required autocomplete="off" dir="ltr">
        </label>
        <label>استخدم الكلمة في جملة <span class="text-muted">(اختياري)</span>
          <textarea class="form-input" rows="2" dir="ltr"></textarea>
        </label>
      </div>
      <button type="submit" formnovalidate class="btn btn-secondary">اكشف الإجابة</button>
    </form>
    <div class="rate-grid" id="eng-rate-grid" style="display:none;">
      ${RATING_BUTTONS.map(b => {
        const next = applyRating(currentCard, b.key);
        const hint = next.status === 'mastered' ? 'تخرج من المراجعات' : forecastLabel(next.interval);
        return `<button class="btn ${b.cls}" data-rating="${b.key}">${b.label}<span>${hint}</span></button>`;
      }).join('')}
    </div>
    <p class="text-muted text-xs text-center mt-4">تقدر تكشف الإجابة أولًا. اكتب الترجمة والكلمة قبل التقييم.</p>
    <div class="text-center mt-4"><button type="button" class="btn btn-sm btn-danger" id="eng-remove-word">حذف الكلمة</button></div>
  `;

  bindFlashcard(container, el, word);
}

function exampleRowHtml(label, text, credit) {
  if (!text) return '';
  return `
    <div class="example-row">
      <div class="example-row-head">
        <span>${escHtml(label)}</span>
        <button class="tts-btn-inline" data-speak="${escHtml(text)}" title="نطق">🔊</button>
      </div>
      <p dir="ltr">${escHtml(text)}</p>
      ${creditHtml(credit)}
    </div>
  `;
}

function bindFlashcard(container, el, word) {
  const scene    = el.querySelector('#eng-scene');
  const inner    = el.querySelector('#eng-card-inner');
  const rateGrid = el.querySelector('#eng-rate-grid');
  const practice = el.querySelector('#eng-writing-practice');
  const requiredAnswers = ['#eng-answer-translation', '#eng-answer-word'].map(id => el.querySelector(id));
  let flipped = false;

  function practiceComplete() {
    for (const input of requiredAnswers) {
      if (input.value.trim()) continue;
      input.value = '';
      input.reportValidity();
      return false;
    }
    return true;
  }

  function flip() {
    flipped = !flipped;
    inner.classList.toggle('flipped', flipped);
    rateGrid.style.display = flipped ? 'grid' : 'none';
  }

  practice.addEventListener('submit', event => {
    event.preventDefault();
    if (!flipped) flip();
  });

  scene.addEventListener('click', (e) => {
    if (e.target.closest('button, a')) return;
    flip();
  });
  scene.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.target.closest('button, a')) { e.preventDefault(); flip(); }
  });

  el.querySelector('#eng-speak-front')?.addEventListener('click', (e) => { e.stopPropagation(); speakEnglish(word.word); });
  el.querySelectorAll('[data-speak]').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); speakEnglish(btn.dataset.speak); });
  });
  el.querySelector('#eng-ask-ai')?.addEventListener('click', (e) => { e.stopPropagation(); openAskAiModal(word); });

  const ratingButtons = [...rateGrid.querySelectorAll('[data-rating]')];
  const removeButton = el.querySelector('#eng-remove-word');
  let saving = false;
  removeButton.addEventListener('click', () => {
    if (!saving) removeWord(word, removeButton, () => paint(container));
  });
  ratingButtons.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (saving || removeButton.disabled || !practiceComplete()) return;
      saving = true;
      removeButton.disabled = true;
      ratingButtons.forEach(button => { button.disabled = true; });
      const current = S.cards[word.id] || createNewCard(word.id);
      const updated = applyRating(current, btn.dataset.rating);
      try {
        // Do not advance or hide the card unless its review date was saved.
        await cardsDB.save(updated);
        S.cards[word.id] = updated;
        if (updated.status === 'mastered') showToast('أتقنت الكلمة! خرجت من المراجعات.', 'success');
        S.stats.totalReviewed += 1;
        touchStreak();
        try { await persistState(); } catch {
          showToast('تم حفظ المراجعة، لكن تعذّر تحديث الإحصائيات. أعد تحميل الصفحة لاحقاً.', 'warning');
        }
        S.sessionIndex += 1;
        paint(container);
      } catch {
        showToast('تعذّر حفظ المراجعة. حاول مرة أخرى.', 'error');
        saving = false;
        removeButton.disabled = false;
        ratingButtons.forEach(button => { button.disabled = false; });
      }
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

    const btn = bodyEl.querySelector('#eng-ai-send');
    const answerEl = bodyEl.querySelector('#eng-ai-answer');
    btn.disabled = true; btn.textContent = '⏳ جاري التفكير…';
    try {
      answerEl.textContent = await askAboutWord(word, q);
    } catch (err) {
      showToast(err.message, 'error', 6000);
    } finally {
      btn.disabled = false; btn.textContent = '✨ إرسال';
    }
  });
}

/* ─── "مفرداتي" tab — فلاتر المستوى (قابلة للضغط) + الحالة + بحث ─────── */
function renderCatalogTab(container, el) {
  renderEnglishCatalog(el, {
    words: S.wordBank.filter(word => word.isOxford),
    cards: S.cards,
    onAdd: async words => {
      const added = await activateCatalogWords(words);
      const dueCount = Object.values(S.cards).filter(card => isDue(card)).length;
      const todayTab = container.querySelector('[data-tab="today"]');
      if (todayTab) todayTab.textContent = `🎯 كلمات اليوم${dueCount ? ` (${dueCount})` : ''}`;
      return added;
    },
  });
}

async function activateCatalogWords(words) {
  let added = 0;
  const known = activeWordKeys(S.wordBank, S.cards);
  const candidates = words.filter(word => {
    const key = normalizeWord(word.word);
    if (S.cards[word.id] || known.has(key)) return false;
    known.add(key);
    return true;
  });
  // Persist only SRS records; shared dictionary content stays bundled in the app.
  for (let i = 0; i < candidates.length; i += 100) {
    const cards = candidates.slice(i, i + 100).map(word => createNewCard(word.id));
    await cardsDB.bulkSave(cards);
    if (S.queue.date !== todayStr()) S.queue = { date: todayStr(), wordIds: [] };
    cards.forEach(card => {
      S.cards[card.id] = card;
      S.seenIds.add(card.id);
      if (!S.queue.wordIds.includes(card.id)) S.queue.wordIds.push(card.id);
    });
    added += cards.length;
  }
  try { await persistState(); } catch {
    showToast('تم حفظ الكلمات، لكن تعذّر تحديث إعدادات اليوم. ستظهر الكلمات بعد إعادة التحميل.', 'warning');
  }
  return added;
}

function renderMyDeckTab(container, el) {
  const entries = S.wordBank
    .filter(w => S.cards[w.id] && S.cards[w.id].status !== 'removed')
    .map(w => ({ word: w, card: S.cards[w.id] }));

  el.innerHTML = `
    <div class="page-hd" style="margin-bottom:var(--s5);">
      <div class="page-hd-text">
        <h2 style="font-size:1.2rem;">مفرداتي</h2>
        <p>${entries.length} كلمة في مجموعتك النشطة</p>
      </div>
      <div class="flex gap-3 wrap">
        <button class="btn btn-secondary btn-sm" id="eng-import-btn">📥 استيراد من ملف/صورة</button>
        <button class="btn btn-primary btn-sm" id="eng-add-word-btn">➕ إضافة كلمة</button>
      </div>
    </div>

    <div class="search-wrap" style="max-width:360px;margin-bottom:var(--s5);">
      <span class="search-icon">🔍</span>
      <input type="text" class="form-input" id="eng-search" placeholder="ابحث عن كلمة أو ترجمة…" dir="auto">
    </div>

    <div class="flex gap-2 wrap" style="margin-bottom:var(--s3);" id="eng-level-filters">
      <button class="filter-pill active" data-level="all">كل المستويات</button>
      ${LEVELS.map(l => `<button class="filter-pill level-${l.toLowerCase()}" data-level="${l}">${l}</button>`).join('')}
    </div>
    <div class="flex gap-2 wrap" style="margin-bottom:var(--s6);" id="eng-status-filters">
      ${STATUS_FILTERS.map((f, i) => `<button class="filter-pill ${i === 0 ? 'active' : ''}" data-status="${f.id}">${f.label}</button>`).join('')}
    </div>

    <div id="eng-deck-grid" class="grid-2"></div>
  `;

  let query = '';

  function applyAndRender() {
    const filtered = entries.filter(({ word, card }) => {
      const matchesQ = !query || word.word.toLowerCase().includes(query.toLowerCase()) || (word.ar || '').includes(query);
      const matchesLevel = S.levelFilter === 'all' || word.level === S.levelFilter;
      let matchesStatus = true;
      if (S.statusFilter === 'due') matchesStatus = isDue(card);
      else if (S.statusFilter !== 'all') matchesStatus = card.status === S.statusFilter;
      return matchesQ && matchesLevel && matchesStatus;
    });

    const grid = el.querySelector('#eng-deck-grid');
    grid.innerHTML = filtered.length === 0
      ? `<p class="text-muted text-sm" style="padding:var(--s7) 0;">لا توجد كلمات مطابقة</p>`
      : filtered.map(({ word, card }) => deckRowHtml(word, card)).join('');

    grid.querySelectorAll('.flashcard-item').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('button, a')) return;
        row.classList.toggle('open');
      });
      row.querySelector('[data-speak]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        speakEnglish(e.currentTarget.dataset.speak);
      });
      row.querySelector('[data-remove-word]').addEventListener('click', event => {
        const word = S.wordById.get(row.dataset.wordId);
        if (word) removeWord(word, event.currentTarget, () => paint(container));
      });
    });
  }

  el.querySelector('#eng-search').addEventListener('input', (e) => { query = e.target.value.trim(); applyAndRender(); });

  el.querySelectorAll('#eng-level-filters .filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      S.levelFilter = btn.dataset.level;
      el.querySelectorAll('#eng-level-filters .filter-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyAndRender();
    });
  });
  el.querySelectorAll('#eng-status-filters .filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      S.statusFilter = btn.dataset.status;
      el.querySelectorAll('#eng-status-filters .filter-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyAndRender();
    });
  });

  el.querySelector('#eng-add-word-btn').addEventListener('click', () => openAddWordModal(container));
  el.querySelector('#eng-import-btn').addEventListener('click', () => openImportModal(container));

  applyAndRender();
}

function deckRowHtml(word, card) {
  const due = isDue(card);
  const statusLabel = card.status === 'mastered' ? 'متقنة · خارج المراجعات'
    : due ? 'مستحقة الآن' : `بعد ${forecastLabel(daysUntil(card.dueDate))}`;
  return `
    <div class="flashcard-item" data-word-id="${escHtml(word.id)}" style="cursor:pointer;flex-direction:column;align-items:stretch;">
      <div class="flex" style="justify-content:space-between;align-items:center;">
        <div>
          <span style="font-weight:700;" dir="ltr">${escHtml(word.word)}</span>
          <span class="stage-badge level-badge level-${(word.level || 'A1').toLowerCase()}">${word.level || 'A1'}</span>
          ${word.custom ? `<span class="category-badge">مخصصة</span>` : ''}
        </div>
        <div class="flex gap-2">
          <button type="button" class="tts-btn-inline" data-speak="${escHtml(word.word)}" aria-label="نطق الكلمة">🔊</button>
          <button type="button" class="btn btn-sm btn-danger" data-remove-word>حذف</button>
        </div>
      </div>
      <p class="text-muted text-xs" style="margin-top:var(--s2);">
        ${due ? `<span style="color:var(--warning);font-weight:700;">${statusLabel}</span>` : statusLabel}
      </p>
      <div class="deck-row-detail">
        ${word.ar ? `<p dir="rtl" style="margin:var(--s3) 0;font-weight:600;">${escHtml(word.ar)}</p>` : ''}
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
        ${LEVELS.map(l => `<option value="${l}">${l}</option>`).join('')}
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
    const bundled = S.wordBank.find(entry => entry.isOxford && normalizeWord(entry.word) === normalizeWord(word));

    const btn = bodyEl.querySelector('#w-ai-btn');
    btn.disabled = true; const original = btn.textContent; btn.textContent = '⏳ جاري التوليد…';
    try {
      const entry = bundled || await generateEnglishWordEntry(word);
      bodyEl.querySelector('#w-level').value = entry.level;
      bodyEl.querySelector('#w-pos').value = entry.pos;
      bodyEl.querySelector('#w-ar').value = entry.ar;
      bodyEl.querySelector('#w-def').value = entry.definition;
      bodyEl.querySelector('#w-ex-daily').value = entry.examples.daily;
      bodyEl.querySelector('#w-ex-academic').value = entry.examples.academic;
      bodyEl.querySelector('#w-ex-idiom').value = entry.examples.idiom;
      showToast(bundled ? 'تمت تعبئة البيانات من المعجم بدون استخدام API' : 'تم التوليد بنجاح ✨', 'success');
    } catch (err) {
      showToast(err.message, 'error', 6000);
    } finally {
      btn.disabled = false; btn.textContent = original;
    }
  });

  bodyEl.querySelector('#w-save').addEventListener('click', async () => {
    const wordText = bodyEl.querySelector('#w-word').value.trim();
    if (!wordText) { bodyEl.querySelector('#w-word-error').classList.add('visible'); return; }

    const newWord = buildCustomWord({
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
    });

    if (!await addWordToDeck(newWord)) {
      showToast('الكلمة موجودة في مفرداتك بالفعل', 'info');
      return;
    }
    close();
    paint(container);
    showToast('تمت إضافة الكلمة إلى مفرداتك', 'success');
  });
}

function buildCustomWord({ word, pos, level, ar, definition, examples }) {
  return {
    id: `custom-${uid()}`,
    word, pos, level, ar, definition, examples,
    custom: true,
  };
}

async function addWordToDeck(newWord) {
  if (activeWordKeys(S.wordBank, S.cards).has(normalizeWord(newWord.word))) return false;
  await customWordsDB.save(newWord);
  const card = createNewCard(newWord.id);
  await cardsDB.save(card);

  S.customWords.push(newWord);
  S.cards[newWord.id] = card;
  S.wordBank = mergeVocabulary(dictionaryWords(S.cards), S.customWords, S.cards);
  S.wordById = new Map(S.wordBank.map(word => [word.id, word]));
  S.seenIds.add(newWord.id);

  // Bug fix: a word you add yourself should show up in "كلمات اليوم" right
  // away — not silently disappear into "seen" limbo until some future daily
  // batch. Push it into today's queue explicitly (creating today's queue if
  // none exists yet), on top of whatever the automatic daily target picked.
  if (S.queue.date !== todayStr()) {
    S.queue = { date: todayStr(), wordIds: [] };
  }
  if (!S.queue.wordIds.includes(newWord.id)) {
    S.queue.wordIds.push(newWord.id);
  }

  await persistState();
  return true;
}

/* ─── Import candidate words from an uploaded file/image ──────────
 * Reuses the exact same extraction pipeline as the "المواد الدراسية"
 * file upload (extractFileContent → OCR if needed via الذكاء الاصطناعي),
 * then asks the assistant for a clean word list. The user reviews a checklist
 * (all pre-checked) before anything is added — uncheck to skip a word,
 * or leave everything checked to add the full extracted list at once.
 * ──────────────────────────────────────────────────────────────── */
function openImportModal(container) {
  const backdrop = document.getElementById('modal-form');
  const titleEl  = document.getElementById('modal-form-title');
  const bodyEl   = document.getElementById('modal-form-body');
  const closeBtn = document.getElementById('modal-form-close');

  titleEl.textContent = 'استيراد كلمات من ملف أو صورة';
  backdrop.classList.remove('hidden');
  bodyEl.innerHTML = `
    <div class="upload-zone" id="eng-upload-zone" tabindex="0" role="button" aria-label="رفع ملف">
      <input type="file" id="eng-file-input" accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.md,.csv">
      <div class="upload-icon">📂</div>
      <p class="upload-title">اسحب ملفاً أو صورة هنا أو انقر للاختيار</p>
      <p class="upload-sub">PDF، صور (PNG/JPG)، نص — سيتم استخراج الكلمات الإنجليزية تلقائياً</p>
    </div>
    <div id="eng-import-status" class="text-muted text-sm" style="margin-top:var(--s4);"></div>
    <div id="eng-import-results"></div>
  `;
  const close = () => backdrop.classList.add('hidden');
  closeBtn.addEventListener('click', close, { once: true });

  const zone  = bodyEl.querySelector('#eng-upload-zone');
  const input = bodyEl.querySelector('#eng-file-input');
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') input.click(); });
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) processImportFile(container, bodyEl, e.dataTransfer.files[0]);
  });
  input.addEventListener('change', () => {
    if (input.files[0]) processImportFile(container, bodyEl, input.files[0]);
    input.value = '';
  });
}

async function processImportFile(container, bodyEl, file) {
  const statusEl  = bodyEl.querySelector('#eng-import-status');
  const resultsEl = bodyEl.querySelector('#eng-import-results');
  resultsEl.innerHTML = '';

  const validation = validateFile(file);
  if (!validation.ok) { showToast(validation.error, 'error'); return; }

  try {
    statusEl.textContent = `⏳ جاري معالجة: ${file.name}…`;
    const extraction = await extractFileContent(file);
    let textContent = extraction.text || '';

    if (needsVisionOCR(extraction)) {
      statusEl.textContent = '⏳ جاري استخراج النص من الصورة…';
      textContent = await extractTextFromImage(extraction.base64, extraction.mimeType);
    }

    if (!textContent.trim()) {
      statusEl.textContent = '⚠️ لم يتم العثور على نص قابل للقراءة في هذا الملف.';
      return;
    }

    statusEl.textContent = '⏳ جاري استخراج الكلمات الإنجليزية بالذكاء الاصطناعي…';
    const words = await extractEnglishWordList(textContent);

    if (words.length === 0) {
      statusEl.textContent = '⚠️ ما لقيت كلمات إنجليزية مناسبة بهذا الملف.';
      return;
    }

    statusEl.textContent = `✅ تم العثور على ${words.length} كلمة — راجع القائمة واختر اللي تبيها:`;
    renderImportChecklist(container, bodyEl, resultsEl, words);
  } catch (err) {
    statusEl.textContent = '';
    showToast(err.message, 'error', 7000);
  }
}

function renderImportChecklist(container, bodyEl, resultsEl, words) {
  resultsEl.innerHTML = `
    <div class="flex gap-3" style="margin:var(--s4) 0;">
      <button class="btn btn-ghost btn-sm" id="imp-select-all">تحديد الكل</button>
      <button class="btn btn-ghost btn-sm" id="imp-select-none">إلغاء التحديد</button>
    </div>
    <div class="import-checklist">
      ${words.map((w, i) => `
        <label class="import-check-row">
          <input type="checkbox" checked data-word="${escHtml(w)}" id="imp-${i}">
          <span dir="ltr">${escHtml(w)}</span>
        </label>
      `).join('')}
    </div>
    <div style="display:flex;gap:var(--s4);justify-content:flex-end;margin-top:var(--s5);">
      <button class="btn btn-primary" id="imp-add-selected">✨ إضافة المحدد + توليد التفاصيل بالذكاء الاصطناعي</button>
    </div>
    <div id="imp-progress" class="text-muted text-sm" style="margin-top:var(--s3);"></div>
  `;

  resultsEl.querySelector('#imp-select-all').addEventListener('click', () => {
    resultsEl.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = true);
  });
  resultsEl.querySelector('#imp-select-none').addEventListener('click', () => {
    resultsEl.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = false);
  });

  resultsEl.querySelector('#imp-add-selected').addEventListener('click', async () => {
    const selected = Array.from(resultsEl.querySelectorAll('input[type=checkbox]:checked')).map(cb => cb.dataset.word);
    if (selected.length === 0) { showToast('اختر كلمة واحدة على الأقل', 'warning'); return; }

    const btn = resultsEl.querySelector('#imp-add-selected');
    const progressEl = resultsEl.querySelector('#imp-progress');
    btn.disabled = true;

    let done = 0, added = 0;
    for (const word of selected) {
      progressEl.textContent = `⏳ جاري الإضافة… (${++done}/${selected.length}) ${word}`;
      if (activeWordKeys(S.wordBank, S.cards).has(normalizeWord(word))) continue;
      const bundled = S.wordBank.find(entry => entry.isOxford && normalizeWord(entry.word) === normalizeWord(word));
      if (bundled) {
        added += await activateCatalogWords([bundled]);
        continue;
      }
      try {
        const entry = await generateEnglishWordEntry(word);
        if (await addWordToDeck(buildCustomWord({ word, ...entry }))) added++;
      } catch (error) {
        progressEl.textContent = `أضيفت ${added} كلمة قبل توقّف الإضافة. ${error.message}`;
        btn.disabled = false;
        return;
      }
    }

    progressEl.textContent = `✅ تمت إضافة ${added} كلمة جديدة؛ تم تجاوز الكلمات الموجودة.`;
    showToast(`تمت إضافة ${added} كلمة إلى مفرداتك`, 'success');
    btn.disabled = false;
    setTimeout(() => {
      document.getElementById('modal-form').classList.add('hidden');
      paint(container);
    }, 900);
  });
}
