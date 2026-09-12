/**
 * subjects.js — Subject list view (create, search, edit, delete)
 */

import { subjects as subjectsDB, flashcards as cardsDB } from '../db.js';
import {
  uid, showToast, showConfirm, debounce,
  SUBJECT_COLORS, randomColor, arabicCount, formatDate,
} from '../utils/helpers.js';

let _allSubjects = [];

export async function renderSubjects(container) {
  container.innerHTML = `<div class="flex-center" style="padding:var(--s10)"><div class="spinner"></div></div>`;

  try {
    _allSubjects = await subjectsDB.getAll();
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p class="text-danger">خطأ: ${err.message}</p></div>`;
    return;
  }

  _allSubjects.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  renderUI(container, _allSubjects);

  // Listen for the dashboard's "open-new-subject" event
  document.addEventListener('open-new-subject', () => openSubjectModal(container), { once: true });
}

function renderUI(container, subjects) {
  container.innerHTML = `
    <div class="page-hd">
      <div class="page-hd-text">
        <h2>المواد الدراسية</h2>
        <p>${arabicCount(subjects.length, 'مادة', 'مواد')}</p>
      </div>
      <button class="btn btn-primary" id="btn-new-subject">
        <span>➕</span> مادة جديدة
      </button>
    </div>

    <!-- Search -->
    <div class="search-wrap mb-4" style="max-width:400px;">
      <span class="search-icon">🔍</span>
      <input type="text" class="form-input" id="subject-search"
        placeholder="ابحث في المواد…" autocomplete="off" dir="rtl">
    </div>

    <!-- Grid -->
    <div class="grid-2" id="subjects-grid">
      ${subjects.length === 0 ? emptyState() : subjects.map(s => subjectCard(s)).join('')}
    </div>
  `;

  // New subject button
  container.querySelector('#btn-new-subject').addEventListener('click', () => {
    openSubjectModal(container);
  });

  // Search
  const searchInput = container.querySelector('#subject-search');
  searchInput.addEventListener('input', debounce(() => {
    const q = searchInput.value.trim().toLowerCase();
    const filtered = q
      ? _allSubjects.filter(s => s.name.toLowerCase().includes(q))
      : _allSubjects;
    const grid = container.querySelector('#subjects-grid');
    grid.innerHTML = filtered.length === 0
      ? `<p class="text-muted text-sm" style="grid-column:1/-1;padding:var(--s7);">لا توجد نتائج</p>`
      : filtered.map(s => subjectCard(s)).join('');
    bindCardActions(container);
  }, 250));

  bindCardActions(container);
}

function bindCardActions(container) {
  // Navigate to subject detail
  container.querySelectorAll('.subject-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.subject-card-actions')) return;
      const id = card.dataset.id;
      window.location.hash = `#subject/${id}`;
    });
  });

  // Edit buttons
  container.querySelectorAll('[data-action="edit-subject"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const subject = _allSubjects.find(s => s.id === id);
      if (subject) openSubjectModal(container, subject);
    });
  });

  // Delete buttons
  container.querySelectorAll('[data-action="delete-subject"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const subject = _allSubjects.find(s => s.id === id);
      if (!subject) return;

      const ok = await showConfirm(
        'حذف المادة',
        `هل أنت متأكد من حذف "${subject.name}"؟ سيتم حذف جميع البطاقات والملفات المرتبطة بها.`
      );
      if (!ok) return;

      try {
        await subjectsDB.delete(id);
        _allSubjects = _allSubjects.filter(s => s.id !== id);
        renderUI(container, _allSubjects);
        showToast('تم حذف المادة بنجاح', 'success');
      } catch (err) {
        showToast(`فشل الحذف: ${err.message}`, 'error');
      }
    });
  });
}

function subjectCard(subject) {
  return `
    <div class="subject-card" data-id="${subject.id}" tabindex="0" role="button"
         aria-label="فتح مادة ${subject.name}">
      <div class="subject-card-stripe" style="background:${subject.color || '#7C3AED'}"></div>
      <div class="subject-card-body">
        <div class="subject-card-name">${subject.name}</div>
        <div class="subject-card-meta">
          <span>📝 ${subject.cardCount ?? 0} بطاقة</span>
          <span>📅 ${subject.createdAt ? formatDate(subject.createdAt.slice(0,10)) : ''}</span>
        </div>
        <div class="subject-card-actions">
          <button class="btn btn-sm btn-ghost" data-action="edit-subject" data-id="${subject.id}"
                  title="تعديل">✏️ تعديل</button>
          <button class="btn btn-sm btn-danger" data-action="delete-subject" data-id="${subject.id}"
                  title="حذف">🗑️</button>
        </div>
      </div>
    </div>
  `;
}

