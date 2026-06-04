/**
 * flashcards.js — All flashcards view: browse, filter by type, practice anytime, stats
 */

import { flashcards as cardsDB, subjects as subjectsDB } from '../db.js';
import { showToast, showConfirm, debounce, escHtml, truncate, todayStr } from '../utils/helpers.js';
import { buildCard } from '../services/srs.js';
import { uid } from '../utils/helpers.js';

export async function renderFlashcards(container) {
  container.innerHTML = `<div class="flex-center" style="padding:var(--s10)"><div class="spinner"></div></div>`;

  const [allCards, allSubjects] = await Promise.all([
    cardsDB.getAll(),
    subjectsDB.getAll(),
  ]);

  const subjectMap = Object.fromEntries(allSubjects.map(s => [s.id, s]));

  renderUI(container, allCards, allSubjects, subjectMap);
}

function renderUI(container, allCards, allSubjects, subjectMap) {
  const today = todayStr();

  container.innerHTML = `
    <div class="page-hd">
      <div class="page-hd-text">
        <h2>البطاقات التعليمية</h2>
        <p>${allCards.length} بطاقة إجمالاً</p>
      </div>
      <div style="display:flex;gap:var(--s4);flex-wrap:wrap;">
        <button class="btn btn-primary" id="btn-add-fc">➕ بطاقة جديدة</button>
        <button class="btn btn-secondary" id="btn-practice-all">🎮 تدرب الآن</button>
      </div>
    </div>

    <!-- Filters row -->
    <div style="display:flex;gap:var(--s4);flex-wrap:wrap;margin-bottom:var(--s6);">
      <div class="search-wrap" style="flex:1;min-width:200px;">
        <span class="search-icon">🔍</span>
        <input type="text" class="form-input" id="fc-search" placeholder="ابحث في البطاقات…" dir="rtl">
      </div>
      <select class="form-select" id="fc-subject-filter" style="min-width:160px;">
        <option value="">جميع المواد</option>
        ${allSubjects.map(s => `<option value="${s.id}">${escHtml(s.name)}</option>`).join('')}
      </select>
      <select class="form-select" id="fc-type-filter" style="min-width:140px;">
        <option value="">جميع الأنواع</option>
        <option value="text">نص ✍️</option>
        <option value="mcq">اختيار من متعدد 🔘</option>
        <option value="tf">صح وخطأ ✅</option>
      </select>
    </div>

    <!-- Type tabs -->
    <div class="card-type-tabs">
      <button class="card-type-tab active" data-type="">الكل (${allCards.length})</button>
      <button class="card-type-tab" data-type="text">✍️ نص (${allCards.filter(c=>!c.type||c.type==='text').length})</button>
      <button class="card-type-tab" data-type="mcq">🔘 متعدد (${allCards.filter(c=>c.type==='mcq').length})</button>
      <button class="card-type-tab" data-type="tf">✅ صح/خطأ (${allCards.filter(c=>c.type==='tf').length})</button>
    </div>

    <!-- Cards list -->
    <div id="fc-list">
      ${renderCardList(allCards, subjectMap, today)}
    </div>
  `;

  let activeType    = '';
  let activeSubject = '';
  let searchQuery   = '';

  function getFiltered() {
    return allCards.filter(c => {
      const typeOk    = !activeType    || (c.type||'text') === activeType;
      const subjectOk = !activeSubject || c.subjectId === activeSubject;
      const q         = searchQuery.toLowerCase();
      const searchOk  = !q || c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q);
      return typeOk && subjectOk && searchOk;
    });
  }

  function refresh() {
    const filtered = getFiltered();
    container.querySelector('#fc-list').innerHTML = renderCardList(filtered, subjectMap, today);
    bindCardActions();
  }

  // Type tabs
  container.querySelectorAll('.card-type-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.card-type-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeType = btn.dataset.type;
      container.querySelector('#fc-type-filter').value = activeType;
      refresh();
    });
  });

  // Subject filter
  container.querySelector('#fc-subject-filter').addEventListener('change', e => {
    activeSubject = e.target.value;
    refresh();
  });

  // Type filter dropdown
  container.querySelector('#fc-type-filter').addEventListener('change', e => {
    activeType = e.target.value;
    container.querySelectorAll('.card-type-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.type === activeType);
    });
    refresh();
  });

  // Search
  container.querySelector('#fc-search').addEventListener('input', debounce(e => {
    searchQuery = e.target.value.trim();
    refresh();
  }, 250));

  // Add card button
  container.querySelector('#btn-add-fc').addEventListener('click', () => {
    openCardModal(container, allCards, allSubjects, subjectMap, null);
  });

  // Practice all button
  container.querySelector('#btn-practice-all').addEventListener('click', () => {
    const filtered = getFiltered();
    if (filtered.length === 0) { showToast('لا توجد بطاقات للتدريب', 'warning'); return; }
    startPracticeMode(container, filtered, allCards, allSubjects, subjectMap);
  });

  function bindCardActions() {
    container.querySelectorAll('[data-action="edit-fc"]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const card = allCards.find(c => c.id === id);
        if (card) openCardModal(container, allCards, allSubjects, subjectMap, card);
      });
    });

    container.querySelectorAll('[data-action="delete-fc"]').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const ok = await showConfirm('حذف البطاقة', 'هل تريد حذف هذه البطاقة نهائياً؟');
        if (!ok) return;
        await cardsDB.delete(id);
        const idx = allCards.findIndex(c => c.id === id);
        if (idx !== -1) allCards.splice(idx, 1);
        refresh();
        showToast('تم حذف البطاقة', 'success');
      });
    });

    container.querySelectorAll('[data-action="practice-one"]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const card = allCards.find(c => c.id === id);
        if (card) startPracticeMode(container, [card], allCards, allSubjects, subjectMap);
      });
    });
  }

  bindCardActions();
}

