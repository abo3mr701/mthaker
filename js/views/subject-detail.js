/**
 * subject-detail.js — Single subject: files, AI generation, flashcard management
 */

import { subjects as subjectsDB, flashcards as cardsDB, files as filesDB, reviewPlans } from '../db.js';
import { generateFlashcards, extractTextFromImage } from '../services/studyAI.js';
import { requirePuterConnection } from '../services/puterAI.js';
import { extractFileContent, needsVisionOCR, validateFile } from '../services/extractor.js';
import { buildCard, stageLabel } from '../services/srs.js';
import { refreshSubjectCardCount } from './subjects.js';
import { cardChoices, cardTypeLabel } from './review-card.js';
import {
  uid, showToast, showConfirm, debounce,
  fileIcon, humanSize, escHtml, truncate, todayStr,
} from '../utils/helpers.js';

export async function renderSubjectDetail(container, subjectId, selectedPlanId) {
  container.innerHTML = `<div class="flex-center" style="padding:var(--s10)"><div class="spinner"></div></div>`;

  const [subject, cards, subjectFiles, plans] = await Promise.all([
    subjectsDB.getById(subjectId),
    cardsDB.getBySubject(subjectId),
    filesDB.getBySubject(subjectId),
    reviewPlans.getBySubject(subjectId),
  ]).catch(err => {
    container.innerHTML = `<div class="empty-state"><p class="text-danger">خطأ: ${err.message}</p></div>`;
    return [null, [], [], []];
  });

  if (!subject) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">❓</div>
        <h3 class="empty-title">المادة غير موجودة</h3>
        <button class="btn btn-secondary" onclick="window.location.hash='#subjects'">← العودة</button>
      </div>`;
    return;
  }

  renderDetailUI(container, subject, cards, subjectFiles, plans, selectedPlanId);
}

function renderDetailUI(container, subject, cards, subjectFiles, plans, selectedPlanId) {
  container.innerHTML = `
    <!-- Back link -->
    <a href="#subjects" class="btn btn-ghost btn-sm mb-4" style="display:inline-flex;">
      ← العودة للمواد
    </a>

    <!-- Subject header -->
    <div class="subject-detail-header">
      <div class="subject-detail-color" style="background:${subject.color}">
        ${escHtml(subject.name.charAt(0))}
      </div>
      <div>
        <h2 class="subject-detail-name">${escHtml(subject.name)}</h2>
        <p class="subject-detail-meta">
          <span id="subject-card-count">${cards.length}</span> بطاقة تعليمية · ${subjectFiles.length} ملف
        </p>
      </div>
    </div>

    <!-- Tabs -->
    <div class="tabs" id="detail-tabs">
      <button class="tab-btn active" data-tab="files">📁 الملفات والمحتوى</button>
      <button class="tab-btn" data-tab="cards">🃏 البطاقات التعليمية</button>
    </div>

    <!-- Files tab -->
    <div id="tab-files">
      ${renderFilesTab(subjectFiles, plans, selectedPlanId)}
    </div>

    <!-- Cards tab (hidden initially) -->
    <div id="tab-cards" class="hidden">
      ${renderCardsTab(subject, cards)}
    </div>
  `;

  // Tab switching
  container.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      container.querySelector('#tab-files').classList.toggle('hidden', tab !== 'files');
      container.querySelector('#tab-cards').classList.toggle('hidden', tab !== 'cards');
    });
  });

  bindFilesTab(container, subject, cards, plans);
  bindCardsTab(container, subject, cards, plans);
}

/* ─── FILES TAB ──────────────────────────────────────────── */
function lessonSelect(plans, id, selected) {
  if (!plans.length && !selected) return '';
  return `<div class="form-group">
    <label class="form-label" for="${id}">اربط البطاقات بدرس (اختياري)</label>
    <select id="${id}" class="form-select">
      <option value="">بطاقات للمادة</option>
      ${selected && !plans.some(plan => plan.id === selected) && id === 'card-lesson'
        ? `<option value="${escHtml(selected)}" selected>الإبقاء على ربط الدرس الحالي</option>` : ''}
      ${plans.map(plan => `<option value="${escHtml(plan.id)}" ${plan.id === selected ? 'selected' : ''}>${escHtml(plan.title)}</option>`).join('')}
    </select>
  </div>`;
}

function renderFilesTab(files, plans, selectedPlanId) {
  const fileItems = files.map(f => `
    <div class="file-item" data-file-id="${f.id}">
      <span class="file-icon">${fileIcon(f.name)}</span>
      <span class="file-name">${escHtml(f.name)}</span>
      <span class="file-status done">✓ معالج</span>
      <span class="text-muted text-xs">${humanSize(f.size || 0)}</span>
      <button class="btn btn-sm btn-danger btn-icon-only" data-action="delete-file" data-id="${f.id}" title="حذف">🗑️</button>
    </div>
  `).join('');

  return `
    ${lessonSelect(plans, 'upload-lesson', selectedPlanId)}
    <!-- Upload zone -->
    <div class="upload-zone" id="upload-zone" tabindex="0" role="button"
         aria-label="رفع ملف جديد">
      <input type="file" id="file-input" accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.md,.csv"
             multiple aria-hidden="true">
      <div class="upload-icon">📂</div>
      <p class="upload-title">اسحب الملفات هنا أو انقر للاختيار</p>
      <p class="upload-sub">PDF، صور (PNG/JPG)، نص — الحد الأقصى 20 ميغابايت</p>
    </div>

    <!-- AI generation status -->
    <div id="ai-status" class="hidden"></div>

    <!-- File list -->
    <div class="section-title">الملفات المرفوعة</div>
    <div id="files-list">
      ${files.length === 0
        ? `<p class="text-muted text-sm" style="padding:var(--s5) 0;">لا توجد ملفات بعد</p>`
        : fileItems
      }
    </div>
  `;
}

function bindFilesTab(container, subject, cards, plans) {
  const uploadZone = container.querySelector('#upload-zone');
  const fileInput  = container.querySelector('#file-input');
  let uploading = false;
  async function upload(files) {
    if (uploading || !files.length) return;
    const planId = container.querySelector('#upload-lesson')?.value;
    uploading = true;
    try {
      await handleFiles(files, container, subject, cards, plans, planId);
    } finally {
      uploading = false;
      hideAIStatus(container);
    }
  }

  // Drag & drop styling
  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
  });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    upload(Array.from(e.dataTransfer.files));
  });

  uploadZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    upload(Array.from(fileInput.files));
    fileInput.value = '';
  });

  // Delete file
  container.querySelector('#files-list')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action="delete-file"]');
    if (!btn) return;
    const id = btn.dataset.id;
    const ok = await showConfirm('حذف الملف', 'هل تريد حذف هذا الملف؟');
    if (!ok) return;
    await filesDB.delete(id);
    btn.closest('.file-item')?.remove();
    showToast('تم حذف الملف', 'success');
  });
}

async function handleFiles(rawFiles, container, subject, cards, plans, planId) {
  try {
    await requirePuterConnection();
  } catch (error) {
    showToast(error.message, 'warning', 7000);
    return;
  }

  for (const file of rawFiles) {
    const validation = validateFile(file);
    if (!validation.ok) { showToast(validation.error, 'error'); continue; }

    // Add pending item to UI immediately
    const tempId = uid();
    addFileItemToList(container, file, tempId, 'processing');
    showAIStatus(container, `جاري معالجة: ${file.name}…`);

    try {
      // 1. Extract raw content
      const extraction = await extractFileContent(file);

      let textContent = extraction.text || '';

      // 2. Extract readable text from images before generating questions.
      if (needsVisionOCR(extraction)) {
        showAIStatus(container, `جاري استخراج النص من الصورة…`);
        textContent = await extractTextFromImage(extraction.base64, extraction.mimeType);
      }

      // 3. Save file metadata + extracted text
      const fileRecord = {
        id:           tempId,
        subjectId:    subject.id,
        name:         file.name,
        size:         file.size,
        mimeType:     file.type,
        extractedText: textContent,
        uploadedAt:   new Date().toISOString(),
      };
      await filesDB.save(fileRecord);
      updateFileItemStatus(container, tempId, 'done');

      // 4. Generate flashcards if we have text
      if (textContent.trim().length >= 20) {
        showAIStatus(container, `جاري إنشاء البطاقات التعليمية بالذكاء الاصطناعي…`);
        try {
          const rawCards = await generateFlashcards(textContent, subject.name);
          const newCards = rawCards.map(c => buildCard({
            ...c,
            subjectId: subject.id,
            planId,
          }));
          await cardsDB.bulkSave(newCards);
          cards.push(...newCards);
          repaintCards(container, subject, cards, plans);
          await refreshSubjectCardCount(subject.id);

          showToast(`✅ تم إنشاء ${newCards.length} بطاقة من "${file.name}"`, 'success', 5000);

        } catch (aiErr) {
          showToast(`تعذّر إنشاء البطاقات: ${aiErr.message}`, 'error', 7000);
        }
      } else {
        showToast(`تم رفع "${file.name}" (النص المستخرج قصير جداً لإنشاء بطاقات)`, 'info');
      }

    } catch (err) {
      updateFileItemStatus(container, tempId, 'error');
      showToast(`خطأ في معالجة "${file.name}": ${err.message}`, 'error', 7000);
    }
  }

}

function addFileItemToList(container, file, tempId, status) {
  const list = container.querySelector('#files-list');
  if (!list) return;
  // Remove empty state text if present
  const emptyP = list.querySelector('p');
  if (emptyP) emptyP.remove();

  const item = document.createElement('div');
  item.className = 'file-item';
  item.dataset.fileId = tempId;
  item.innerHTML = `
    <span class="file-icon">${fileIcon(file.name)}</span>
    <span class="file-name">${escHtml(file.name)}</span>
    <span class="file-status ${status}" id="status-${tempId}">
      ${status === 'processing' ? '<span class="spinner" style="width:14px;height:14px;border-width:2px;"></span>' : ''}
    </span>
    <span class="text-muted text-xs">${humanSize(file.size)}</span>
  `;
  list.appendChild(item);
}

function updateFileItemStatus(container, tempId, status) {
  const el = container.querySelector(`#status-${tempId}`);
  if (!el) return;
  el.className = `file-status ${status}`;
  el.innerHTML = status === 'done' ? '✓ معالج' : status === 'error' ? '✕ خطأ' : '';
}

