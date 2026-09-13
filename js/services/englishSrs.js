/**
 * englishSrs.js — نظام SRS بطريقة Anki (4 أزرار تقييم) مخصّص لقسم الإنجليزية فقط.
 *
 * منقول بالكامل من نظام Lexora (نفس الخوارزمية والفواصل الزمنية بالضبط) —
 * مستقل تماماً عن خوارزمية "بطاقات المراجعة" العامة في مذاكر (srs.js).
 */

export const RATINGS = {
  AGAIN: 'again',
  HARD:  'hard',
  GOOD:  'good',
  EASY:  'easy',
};

const MIN_EASE     = 1.3;
const DEFAULT_EASE = 2.5;

export function createNewCard(wordId) {
  const now = new Date().toISOString();
  return {
    id:           wordId,
    ease:         DEFAULT_EASE,
    interval:     0,        // أيام حتى المراجعة القادمة
    reps:         0,        // عدد المراجعات المتتالية الناجحة
    lapses:       0,
    status:       'new',    // new | learning | review
    dueDate:      now,
    lastReviewed: null,
    lastRating:   null,
  };
}

/**
 * تطبيق تقييم على بطاقة وإرجاع حالتها الجديدة.
 * @param {object} card حالة البطاقة الحالية
 * @param {'again'|'hard'|'good'|'easy'} rating
 */
export function applyRating(card, rating) {
  const next = { ...card };
  const now  = new Date();

  switch (rating) {
    case RATINGS.AGAIN: {
      next.lapses += 1;
      next.reps    = 0;
      next.ease    = Math.max(MIN_EASE, next.ease - 0.2);
      next.interval = 0; // مستحقة اليوم/فوراً مرة أخرى
      next.status  = 'learning';
      break;
    }
    case RATINGS.HARD: {
      next.ease = Math.max(MIN_EASE, next.ease - 0.15);
      next.interval = next.reps === 0 ? 1 : Math.max(1, Math.round(next.interval * 1.2));
      next.reps += 1;
      next.status = 'review';
      break;
    }
    case RATINGS.GOOD: {
      if (next.reps === 0) next.interval = 1;
      else if (next.reps === 1) next.interval = 6;
      else next.interval = Math.round(next.interval * next.ease);
      next.reps += 1;
      next.status = 'review';
      break;
    }
    case RATINGS.EASY: {
      next.ease = next.ease + 0.15;
      next.interval = next.reps === 0 ? 4 : Math.round(next.interval * next.ease * 1.3);
      next.reps += 1;
      next.status = 'review';
      break;
    }
    default:
      break;
  }

  const due = new Date(now);
  due.setDate(due.getDate() + next.interval);
  next.dueDate      = due.toISOString();
  next.lastReviewed = now.toISOString();
  next.lastRating   = rating;
  return next;
}

export function isDue(card, at = new Date()) {
  return new Date(card.dueDate) <= at;
}

export function forecastLabel(interval) {
  if (interval <= 0) return 'اليوم';
  if (interval === 1) return 'يوم واحد';
  if (interval < 30) return `${interval} يوم`;
  if (interval < 365) return `${Math.round(interval / 30)} شهر`;
  return `${(interval / 365).toFixed(1)} سنة`;
}
