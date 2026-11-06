import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { localStudyDay } from '../js/services/reviewPlanSchedule.js';

const dataUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('lesson cards can be reviewed or deleted without affecting the other cards', async () => {
  process.env.TZ = 'Asia/Riyadh';
  const docs = new Map();
  globalThis.lessonCardStore = {
    collection: (_db, ...parts) => parts.join('/'),
    doc: (col, id) => col + '/' + id,
    setDoc: async (key, record) => docs.set(key, record),
    deleteDoc: async key => docs.delete(key),
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
  const firestore = dataUrl('export const { collection, doc, setDoc, query, where, getDocs, writeBatch, deleteDoc } = globalThis.lessonCardStore; export const getDoc=()=>{}, runTransaction=()=>{};');
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

  const extra = buildCard({ front: 'بطاقة للحذف', back: 'إجابة', subjectId: 'math', planId: 'algebra' });
  await flashcards.save(extra);
  const ui = { confirm: false, toasts: [], refreshed: [] };
  globalThis.lessonLibraryUI = ui;
  const helpers = dataUrl(`
    export { escHtml } from '${new URL('../js/utils/helpers.js', import.meta.url).href}';
    export const showConfirm = async () => globalThis.lessonLibraryUI.confirm;
    export const showToast = (text, type) => globalThis.lessonLibraryUI.toasts.push([text, type]);
  `);
  const reviewCard = dataUrl((await source('../js/views/review-card.js')).replace('../utils/helpers.js', helpers));
  const { renderCardLibrary } = await import(dataUrl((await source('../js/views/card-library.js'))
    .replace('../db.js', dbUrl)
    .replace('../services/reviewPlanSchedule.js', schedule)
    .replace('../utils/helpers.js', helpers)
    .replace('./review-card.js', reviewCard)
    .replace('./subjects.js', dataUrl('export const refreshSubjectCardCount = async id => globalThis.lessonLibraryUI.refreshed.push(id);'))));
  const list = { addEventListener: (_type, fn) => { list.click = fn; } };
  const count = {};
  const elements = { '#library-cards': list, '#library-count': count, '#library-search': { value: '', addEventListener() {} } };
  const container = { querySelector: selector => elements[selector] };
  await renderCardLibrary(container, 'algebra');
  assert.match(list.innerHTML, /بطاقة للحذف/);
  const button = { dataset: { deleteCard: extra.id } };
  const click = { target: { closest: () => button } };
  await list.click(click);
  assert.deepEqual(await flashcards.getByPlan('algebra'), [card, extra]);
  ui.confirm = true;
  await list.click(click);
  assert.doesNotMatch(list.innerHTML, /بطاقة للحذف/);
  assert.equal(count.textContent, '1 بطاقة · 1 مستحقة');
  assert.deepEqual(await flashcards.getBySubject('math'), [card]);
  assert.deepEqual(await flashcards.getByPlan('algebra'), [card]);
  assert.deepEqual(await flashcards.getDueCards(), [card]);
  assert.deepEqual(ui.refreshed, ['math']);
  assert.equal(ui.toasts.at(-1)?.[1], 'success');

  const updated = await processReview(card, false);
  assert.deepEqual(await flashcards.getDueCards(), []);
  assert.deepEqual(await flashcards.getByPlan('algebra'), [updated]);
  assert.equal(updated.answer, 'خطأ');
  assert.equal(updated.lapses, 1);
  const [review] = await history.getByCard(card.id);
  assert.equal(review.correct, false);
});