function showAIStatus(container, msg) {
  const el = container.querySelector('#ai-status');
  if (!el) return;
  el.className = 'ai-generating';
  el.innerHTML = `<div class="spinner" style="width:18px;height:18px;border-width:2px;"></div> ${escHtml(msg)}`;
}

function hideAIStatus(container) {
  const el = container.querySelector('#ai-status');
  if (el) { el.className = 'hidden'; el.innerHTML = ''; }
}

/* ─── CARDS TAB ──────────────────────────────────────────── */
function renderCardsTab(subject, cards) {
  cards.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  return `
    <div class="page-hd" style="margin-bottom:var(--s6);">
      <div class="search-wrap" style="max-width:360px;flex:1;">
        <span class="search-icon">🔍</span>
        <input type="text" class="form-input" id="card-search" placeholder="ابحث في البطاقات…" dir="rtl">
      </div>
      <button class="btn btn-primary btn-sm" id="btn-add-card">➕ بطاقة يدوية</button>
    </div>

    <div id="cards-list">
      ${cards.length === 0
        ? `<div class="empty-state"><div class="empty-icon">🃏</div>
           <h3 class="empty-title">لا توجد بطاقات بعد</h3>
           <p class="empty-sub">ارفع ملفاً لإنشاء بطاقات تلقائياً أو أضف بطاقة يدوياً</p></div>`
        : cards.map(cardItemHtml).join('')
      }
    </div>
  `;
}

