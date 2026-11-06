import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { localStudyDay } from '../js/services/reviewPlanSchedule.js';

const dataUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('individual, selected and completed-plan deletions leave other cards and review history intact', async () => {
  process.env.TZ = 'Asia/Riyadh';
  const docs = new Map();
  globalThis.lessonCardStore = {
    collection: (_db, ...parts) => parts.join('/'),
    doc: (col, id) => col + '/' + id,
    setDoc: async (key, record) => docs.set(key, record),
    getDoc: async key => ({ exists: () => docs.has(key), data: () => docs.get(key) }),
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
        delete(key) { changes.push(() => docs.delete(key)); },
        async commit() { changes.forEach(apply => apply()); },
      };
    },
    async runTransaction(db, execute) {
      const batch = this.writeBatch(db);
      await execute({ ...batch, get: this.getDoc });
      await batch.commit();
    },
  };
  const firestore = dataUrl(`const store = globalThis.lessonCardStore;
    export const { collection, doc, setDoc, query, where, getDoc, getDocs, writeBatch, deleteDoc } = store;
    export const runTransaction = store.runTransaction.bind(store);`);
  const schedule = new URL('../js/services/reviewPlanSchedule.js', import.meta.url).href;
  const dbSource = (await source('../js/db.js'))
    .replace('./services/firebase.js', dataUrl('export const auth={ currentUser:{uid:"test-user"} }, firestore={};'))
    .replace(/https:\/\/www\.gstatic\.com\/[^']+firebase-firestore\.js/, firestore)
    .replace('./services/studyTime.js', new URL('../js/services/studyTime.js', import.meta.url).href)
    .replace('./services/reviewPlanSchedule.js', schedule);
  const dbUrl = dataUrl(dbSource);
  const { flashcards, history, reviewPlans } = await import(dbUrl);
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
  const ui = { confirm: false, toasts: [], refreshed: [], confirmations: [] };
  globalThis.lessonLibraryUI = ui;
  const helpers = dataUrl(`
    export { escHtml } from '${new URL('../js/utils/helpers.js', import.meta.url).href}';
    export const showConfirm = async (...args) => {
      globalThis.lessonLibraryUI.confirmations.push(args);
      return globalThis.lessonLibraryUI.confirm;
    };
    export const showToast = (text, type) => globalThis.lessonLibraryUI.toasts.push([text, type]);
  `);
  const reviewCard = dataUrl((await source('../js/views/review-card.js')).replace('../utils/helpers.js', helpers));
  const { renderCardLibrary } = await import(dataUrl((await source('../js/views/card-library.js'))
    .replace('../db.js', dbUrl)
    .replace('../services/reviewPlanSchedule.js', schedule)
    .replace('../utils/helpers.js', helpers)
    .replace('./review-card.js', reviewCard)
    .replace('./subjects.js', dataUrl('export const refreshSubjectCardCount = async id => globalThis.lessonLibraryUI.refreshed.push(id);'))));
  const element = () => ({
    classList: { toggle() {} },
    addEventListener(type, fn) { this[type] = fn; },
    setAttribute() {},
  });
  const elements = Object.fromEntries(['cards','count','search','select','selection','selected-count','select-results','delete-selected']
    .map(name => ['#library-' + name, element()]));
  const list = elements['#library-cards'];
  const count = elements['#library-count'];
  const search = elements['#library-search'];
  search.value = '';
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

  const selected = ['حذف ١', 'حذف ٢'].map(front => buildCard({ front, back: 'إجابة', subjectId: 'math', planId: 'algebra' }));
  const other = buildCard({ front: 'درس آخر', back: 'إجابة', subjectId: 'math', planId: 'geometry' });
  await flashcards.bulkSave([...selected, other]);
  await renderCardLibrary(container, 'algebra');
  elements['#library-select'].click();
  search.value = 'حذف';
  search.input();
  elements['#library-select-results'].click();
  search.value = 'حذف ١';
  search.input();
  assert.match(elements['#library-selected-count'].textContent, /1 خارج نتائج البحث/);
  await elements['#library-delete-selected'].click();
  assert.match(ui.confirmations.at(-1)[0], /\(2\)/);
  assert.deepEqual(await flashcards.getByPlan('algebra'), [updated]);
  assert.deepEqual(await flashcards.getByPlan('geometry'), [other]);

  const today = localStudyDay();
  const active = { id: 'algebra', reviews: [
    { id: 'first', dueDate: today, done: false },
    { id: 'last', dueDate: today, done: false },
  ] };
  const completedAt = new Date().toISOString();
  const final = { ...active, reviews: active.reviews.map(row => ({ ...row, done: true, completedAt })) };
  await reviewPlans.save(active);
  await assert.rejects(reviewPlans.finish(final, 'last'), /Lesson review changed/);
  assert.deepEqual(await flashcards.getByPlan('algebra'), [updated]);
  await reviewPlans.save({ ...active, reviews: [final.reviews[0], active.reviews[1]] });
  await flashcards.save({ ...updated, nextReview: today });
  await assert.rejects(reviewPlans.finish(final, 'last'), { code: 'lesson-cards-due' });
  await flashcards.save(updated);
  const { removed, pending } = await reviewPlans.finish(final, 'last');
  assert.deepEqual(removed, [updated]);
  assert.deepEqual(pending, []);
  assert.deepEqual((await reviewPlans.getById('algebra')).reviews, final.reviews);
  assert.deepEqual(await flashcards.getByPlan('algebra'), []);
  assert.deepEqual(await flashcards.getBySubject('math'), [other]);
  assert.deepEqual(await history.getByCard(card.id), [review]);

  const bigPlan = { id: 'large', reviews: [{ id: 'final', dueDate: today, done: false }] };
  await reviewPlans.save(bigPlan);
  const many = Array.from({ length: 400 }, (_, i) => ({ ...updated, planId: 'large', id: `large-${i}` }));
  await flashcards.bulkSave(many);
  const finished = { ...bigPlan, reviews: [{ ...bigPlan.reviews[0], done: true, completedAt }] };
  const bigResult = await reviewPlans.finish(finished, 'final');
  assert.equal(bigResult.removed.length, 399);
  const saved = await reviewPlans.getById(bigPlan.id);
  assert.deepEqual(saved.pendingCardCleanup, ['large-399']);
  const addedLater = { ...updated, planId: 'large', id: 'added-later' };
  await flashcards.save(addedLater);
  await reviewPlans.cleanupFinishedCards(saved);
  assert.deepEqual(await flashcards.getByPlan('large'), [addedLater]);
  assert.deepEqual((await reviewPlans.getById('large')).pendingCardCleanup, []);
});