function renderCardList(cards, subjectMap, today) {
  if (cards.length === 0) {
    return `<div class="empty-state">
      <div class="empty-icon">🃏</div>
      <h3 class="empty-title">لا توجد بطاقات</h3>
      <p class="empty-sub">أضف بطاقة يدوياً أو ارفع ملفاً في قسم المواد</p>
    </div>`;
  }

  return cards.map(card => {
    const subject  = subjectMap[card.subjectId];
    const typeIcon = { text: '✍️', mcq: '🔘', tf: '✅' }[card.type || 'text'] || '✍️';
    const typeLbl  = { text: 'نص', mcq: 'متعدد', tf: 'صح/خطأ' }[card.type || 'text'] || 'نص';
    const isDue    = !card.nextReview || card.nextReview <= today;
    const accuracy = card.reviewCount > 0
      ? Math.round((card.correctCount||0) / card.reviewCount * 100)
      : null;

    return `
      <div class="flashcard-item" data-card-id="${card.id}">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:var(--s3);margin-bottom:var(--s3);flex-wrap:wrap;">
            <span class="stage-badge">${typeIcon} ${typeLbl}</span>
            ${isDue ? `<span class="stage-badge due-badge">📅 مستحقة</span>` : ''}
            ${subject ? `<span style="font-size:.75rem;color:var(--text3);">📚 ${escHtml(subject.name)}</span>` : ''}
          </div>
          <div class="front">${escHtml(truncate(card.front, 100))}</div>
          <div class="back">${escHtml(truncate(card.back, 80))}</div>
          <div class="fc-stats">
            <span class="fc-stat">رُئيت <strong>${card.reviewCount||0}</strong> مرة</span>
            <span class="fc-stat">صحيحة <strong>${card.correctCount||0}</strong> مرة</span>
            ${accuracy !== null ? `<span class="fc-stat">الدقة <strong>${accuracy}%</strong></span>` : ''}
          </div>
        </div>
        <div class="flashcard-actions" style="flex-shrink:0;">
          <button class="btn btn-sm btn-ghost" data-action="practice-one" data-id="${card.id}" title="تدرب">🎮</button>
          <button class="btn btn-sm btn-ghost" data-action="edit-fc" data-id="${card.id}" title="تعديل">✏️</button>
          <button class="btn btn-sm btn-danger" data-action="delete-fc" data-id="${card.id}" title="حذف">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
}

/* ── Practice mode (anytime, no SRS update) ─────────────── */
function startPracticeMode(container, cards, allCards, allSubjects, subjectMap) {
  const shuffled = [...cards].sort(() => Math.random() - .5);
  let index   = 0;
  let correct = 0;
  let flipped = false;

  function show() {
    if (index >= shuffled.length) {
      showDone();
      return;
    }
    flipped = false;
    const card     = shuffled[index];
    const subject  = subjectMap[card.subjectId];
    const cardType = card.type || 'text';

    container.innerHTML = `
      <div class="page-hd" style="margin-bottom:var(--s5);">
        <button class="btn btn-ghost btn-sm" id="exit-practice">← خروج</button>
        <span class="text-muted text-sm">${index+1} / ${shuffled.length}</span>
      </div>
      <p class="study-counter">🎮 وضع التدريب — بدون تأثير على الجدول</p>

      <div class="study-progress-bar" style="margin-bottom:var(--s7);">
        <div class="study-progress-fill" style="width:${(index/shuffled.length)*100}%"></div>
      </div>

      ${cardType === 'tf'  ? renderTFCard(card, subject)  :
        cardType === 'mcq' ? renderMCQCard(card, subject) :
        renderTextCard(card, subject)}
    `;

    container.querySelector('#exit-practice')?.addEventListener('click', () => {
      renderUI(container, allCards, allSubjects, subjectMap);
    });

    if (cardType === 'text') bindTextCard(container);
    if (cardType === 'mcq')  bindMCQCard(container, card, () => { correct++; index++; setTimeout(show, 900); }, () => { index++; setTimeout(show, 900); });
    if (cardType === 'tf')   bindTFCard(container, card, () => { correct++; index++; setTimeout(show, 700); }, () => { index++; setTimeout(show, 700); });
  }

  function bindTextCard(container) {
    const scene = container.querySelector('#practice-scene');
    scene?.addEventListener('click', () => {
      if (flipped) return;
      flipped = true;
      scene.querySelector('.study-card-inner')?.classList.add('flipped');
      setTimeout(() => {
        const actionsEl = container.querySelector('#practice-actions');
        if (actionsEl) actionsEl.style.display = 'flex';
      }, 350);
    });
    container.querySelector('#practice-correct')?.addEventListener('click', () => { correct++; index++; show(); });
    container.querySelector('#practice-wrong')?.addEventListener('click',   () => { index++; show(); });
  }

  function showDone() {
    const pct = shuffled.length > 0 ? Math.round(correct/shuffled.length*100) : 0;
    container.innerHTML = `
      <div class="study-done">
        <div class="study-done-icon">${pct>=80?'🏆':pct>=50?'👍':'💪'}</div>
        <h3 class="study-done-title">انتهى التدريب!</h3>
        <div class="study-done-stats">
          <div class="study-done-stat">
            <div class="study-done-stat-val text-success">${correct}</div>
            <div class="study-done-stat-lbl">صحيح</div>
          </div>
          <div class="study-done-stat">
            <div class="study-done-stat-val text-danger">${shuffled.length-correct}</div>
            <div class="study-done-stat-lbl">خطأ</div>
          </div>
          <div class="study-done-stat">
            <div class="study-done-stat-val">${pct}%</div>
            <div class="study-done-stat-lbl">الدقة</div>
          </div>
        </div>
        <div style="display:flex;gap:var(--s5);justify-content:center;flex-wrap:wrap;">
          <button class="btn btn-primary" id="retry-practice">🔄 مجدداً</button>
          <button class="btn btn-secondary" id="back-fc">← البطاقات</button>
        </div>
      </div>
    `;
    container.querySelector('#retry-practice')?.addEventListener('click', () => startPracticeMode(container, cards, allCards, allSubjects, subjectMap));
    container.querySelector('#back-fc')?.addEventListener('click', () => renderUI(container, allCards, allSubjects, subjectMap));
  }

  show();
}

function renderTextCard(card, subject) {
  return `
    <div class="study-scene" id="practice-scene" role="button" tabindex="0">
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
    <div class="study-actions" id="practice-actions" style="display:none;">
      <button class="btn btn-wrong" id="practice-wrong">✗ خطأ</button>
      <button class="btn btn-correct" id="practice-correct">✓ صحيح</button>
    </div>
  `;
}

function renderMCQCard(card, subject) {
  const opts   = card.options || [];
  const answer = card.answer  || card.back;
  return `
    <div class="card card-elevated" style="max-width:640px;margin:0 auto;">
      <p style="font-size:1.15rem;font-weight:700;margin-bottom:var(--s7);text-align:center;" dir="rtl">
        🔘 ${escHtml(card.front)}
      </p>
      <div class="mcq-options" id="mcq-opts">
        ${opts.map((o,i) => `
          <div class="mcq-option" data-idx="${i}" data-answer="${escHtml(answer)}" dir="rtl">
            ${escHtml(o)}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function bindMCQCard(container, card, onCorrect, onWrong) {
  container.querySelectorAll('.mcq-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const chosen = opt.textContent.trim();
      const answer = (card.answer || card.back).trim();
      const isRight = chosen === answer;
      container.querySelectorAll('.mcq-option').forEach(o => {
        if (o.textContent.trim() === answer) o.classList.add('reveal');
        else if (o === opt && !isRight) o.classList.add('wrong');
        o.style.pointerEvents = 'none';
      });
      if (isRight) { opt.classList.add('correct'); onCorrect(); }
      else onWrong();
    });
  });
}

function renderTFCard(card, subject) {
  return `
    <div class="card card-elevated" style="max-width:640px;margin:0 auto;text-align:center;">
      <p style="font-size:1.2rem;font-weight:700;margin-bottom:var(--s7);" dir="rtl">
        ✅ ${escHtml(card.front)}
      </p>
      <div class="tf-options">
        <button class="tf-btn true-btn" id="tf-true">✓ صح</button>
        <button class="tf-btn false-btn" id="tf-false">✗ خطأ</button>
      </div>
      <div id="tf-result" style="margin-top:var(--s6);font-size:.9rem;"></div>
    </div>
  `;
}

function bindTFCard(container, card, onCorrect, onWrong) {
  const answer = (card.answer || card.back || '').toLowerCase().trim();
  const isTrue = answer === 'صح' || answer === 'true' || answer === 'صحيح';

  const trueBtn  = container.querySelector('#tf-true');
  const falseBtn = container.querySelector('#tf-false');
  const result   = container.querySelector('#tf-result');

  function handle(chosen) {
    const right = chosen === isTrue;
    trueBtn.classList.toggle('correct', isTrue);
    trueBtn.classList.toggle('wrong',   !isTrue && chosen === true);
    falseBtn.classList.toggle('correct', !isTrue);
    falseBtn.classList.toggle('wrong',   isTrue && chosen === false);
    trueBtn.disabled = falseBtn.disabled = true;
    result.textContent = right ? '✅ إجابة صحيحة!' : `❌ الإجابة: ${isTrue ? 'صح' : 'خطأ'}`;
    result.style.color = right ? 'var(--success)' : 'var(--danger)';
    right ? onCorrect() : onWrong();
  }

  trueBtn?.addEventListener('click',  () => handle(true));
  falseBtn?.addEventListener('click', () => handle(false));
}

/* ── Card create/edit modal ──────────────────────────────── */
function openCardModal(container, allCards, allSubjects, subjectMap, existing) {
  const isEdit   = !!existing;
  const backdrop = document.getElementById('modal-form');
  const titleEl  = document.getElementById('modal-form-title');
  const bodyEl   = document.getElementById('modal-form-body');
  const closeBtn = document.getElementById('modal-form-close');

  titleEl.textContent = isEdit ? 'تعديل البطاقة' : 'بطاقة جديدة';
  backdrop.classList.remove('hidden');

  const currentType = existing?.type || 'text';

  bodyEl.innerHTML = `
    <div class="form-group">
      <label class="form-label">نوع البطاقة</label>
      <div class="gen-type-grid" style="grid-template-columns:1fr 1fr 1fr;">
        <div class="gen-type-card ${currentType==='text'?'selected':''}" data-type="text">
          <div class="gen-type-icon">✍️</div>
          <div class="gen-type-label">نص</div>
        </div>
        <div class="gen-type-card ${currentType==='mcq'?'selected':''}" data-type="mcq">
          <div class="gen-type-icon">🔘</div>
          <div class="gen-type-label">متعدد</div>
        </div>
        <div class="gen-type-card ${currentType==='tf'?'selected':''}" data-type="tf">
          <div class="gen-type-icon">✅</div>
          <div class="gen-type-label">صح/خطأ</div>
        </div>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">المادة</label>
      <select class="form-select" id="fc-modal-subject">
        ${allSubjects.map(s => `<option value="${s.id}" ${existing?.subjectId===s.id?'selected':''}>${escHtml(s.name)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">السؤال / الوجه *</label>
      <textarea class="form-textarea" id="fc-modal-front" rows="3" dir="rtl">${escHtml(existing?.front||'')}</textarea>
      <span class="form-error" id="front-err">يرجى إدخال السؤال.</span>
    </div>
    <div id="fc-type-fields">${renderTypeFields(currentType, existing)}</div>
    <div style="display:flex;gap:var(--s4);justify-content:flex-end;">
      <button class="btn btn-ghost" id="fc-cancel">إلغاء</button>
      <button class="btn btn-primary" id="fc-save">${isEdit?'💾 حفظ':'✅ إضافة'}</button>
    </div>
  `;

  let selectedType = currentType;

  bodyEl.querySelectorAll('.gen-type-card').forEach(card => {
    card.addEventListener('click', () => {
      bodyEl.querySelectorAll('.gen-type-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedType = card.dataset.type;
      bodyEl.querySelector('#fc-type-fields').innerHTML = renderTypeFields(selectedType, null);
      bindMCQFieldEvents(bodyEl);
    });
  });

  bindMCQFieldEvents(bodyEl);
  setTimeout(() => bodyEl.querySelector('#fc-modal-front')?.focus(), 50);

  const close = () => backdrop.classList.add('hidden');
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', e => { if (e.target===backdrop) close(); }, { once:true });
  bodyEl.querySelector('#fc-cancel').addEventListener('click', close);

  bodyEl.querySelector('#fc-save').addEventListener('click', async () => {
    const front = bodyEl.querySelector('#fc-modal-front').value.trim();
    const frontErr = bodyEl.querySelector('#front-err');
    if (!front) { frontErr.classList.add('visible'); return; }
    frontErr.classList.remove('visible');

    const subjectId = bodyEl.querySelector('#fc-modal-subject').value;
    let back    = '';
    let options = undefined;
    let answer  = undefined;

    if (selectedType === 'text') {
      back = bodyEl.querySelector('#fc-modal-back')?.value.trim() || '';
    } else if (selectedType === 'mcq') {
      const opts = Array.from(bodyEl.querySelectorAll('.mcq-option-input'))
        .map(i => i.value.trim()).filter(Boolean);
      answer  = bodyEl.querySelector('#mcq-answer')?.value.trim() || '';
      options = opts;
      back    = answer;
    } else if (selectedType === 'tf') {
      answer = bodyEl.querySelector('#tf-answer')?.value || 'صح';
      back   = answer;
    }

    const card = isEdit
      ? { ...existing, front, back, type:selectedType, options, answer }
      : buildCard({ front, back, subjectId });

    if (!isEdit) { card.type = selectedType; card.options = options; card.answer = answer; }

    await cardsDB.save(card);

    if (isEdit) {
      const idx = allCards.findIndex(c => c.id === card.id);
      if (idx !== -1) allCards[idx] = card;
    } else {
      allCards.unshift(card);
    }

    close();
    renderUI(container, allCards, allSubjects, subjectMap);
    showToast(isEdit ? 'تم تعديل البطاقة' : 'تم إضافة البطاقة', 'success');
  });
}

function renderTypeFields(type, existing) {
  if (type === 'text') {
    return `
      <div class="form-group">
        <label class="form-label">الإجابة / الظهر *</label>
        <textarea class="form-textarea" id="fc-modal-back" rows="3" dir="rtl">${escHtml(existing?.back||'')}</textarea>
      </div>`;
  }
  if (type === 'mcq') {
    const opts = existing?.options || ['','','',''];
    return `
      <div class="form-group">
        <label class="form-label">الخيارات (أضف 2-6 خيارات)</label>
        <div id="mcq-options-list" style="display:flex;flex-direction:column;gap:var(--s3);">
          ${opts.map((o,i)=>`
            <div style="display:flex;gap:var(--s3);align-items:center;">
              <span style="font-size:.8rem;color:var(--text3);min-width:20px;">${i+1}.</span>
              <input class="form-input mcq-option-input" value="${escHtml(o)}" placeholder="خيار ${i+1}" dir="rtl">
              ${i>=2?`<button class="btn btn-danger btn-sm btn-icon-only remove-mcq-opt">✕</button>`:''}
            </div>`).join('')}
        </div>
        <button class="btn btn-secondary btn-sm" id="add-mcq-opt" style="margin-top:var(--s3);">➕ خيار</button>
      </div>
      <div class="form-group">
        <label class="form-label">الإجابة الصحيحة</label>
        <input class="form-input" id="mcq-answer" value="${escHtml(existing?.answer||'')}" placeholder="اكتب الإجابة الصحيحة كما هي في الخيارات" dir="rtl">
      </div>`;
  }
  if (type === 'tf') {
    return `
      <div class="form-group">
        <label class="form-label">الإجابة الصحيحة</label>
        <select class="form-select" id="tf-answer">
          <option value="صح" ${existing?.answer==='صح'?'selected':''}>✓ صح</option>
          <option value="خطأ" ${existing?.answer==='خطأ'?'selected':''}>✗ خطأ</option>
        </select>
      </div>`;
  }
  return '';
}

function bindMCQFieldEvents(bodyEl) {
  bodyEl.querySelector('#add-mcq-opt')?.addEventListener('click', () => {
    const list  = bodyEl.querySelector('#mcq-options-list');
    const count = list.querySelectorAll('.mcq-option-input').length;
    if (count >= 6) return;
    const div = document.createElement('div');
    div.style.cssText = 'display:flex;gap:var(--s3);align-items:center;';
    div.innerHTML = `
      <span style="font-size:.8rem;color:var(--text3);min-width:20px;">${count+1}.</span>
      <input class="form-input mcq-option-input" placeholder="خيار ${count+1}" dir="rtl">
      <button class="btn btn-danger btn-sm btn-icon-only remove-mcq-opt">✕</button>
    `;
    list.appendChild(div);
  });

  bodyEl.addEventListener('click', e => {
    if (e.target.classList.contains('remove-mcq-opt')) {
      const list = bodyEl.querySelector('#mcq-options-list');
      if (list.querySelectorAll('.mcq-option-input').length <= 2) return;
      e.target.closest('div').remove();
    }
  });
}
