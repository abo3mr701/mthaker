/**
 * study.js — Spaced repetition study session view (flashcards)
 *
 * التعديلات الرئيسية:
 *  - يستخدم buildTodayQueue() الجديدة: ترتيب حسب الأولوية (أكثر خطأً ثم الأقدم)
 *    + تطبيق "الحد الأقصى للمراجعات اليومية" + تأجيل تلقائي للباقي على الأيام القادمة.
 *  - إمكانية تعديل الحد الأقصى مباشرة من نفس صفحة المراجعة (بدون الذهاب للإعدادات).
 *  - فلتر تصنيف (عام / إنجليزي / ...) بجانب فلتر المادة.
 *  - زر نطق (TTS) لبطاقات قسم الإنجليزي + عرض الترجمة والمثال إن وُجدا.
 */

import { flashcards as cardsDB, subjects as subjectsDB } from '../db.js';
import { processReview, buildTodayQueue, getMaxDailyReviews, setMaxDailyReviews } from '../services/srs.js';
import { showToast, escHtml } from '../utils/helpers.js';

const ENGLISH_CATEGORY = 'إنجليزي';

export async function renderStudy(container, subjectId = null, category = null) {
  container.innerHTML = `<div class="flex-center" style="padding:var(--s10)"><div class="spinner"></div></div>`;

  const [allSubjects, allCategories, maxDaily, result] = await Promise.all([
    subjectsDB.getAll(),
    cardsDB.getCategories(),
    getMaxDailyReviews(),
    buildTodayQueue({ subjectId, category }),
  ]);

  if (result.queue.length === 0) {
    renderNoDueCards(container, allSubjects, allCategories, subjectId, category, maxDaily, result);
    return;
  }

  const shuffled = shuffleArray([...result.queue]);
  renderSession(container, shuffled, allSubjects, allCategories, subjectId, category, maxDaily, result);
}

/* ─── Shared header: subject + category filters + max-daily editor ── */
function renderFiltersBar(subjects, categories, currentSubjectId, currentCategory) {
  const subjectOptions = subjects.map(s =>
    `<option value="${s.id}" ${s.id === currentSubjectId ? 'selected' : ''}>${escHtml(s.name)}</option>`
  ).join('');

  const categoryOptions = categories.map(c =>
    `<option value="${escHtml(c)}" ${c === currentCategory ? 'selected' : ''}>${c === ENGLISH_CATEGORY ? '🇬🇧 ' : ''}${escHtml(c)}</option>`
  ).join('');

  const allSelected = !currentSubjectId || currentSubjectId === '_';
  return `
    <select class="form-select" id="subject-filter" style="min-width:160px;">
      <option value="" ${allSelected ? 'selected' : ''}>جميع المواد</option>
      ${subjectOptions}
    </select>
    <select class="form-select" id="category-filter" style="min-width:160px;">
      <option value="">كل الأقسام</option>
      ${categoryOptions}
    </select>
  `;
}

function bindFiltersBar(container, currentSubjectId, currentCategory) {
  const go = () => {
    const s = container.querySelector('#subject-filter')?.value || '_';
    const c = container.querySelector('#category-filter')?.value || '';
    if (!s && !c) { window.location.hash = '#study'; return; }
    window.location.hash = c ? `#study/${s || '_'}/${encodeURIComponent(c)}` : `#study/${s || '_'}`;
  };
  container.querySelector('#subject-filter')?.addEventListener('change', go);
  container.querySelector('#category-filter')?.addEventListener('change', go);
}

/* ─── Inline "max daily reviews" editor (no need to visit settings) ── */
function renderMaxDailyBox(maxDaily, result) {
  return `
    <div class="max-daily-box" id="max-daily-box" title="أقصى عدد بطاقات تُعرض في جلسة واحدة يومياً">
      <span class="max-daily-lbl">🎚️ الحد اليومي</span>
      <input type="number" id="max-daily-input" class="max-daily-input" min="0" step="5" value="${maxDaily}">
      <button class="btn btn-sm btn-secondary" id="max-daily-save">حفظ</button>
      ${result.deferredCount > 0
        ? `<span class="max-daily-note">⏳ تم تأجيل ${result.deferredCount} بطاقة للأيام القادمة تلقائياً (المستحق الكلي اليوم: ${result.totalDue})</span>`
        : ''}
    </div>
  `;
}

function bindMaxDailyBox(container, subjectId, category) {
  container.querySelector('#max-daily-save')?.addEventListener('click', async () => {
    const val = container.querySelector('#max-daily-input').value;
    await setMaxDailyReviews(val);
    showToast('تم تحديث الحد الأقصى للمراجعات اليومية', 'success');
    // Re-render session with the new cap applied immediately
    renderStudy(container, subjectId, category);
  });
}

