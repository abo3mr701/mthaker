export const DEFAULT_PLAN_LIMIT = 10;

export function planLimit(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : DEFAULT_PLAN_LIMIT;
}

export function localStudyDay(at = new Date()) {
  return [at.getFullYear(), at.getMonth() + 1, at.getDate()]
    .map((part, index) => String(part).padStart(index ? 2 : 4, '0')).join('-');
}

export function nextReviewDay(date) {
  const value = new Date(date + 'T00:00:00Z');
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

export function scheduleReviewPlans(plans, today, limit) {
  const capacity = planLimit(limit);
  const occupied = new Map();
  const pending = [];
  const scheduled = plans.map(plan => ({ ...plan, reviews: (plan.reviews || []).map(review => ({ ...review })) }));
  for (const plan of scheduled) {
    for (const review of plan.reviews) {
      if (review.done) {
        const day = review.completedAt ? localStudyDay(new Date(review.completedAt)) : review.dueDate;
        if (day === today) occupied.set(day, (occupied.get(day) || 0) + 1);
      } else if (review.dueDate) {
        pending.push({ plan, review });
      }
    }
  }
  pending.sort((a, b) => a.review.dueDate.localeCompare(b.review.dueDate)
    || String(a.plan.createdAt || '').localeCompare(String(b.plan.createdAt || ''))
    || String(a.plan.id).localeCompare(String(b.plan.id)));
  const changed = new Set();
  for (const { plan, review } of pending) {
    // A missed checkpoint is eligible on the next day the user returns.
    let day = review.dueDate < today ? today : review.dueDate;
    while ((occupied.get(day) || 0) >= capacity) day = nextReviewDay(day);
    occupied.set(day, (occupied.get(day) || 0) + 1);
    if (review.dueDate !== day) {
      review.dueDate = day;
      changed.add(plan.id);
    }
  }
  return { plans: scheduled, changed: scheduled.filter(plan => changed.has(plan.id)) };
}
