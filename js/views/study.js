/**
 * study.js — Spaced repetition study session view
 */

import { flashcards as cardsDB, subjects as subjectsDB } from '../db.js';
import { processReview } from '../services/srs.js';
import { showToast, escHtml, arabicCount } from '../utils/helpers.js';

export async function renderStudy(container, subjectId = null) {
  container.innerHTML = `<div class="flex-center" style="padding:var(--s10)"><div class="spinner"></div></div>`;

  // Load subjects for subject filter dropdown
  const [allSubjects, due] = await Promise.all([
    subjectsDB.getAll(),
    cardsDB.getDueCards(subjectId),
  ]);

  if (due.length === 0) {
    renderNoDueCards(container, allSubjects, subjectId);
    return;
  }

  // Shuffle cards for variety
  const shuffled = shuffleArray([...due]);
  renderSession(container, shuffled, allSubjects, subjectId);
}

function renderNoDueCards(container, subjects, currentSubjectId) {
  const subjectOptions = subjects.map(s =>
    `<option value="${s.id}" ${s.id === currentSubjectId ? 'selected' : ''}>${escHtml(s.name)}</option>`
  ).join('');

  container.innerHTML = `
    <div class="page-hd">
      <div class="page-hd-text">
        <h2>المراجعة</h2>
      </div>
      <div class="flex gap-3 wrap">
        <select class="form-select" id="subject-filter" style="min-width:180px;">
          <option value="">جميع المواد</option>
          ${subjectOptions}
        </select>
      </div>
    </div>

    <div class="study-done">
      <div class="study-done-icon">🎉</div>
      <h3 class="study-done-title">
        ${currentSubjectId ? 'لا توجد بطاقات مستحقة في هذه المادة' : 'أنجزت جميع مراجعاتك اليوم!'}
      </h3>
      <p class="text-muted">
        ${currentSubjectId
          ? 'جميع بطاقات هذه المادة ستظهر في موعدها القادم.'
          : 'ممتاز! عد غداً للمراجعة التالية.'}
      </p>
      <div style="margin-top:var(--s8);display:flex;gap:var(--s5);justify-content:center;flex-wrap:wrap;">
        <a href="#subjects" class="btn btn-primary">📚 إضافة محتوى جديد</a>
        <a href="#dashboard" class="btn btn-secondary">🏠 لوحة التحكم</a>
      </div>
    </div>
  `;

  container.querySelector('#subject-filter')?.addEventListener('change', (e) => {
    const val = e.target.value;
    window.location.hash = val ? `#study/${val}` : '#study';
  });
}

function renderSession(container, cards, subjects, currentSubjectId) {
  const total = cards.length;
  let index   = 0;
  let correct = 0;
  let wrong   = 0;
  let flipped = false;

  const subjectOptions = subjects.map(s =>
    `<option value="${s.id}" ${s.id === currentSubjectId ? 'selected' : ''}>${escHtml(s.name)}</option>`
  ).join('');

  container.innerHTML = `
    <div class="page-hd">
      <div class="page-hd-text">
        <h2>المراجعة</h2>
      </div>
      <div class="flex gap-3 wrap">
        <select class="form-select" id="subject-filter" style="min-width:180px;">
          <option value="">جميع المواد</option>
          ${subjectOptions}
        </select>
      </div>
    </div>

    <p class="study-counter" id="study-counter">البطاقة 1 من ${total}</p>
    <div class="study-progress-bar">
      <div class="study-progress-fill" id="study-progress" style="width:0%"></div>
    </div>

    <!-- Flip card -->
    <div class="study-scene" id="study-scene" role="button"
         tabindex="0" aria-label="انقر لقلب البطاقة">
      <div class="study-card-inner" id="card-inner">
        <div class="study-card-face study-card-front">
          <p class="study-card-text" id="card-front-text" dir="rtl"></p>
          <p class="study-card-hint">انقر للكشف عن الإجابة</p>
        </div>
        <div class="study-card-face study-card-back">
          <p class="study-card-text" id="card-back-text" dir="rtl"></p>
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

  // Subject filter
  container.querySelector('#subject-filter')?.addEventListener('change', (e) => {
    const val = e.target.value;
    window.location.hash = val ? `#study/${val}` : '#study';
  });

  function showCard(i) {
    if (i >= total) { showCompletion(); return; }
    flipped = false;
    const card = cards[i];

    container.querySelector('#card-inner').classList.remove('flipped');
    container.querySelector('#card-front-text').textContent = card.front;
    container.querySelector('#card-back-text').textContent  = card.back;
    container.querySelector('#study-actions').style.display = 'none';
    container.querySelector('#study-counter').textContent   = `البطاقة ${i + 1} من ${total}`;
    const pct = Math.round((i / total) * 100);
    container.querySelector('#study-progress').style.width = `${pct}%`;
  }

  function flipCard() {
    if (flipped) return;
    flipped = true;
    container.querySelector('#card-inner').classList.add('flipped');
    // Show rating buttons after flip animation
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
      window.location.hash = currentSubjectId ? `#study/${currentSubjectId}` : '#study';
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
