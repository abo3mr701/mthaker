import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dataUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const prompts = await readFile(new URL('../js/services/studyAI.js', import.meta.url), 'utf8');
const transport = dataUrl('export function generatePuterContent(messages) { return globalThis.captureStudyRequest(messages); }');
const studyAI = await import(dataUrl(prompts.replace('./puterAI.js', transport)));

test('chat and image extraction use the same Puter message format', async () => {
  const calls = [];
  globalThis.captureStudyRequest = messages => { calls.push(messages); return 'مرحبا'; };
  const question = { role: 'user', text: 'اشرح لي الدرس' };
  assert.equal(await studyAI.chat([question], 'محتوى الدرس'), 'مرحبا');
  assert.equal(calls[0][0].role, 'system');
  assert.match(calls[0][0].content[0].text, /محتوى الدرس/);
  assert.deepEqual(calls[0][1], { role: 'user', content: [{ type: 'text', text: question.text }] });
  assert.equal(await studyAI.extractTextFromImage('BASE64', 'image/png'), 'مرحبا');
  assert.deepEqual(calls[1][0].content[0], {
    type: 'image_url', image_url: { url: 'data:image/png;base64,BASE64' },
  });
});

test('AI never uses the preceding Mthaker account’s Puter session', async () => {
  const source = await readFile(new URL('../js/services/puterAI.js', import.meta.url), 'utf8');
  const auth = { currentUser: { uid: 'first' } };
  globalThis.aiTestAuth = auth;
  const firebase = dataUrl('export const auth = globalThis.aiTestAuth;');
  const puterAI = await import(dataUrl(source.replace('./firebase.js', firebase)));
  const links = new Map();
  const requests = [];
  let puterId = 'puter-one';
  globalThis.localStorage = {
    getItem: key => links.get(key),
    setItem: (key, value) => links.set(key, value),
  };
  globalThis.puter = {
    auth: { isSignedIn: () => true, getUser: async () => ({ uuid: puterId }), signIn: async () => {} },
    ai: { chat: async () => {
      requests.push(puterId);
      return { message: { content: 'مرحبا' } };
    } },
  };
  await puterAI.connectPuter();
  assert.equal(await puterAI.generatePuterContent([]), 'مرحبا');
  auth.currentUser = { uid: 'second' };
  await assert.rejects(puterAI.generatePuterContent([]), /اربط حساب Puter/);
  puterId = 'puter-two';
  await puterAI.connectPuter();
  assert.equal(await puterAI.generatePuterContent([]), 'مرحبا');
  auth.currentUser = { uid: 'first' };
  await assert.rejects(puterAI.generatePuterContent([]), /اربط حساب Puter/);
  assert.deepEqual(requests, ['puter-one', 'puter-two']);
});

test('flashcard generation keeps the distinct types, answers and explanations', async () => {
  globalThis.captureStudyRequest = () => JSON.stringify([
    { type: 'mcq', front: 'اختر', back: 'التفسير', options: ['أ', 'ب', 'ج', 'د'], answer: 'ب' },
    { type: 'tf', front: 'العبارة', back: 'التصحيح', answer: 'خطأ' },
    { type: 'essay', front: 'اشرح', back: 'الإجابة النموذجية' },
    { type: 'mcq', front: 'خيار مفقود', back: 'التفسير', options: ['أ', 'ب', 'ج', 'د'], answer: 'هـ' },
  ]);
  const cards = await studyAI.generateFlashcards('هذا نص درس تجريبي طويل يصلح لبطاقات المراجعة.');
  assert.deepEqual(cards.map(card => card.type), ['mcq', 'tf', 'essay']);
  assert.deepEqual(cards[0].options, ['أ', 'ب', 'ج', 'د']);
  assert.equal(cards[0].answer, 'ب');
  assert.equal(cards[1].answer, 'خطأ');
  assert.equal(cards[2].back, 'الإجابة النموذجية');
});