function emptyState() {
  return `
    <div class="empty-state" style="grid-column:1/-1;">
      <div class="empty-icon">📚</div>
      <h3 class="empty-title">لا توجد مواد دراسية بعد</h3>
      <p class="empty-sub">أنشئ مادتك الأولى لتبدأ المذاكرة</p>
    </div>
  `;
}

/* ─── Subject Create / Edit Modal ────────────────────────── */
function openSubjectModal(container, existing = null) {
  const isEdit = !!existing;
  const title  = isEdit ? 'تعديل المادة' : 'مادة جديدة';
  const name   = existing?.name || '';
  const color  = existing?.color || randomColor();

  // Build modal directly in modal-form
  const backdrop = document.getElementById('modal-form');
  const titleEl  = document.getElementById('modal-form-title');
  const bodyEl   = document.getElementById('modal-form-body');
  const closeBtn = document.getElementById('modal-form-close');

  titleEl.textContent = title;
  backdrop.classList.remove('hidden');

  bodyEl.innerHTML = `
    <div class="form-group">
      <label class="form-label" for="subject-name-input">اسم المادة *</label>
      <input type="text" class="form-input" id="subject-name-input"
        value="${name}" placeholder="مثال: الرياضيات، الفيزياء…" maxlength="80" dir="rtl">
      <span class="form-error" id="name-error">يرجى إدخال اسم المادة.</span>
    </div>

    <div class="form-group">
      <label class="form-label">اللون</label>
      <div class="color-picker" id="color-picker">
        ${SUBJECT_COLORS.map(c => `
          <div class="color-dot ${c === color ? 'selected' : ''}"
               style="background:${c}" data-color="${c}" title="${c}"></div>
        `).join('')}
      </div>
    </div>

    <div style="display:flex;gap:var(--s4);justify-content:flex-end;padding-top:var(--s5);">
      <button class="btn btn-ghost" id="modal-cancel-subj">إلغاء</button>
      <button class="btn btn-primary" id="modal-save-subj">
        ${isEdit ? '💾 حفظ التغييرات' : '✅ إنشاء المادة'}
      </button>
    </div>
  `;

  let selectedColor = color;

  // Color picker
  bodyEl.querySelectorAll('.color-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      bodyEl.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
      dot.classList.add('selected');
      selectedColor = dot.dataset.color;
    });
  });

  // Focus name input
  setTimeout(() => bodyEl.querySelector('#subject-name-input')?.focus(), 50);

  const closeModal = () => {
    backdrop.classList.add('hidden');
    closeBtn.removeEventListener('click', closeModal);
  };

  closeBtn.addEventListener('click', closeModal);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); }, { once: true });
  bodyEl.querySelector('#modal-cancel-subj').addEventListener('click', closeModal);

  // Save
  bodyEl.querySelector('#modal-save-subj').addEventListener('click', async () => {
    const nameInput = bodyEl.querySelector('#subject-name-input');
    const nameVal   = nameInput.value.trim();
    const nameError = bodyEl.querySelector('#name-error');

    if (!nameVal) {
      nameError.classList.add('visible');
      nameInput.focus();
      return;
    }
    nameError.classList.remove('visible');

    const subject = isEdit
      ? { ...existing, name: nameVal, color: selectedColor }
      : {
          id:        uid(),
          name:      nameVal,
          color:     selectedColor,
          createdAt: new Date().toISOString(),
          cardCount: 0,
        };

    try {
      await subjectsDB.save(subject);
      if (isEdit) {
        const idx = _allSubjects.findIndex(s => s.id === subject.id);
        if (idx !== -1) _allSubjects[idx] = subject;
      } else {
        _allSubjects.unshift(subject);
      }
      closeModal();
      renderUI(container, _allSubjects);
      showToast(isEdit ? 'تم تعديل المادة' : 'تم إنشاء المادة', 'success');
    } catch (err) {
      showToast(`فشل الحفظ: ${err.message}`, 'error');
    }
  });

  // Allow Enter key to submit
  bodyEl.querySelector('#subject-name-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') bodyEl.querySelector('#modal-save-subj').click();
  });
}

/* ─── Update card count badge for a subject ─────────────── */
export async function refreshSubjectCardCount(subjectId) {
  try {
    const subject = await subjectsDB.getById(subjectId);
    if (!subject) return;
    const cards = await cardsDB.getBySubject(subjectId);
    await subjectsDB.save({ ...subject, cardCount: cards.length });
  } catch {
    // Non-critical
  }
}
