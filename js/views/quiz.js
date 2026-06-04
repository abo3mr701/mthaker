/**
 * quiz.js — Mixed quiz from multiple subjects with all card types
 */

import { flashcards as cardsDB, subjects as subjectsDB } from '../db.js';
import { escHtml, showToast } from '../utils/helpers.js';

export async function renderQuiz(container) {
  container.innerHTML = `<div class="flex-center" style="padding:var(--s10)"><div class="spinner"></div></div>`;
  const [allCards, allSubjects] = await Promise.all([cardsDB.getAll(), subjectsDB.getAll()]);
  if (allSubjects.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📝</div>
      <h3 class="empty-title">لا توجد مواد بعد</h3>
      <p class="empty-sub">أضف مواد وبطاقات أولاً</p>
      <a href="#subjects" class="btn btn-primary">📚 المواد</a></div>`;
    return;
  }
  renderSetup(container, allCards, allSubjects);
}

function renderSetup(container, allCards, allSubjects) {
  const subjectMap = Object.fromEntries(allSubjects.map(s => [s.id, s]));
  container.innerHTML = `
    <div class="page-hd">
      <div class="page-hd-text"><h2>الاختبار المدمج</h2>
        <p>اختر مواد وأنواع البطاقات وابدأ الاختبار</p></div>
    </div>
    <div class="quiz-setup">
      <div class="settings-section">
        <div class="settings-section-title"><span class="settings-section-icon">📚</span> اختر المواد</div>
        <div class="quiz-subject-list" id="quiz-subjects">
          ${allSubjects.map(s => {
            const count = allCards.filter(c => c.subjectId === s.id).length;
            return `
            <div class="quiz-subject-item" data-id="${s.id}">
              <div class="quiz-subject-check">✓</div>
              <span style="width:10px;height:10px;border-radius:50%;background:${s.color};flex-shrink:0;"></span>
              <span style="flex:1;">${escHtml(s.name)}</span>
              <span class="text-muted text-xs">${count} بطاقة</span>
            </div>`;
          }).join('')}
        </div>
        <div style="display:flex;gap:var(--s4);">
          <button class="btn btn-ghost btn-sm" id="select-all-btn">تحديد الكل</button>
          <button class="btn btn-ghost btn-sm" id="deselect-all-btn">إلغاء الكل</button>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-title"><span class="settings-section-icon">🎯</span> أنواع البطاقات</div>
        <div style="display:flex;gap:var(--s4);flex-wrap:wrap;">
          <label style="display:flex;align-items:center;gap:var(--s3);cursor:pointer;">
            <input type="checkbox" id="type-text" checked> ✍️ نص
          </label>
          <label style="display:flex;align-items:center;gap:var(--s3);cursor:pointer;">
            <input type="checkbox" id="type-mcq" checked> 🔘 اختيار متعدد
          </label>
          <label style="display:flex;align-items:center;gap:var(--s3);cursor:pointer;">
            <input type="checkbox" id="type-tf" checked> ✅ صح/خطأ
          </label>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-title"><span class="settings-section-icon">⚙️</span> إعدادات الاختبار</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--s5);">
          <div class="form-group">
            <label class="form-label">عدد الأسئلة</label>
            <input type="number" class="form-input" id="quiz-count" value="10" min="1" max="50">
          </div>
          <div class="form-group">
            <label class="form-label">الترتيب</label>
            <select class="form-select" id="quiz-order">
              <option value="random">عشوائي</option>
              <option value="due">المستحقة أولاً</option>
              <option value="weak">الأضعف أولاً</option>
            </select>
          </div>
        </div>
      </div>

      <div id="quiz-card-count" class="text-muted text-sm" style="margin-bottom:var(--s5);"></div>
      <button class="btn btn-primary w-full" id="start-quiz-btn" style="font-size:1rem;padding:var(--s6);">
        🚀 ابدأ الاختبار
      </button>
    </div>
  `;

  const selectedSubjects = new Set(allSubjects.map(s => s.id));

  function updateCount() {
    const types = getSelectedTypes();
    const cards = getQuizCards(allCards, selectedSubjects, types, 999, 'random');
    const el = container.querySelector('#quiz-card-count');
    if (el) el.textContent = `${cards.length} بطاقة متاحة بالتصفية الحالية`;
  }

  function getSelectedTypes() {
    return {
      text: container.querySelector('#type-text')?.checked,
      mcq:  container.querySelector('#type-mcq')?.checked,
      tf:   container.querySelector('#type-tf')?.checked,
    };
  }

  // Subject selection
  container.querySelectorAll('.quiz-subject-item').forEach(item => {
    item.classList.add('selected');
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      item.classList.toggle('selected');
      if (item.classList.contains('selected')) selectedSubjects.add(id);
      else selectedSubjects.delete(id);
      updateCount();
    });
  });

  container.querySelector('#select-all-btn')?.addEventListener('click', () => {
    container.querySelectorAll('.quiz-subject-item').forEach(i => {
      i.classList.add('selected');
      selectedSubjects.add(i.dataset.id);
    });
    updateCount();
  });

  container.querySelector('#deselect-all-btn')?.addEventListener('click', () => {
    container.querySelectorAll('.quiz-subject-item').forEach(i => i.classList.remove('selected'));
    selectedSubjects.clear();
    updateCount();
  });

  ['#type-text','#type-mcq','#type-tf'].forEach(id => {
    container.querySelector(id)?.addEventListener('change', updateCount);
  });

  updateCount();

  container.querySelector('#start-quiz-btn').addEventListener('click', () => {
    if (selectedSubjects.size === 0) { showToast('اختر مادة واحدة على الأقل', 'warning'); return; }
    const types   = getSelectedTypes();
    const count   = Math.max(1, parseInt(container.querySelector('#quiz-count').value,10)||10);
    const order   = container.querySelector('#quiz-order').value;
    const cards   = getQuizCards(allCards, selectedSubjects, types, count, order);
    if (cards.length === 0) { showToast('لا توجد بطاقات بهذه الخيارات', 'warning'); return; }
    startQuiz(container, cards, allCards, allSubjects, subjectMap);
  });
}

function getQuizCards(allCards, selectedSubjects, types, limit, order) {
  let cards = allCards.filter(c => {
    if (!selectedSubjects.has(c.subjectId)) return false;
    const t = c.type || 'text';
    return (t==='text'&&types.text) || (t==='mcq'&&types.mcq) || (t==='tf'&&types.tf);
  });

  const today = new Date().toISOString().slice(0,10);
  if (order === 'random') cards = cards.sort(()=>Math.random()-.5);
  else if (order === 'due') cards = cards.sort((a,b)=>(a.nextReview||'').localeCompare(b.nextReview||''));
  else if (order === 'weak') cards = cards.sort((a,b)=>{
    const accA = a.reviewCount>0?(a.correctCount||0)/a.reviewCount:0.5;
    const accB = b.reviewCount>0?(b.correctCount||0)/b.reviewCount:0.5;
    return accA-accB;
  });

  return cards.slice(0, limit);
}

function startQuiz(container, cards, allCards, allSubjects, subjectMap) {
  let index   = 0;
  let correct = 0;
  let flipped = false;

  function show() {
    if (index >= cards.length) { showResult(); return; }
    flipped = false;
    const card = cards[index];
    const type = card.type || 'text';
    const subject = subjectMap[card.subjectId];

    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--s5);">
        <button class="btn btn-ghost btn-sm" id="quit-quiz">← خروج</button>
        <span class="text-muted text-sm">${index+1} / ${cards.length}</span>
        <span class="text-sm" style="color:var(--success);">✓ ${correct}</span>
      </div>
      <div class="study-progress-bar" style="margin-bottom:var(--s7);">
        <div class="study-progress-fill" style="width:${(index/cards.length)*100}%"></div>
      </div>
      ${subject ? `<p class="text-muted text-xs text-center" style="margin-bottom:var(--s4);">📚 ${escHtml(subject.name)}</p>` : ''}
      ${type==='mcq' ? renderMCQ(card) : type==='tf' ? renderTF(card) : renderText(card)}
    `;

    container.querySelector('#quit-quiz')?.addEventListener('click', () => renderSetup(container, allCards, allSubjects));

    if (type === 'text') {
      const scene = container.querySelector('#quiz-scene');
      scene?.addEventListener('click', () => {
        if (flipped) return; flipped = true;
        scene.querySelector('.study-card-inner')?.classList.add('flipped');
        setTimeout(() => { const a = container.querySelector('#quiz-actions'); if(a) a.style.display='flex'; }, 350);
      });
      container.querySelector('#quiz-correct')?.addEventListener('click', () => { correct++; index++; show(); });
      container.querySelector('#quiz-wrong')?.addEventListener('click',   () => { index++; show(); });
    }
    if (type === 'mcq') bindMCQ(container, card, () => { correct++; index++; setTimeout(show,900); }, () => { index++; setTimeout(show,900); });
    if (type === 'tf')  bindTF(container, card,  () => { correct++; index++; setTimeout(show,700); }, () => { index++; setTimeout(show,700); });
  }

  function showResult() {
    const pct = Math.round(correct/cards.length*100);
    container.innerHTML = `
      <div class="study-done">
        <div class="study-done-icon">${pct>=80?'🏆':pct>=60?'🎉':pct>=40?'👍':'💪'}</div>
        <h3 class="study-done-title">انتهى الاختبار!</h3>
        <p class="text-muted" style="margin-bottom:var(--s6);">${cards.length} سؤال من ${allSubjects.length > 1 ? 'مواد متعددة' : 'مادة واحدة'}</p>
        <div class="study-done-stats">
          <div class="study-done-stat"><div class="study-done-stat-val text-success">${correct}</div><div class="study-done-stat-lbl">صحيح</div></div>
          <div class="study-done-stat"><div class="study-done-stat-val text-danger">${cards.length-correct}</div><div class="study-done-stat-lbl">خطأ</div></div>
          <div class="study-done-stat"><div class="study-done-stat-val">${pct}%</div><div class="study-done-stat-lbl">النتيجة</div></div>
        </div>
        <div style="display:flex;gap:var(--s5);justify-content:center;flex-wrap:wrap;">
          <button class="btn btn-primary" id="retry-quiz">🔄 اختبار جديد</button>
          <a href="#dashboard" class="btn btn-secondary">🏠 الرئيسية</a>
        </div>
      </div>`;
    container.querySelector('#retry-quiz')?.addEventListener('click', () => renderSetup(container, allCards, allSubjects));
  }

  show();
}

