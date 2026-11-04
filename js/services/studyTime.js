import { localStudyDay } from './reviewPlanSchedule.js';

export function sessionTotals(sessions, now = new Date()) {
  const today = localStudyDay(now);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - (now.getDay() + 1) % 7);
  const week = localStudyDay(weekStart);
  const month = today.slice(0, 7) + '-01';
  const totals = { today: 0, week: 0, month: 0, all: 0, todayCount: 0, count: 0 };
  for (const session of sessions) {
    if (!session.completed || session.mode === 'break') continue;
    const days = session.studyByDay ?? { [session.date]: session.durationMs };
    totals.count++;
    if (days[today] > 0) totals.todayCount++;
    for (const [day, value] of Object.entries(days)) {
      if (!Number.isFinite(value) || value <= 0) continue;
      totals.all += value;
      if (day === today) totals.today += value;
      if (day >= week && day <= today) totals.week += value;
      if (day >= month && day <= today) totals.month += value;
    }
  }
  return totals;
}

export function addStudySpan(days, start, end) {
  while (start < end) {
    const midnight = new Date(start);
    midnight.setHours(24, 0, 0, 0);
    const until = Math.min(+midnight, end);
    const day = localStudyDay(new Date(start));
    days[day] = (days[day] || 0) + until - start;
    start = until;
  }
}

export function studyDuration(ms) {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} س ${minutes % 60} د` : `${minutes} د`;
}
