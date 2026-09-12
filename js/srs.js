/**
 * srs.js — Spaced Repetition System engine (v2)
 *
 * الخوارزمية الجديدة (Ease-based, يشبه SM-2 المبسّط):
 *  - كل بطاقة تملك: interval (أيام حتى المراجعة القادمة)، ease (معامل السهولة، افتراضي 2.5)،
 *    lapses (عدد الأخطاء)، nextReview (تاريخ الاستحقاق).
 *  - إجابة صحيحة  → interval = round(interval * ease) و ease يرتفع قليلاً (سقف 3.2).
 *  - إجابة خاطئة  → nextReview = غداً (interval = 1)، lapses++، ease ينخفض قليلاً (حد أدنى 1.3).
 *
 * حد المراجعات اليومية (Max Daily Reviews):
 *  - يُخزَّن في الإعدادات تحت المفتاح "maxDailyReviews" (0 = بلا حد).
 *  - عند فتح المراجعة: تُرتَّب كل البطاقات المستحقة حسب الأولوية
 *    (الأكثر أخطاءً أولاً ثم الأقدم استحقاقاً)، ويُؤخذ منها فقط ما يوازي الحد الأقصى.
 *  - الباقي يُؤجَّل تلقائياً على الأيام القادمة (دفعة لكل يوم بحجم الحد الأقصى) بدل تكديسه
 *    كله في يوم واحد — هذا ما يمنع "الانفجار" في عدد البطاقات المستحقة.
 */

import { todayStr, addDays, uid } from '../utils/helpers.js';
import { flashcards as cardsDB, history as historyDB, settings } from '../db.js';

/* ─── Defaults ────────────────────────────────────────────── */
export const DEFAULT_EASE            = 2.5;
export const MIN_EASE                = 1.3;
export const MAX_EASE                = 3.2;
export const DEFAULT_MAX_DAILY       = 20; // 0 = غير محدود
// Kept only for backward compatibility with any old settings screen that reads it
export const DEFAULT_INTERVALS       = [1, 3, 7, 14, 30, 90];

/* ─── Max daily reviews (editable directly from the review screen) ─ */
export async function getMaxDailyReviews() {
  const saved = await settings.get('maxDailyReviews');
  if (saved === undefined || saved === null || saved === '') return DEFAULT_MAX_DAILY;
  const n = parseInt(saved, 10);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_MAX_DAILY;
}

export async function setMaxDailyReviews(n) {
  const val = Math.max(0, parseInt(n, 10) || 0);
  await settings.set('maxDailyReviews', val);
  return val;
}

/* ─── Legacy interval settings (kept so settings.js doesn't break) ── */
export async function getIntervals() {
  const saved = await settings.get('srsIntervals');
  if (Array.isArray(saved) && saved.length > 0) return saved;
  return [...DEFAULT_INTERVALS];
}

export async function saveIntervals(intervals) {
  if (!Array.isArray(intervals) || intervals.length === 0) {
    throw new Error('يجب أن تحتوي الفترات على قيمة واحدة على الأقل.');
  }
  const nums = intervals.map(n => Math.max(1, parseInt(n, 10) || 1));
  await settings.set('srsIntervals', nums);
  return nums;
}

/* ─── Build a new flashcard object ───────────────────────── */
export function buildCard({ front, back, subjectId, category = 'عام', translation = '', example = '' }) {
  return {
    id:           uid(),
    subjectId,
    category:     category || 'عام',
    front:        (front || '').trim(),
    back:         (back  || '').trim(),
    translation:  (translation || '').trim(),
    example:      (example || '').trim(),
    stage:        0,           // legacy, kept for old UI badges only
    ease:         DEFAULT_EASE,
    interval:     0,           // 0 → due immediately (new card)
    lapses:       0,
    nextReview:   todayStr(),
    createdAt:    new Date().toISOString(),
    lastReview:   null,
    reviewCount:  0,
    correctCount: 0,
  };
}