function cardItemHtml(c) {
  const choices = cardChoices(c);
  return `
    <div class="flashcard-item" data-card-id="${c.id}">
      <div class="flashcard-text" style="flex:1;">
        <div class="front">${escHtml(c.front)}</div>
        <div class="back">${choices ? escHtml(choices.options[choices.index]) + ' · ' : ''}${escHtml(truncate(c.back, 120))}</div>
        <span class="stage-badge">${cardTypeLabel(c)}</span>
        <span class="stage-badge">${stageLabel(c)}</span>
        ${c.lapses ? `<span class="lapses-badge" title="عدد الأخطاء">✗ ${c.lapses}</span>` : ''}
      </div>
      <div class="flashcard-actions">
        <button class="btn btn-sm btn-ghost" data-action="edit-card" data-id="${c.id}" title="تعديل">✏️</button>
        <button class="btn btn-sm btn-danger" data-action="delete-card" data-id="${c.id}" title="حذف">🗑️</button>
      </div>
    </div>
  `;
}

function repaintCards(container, subject, cards, plans) {
  container.querySelector('#subject-card-count').textContent = cards.length;
  container.querySelector('#tab-cards').innerHTML = renderCardsTab(subject, cards);
  bindCardsTab(container, subject, cards, plans);
}

function bindCardsTab(container, subject, cards, plans) {
  const applyFilters = debounce(() => {
    const q = (container.querySelector('#card-search')?.value || '').trim().toLowerCase();

    const filtered = cards.filter(c =>
      !q || String(c.front || '').toLowerCase().includes(q) || String(c.back || '').toLowerCase().includes(q)
    );

    const list = container.querySelector('#cards-list');
    if (!list) return;
    list.innerHTML = filtered.length === 0
      ? `<p class="text-muted text-sm" style="padding:var(--s7) 0;">لا توجد نتائج</p>`
      : filtered.map(cardItemHtml).join('');
    rebindCardActions(container, subject, cards, plans);
  }, 200);

  container.querySelector('#card-search')?.addEventListener('input', applyFilters);

  // Add card button
  container.querySelector('#btn-add-card')?.addEventListener('click', () => {
    openCardModal(container, subject, null, cards, plans);
  });

  rebindCardActions(container, subject, cards, plans);
}

