import assert from 'node:assert/strict';
import test from 'node:test';
import { scheduleReviewPlans } from '../js/services/reviewPlanSchedule.js';
import { arabicMessageForDay, englishMessageForDay } from '../js/data/dailyMotivation.js';

const today = '2026-11-04';
const tomorrow = '2026-11-05';
const review = (id, dueDate) => ({ id, dueDate, done: false });
const plan = reviews => [{ id: 'plan', reviews }];

test('the sixth review stays tomorrow after one of five is completed and after reload', () => {
  const original = plan(Array.from({length: 6}, (_, id) => review(id, today)));
  const scheduled = scheduleReviewPlans(original, today, 5).plans;
  assert.equal(scheduled[0].reviews[5].dueDate, tomorrow);
  scheduled[0].reviews[0].done = true;
  const afterReload = scheduleReviewPlans(JSON.parse(JSON.stringify(scheduled)), today, 5);
  assert.equal(afterReload.changed.length, 0);
  assert.equal(afterReload.plans[0].reviews.filter(r => !r.done && r.dueDate === today).length, 4);
  assert.equal(afterReload.plans[0].reviews[5].dueDate, tomorrow);
  assert.equal(original[0].reviews[5].dueDate, today);
});

test('missed reviews take priority and displace items on a full day into later dates', () => {
  const original = plan([review('today', today), review('tomorrow', tomorrow), review('missed', '2026-11-03')]);
  const { plans } = scheduleReviewPlans(original, today, 1);
  const dates = Object.fromEntries(plans[0].reviews.map(r => [r.id, r.dueDate]));
  assert.deepEqual(dates, { today: tomorrow, tomorrow: '2026-11-06', missed: today });
  assert.equal(scheduleReviewPlans(plans, today, 1).changed.length, 0);
});

test('already completed checkpoints consume slots even when scheduling for the first time', () => {
  const { plans } = scheduleReviewPlans(plan([{ ...review('done', today), done: true }, review('extra', today)]), today, 1);
  assert.equal(plans[0].reviews[0].dueDate, today);
  assert.equal(plans[0].reviews[1].dueDate, tomorrow);
});

test('home has 30 distinct daily messages and English changes with the date', () => {
  const messages = Array.from({length:30}, (_, index) => arabicMessageForDay(`2026-11-${String(index+1).padStart(2,'0')}`));
  assert.equal(new Set(messages.map(message => message.text)).size, 30);
  assert.equal(messages.filter(message => message.author && message.source).length, 5);
  assert.notEqual(englishMessageForDay(today), englishMessageForDay(tomorrow));
});