function renderText(card) {
  return `
    <div class="study-scene" id="quiz-scene" role="button" tabindex="0">
      <div class="study-card-inner">
        <div class="study-card-face study-card-front">
          <p class="study-card-text" dir="rtl">${escHtml(card.front)}</p>
          <p class="study-card-hint">انقر للكشف</p>
        </div>
        <div class="study-card-face study-card-back">
          <p class="study-card-text" dir="rtl">${escHtml(card.back)}</p>
        </div>
      </div>
    </div>
    <div class="study-actions" id="quiz-actions" style="display:none;">
      <button class="btn btn-wrong" id="quiz-wrong">✗ خطأ</button>
      <button class="btn btn-correct" id="quiz-correct">✓ صحيح</button>
    </div>`;
}

function renderMCQ(card) {
  const opts = card.options || [card.back];
  return `
    <div class="card card-elevated" style="max-width:640px;margin:0 auto;">
      <p style="font-size:1.1rem;font-weight:700;margin-bottom:var(--s7);text-align:center;" dir="rtl">🔘 ${escHtml(card.front)}</p>
      <div class="mcq-options">
        ${opts.map((o,i)=>`<div class="mcq-option" data-idx="${i}" dir="rtl">${escHtml(o)}</div>`).join('')}
      </div>
    </div>`;
}

