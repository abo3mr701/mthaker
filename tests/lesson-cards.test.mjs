import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { localStudyDay } from '../js/services/reviewPlanSchedule.js';

const dataUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('a new lesson card is visible today and grading preserves its lesson and question', async () => {
  process.env.TZ = 'Asia/Riyadh';
  const docs = new Map();
  globalThis.lessonCardStore = {
    collection: (_db, ...parts) => parts.join('/'),
    doc: (col, id) => col + '/' + id,
    setDoc: async (key, record) => docs.set(key, record),
    query: (col, constraint) => ({ col, constraint }),
    where: (field, _, value) => ({ field, value }),
    getDocs: async (ref) => {
      const { col, constraint } = typeof ref === 'string' ? { col: ref } : ref;
      return { docs: [...docs].filter(([key, record]) => key.startsWith(col + '/') &&
        (!constraint || record[constraint.field] === constraint.value))
        .map(([, record]) => ({ data: () => record })) };
    },
    writeBatch: () => {
      const changes = [];
      return {
        update(key, fields) { changes.push(() => docs.set(key, { ...docs.get(key), ...fields })); },
        set(key, row) { changes.push(() => docs.set(key, row)); },
        async commit() { changes.forEach(apply => apply()); },
      };
    },
  };
  const firestore = dataUrl('export const { collection, doc, setDoc, query, where, getDocs, writeBatch } = globalThis.lessonCardStore; export const getDoc=()=>{}, deleteDoc=()=>{}, runTransaction=()=>{};');
  const schedule = new URL('../js/services/reviewPlanSchedule.js', import.meta.url).href;
  const dbSource = (await source('../js/db.js'))
    .replace('./services/firebase.js', dataUrl('export const auth={ currentUser:{uid:"test-user"} }, firestore={};'))
    .replace(/https:\/\/www\.gstatic\.com\/[^']+firebase-firestore\.js/, firestore)
    .replace('./services/studyTime.js', new URL('../js/services/studyTime.js', import.meta.url).href)
    .replace('./services/reviewPlanSchedule.js', schedule);
  const dbUrl = dataUrl(dbSource);
  const { flashcards, history } = await import(dbUrl);
  const { buildCard, processReview } = await import(dataUrl((await source('../js/services/srs.js'))
    .replace('../utils/helpers.js', new URL('../js/utils/helpers.js', import.meta.url).href)
    .replace('./reviewPlanSchedule.js', schedule)
    .replace('../db.js', dbUrl)));

  const card = buildCard({ front: 'عبارة', back: 'تفسير', type: 'tf', answer: 'خطأ', subjectId: 'math', planId: 'algebra' });
  assert.equal(card.nextReview, localStudyDay());
  await flashcards.save(card);
  assert.deepEqual(await flashcards.getByPlan('algebra'), [card]);
  assert.deepEqual(await flashcards.getBySubject('math'), [card]);
  assert.deepEqual(await flashcards.getDueCards(), [card]);

  const updated = await processReview(card, false);
  assert.deepEqual(await flashcards.getDueCards(), []);
  assert.deepEqual(await flashcards.getByPlan('algebra'), [updated]);
  assert.equal(updated.answer, 'خطأ');
  assert.equal(updated.lapses, 1);
  const [review] = await history.getByCard(card.id);
  assert.equal(review.correct, false);
});
