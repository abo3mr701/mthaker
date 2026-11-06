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
  const selected = new Set();
  let selecting = false;
  let deleting = false;
  let visible = [];
  cards.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  container.innerHTML = `
    <div class="page-hd">
      <div class="page-hd-text">
        <h2>${lesson ? escHtml(lesson.title) : 'كل البطاقات'}</h2>
        <p id="library-count"></p>
      </div>
      <div class="flex gap-3 wrap">
        <button type="button" class="btn btn-secondary" id="library-select" aria-pressed="false">تحديد البطاقات</button>
        ${planId ? '<a class="btn btn-secondary" href="#cards">كل البطاقات</a>' : ''}
        <a class="btn btn-primary" href="${planId ? '#reviews' : '#study'}">${planId ? 'المراجعات' : 'راجع المستحق اليوم'}</a>
      </div>
    </div>
    <div class="form-group">
      <label for="library-search" class="form-label">ابحث في البطاقات</label>
      <input class="form-input" id="library-search" type="search" dir="auto">
    </div>
    <div class="library-selection flex gap-3 wrap hidden" id="library-selection">
      <span class="text-sm" id="library-selected-count" role="status"></span>
      <button type="button" class="btn btn-secondary btn-sm" id="library-select-results">تحديد كل النتائج</button>
      <button type="button" class="btn btn-danger btn-sm" id="library-delete-selected">حذف المحدد</button>
    </div>
    <div id="library-cards"></div>
  `;

  const search = container.querySelector('#library-search');
  const list = container.querySelector('#library-cards');
  const count = container.querySelector('#library-count');
  const select = container.querySelector('#library-select');
  const tools = container.querySelector('#library-selection');
  const selectedCount = container.querySelector('#library-selected-count');
  const selectResults = container.querySelector('#library-select-results');
  const deleteSelected = container.querySelector('#library-delete-selected');

  function syncSelection() {
    const allVisible = visible.length > 0 && visible.every(card => selected.has(card.id));
    const hidden = selected.size - visible.filter(card => selected.has(card.id)).length;
    select.classList.toggle('hidden', cards.length === 0);
    select.disabled = deleting;
    select.setAttribute('aria-pressed', String(selecting));
    select.textContent = selecting ? 'إنهاء التحديد' : 'تحديد البطاقات';
    tools.classList.toggle('hidden', !selecting);
    selectedCount.textContent = `المحدد: ${selected.size}${hidden ? ` (${hidden} خارج نتائج البحث)` : ''}`;
    selectResults.textContent = allVisible ? 'إلغاء تحديد النتائج' : 'تحديد كل النتائج';
    selectResults.disabled = deleting || !visible.length;
    deleteSelected.disabled = deleting || !selected.size;
  }

  function paint() {
    count.textContent = `${cards.length} بطاقة · ${cards.filter(card => !card.nextReview || card.nextReview <= today).length} مستحقة`;
    const query = search.value.trim().toLowerCase();
    visible = cards.filter(card => [card.front, card.back, card.answer,
      names.get(card.subjectId), lessons.get(card.planId)?.title]
      .some(value => String(value || '').toLowerCase().includes(query)));
    list.innerHTML = visible.map(card => {
      const choices = cardChoices(card);
      const due = !card.nextReview || card.nextReview <= today;
      const checked = selected.has(card.id);
      return `<div class="card library-card${checked ? ' is-selected' : ''}">
        ${selecting ? `<label class="library-card-check"><input type="checkbox" data-select-card="${escHtml(card.id)}"
          aria-label="تحديد البطاقة: ${escHtml(card.front)}" ${checked ? 'checked' : ''} ${deleting ? 'disabled' : ''}></label>` : ''}
        <details>
          <summary dir="auto"><strong>${escHtml(card.front)}</strong></summary>
          <div style="margin:var(--s3) 0">
            <span class="stage-badge">${cardTypeLabel(card)}</span>
            <span class="stage-badge ${due ? 'due-badge' : ''}">${due ? 'مستحقة' : escHtml(card.nextReview)}</span>
            ${names.has(card.subjectId) ? `<a class="btn btn-ghost btn-sm" href="#subject/${encodeURIComponent(card.subjectId)}">${escHtml(names.get(card.subjectId))}</a>` : ''}
            ${lessons.has(card.planId) && !planId ? `<a class="btn btn-ghost btn-sm" href="#cards/${encodeURIComponent(card.planId)}">${escHtml(lessons.get(card.planId).title)}</a>` : ''}
          </div>
          ${choices ? `<p dir="auto"><strong>الإجابة: ${escHtml(choices.options[choices.index])}</strong></p>` : ''}
          <p dir="auto" style="white-space:pre-wrap;overflow-wrap:anywhere">${escHtml(card.back || '')}</p>
        </details>
        ${selecting ? '' : `<button type="button" class="btn btn-ghost btn-sm text-danger" data-delete-card="${escHtml(card.id)}" ${deleting ? 'disabled' : ''}>حذف البطاقة</button>`}
      </div>`;
    }).join('') || '<p class="text-muted">ما فيه بطاقات مطابقة.</p>';
    syncSelection();
  }

  async function remove(targets) {
    if (deleting || !targets.length) return;
    const multi = selecting;
    const hidden = targets.filter(card => !visible.includes(card)).length;
    deleting = true;
    syncSelection();
    const removed = new Set();
    try {
      const title = multi ? `حذف البطاقات المحددة (${targets.length})` : 'حذف البطاقة';
      const message = multi
        ? `تُحذف البطاقات المحددة من المواد والدروس والمراجعات القادمة.${hidden ? ` يشمل ذلك ${hidden} خارج نتائج البحث الحالية.` : ''} هل تريد حذفها؟`
        : 'تُحذف البطاقة من المادة والدرس والمراجعات القادمة. هل تريد حذفها؟';
      if (!await showConfirm(title, message)) return;
      if (multi) await flashcards.bulkDelete(targets.map(card => card.id), ids => ids.forEach(id => removed.add(id)));
      else {
        await flashcards.delete(targets[0].id);
        removed.add(targets[0].id);
      }
      showToast(multi ? `تم حذف البطاقات (${removed.size})` : 'تم حذف البطاقة', 'success');
    } catch {
      showToast(removed.size
        ? `تم حذف ${removed.size}، وتعذّر حذف الباقي. حاول مرة أخرى.`
        : 'تعذّر الحذف. حاول مرة أخرى.', 'error');
    } finally {
      if (removed.size) {
        const affected = new Set();
        for (let i = cards.length - 1; i >= 0; i--) {
          if (!removed.has(cards[i].id)) continue;
          if (cards[i].subjectId) affected.add(cards[i].subjectId);
          selected.delete(cards[i].id);
          cards.splice(i, 1);
        }
        if (!cards.length) selecting = false;
        await Promise.all([...affected].map(refreshSubjectCardCount));
      }
      deleting = false;
      if (removed.size) paint();
      else syncSelection();
    }
  }

  select.addEventListener('click', () => {
    if (deleting) return;
    selecting = !selecting;
    selected.clear();
    paint();
  });
  selectResults.addEventListener('click', () => {
    if (deleting) return;
    const allVisible = visible.length > 0 && visible.every(card => selected.has(card.id));
    visible.forEach(card => allVisible ? selected.delete(card.id) : selected.add(card.id));
    paint();
  });
  deleteSelected.addEventListener('click', () => remove(cards.filter(card => selected.has(card.id))));
  list.addEventListener('change', event => {
    const checkbox = event.target.closest('[data-select-card]');
    if (!checkbox) return;
    const id = checkbox.dataset.selectCard;
    if (deleting) { checkbox.checked = selected.has(id); return; }
    if (checkbox.checked) selected.add(id);
    else selected.delete(id);
    checkbox.closest('.library-card').classList.toggle('is-selected', checkbox.checked);
    syncSelection();
  });
  list.addEventListener('click', event => {
    const button = event.target.closest('[data-delete-card]');
    if (button) return remove(cards.filter(card => card.id === button.dataset.deleteCard));
  });
  search.addEventListener('input', paint);
  paint();
}
