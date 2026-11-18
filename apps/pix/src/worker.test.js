import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dom } from './test/helpers.js';

// worker.js guarda o app no módulo; cada teste importa uma cópia nova (query string).
let n = 0;
const freshWorker = async () => (await import(`./worker.js?fresh=${n++}`)).default;

test('worker sem variáveis (produção): página pausada', async () => {
  const worker = await freshWorker();
  const res = await worker.fetch(new Request('http://x/pix'), {});
  assert.equal(res.status, 200);
  const doc = await dom(res);
  assert.match(doc.body.textContent, /A venda por Pix está pausada/);
});

test('worker sem PIX_DEV_TOOLS: /pix/dev → 404', async () => {
  const worker = await freshWorker();
  const res = await worker.fetch(new Request('http://x/pix/dev'), {});
  assert.equal(res.status, 404);
});
