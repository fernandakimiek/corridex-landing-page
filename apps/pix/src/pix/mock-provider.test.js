import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockPixProvider } from './mock-provider.js';

test('provedor recusa sem devTools', () =>
  assert.throws(() => createMockPixProvider({ devTools: false, now: Date.now }), /PIX_DEV_TOOLS/));

test('cobrança ATIVA até markPaid', async () => {
  const p = createMockPixProvider({ devTools: true, now: () => 1000 });
  const { copiaECola } = await p.createCharge({ txid: 'TX1', amountCents: 9990, expiresInSeconds: 1800 });
  assert.match(copiaECola, /^000201/);
  assert.ok(copiaECola.includes('teste@corridex.app'));
  assert.ok(copiaECola.includes('TESTE - NAO PAGUE'));
  assert.deepEqual(await p.getCharge('TX1'), { status: 'ATIVA', amountCents: 9990 });
  p.markPaid('TX1');
  assert.deepEqual(await p.getCharge('TX1'), { status: 'CONCLUIDA', amountCents: 9990 });
});

test('expiresAt = now + ttl', async () => {
  const p = createMockPixProvider({ devTools: true, now: () => 1000 });
  const c = await p.createCharge({ txid: 'TX2', amountCents: 990, expiresInSeconds: 1800 });
  assert.equal(c.expiresAt, 1000 + 1800_000);
});

test('pagamento após expiresAt continua aceito', async () => {
  let t = 0;
  const p = createMockPixProvider({ devTools: true, now: () => t });
  await p.createCharge({ txid: 'TX3', amountCents: 990, expiresInSeconds: 1 });
  t = 10_000_000;
  assert.equal((await p.getCharge('TX3')).status, 'ATIVA');
  p.markPaid('TX3');
  assert.equal((await p.getCharge('TX3')).status, 'CONCLUIDA');
});

test('txid desconhecido', async () => {
  const p = createMockPixProvider({ devTools: true, now: Date.now });
  assert.equal(await p.getCharge('nope'), null);
  assert.doesNotThrow(() => p.markPaid('nope'));
});
