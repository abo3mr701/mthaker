import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('a populated subject list renders and escapes the subject name', async () => {
  const fixture = [{ id: 'math', name: 'رياضيات <متقدمة>', createdAt: '2026-11-05', cardCount: 2 }];
  const db = 'data:text/javascript,' + encodeURIComponent(
    `export const subjects = { getAll: async () => ${JSON.stringify(fixture)} };
     export const flashcards = {}, reviewPlans = {};`,
  );
  const source = (await readFile(new URL('../js/views/subjects.js', import.meta.url), 'utf8'))
    .replace("'../db.js'", JSON.stringify(db))
    .replace("'../utils/helpers.js'", JSON.stringify(new URL('../js/utils/helpers.js', import.meta.url).href));
  const { renderSubjects } = await import('data:text/javascript,' + encodeURIComponent(source));
  const container = {
    innerHTML: '',
    querySelector: () => ({ addEventListener() {} }),
    querySelectorAll: () => [],
  };
  const previousDocument = globalThis.document;
  globalThis.document = { addEventListener() {} };
  try {
    await renderSubjects(container);
    assert.match(container.innerHTML, /data-id="math"/);
    assert.match(container.innerHTML, /رياضيات &lt;متقدمة&gt;/);
  } finally {
    globalThis.document = previousDocument;
  }
});
