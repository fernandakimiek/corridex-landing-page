import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderService, normalizeEmail } from './orders.js';
import { PLANS } from './plans.js';
import { createMockPixProvider } from './pix/mock-provider.js';
import { createMemoryStores } from './store/memory.js';
import { seedCodes } from './dev/seed.js';

const T0 = Date.UTC(2026, 10, 17, 12, 0, 0);
const TTL_MS = 1800 * 1000;

function setup({ provider: wrap } = {}) {
  let t = T0;
  const clock = { now: () => t, set: (ms) => { t = ms; }, advance: (ms) => { t += ms; } };
  const base = createMockPixProvider({ devTools: true, now: clock.now });
  let chargeCalls = 0;
  const counted = {
    ...base,
    createCharge: (args) => { chargeCalls++; return base.createCharge(args); },
  };
  const provider = wrap ? wrap(counted) : counted;
  const stores = createMemoryStores({ codes: seedCodes() });
  const service = createOrderService({ provider, stores, plans: PLANS, now: clock.now });
  return { service, provider: base, stores, clock, chargeCalls: () => chargeCalls };
}

// Quantos códigos livres o plano ainda tem (reserva com e-mails novos e devolve).
function freeCount(stores, planId) {
  let n = 0;
  while (stores.codes.reserve(planId, `probe${n}@probe.com`, `probe-${n}`)) n++;
  for (let i = 0; i < n; i++) stores.codes.release(`probe-${i}`);
  return n;
}

async function exhaust(service, planId) {
  for (let i = 0; ; i++) {
    const r = await service.create({ planId, email: `outro${i}@x.com` });
    if (!r.ok) return r;
  }
}

test('normalizeEmail', () => {
  assert.equal(normalizeEmail(' Motorista@Email.com '), 'motorista@email.com');
  assert.equal(normalizeEmail('sem-arroba'), null);
  assert.equal(normalizeEmail('a b@x.com'), null);
  assert.equal(normalizeEmail(''), null);
  assert.equal(normalizeEmail(undefined), null);
});

test('cria pedido paying com reserva e cobrança', async () => {
  const { service, stores } = setup();
  const r = await service.create({ planId: 'annual', email: 'a@x.com' });
  assert.equal(r.ok, true);
  const o = r.order;
  assert.equal(o.status, 'paying');
  assert.equal(o.amountCents, 9990);
  assert.equal(o.planId, 'annual');
  assert.equal(o.txids.length, 1);
  assert.match(o.txids[0], /^[A-Za-z0-9]{25}$/);
  assert.match(o.token, /^[A-Za-z0-9_-]{22}$/);
  assert.ok(o.copiaECola.startsWith('000201'));
  assert.equal(o.expiresAt, T0 + TTL_MS);
  assert.equal(o.code, null);
  assert.equal(o.paidAt, null);
  assert.equal(o.createdAt, T0);
  assert.equal(freeCount(stores, 'annual'), 5);
  assert.equal((await service.get(o.token)).token, o.token);
});

test('e-mail inválido / plano inválido', async () => {
  const { service, chargeCalls } = setup();
  assert.deepEqual(await service.create({ planId: 'annual', email: 'nada' }), { ok: false, reason: 'invalid_email' });
  assert.deepEqual(await service.create({ planId: 'vitalicio', email: 'a@x.com' }), { ok: false, reason: 'invalid_plan' });
  assert.deepEqual(await service.create({ planId: 'teste', email: 'a@x.com' }), { ok: false, reason: 'invalid_plan' });
  assert.deepEqual(await service.create({ planId: 'toString', email: 'a@x.com' }), { ok: false, reason: 'invalid_plan' });
  assert.equal(chargeCalls(), 0);
});

test('sem estoque não cria cobrança', async () => {
  const { service, chargeCalls } = setup();
  const r = await exhaust(service, 'annual');
  assert.deepEqual(r, { ok: false, reason: 'plan_out_of_stock' });
  assert.equal(chargeCalls(), 6);
});

test('normaliza e-mail', async () => {
  const { service } = setup();
  const r = await service.create({ planId: 'annual', email: ' Motorista@Email.com ' });
  assert.equal(r.order.email, 'motorista@email.com');
});

