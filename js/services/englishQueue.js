/**
 * englishQueue.js — مولّد الدفعة اليومية الديناميكي (منقول من Lexora).
 *
 * يبني كل يوم مجموعة من الكلمات الجديدة كلياً (لم تُعرض من قبل) بحد أقصى
 * targetCount (افتراضيًا 100)، بنسبة 60-70% سهلة (A1-A2) و30-40% متوسطة
 * فأعلى (B1-B2)، مع إعادة توازن ديناميكية إذا نفدت إحدى المجموعتين، وبدون
 * أي تكرار — أي كلمة ظهرت سابقًا (seenIds) لا تُعاد أبدًا.
 */

const EASY_LEVELS = new Set(['A1', 'A2']);
const HARD_LEVELS = new Set(['B1', 'B2', 'C1']);

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * @param {Array} wordBank كل الكلمات المتاحة (لازم تملك id و level)
 * @param {Set<string>} seenIds معرّفات الكلمات المستبعدة (ظهرت من قبل)
 * @param {number} targetCount عدد الكلمات المطلوب يوميًا (افتراضي 100)
 * @param {{min:number,max:number}} easyRatio نسبة الكلمات "السهلة" بالدفعة
 */
export function generateDailyQueue(wordBank, seenIds, targetCount = 100, easyRatio = { min: 0.6, max: 0.7 }) {
  const available = wordBank.filter((w) => !seenIds.has(w.id));

  const easyPool = shuffle(available.filter((w) => EASY_LEVELS.has(w.level)));
  const hardPool = shuffle(available.filter((w) => HARD_LEVELS.has(w.level)));

  if (available.length === 0) {
    return { selected: [], easyCount: 0, hardCount: 0, poolExhausted: true };
  }

  const targetEasyFraction = (easyRatio.min + easyRatio.max) / 2;
  let desiredEasy = Math.round(targetCount * targetEasyFraction);
  let desiredHard = targetCount - desiredEasy;

  let takeEasy = Math.min(desiredEasy, easyPool.length);
  let takeHard = Math.min(desiredHard, hardPool.length);

  let shortfall = targetCount - (takeEasy + takeHard);
  if (shortfall > 0) {
    const extraFromEasy = Math.min(shortfall, easyPool.length - takeEasy);
    takeEasy += extraFromEasy;
    shortfall -= extraFromEasy;
  }
  if (shortfall > 0) {
    const extraFromHard = Math.min(shortfall, hardPool.length - takeHard);
    takeHard += extraFromHard;
    shortfall -= extraFromHard;
  }

  const selected = shuffle([...easyPool.slice(0, takeEasy), ...hardPool.slice(0, takeHard)]);

  return {
    selected,
    easyCount: takeEasy,
    hardCount: takeHard,
    poolExhausted: selected.length < targetCount,
    poolRemainingAfter: available.length - selected.length,
  };
}

export function levelBucket(level) {
  return EASY_LEVELS.has(level) ? 'easy' : 'intermediate';
}
