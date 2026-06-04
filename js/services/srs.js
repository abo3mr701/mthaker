/**
 * srs.js — Spaced Repetition System engine
 *
 * Default intervals (days): [1, 3, 7, 14, 30, 90]
 * A correct answer advances the stage; an incorrect answer moves the card back.
 * nextReview is stored as ISO date string (YYYY-MM-DD).
 */

import { todayStr, addDays } from '../utils/helpers.js';
import { flashcards as cardsDB, history as historyDB, settings } from '../db.js';
import { uid } from '../utils/helpers.js';

/* ─── Default SRS intervals in days ──────────────────────── */
export const DEFAULT_INTERVALS = [1, 3, 7, 14, 30, 90];

/* ─── Load configured intervals from settings ────────────── */
export async function getIntervals() {
  const saved = await settings.get('srsIntervals');
  if (Array.isArray(saved) && saved.length > 0) return saved;
  return [...DEFAULT_INTERVALS];
}

/* ─── Save intervals to settings ─────────────────────────── */
export async function saveIntervals(intervals) {
  if (!Array.isArray(intervals) || intervals.length === 0) {
    throw new Error('يجب أن تحتوي الفترات على قيمة واحدة على الأقل.');
  }
  const nums = intervals.map(n => Math.max(1, parseInt(n, 10) || 1));
  await settings.set('srsIntervals', nums);
  return nums;
}

/* ─── Build a new flashcard object ───────────────────────── */
export function buildCard({ front, back, subjectId }) {
  return {
    id:          uid(),
    subjectId,
    front:       (front || '').trim(),
    back:        (back  || '').trim(),
    stage:       0,
    nextReview:  todayStr(),
    createdAt:   new Date().toISOString(),
    lastReview:  null,
    reviewCount: 0,
    correctCount: 0,
  };
}

/* ─── Process a review result ────────────────────────────── */
export async function processReview(card, correct) {
  const intervals = await getIntervals();

  let newStage;
  if (correct) {
    newStage = Math.min(card.stage + 1, intervals.length - 1);
  } else {
    // On wrong answer: go back two stages (but not below 0)
    newStage = Math.max(0, card.stage - 2);
  }

  const daysUntilNext = intervals[newStage] ?? intervals[intervals.length - 1];
  const nextReview    = addDays(todayStr(), daysUntilNext);

  const updated = {
    ...card,
    stage:        newStage,
    nextReview,
    lastReview:   new Date().toISOString(),
    reviewCount:  (card.reviewCount  || 0) + 1,
    correctCount: (card.correctCount || 0) + (correct ? 1 : 0),
  };

  // Persist updated card
  await cardsDB.save(updated);

  // Record history entry
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

/* ─── Get stats for a single card ────────────────────────── */
export function cardAccuracy(card) {
  if (!card.reviewCount) return null;
  return Math.round((card.correctCount / card.reviewCount) * 100);
}

/* ─── Label for a stage ───────────────────────────────────── */
export async function stageLabel(stage) {
  const intervals = await getIntervals();
  if (stage === 0) return 'جديدة';
  const days = intervals[Math.min(stage, intervals.length - 1)];
  return `كل ${days} يوم`;
}

/* ─── Count due cards across all subjects ────────────────── */
export async function getDueCount() {
  const due = await cardsDB.getDueCards();
  return due.length;
}