test('duplo envio do mesmo formulário (mesmo nonce) reaproveita pedido ativo', async () => {
  const { service, stores, chargeCalls } = setup();
  const a = await service.create({ planId: 'annual', email: 'a@x.com', nonce: 'n1' });
  assert.equal(a.order.nonce, 'n1');
  const b = await service.create({ planId: 'annual', email: 'A@x.com ', nonce: 'n1' });
  assert.equal(b.ok, true);
  assert.equal(b.order.token, a.order.token);
  assert.equal(chargeCalls(), 1);
  assert.equal(freeCount(stores, 'annual'), 5);
});

test('outro nonce (ou nenhum) nunca devolve o pedido de outra pessoa', async () => {
  const { service } = setup();
  const victim = await service.create({ planId: 'annual', email: 'a@x.com', nonce: 'vitima' });
  for (const nonce of ['outro', '', undefined]) {
    const r = await service.create({ planId: 'annual', email: 'a@x.com', nonce });
    if (r.ok) assert.notEqual(r.order.token, victim.order.token, String(nonce));
    else assert.equal(r.reason, 'unavailable_for_customer');
  }
  // A primeira tentativa nova pega a outra oferta; as seguintes ficam indisponíveis para o e-mail.
  const again = await service.create({ planId: 'annual', email: 'a@x.com', nonce: 'mais-um' });
  assert.deepEqual(again, { ok: false, reason: 'unavailable_for_customer' });
});

test('pago → delivered com código', async () => {
  const { service, provider, clock } = setup();
  const { order } = await service.create({ planId: 'annual', email: 'a@x.com' });
  clock.advance(60_000);
  provider.markPaid(order.txids[0]);
  const o = await service.get(order.token);
  assert.equal(o.status, 'delivered');
  assert.ok(o.code.value.startsWith('EXEMP'));
  assert.equal(o.code.planId, 'annual');
  assert.equal(o.paidAt, T0 + 60_000);
});

test('get repetido não entrega outro código', async () => {
  const { service, provider, stores } = setup();
  const { order } = await service.create({ planId: 'annual', email: 'a@x.com' });
  provider.markPaid(order.txids[0]);
  const values = [];
  for (let i = 0; i < 3; i++) values.push((await service.get(order.token)).code.value);
  assert.equal(new Set(values).size, 1);
  assert.equal(freeCount(stores, 'annual'), 5);
});

test('vence e libera reserva', async () => {
  const { service, stores, clock } = setup();
  const { order } = await service.create({ planId: 'annual', email: 'a@x.com' });
  clock.advance(TTL_MS - 1);
  assert.equal((await service.get(order.token)).status, 'paying');
  clock.advance(1);
  const o = await service.get(order.token);
  assert.equal(o.status, 'expired');
  assert.equal(o.code, null);
  assert.equal(freeCount(stores, 'annual'), 6);
});

test('pago depois de vencer → delivered', async () => {
  const { service, provider, clock } = setup();
  const { order } = await service.create({ planId: 'annual', email: 'a@x.com' });
  clock.advance(TTL_MS);
  assert.equal((await service.get(order.token)).status, 'expired');
  provider.markPaid(order.txids[0]);
  const o = await service.get(order.token);
  assert.equal(o.status, 'delivered');
  assert.ok(o.code.value.startsWith('EXEMP'));
});

test('pago depois de vencer sem estoque → pending', async () => {
  const { service, provider, clock } = setup();
  const { order } = await service.create({ planId: 'annual', email: 'a@x.com' });
  clock.advance(TTL_MS);
  assert.equal((await service.get(order.token)).status, 'expired');
  assert.equal((await exhaust(service, 'annual')).reason, 'plan_out_of_stock');
  provider.markPaid(order.txids[0]);
  const o = await service.get(order.token);
  assert.equal(o.status, 'pending');
  assert.equal(o.code, null);
  assert.equal(o.paidAt, T0 + TTL_MS);
  assert.equal((await service.get(order.token)).status, 'pending');
});

test('pago com valor diferente não entrega', async () => {
  const { service, stores } = setup({
    provider: (p) => ({ ...p, getCharge: async (txid) => ({ ...(await p.getCharge(txid)), status: 'CONCLUIDA', amountCents: 1 }) }),
  });
  const { order } = await service.create({ planId: 'annual', email: 'a@x.com' });
  const o = await service.get(order.token);
  assert.equal(o.status, 'paying');
  assert.equal(o.code, null);
  assert.equal(freeCount(stores, 'annual'), 5);
});