function bindMCQ(container, card, onCorrect, onWrong) {
  const answer = (card.answer||card.back).trim();
  container.querySelectorAll('.mcq-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const right = opt.textContent.trim() === answer;
      container.querySelectorAll('.mcq-option').forEach(o => {
        if (o.textContent.trim()===answer) o.classList.add('reveal');
        else if (o===opt&&!right) o.classList.add('wrong');
        o.style.pointerEvents='none';
      });
      right ? onCorrect() : onWrong();
    });
  });
}

function renderTF(card) {
  return `
    <div class="card card-elevated" style="max-width:640px;margin:0 auto;text-align:center;">
      <p style="font-size:1.2rem;font-weight:700;margin-bottom:var(--s7);" dir="rtl">✅ ${escHtml(card.front)}</p>
      <div class="tf-options">
        <button class="tf-btn true-btn" id="tf-true">✓ صح</button>
        <button class="tf-btn false-btn" id="tf-false">✗ خطأ</button>
      </div>
      <div id="tf-result" style="margin-top:var(--s5);font-size:.9rem;font-weight:600;"></div>
    </div>`;
}

function bindTF(container, card, onCorrect, onWrong) {
  const answer = (card.answer||card.back||'').trim();
  const isTrue = answer==='صح'||answer==='true'||answer==='صحيح';
  const trueBtn=container.querySelector('#tf-true'), falseBtn=container.querySelector('#tf-false');
  const result=container.querySelector('#tf-result');
  function handle(chosen) {
    const right = chosen===isTrue;
    trueBtn.classList.toggle('correct',isTrue); trueBtn.classList.toggle('wrong',!isTrue&&chosen===true);
    falseBtn.classList.toggle('correct',!isTrue); falseBtn.classList.toggle('wrong',isTrue&&chosen===false);
    trueBtn.disabled=falseBtn.disabled=true;
    result.textContent = right?'✅ صحيح!':`❌ الإجابة: ${isTrue?'صح':'خطأ'}`;
    result.style.color = right?'var(--success)':'var(--danger)';
    right?onCorrect():onWrong();
  }
  trueBtn?.addEventListener('click',()=>handle(true));
  falseBtn?.addEventListener('click',()=>handle(false));
}
