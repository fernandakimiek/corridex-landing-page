import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp } from './test/helpers.js';

test('GET /pix/health responde ok', async () => {
  const res = await makeApp().app.request('/pix/health');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test('a API não responde fora de /pix', async () => {
  const res = await makeApp().app.request('/health');
  assert.equal(res.status, 404);
});