function renderNoDueCards(container, subjects, categories, currentSubjectId, currentCategory, maxDaily, result) {
  container.innerHTML = `
    <div class="page-hd">
      <div class="page-hd-text">
        <h2>${currentCategory === ENGLISH_CATEGORY ? '🇬🇧 مراجعة الإنجليزية' : 'مراجعة البطاقات'}</h2>
        <p>مراجعة البطاقات التعليمية بنظام التكرار المتباعد</p>
      </div>
      <div class="flex gap-3 wrap">
        ${renderFiltersBar(subjects, categories, currentSubjectId, currentCategory)}
      </div>
    </div>

    ${renderMaxDailyBox(maxDaily, result)}

    <div class="study-done">
      <div class="study-done-icon">🎉</div>
      <h3 class="study-done-title">
        ${currentSubjectId || currentCategory ? 'لا توجد بطاقات مستحقة ضمن هذا الفلتر' : 'أنجزت جميع مراجعاتك اليوم!'}
      </h3>
      <p class="text-muted">
        ${currentSubjectId || currentCategory
          ? 'جميع البطاقات ضمن هذا الفلتر ستظهر في موعدها القادم.'
          : 'ممتاز! عد غداً للمراجعة التالية.'}
      </p>
      <div style="margin-top:var(--s8);display:flex;gap:var(--s5);justify-content:center;flex-wrap:wrap;">
        <a href="#subjects" class="btn btn-primary">📚 إضافة محتوى جديد</a>
        <a href="#reviews" class="btn btn-secondary">🗂️ خطط المراجعة</a>
        <a href="#dashboard" class="btn btn-secondary">🏠 لوحة التحكم</a>
      </div>
    </div>
  `;

  bindFiltersBar(container, currentSubjectId, currentCategory);
  bindMaxDailyBox(container, currentSubjectId, currentCategory);
}

