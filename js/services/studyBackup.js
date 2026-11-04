const LEGACY = ['subjects', 'flashcards', 'files', 'sessions', 'history'];
const CURRENT = [...LEGACY, 'reviewPlans', 'englishCards', 'englishWords'];
const ID = /^[\w.:-]{1,200}$/;
const HEX = /^#[\da-f]{3,8}$/i;
const LEVEL = /^[ABC][12]$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = value => typeof value === 'string' && ID.test(value) && !['.', '..'].includes(value) && !/^__.*__$/.test(value);
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const number = value => Number.isFinite(value) && value >= 0;

function validRow(key, row) {
  if (!object(row) || !id(row.id)) return false;
  if (row.subjectId != null && !id(row.subjectId)) return false;
  if (row.color != null && (typeof row.color !== 'string' || !HEX.test(row.color))) return false;
  if (row.lapses != null && !number(row.lapses)) return false;
  switch (key) {
    case 'subjects':
      return typeof row.name === 'string' && (row.cardCount == null || number(row.cardCount))
        && (row.createdAt == null || timestamp(row.createdAt));
    case 'flashcards':
      return typeof row.front === 'string' && typeof row.back === 'string';
    case 'files':
      return typeof row.name === 'string';
    case 'sessions':
      return number(row.durationMs) && typeof row.date === 'string' && DAY.test(row.date)
        && (row.studyByDay == null || (object(row.studyByDay)
          && Object.entries(row.studyByDay).every(([day, duration]) => DAY.test(day) && number(duration))));
    case 'history':
      return id(row.cardId) && timestamp(row.reviewedAt);
    case 'reviewPlans':
      return typeof row.title === 'string' && Array.isArray(row.reviews)
        && row.reviews.every(review => object(review) && id(review.id) && timestamp(review.dueDate));
    case 'englishCards':
      return ['new', 'learning', 'review', 'mastered', 'removed'].includes(row.status)
        && number(row.interval) && number(row.reps) && number(row.ease)
        && (row.dueDate === null || timestamp(row.dueDate));
    case 'englishWords':
      return typeof row.word === 'string' && typeof row.level === 'string' && LEVEL.test(row.level)
        && (row.exampleLabels == null || (Array.isArray(row.exampleLabels)
          && row.exampleLabels.every(label => typeof label === 'string')));
    default:
      return false;
  }
}

export function parseStudyBackup(source) {
  let value;
  try { value = JSON.parse(source); }
  catch { throw new Error('ملف النسخة ليس JSON صالحًا.'); }
  const legacy = object(value) && value.version === '1.0' && timestamp(value.exportedAt);
  if (!legacy && (!object(value) || value.app !== 'mthaker' || value.version !== '2.0')) {
    throw new Error('اختر ملف نسخة احتياطية صادرًا من مذاكر.');
  }
  return Object.fromEntries((legacy ? LEGACY : CURRENT).map(key => {
    const rows = value[key];
    if (!Array.isArray(rows) || !rows.every(row => validRow(key, row)) || new Set(rows.map(row => row.id)).size !== rows.length) {
      throw new Error('تحتوي النسخة على سجلات غير صالحة أو مكررة.');
    }
    return [key, rows];
  }));
}
