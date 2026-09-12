/**
 * helpers.js — Shared utilities for مذاكر
 */

/* ─── Unique ID ───────────────────────────────────────────── */
export function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/* ─── Date helpers ────────────────────────────────────────── */
export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleString('ar-SA', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function timeAgo(isoStr) {
  if (!isoStr) return '';
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (days  > 0) return `منذ ${days} ${days === 1 ? 'يوم' : 'أيام'}`;
  if (hours > 0) return `منذ ${hours} ${hours === 1 ? 'ساعة' : 'ساعات'}`;
  if (mins  > 0) return `منذ ${mins} ${mins === 1 ? 'دقيقة' : 'دقائق'}`;
  return 'الآن';
}

/* ─── Format minutes to mm:ss ────────────────────────────── */
export function formatTimer(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/* ─── Escape HTML to prevent XSS ─────────────────────────── */
export function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ─── Toast Notifications ─────────────────────────────────── */
const toastStack = () => document.getElementById('toasts');

const TOAST_ICONS = {
  success: '✓',
  error:   '✕',
  info:    'ℹ',
  warning: '⚠',
};

export function showToast(message, type = 'info', duration = 3500) {
  const container = toastStack();
  if (!container) return;

  const el = document.createElement('div');
  el.className  = `toast toast-${type}`;
  el.innerHTML  = `
    <span class="toast-icon">${TOAST_ICONS[type] || 'ℹ'}</span>
    <span>${escHtml(message)}</span>
  `;
  container.appendChild(el);

  // Trigger transition
  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add('show'));
  });

  // Auto-remove
  setTimeout(() => {
    el.classList.remove('show');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
  }, duration);
}

/* ─── Confirm Dialog ──────────────────────────────────────── */
export function showConfirm(title, message) {
  return new Promise((resolve) => {
    const backdrop = document.getElementById('modal-confirm');
    const titleEl  = document.getElementById('confirm-title');
    const msgEl    = document.getElementById('confirm-msg');
    const yesBtn   = document.getElementById('confirm-yes');
    const noBtn    = document.getElementById('confirm-no');

    titleEl.textContent = title;
    msgEl.textContent   = message;
    backdrop.classList.remove('hidden');

    const cleanup = (result) => {
      backdrop.classList.add('hidden');
      yesBtn.removeEventListener('click', onYes);
      noBtn.removeEventListener('click', onNo);
      backdrop.removeEventListener('click', onBackdrop);
      resolve(result);
    };

    const onYes      = () => cleanup(true);
    const onNo       = () => cleanup(false);
    const onBackdrop = (e) => { if (e.target === backdrop) cleanup(false); };

    yesBtn.addEventListener('click', onYes);
    noBtn.addEventListener('click', onNo);
    backdrop.addEventListener('click', onBackdrop);
  });
}

/* ─── Generic Form Modal ──────────────────────────────────── */
export function showModal({ title, bodyHtml, onClose } = {}) {
  const backdrop = document.getElementById('modal-form');
  const titleEl  = document.getElementById('modal-form-title');
  const bodyEl   = document.getElementById('modal-form-body');
  const closeBtn = document.getElementById('modal-form-close');

  titleEl.textContent = title || '';
  bodyEl.innerHTML    = bodyHtml || '';
  backdrop.classList.remove('hidden');

  const close = () => {
    backdrop.classList.add('hidden');
    closeBtn.removeEventListener('click', close);
    backdrop.removeEventListener('click', onBackdrop);
    if (typeof onClose === 'function') onClose();
  };

  const onBackdrop = (e) => { if (e.target === backdrop) close(); };

  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', onBackdrop);

  return { close, bodyEl };
}

/* ─── Debounce ────────────────────────────────────────────── */
export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/* ─── Truncate text ───────────────────────────────────────── */
export function truncate(str, maxLen = 80) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

/* ─── Subject colour palette ──────────────────────────────── */
export const SUBJECT_COLORS = [
  '#7C3AED', '#2563EB', '#0891B2', '#059669',
  '#D97706', '#DC2626', '#DB2777', '#7C3AED',
  '#4F46E5', '#0D9488', '#65A30D', '#EA580C',
];

export function randomColor() {
  return SUBJECT_COLORS[Math.floor(Math.random() * SUBJECT_COLORS.length)];
}

/* ─── File type helpers ───────────────────────────────────── */
export function fileIcon(mimeOrName) {
  const name = (mimeOrName || '').toLowerCase();
  if (name.includes('pdf'))                return '📄';
  if (name.match(/png|jpg|jpeg|gif|webp/)) return '🖼️';
  if (name.match(/doc/))                   return '📝';
  if (name.match(/xls/))                   return '📊';
  if (name.match(/ppt/))                   return '📋';
  if (name.match(/txt|text/))             return '📃';
  return '📁';
}

export function humanSize(bytes) {
  if (bytes < 1024)            return `${bytes} ب`;
  if (bytes < 1_048_576)       return `${(bytes/1024).toFixed(1)} ك`;
  return `${(bytes/1_048_576).toFixed(1)} م`;
}

/* ─── Pluralise Arabic numbers (simplified) ──────────────── */
export function arabicCount(n, singular, plural) {
  return `${n} ${n === 1 ? singular : plural}`;
}