function rebindCardActions(container, subject, cards, plans) {
  // Edit
  container.querySelectorAll('[data-action="edit-card"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id   = btn.dataset.id;
      const card = cards.find(c => c.id === id);
      if (card) openCardModal(container, subject, card, cards, plans);
    });
  });

  // Delete
  container.querySelectorAll('[data-action="delete-card"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const ok = await showConfirm('حذف البطاقة', 'هل تريد حذف هذه البطاقة نهائياً؟');
      if (!ok) return;
      await cardsDB.delete(id);
      const idx = cards.findIndex(c => c.id === id);
      if (idx !== -1) cards.splice(idx, 1);
      repaintCards(container, subject, cards, plans);
      await refreshSubjectCardCount(subject.id);
      showToast('تم حذف البطاقة', 'success');
    });
  });
}

function openCardModal(container, subject, existing, cards, plans) {
  const isEdit = !!existing;
  const backdrop = document.getElementById('modal-form');
  const titleEl  = document.getElementById('modal-form-title');
  const bodyEl   = document.getElementById('modal-form-body');
  const closeBtn = document.getElementById('modal-form-close');

  titleEl.textContent = isEdit ? 'تعديل البطاقة' : 'بطاقة جديدة';
  backdrop.classList.remove('hidden');

  bodyEl.innerHTML = `
    <div class="form-group">
      <label class="form-label">الوجه (السؤال) *</label>
      <textarea class="form-textarea" id="card-front" rows="2" dir="auto"
        placeholder="أدخل السؤال أو المفهوم…">${escHtml(existing?.front || '')}</textarea>
      <span class="form-error" id="front-error">يرجى إدخال وجه البطاقة.</span>
    </div>
    <div class="form-group">
      <label class="form-label">الظهر (الإجابة) *</label>
      <textarea class="form-textarea" id="card-back" rows="3" dir="auto"
        placeholder="أدخل الإجابة أو الشرح…">${escHtml(existing?.back || '')}</textarea>
      <span class="form-error" id="back-error">يرجى إدخال ظهر البطاقة.</span>
    </div>
    ${lessonSelect(plans, 'card-lesson', existing?.planId)}
    <div style="display:flex;gap:var(--s4);justify-content:flex-end;">
      <button class="btn btn-ghost" id="cancel-card-btn">إلغاء</button>
      <button class="btn btn-primary" id="save-card-btn">
        ${isEdit ? '💾 حفظ' : '✅ إضافة'}
      </button>
    </div>
  `;

  setTimeout(() => bodyEl.querySelector('#card-front')?.focus(), 50);

  const close = () => {
    backdrop.classList.add('hidden');
    closeBtn.removeEventListener('click', close);
  };
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); }, { once: true });
  bodyEl.querySelector('#cancel-card-btn').addEventListener('click', close);

  bodyEl.querySelector('#save-card-btn').addEventListener('click', async () => {
    const front = bodyEl.querySelector('#card-front').value.trim();
    const back  = bodyEl.querySelector('#card-back').value.trim();
    const fe    = bodyEl.querySelector('#front-error');
    const be    = bodyEl.querySelector('#back-error');
    let valid   = true;

    if (!front) { fe.classList.add('visible'); valid = false; } else fe.classList.remove('visible');
    if (!back)  { be.classList.add('visible'); valid = false; } else be.classList.remove('visible');
    if (!valid) return;

    const planId = bodyEl.querySelector('#card-lesson')?.value;
    const card = isEdit
      ? { ...existing, front, back, planId: planId ?? existing.planId ?? null }
      : buildCard({ front, back, subjectId: subject.id, planId });

    const save = bodyEl.querySelector('#save-card-btn');
    save.disabled = true;
    try {
      await cardsDB.save(card);
    } catch {
      save.disabled = false;
      showToast('تعذّر حفظ البطاقة. حاول مرة أخرى.', 'error');
      return;
    }
    await refreshSubjectCardCount(subject.id);

    if (isEdit) {
      const idx = cards.findIndex(c => c.id === card.id);
      if (idx !== -1) cards[idx] = card;
    } else {
      cards.unshift(card);
    }

    close();
    repaintCards(container, subject, cards, plans);
    showToast(isEdit ? 'تم تعديل البطاقة' : 'تم إضافة البطاقة', 'success');
  });
}
