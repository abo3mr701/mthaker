import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/services/gemini.js', import.meta.url), 'utf8');
let sequence = 0;
const freshService = () => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}#${sequence++}`);
const model = (id, methods = ['generateContent']) => ({ name: `models/${id}`, supportedGenerationMethods: methods });
const response = (json, status = 200) => ({ ok: status < 400, status, json: async () => json });
const answer = () => response({ candidates: [{ content: { parts: [{ text: 'مرحبا' }] } }] });

test('discovers models using GET and a header; trims key; does not spend generation tokens', async () => {
  const service = await freshService();
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return response({ models: [model('gemini-2.5-flash')] });
  };
  assert.deepEqual(await service.validateApiKey(' dummy '), { valid: true, model: 'gemini-2.5-flash' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers['x-goog-api-key'], 'dummy');
  assert.ok(!calls[0].url.includes('dummy'));
  assert.ok(!calls[0].url.includes('generateContent'));
});

test('pagination, stable preference and exclusion of image/audio/embedding models', async () => {
  const service = await freshService();
  globalThis.fetch = async url => new URL(url).searchParams.has('pageToken')
    ? response({ models: [model('gemini-2.5-flash')] })
    : response({ models: [model('gemini-9.0-flash-preview'), model('gemini-9.0-flash-image'),
        model('gemini-9.0-flash-preview-tts'), model('gemini-embedding-001', ['embedContent'])], nextPageToken: 'page 2' });
  assert.equal((await service.validateApiKey('dummy')).model, 'gemini-2.5-flash');
});

test('selects newer discovered Flash model without changing a hardcoded endpoint', async () => {
  const service = await freshService();
  globalThis.fetch = async () => response({ models: [model('gemini-2.5-flash'), model('gemini-9.0-flash')] });
  assert.equal((await service.validateApiKey('dummy')).model, 'gemini-9.0-flash');
});

test('does not select specialized preview models even when no text model is listed', async () => {
  const service = await freshService();
  globalThis.fetch = async () => response({ models: [model('gemini-9.0-flash-preview-tts'), model('gemini-9.0-flash-preview-native-audio')] });
  assert.equal((await service.validateApiKey('dummy')).kind, 'no_model');
});

for (const [status, kind, details] of [
  [400, 'invalid_key', [{ reason: 'API_KEY_INVALID' }]],
  [400, 'invalid_key', [{ reason: 'API_KEY_EXPIRED' }]],
  [401, 'invalid_key'], [403, 'permission'], [429, 'quota'],
  [404, 'not_found'], [503, 'service'], [400, 'request'],
]) {
  test(`classifies HTTP ${status} as ${kind}`, async () => {
    const service = await freshService();
    globalThis.fetch = async () => response({ error: { message: 'Google error', details } }, status);
    const result = await service.validateApiKey('dummy');
    assert.equal(result.valid, false);
    assert.equal(result.kind, kind);
    assert.ok(result.error.length > 0);
  });
}

test('distinguishes network failure from an invalid key', async () => {
  const service = await freshService();
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  assert.equal((await service.validateApiKey('dummy')).kind, 'network');
});

test('rejects empty keys before any request', async () => {
  const service = await freshService();
  globalThis.fetch = async () => { assert.fail('unexpected fetch'); };
  assert.equal((await service.validateApiKey('  ')).kind, 'missing_key');
});

test('handles no suitable models and malformed responses', async () => {
  const service = await freshService();
  globalThis.fetch = async () => response({ models: [model('gemini-embedding-001', ['embedContent'])] });
  assert.equal((await service.validateApiKey('dummy')).kind, 'no_model');
  globalThis.fetch = async () => ({ status: 502, json: async () => { throw new Error('not JSON'); } });
  assert.equal((await service.validateApiKey('dummy')).kind, 'response');
});

test('uses discovered model for chat and OCR and reuses model cache', async () => {
  const service = await freshService();
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return url.includes(':generateContent') ? answer() : response({ models: [model('gemini-9.0-flash')] });
  };
  await service.validateApiKey('dummy');
  assert.equal(await service.chat('dummy', []), 'مرحبا');
  assert.equal(await service.extractTextFromImage('dummy', 'BASE64'), 'مرحبا');
  assert.equal(calls.length, 3);
  assert.ok(calls[1].url.includes('models/gemini-9.0-flash:generateContent'));
  assert.equal(JSON.parse(calls[2].options.body).contents[0].parts[0].inlineData.data, 'BASE64');
});

test('refreshes a removed model once and generates with the replacement', async () => {
  const service = await freshService();
  let lists = 0, posts = 0;
  globalThis.fetch = async url => {
    if (!url.includes(':generateContent')) return response({ models: [model(++lists === 1 ? 'gemini-2.5-flash' : 'gemini-9.0-flash')] });
    posts++;
    return url.includes('2.5-flash') ? response({ error: { message: 'removed' } }, 404) : answer();
  };
  assert.equal(await service.chat('dummy', []), 'مرحبا');
  assert.equal(lists, 2);
  assert.equal(posts, 2);
});

test('does not retry generation quota failures', async () => {
  const service = await freshService();
  let posts = 0;
  globalThis.fetch = async url => {
    if (!url.includes(':generateContent')) return response({ models: [model('gemini-2.5-flash')] });
    posts++;
    return response({ error: { message: 'Quota exceeded' } }, 429);
  };
  await assert.rejects(service.chat('dummy', []), error => error.kind === 'quota');
  assert.equal(posts, 1);
});

test('a changed key gets its own discovery and raw errors redact the key', async () => {
  const service = await freshService();
  const keys = [];
  globalThis.fetch = async (url, options) => {
    keys.push(options.headers['x-goog-api-key']);
    return response({ models: [model('gemini-2.5-flash')] });
  };
  await service.validateApiKey('first-dummy');
  await service.validateApiKey('second-dummy');
  assert.deepEqual(keys, ['first-dummy', 'second-dummy']);
  globalThis.fetch = async () => response({ error: { message: 'bad second-dummy' } }, 400);
  assert.ok(!(await service.validateApiKey('second-dummy')).error.includes('second-dummy'));
});
