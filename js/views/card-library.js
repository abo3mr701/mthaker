import { flashcards, reviewPlans, subjects } from '../db.js';
import { localStudyDay } from '../services/reviewPlanSchedule.js';
import { escHtml, showConfirm, showToast } from '../utils/helpers.js';
import { cardChoices, cardTypeLabel } from './review-card.js';
import { refreshSubjectCardCount } from './subjects.js';

export async function renderCardLibrary(container, planId) {
  const [cards, plans, materials] = await Promise.all([
    planId ? flashcards.getByPlan(planId) : flashcards.getAll(),
    reviewPlans.getAll(),
    subjects.getAll(),
  ]);
  const names = new Map(materials.map(subject => [subject.id, subject.name]));
  const lessons = new Map(plans.map(plan => [plan.id, plan]));
  const lesson = lessons.get(planId);
  const today = localStudyDay();
  cards.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  container.innerHTML = `
    <div class="page-hd">
      <div class="page-hd-text">
        <h2>${lesson ? escHtml(lesson.title) : 'كل البطاقات'}</h2>
        <p id="library-count"></p>
      </div>
      <div class="flex gap-3 wrap">
        ${planId ? '<a class="btn btn-secondary" href="#cards">كل البطاقات</a>' : ''}
        <a class="btn btn-primary" href="${planId ? '#reviews' : '#study'}">${planId ? 'المراجعات' : 'راجع المستحق اليوم'}</a>
      </div>
    </div>
    <div class="form-group">
      <label for="library-search" class="form-label">ابحث في البطاقات</label>
      <input class="form-input" id="library-search" type="search" dir="auto">
    </div>
    <div id="library-cards"></div>
  `;

  const search = container.querySelector('#library-search');
  const list = container.querySelector('#library-cards');
  const count = container.querySelector('#library-count');
  function paint() {
    count.textContent = `${cards.length} بطاقة · ${cards.filter(card => !card.nextReview || card.nextReview <= today).length} مستحقة`;
    const query = search.value.trim().toLowerCase();
    const visible = cards.filter(card => [card.front, card.back, card.answer,
      names.get(card.subjectId), lessons.get(card.planId)?.title]
      .some(value => String(value || '').toLowerCase().includes(query)));
    list.innerHTML = visible.map(card => {
      const choices = cardChoices(card);
      const due = !card.nextReview || card.nextReview <= today;
      return `<div class="card flex gap-3" style="margin-bottom:var(--s4);align-items:flex-start">
        <details style="flex:1;min-width:0">
          <summary dir="auto" style="overflow-wrap:anywhere"><strong>${escHtml(card.front)}</strong></summary>
          <div style="margin:var(--s3) 0">
            <span class="stage-badge">${cardTypeLabel(card)}</span>
            <span class="stage-badge ${due ? 'due-badge' : ''}">${due ? 'مستحقة' : escHtml(card.nextReview)}</span>
            ${names.has(card.subjectId) ? `<a class="btn btn-ghost btn-sm" href="#subject/${encodeURIComponent(card.subjectId)}">${escHtml(names.get(card.subjectId))}</a>` : ''}
            ${lessons.has(card.planId) && !planId ? `<a class="btn btn-ghost btn-sm" href="#cards/${encodeURIComponent(card.planId)}">${escHtml(lessons.get(card.planId).title)}</a>` : ''}
          </div>
          ${choices ? `<p dir="auto"><strong>الإجابة: ${escHtml(choices.options[choices.index])}</strong></p>` : ''}
          <p dir="auto" style="white-space:pre-wrap;overflow-wrap:anywhere">${escHtml(card.back || '')}</p>
        </details>
        <button type="button" class="btn btn-ghost btn-sm text-danger" data-delete-card="${escHtml(card.id)}">حذف البطاقة</button>
      </div>`;
    }).join('') || '<p class="text-muted">ما فيه بطاقات مطابقة.</p>';
  }
  let deleting = false;
  list.addEventListener('click', async event => {
    const button = event.target.closest('[data-delete-card]');
    if (!button || deleting) return;
    const card = cards.find(item => item.id === button.dataset.deleteCard);
    if (!card) return;
    deleting = true;
    try {
      if (!await showConfirm('حذف البطاقة', 'تُحذف البطاقة من المادة والدرس والمراجعات القادمة. هل تريد حذفها؟')) return;
      button.disabled = true;
      await flashcards.delete(card.id);
      cards.splice(cards.indexOf(card), 1);
      paint();
      if (card.subjectId) await refreshSubjectCardCount(card.subjectId);
      showToast('تم حذف البطاقة', 'success');
    } catch {
      button.disabled = false;
      showToast('تعذّر حذف البطاقة. حاول مرة أخرى.', 'error');
    } finally {
      deleting = false;
    }
  });
  search.addEventListener('input', paint);
  paint();
}