/* ─── Process a review result (new ease-based algorithm) ─── */
export async function processReview(card, correct) {
  const ease   = card.ease || DEFAULT_EASE;
  const oldInt = card.interval || 0;
  let newInterval, newEase, newLapses = card.lapses || 0;

  if (correct) {
    // Correct answer: multiply the interval by the ease factor.
    // First-ever correct review (interval 0) starts at 1 day.
    newInterval = oldInt <= 0 ? 1 : Math.max(1, Math.round(oldInt * ease));
    newEase     = Math.min(MAX_EASE, +(ease + 0.1).toFixed(2));
  } else {
    // Wrong answer: back to tomorrow, count the lapse, soften the ease.
    newInterval = 1;
    newEase     = Math.max(MIN_EASE, +(ease - 0.2).toFixed(2));
    newLapses  += 1;
  }

  const nextReview = addDays(todayStr(), newInterval);
  // stage kept only as a coarse display bucket (0..5) derived from the interval
  const newStage = intervalToStage(newInterval);

  const updated = {
    ...card,
    stage:        newStage,
    ease:         newEase,
    interval:     newInterval,
    lapses:       newLapses,
    nextReview,
    lastReview:   new Date().toISOString(),
    reviewCount:  (card.reviewCount  || 0) + 1,
    correctCount: (card.correctCount || 0) + (correct ? 1 : 0),
  };

  await cardsDB.save(updated);

  await historyDB.save({
    id:         uid(),
    cardId:     card.id,
    subjectId:  card.subjectId,
    correct,
    stage:      newStage,
    reviewedAt: new Date().toISOString(),
  });

  return updated;
}

function intervalToStage(days) {
  if (days <= 1)  return 0;
  if (days <= 3)  return 1;
  if (days <= 7)  return 2;
  if (days <= 14) return 3;
  if (days <= 30) return 4;
  return 5;
}

/* ─── Stats for a single card ────────────────────────────── */
export function cardAccuracy(card) {
  if (!card.reviewCount) return null;
  return Math.round((card.correctCount / card.reviewCount) * 100);
}

/* ─── Label for a stage / interval ───────────────────────── */
export function stageLabel(card) {
  if (!card.reviewCount) return 'جديدة';
  const days = card.interval || 1;
  return `كل ${days} ${days === 1 ? 'يوم' : 'أيام'}`;
}

/* ─── Count due cards across all subjects ────────────────── */
export async function getDueCount(category = null) {
  const due = await cardsDB.getDueCards(null, category);
  return due.length;
}

/* ─── Priority ordering: most lapses first, then oldest due first ── */
function priorityCompare(a, b) {
  const lapseDiff = (b.lapses || 0) - (a.lapses || 0);
  if (lapseDiff !== 0) return lapseDiff;
  const aDate = a.nextReview || '0000-00-00';
  const bDate = b.nextReview || '0000-00-00';
  if (aDate !== bDate) return aDate.localeCompare(bDate); // oldest (smaller date) first
  return (a.createdAt || '').localeCompare(b.createdAt || '');
}

/**
 * Build today's review queue:
 *  1. Fetch every due card (subjectId/category optional filters).
 *  2. Sort by priority (most errors → oldest due).
 *  3. Keep only `maxDaily` of them for *today*.
 *  4. Spread the overflow across the coming days (maxDaily per day) so the
 *     backlog drains gradually instead of reappearing all at once tomorrow.
 *
 * Returns { queue, totalDue, deferredCount, maxDaily }
 */
export async function buildTodayQueue({ subjectId = null, category = null } = {}) {
  const maxDaily = await getMaxDailyReviews();
  const due = await cardsDB.getDueCards(subjectId, category);
  due.sort(priorityCompare);

  if (maxDaily <= 0 || due.length <= maxDaily) {
    return { queue: due, totalDue: due.length, deferredCount: 0, maxDaily };
  }

  const todayBatch = due.slice(0, maxDaily);
  const overflow    = due.slice(maxDaily);

  // Distribute the overflow: day+1 gets the next `maxDaily`, day+2 the next
  // batch after that, and so on — preserving their relative priority order.
  const today = todayStr();
  const updates = overflow.map((card, i) => {
    const dayOffset  = Math.floor(i / maxDaily) + 1;
    const newDueDate = addDays(today, dayOffset);
    // Never push a card further into the future than it already was scheduled for.
    const finalDate = (!card.nextReview || newDueDate > card.nextReview) ? newDueDate : card.nextReview;
    return { ...card, nextReview: finalDate };
  });

  await cardsDB.bulkSave(updates);

  return { queue: todayBatch, totalDue: due.length, deferredCount: overflow.length, maxDaily };
}
