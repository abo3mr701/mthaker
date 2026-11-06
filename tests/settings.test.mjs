import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/views/settings.js', import.meta.url), 'utf8');
const settingsSource = source.replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];\s*/g, '');
let sequence = 0;

async function setup({ oldKey = '', failSave = false } = {}) {
  const stored = new Map([['geminiApiKey', oldKey]]);
  const button = {
    addEventListener(type, callback) { this.callback = callback; },
    remove() { this.removed = true; },
  };
  const container = {
    innerHTML: '',
    querySelector: id => id === '#clear-key-btn' && oldKey ? button : null,
  };
  globalThis.settingsFixture = {
    settingsDB: {
      get: async key => stored.get(key),
      set: async (key, value) => {
        if (failSave) throw new Error('offline');
        stored.set(key, value);
      },
    },
    getMaxDailyReviews: async () => 50,
    showConfirm: async () => true,
    showToast: () => {},
  };
  const shim = 'const {settingsDB,getMaxDailyReviews,showConfirm,showToast}=globalThis.settingsFixture;\n';
  const module = await import('data:text/javascript;base64,' + Buffer.from(shim + settingsSource).toString('base64') + '#' + sequence++);
  await module.renderSettings(container);
  return { html: container.innerHTML, stored, button };
}

test('settings links to the assistant without requesting a Gemini key', async () => {
  const { html } = await setup();
  assert.match(html, /href="#chat"/);
  assert.doesNotMatch(html, /api-key-input|clear-key-btn/);
});

test('saved keys can be removed without exposing the secret in the markup', async () => {
  const { html, stored, button } = await setup({ oldKey: 'private-old-key' });
  assert.doesNotMatch(html, /private-old-key/);
  await button.callback();
  assert.equal(stored.get('geminiApiKey'), '');
  assert.equal(button.removed, true);
});

test('failed key removal keeps the retry button available', async () => {
  const { stored, button } = await setup({ oldKey: 'private-old-key', failSave: true });
  await button.callback();
  assert.equal(stored.get('geminiApiKey'), 'private-old-key');
  assert.equal(button.disabled, false);
});
