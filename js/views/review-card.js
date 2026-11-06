import { escHtml, showToast } from '../utils/helpers.js';

const LABELS = { text: 'سؤال قصير', essay: 'سؤال مقالي', mcq: 'اختيار من متعدد', tf: 'صح أو خطأ' };

export function cardChoices(card) {
  if (card.type === 'tf') {
    const answer = String(card.answer ?? card.back ?? '').trim().toLowerCase();
    if (['صح', 'صحيح', 'true'].includes(answer)) return { options: ['صح', 'خطأ'], index: 0 };
    if (['خطأ', 'false'].includes(answer)) return { options: ['صح', 'خطأ'], index: 1 };
  }
  if (card.type === 'mcq' && Array.isArray(card.options) && card.options.length >= 2) {
    const index = card.options.indexOf(card.answer ?? card.back);
    if (index >= 0) return { options: card.options, index };
  }
  return null;
}

export function cardTypeLabel(card) {
  return LABELS[cardChoices(card) ? card.type : card.type === 'essay' ? 'essay' : 'text'];
}

export function renderReviewCard(slot, card, onRate) {
  const choices = cardChoices(card);
  const question = escHtml(card.front);
  const answer = escHtml(card.back || '—');
  const label = cardTypeLabel(card);
  slot.innerHTML = choices ? `
    <div class="card review-question">
      <span class="stage-badge">${label}</span>
      <h3 dir="auto">${question}</h3>
      <div class="review-options">
        ${choices.options.map((option, index) =>
          `<button class="btn btn-secondary" data-choice="${index}" dir="auto">${escHtml(option)}</button>`
        ).join('')}
      </div>
      <div class="hidden" data-feedback aria-live="polite">
        <strong data-result></strong>
        ${card.back !== choices.options[choices.index] ? `<p dir="auto">${answer}</p>` : ''}
        <button class="btn btn-primary" data-next>متابعة</button>
      </div>
    </div>` : `
    <div class="card review-question">
      <span class="stage-badge">${label}</span>
      <h3 dir="auto">${question}</h3>
      <button class="btn btn-primary" data-reveal>اكشف الإجابة</button>
      <div class="hidden" data-feedback>
        <p dir="auto">${answer}</p>
        <div class="study-actions">
          <button class="btn btn-wrong" data-rate="wrong">✗ لم أتذكر</button>
          <button class="btn btn-correct" data-rate="correct">✓ أتذكرتها</button>
        </div>
      </div>
    </div>`;

  const feedback = slot.querySelector('[data-feedback]');
  const ratingButtons = [...slot.querySelectorAll('[data-rate], [data-next]')];
  let saving = false;
  async function rate(correct) {
    if (saving) return;
    saving = true;
    ratingButtons.forEach(button => { button.disabled = true; });
    try {
      await onRate(correct);
    } catch {
      showToast('تعذّر حفظ إجابة البطاقة. حاول مرة أخرى.', 'error');
      saving = false;
      ratingButtons.forEach(button => { button.disabled = false; });
    }
  }

  if (choices) {
    const buttons = [...slot.querySelectorAll('[data-choice]')];
    let correct;
    buttons.forEach((button, index) => button.addEventListener('click', () => {
      if (correct !== undefined) return;
      correct = index === choices.index;
      buttons.forEach((choice, i) => {
        choice.disabled = true;
        if (i === choices.index) choice.classList.add('review-option-correct');
        if (i === index && !correct) choice.classList.add('review-option-wrong');
      });
      slot.querySelector('[data-result]').textContent = correct
        ? 'إجابة صحيحة ✓' : `الإجابة الصحيحة: ${choices.options[choices.index]}`;
      feedback.classList.remove('hidden');
      slot.querySelector('[data-next]').focus();
    }));
    slot.querySelector('[data-next]').addEventListener('click', () => rate(correct));
  } else {
    slot.querySelector('[data-reveal]').addEventListener('click', event => {
      event.currentTarget.classList.add('hidden');
      feedback.classList.remove('hidden');
      ratingButtons[0].focus();
    });
    ratingButtons.forEach(button => button.addEventListener('click', () => rate(button.dataset.rate === 'correct')));
  }
}