test('renew gera nova cobrança no mesmo token', async () => {
  const { service, stores, clock, provider } = setup();
  const { order } = await service.create({ planId: 'annual', email: 'a@x.com' });
  assert.deepEqual(await service.renew(order.token), { ok: false, reason: 'not_expired' });
  clock.advance(TTL_MS);
  await service.get(order.token);
  clock.advance(5000);
  const r = await service.renew(order.token);
  assert.equal(r.ok, true);
  assert.equal(r.order.token, order.token);
  assert.equal(r.order.status, 'paying');
  assert.equal(r.order.txids.length, 2);
  assert.equal(r.order.txids[0], order.txids[0]);
  assert.notEqual(r.order.txids[1], order.txids[0]);
  assert.notEqual(r.order.copiaECola, order.copiaECola);
  assert.equal(r.order.expiresAt, T0 + TTL_MS + 5000 + TTL_MS);
  assert.equal(freeCount(stores, 'annual'), 5);
  // pagar a primeira cobrança (antiga) ainda entrega
  provider.markPaid(order.txids[0]);
  assert.equal((await service.get(order.token)).status, 'delivered');
  assert.deepEqual(await service.renew(order.token), { ok: false, reason: 'not_expired' });
});

test('renew: token desconhecido e sem estoque', async () => {
  const { service, clock } = setup();
  assert.deepEqual(await service.renew('nada'), { ok: false, reason: 'not_found' });
  assert.equal(await service.get('nada'), null);
  const { order } = await service.create({ planId: 'annual', email: 'a@x.com' });
  clock.advance(TTL_MS);
  await service.get(order.token);
  await exhaust(service, 'annual');
  assert.deepEqual(await service.renew(order.token), { ok: false, reason: 'plan_out_of_stock' });
  assert.equal((await service.get(order.token)).status, 'expired');
});

test('renew sincroniza antes: pago depois de vencer não gera nova cobrança', async () => {
  const { service, provider, clock, chargeCalls } = setup();
  const { order } = await service.create({ planId: 'annual', email: 'a@x.com' });
  clock.advance(TTL_MS);
  await service.get(order.token);
  provider.markPaid(order.txids[0]);
  assert.deepEqual(await service.renew(order.token), { ok: false, reason: 'not_expired' });
  assert.equal(chargeCalls(), 1);
  assert.equal((await service.get(order.token)).status, 'delivered');
});

test('pedido ativo vencido não é reaproveitado', async () => {
  const { service, clock, stores } = setup();
  const a = await service.create({ planId: 'annual', email: 'a@x.com' });
  clock.advance(TTL_MS);
  const b = await service.create({ planId: 'annual', email: 'a@x.com' });
  assert.equal(b.ok, true);
  assert.notEqual(b.order.token, a.order.token);
  assert.equal((await service.get(a.order.token)).status, 'expired');
  assert.equal(freeCount(stores, 'annual'), 5);
});

test('e-mail que já recebeu todas as ofertas → unavailable_for_customer sem cobrança', async () => {
  const { service, provider, chargeCalls } = setup();
  for (let i = 0; i < 2; i++) {
    const { order } = await service.create({ planId: 'monthly', email: 'a@x.com' });
    provider.markPaid(order.txids[0]);
    assert.equal((await service.get(order.token)).status, 'delivered');
  }
  assert.deepEqual(await service.create({ planId: 'monthly', email: 'a@x.com' }), { ok: false, reason: 'unavailable_for_customer' });
  assert.equal(chargeCalls(), 2);
});

test('provedor falha → pix_unavailable e libera reserva', async () => {
  const { service, stores } = setup({
    provider: (p) => ({ ...p, createCharge: async () => { throw new Error('banco fora'); } }),
  });
  const r = await service.create({ planId: 'annual', email: 'a@x.com' });
  assert.deepEqual(r, { ok: false, reason: 'pix_unavailable' });
  assert.equal(freeCount(stores, 'annual'), 6);
  assert.equal(stores.orders.findActive('a@x.com', 'annual'), null);
});

test('pedido com purchaseTokenId tem origin app', async () => {
  const { service, stores } = setup();
  const r = await service.create({ planId: 'annual', email: 'a@x.com', purchaseTokenId: 'tok-1' });
  assert.equal(r.ok, true);
  assert.equal(stores.orders.get(r.order.token).purchaseTokenId, 'tok-1');
  assert.equal(stores.orders.get(r.order.token).origin, 'app');
});

test('sem token tem origin site e purchaseTokenId null', async () => {
  const { service, stores } = setup();
  const r = await service.create({ planId: 'annual', email: 'a@x.com' });
  assert.equal(stores.orders.get(r.order.token).purchaseTokenId, null);
  assert.equal(stores.orders.get(r.order.token).origin, 'site');
});