function renderSession(container, cards, subjects, categories, currentSubjectId, currentCategory, maxDaily, result) {
  const total = cards.length;
  let index   = 0;
  let correct = 0;
  let wrong   = 0;
  let flipped = false;

  container.innerHTML = `
    <div class="page-hd">
      <div class="page-hd-text">
        <h2>${currentCategory === ENGLISH_CATEGORY ? '🇬🇧 مراجعة الإنجليزية' : 'مراجعة البطاقات'}</h2>
      </div>
      <div class="flex gap-3 wrap">
        ${renderFiltersBar(subjects, categories, currentSubjectId, currentCategory)}
      </div>
    </div>

    ${renderMaxDailyBox(maxDaily, result)}

    <p class="study-counter" id="study-counter">البطاقة 1 من ${total}</p>
    <div class="study-progress-bar">
      <div class="study-progress-fill" id="study-progress" style="width:0%"></div>
    </div>

    <!-- Flip card -->
    <div class="study-scene" id="study-scene" role="button"
         tabindex="0" aria-label="انقر لقلب البطاقة">
      <div class="study-card-inner" id="card-inner">
        <div class="study-card-face study-card-front">
          <button class="tts-btn hidden" id="tts-front-btn" title="نطق الكلمة">🔊</button>
          <p class="study-card-text" id="card-front-text" dir="auto"></p>
          <p class="study-card-hint">انقر للكشف عن الإجابة</p>
        </div>
        <div class="study-card-face study-card-back">
          <button class="tts-btn hidden" id="tts-back-btn" title="نطق الجملة">🔊</button>
          <p class="study-card-text" id="card-back-text" dir="auto"></p>
          <p class="study-card-extra" id="card-extra-text"></p>
          <p class="study-card-hint">كيف كانت إجابتك؟</p>
        </div>
      </div>
    </div>

    <!-- Rating buttons (shown after flip) -->
    <div class="study-actions" id="study-actions" style="display:none;">
      <button class="btn btn-wrong" id="btn-wrong">✗ لم أتذكر</button>
      <button class="btn btn-correct" id="btn-correct">✓ أتذكرتها</button>
    </div>

    <!-- Keyboard hint -->
    <p class="text-muted text-xs text-center mt-4">
      مفتاح المسافة: قلب البطاقة | ← أتذكرت | → لم أتذكر
    </p>
  `;

  bindFiltersBar(container, currentSubjectId, currentCategory);
  bindMaxDailyBox(container, currentSubjectId, currentCategory);

  function isEnglish(card) { return (card.category || 'عام') === ENGLISH_CATEGORY; }

  function speak(text, btn) {
    if (!('speechSynthesis' in window) || !text) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'en-US';
      utter.rate = 0.95;
      window.speechSynthesis.speak(utter);
    } catch { /* Web Speech API unsupported — silently ignore */ }
  }

  function showCard(i) {
    if (i >= total) { showCompletion(); return; }
    flipped = false;
    const card = cards[i];
    const english = isEnglish(card);

    container.querySelector('#card-inner').classList.remove('flipped');
    container.querySelector('#card-front-text').textContent = card.front;

    // Back: translation + example (English deck) or the plain "back" text
    let backHtml = escHtml(card.back || '');
    let extraHtml = '';
    if (english && (card.translation || card.example)) {
      backHtml = card.translation ? `<strong>${escHtml(card.translation)}</strong>` : backHtml;
      if (card.example) {
        extraHtml = `📝 ${escHtml(card.example)}`;
      }
    }
    container.querySelector('#card-back-text').innerHTML = backHtml || '—';
    container.querySelector('#card-extra-text').textContent = extraHtml;

    container.querySelector('#tts-front-btn').classList.toggle('hidden', !english);
    container.querySelector('#tts-back-btn').classList.toggle('hidden', !(english && card.example));

    container.querySelector('#study-actions').style.display = 'none';
    container.querySelector('#study-counter').textContent   = `البطاقة ${i + 1} من ${total}`;
    const pct = Math.round((i / total) * 100);
    container.querySelector('#study-progress').style.width = `${pct}%`;
  }

  function flipCard() {
    if (flipped) return;
    flipped = true;
    container.querySelector('#card-inner').classList.add('flipped');
    setTimeout(() => {
      container.querySelector('#study-actions').style.display = 'flex';
    }, 350);
  }

  async function handleRating(isCorrect) {
    const card = cards[index];
    try {
      await processReview(card, isCorrect);
    } catch (err) {
      showToast(`خطأ في حفظ المراجعة: ${err.message}`, 'error');
    }
    if (isCorrect) correct++; else wrong++;
    index++;
    showCard(index);
  }

  function showCompletion() {
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
    container.innerHTML = `
      <div class="study-done">
        <div class="study-done-icon">${accuracy >= 80 ? '🏆' : accuracy >= 50 ? '👍' : '💪'}</div>
        <h3 class="study-done-title">أنهيت جلسة المراجعة!</h3>
        <div class="study-done-stats">
          <div class="study-done-stat">
            <div class="study-done-stat-val text-success">${correct}</div>
            <div class="study-done-stat-lbl">صحيح</div>
          </div>
          <div class="study-done-stat">
            <div class="study-done-stat-val text-danger">${wrong}</div>
            <div class="study-done-stat-lbl">خطأ</div>
          </div>
          <div class="study-done-stat">
            <div class="study-done-stat-val">${accuracy}%</div>
            <div class="study-done-stat-lbl">الدقة</div>
          </div>
        </div>
        <div style="display:flex;gap:var(--s5);justify-content:center;flex-wrap:wrap;">
          <button class="btn btn-primary" id="study-again-btn">🔄 راجع مرة أخرى</button>
          <a href="#dashboard" class="btn btn-secondary">🏠 لوحة التحكم</a>
        </div>
      </div>
    `;

    container.querySelector('#study-again-btn')?.addEventListener('click', () => {
      renderStudy(container, currentSubjectId, currentCategory);
    });
  }

  // Event bindings
  const scene = container.querySelector('#study-scene');
  scene.addEventListener('click', flipCard);
  scene.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flipCard(); }
  });

  container.querySelector('#btn-correct').addEventListener('click', () => handleRating(true));
  container.querySelector('#btn-wrong').addEventListener('click',   () => handleRating(false));

  container.querySelector('#tts-front-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    speak(cards[index].front);
  });
  container.querySelector('#tts-back-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    speak(cards[index].example || cards[index].front);
  });

  // Keyboard shortcuts — self-removes once #study-scene leaves the DOM
  const keyHandler = (e) => {
    if (!document.getElementById('study-scene')) {
      document.removeEventListener('keydown', keyHandler);
      return;
    }
    if (e.key === ' ')           { e.preventDefault(); flipCard(); }
    if (e.key === 'ArrowLeft'  && flipped) handleRating(true);
    if (e.key === 'ArrowRight' && flipped) handleRating(false);
  };
  document.addEventListener('keydown', keyHandler);

  // Show first card
  showCard(0);
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
