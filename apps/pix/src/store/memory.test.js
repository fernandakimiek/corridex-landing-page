import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStores } from './memory.js';
import { seedCodes } from '../dev/seed.js';

const stores = () => createMemoryStores({ codes: seedCodes() });

test('seed: 4 planos x 2 ofertas x 3 códigos, valores únicos de 18 chars', () => {
  const codes = seedCodes();
  assert.equal(codes.length, 24);
  assert.equal(new Set(codes.map((c) => c.value)).size, 24);
  for (const c of codes) {
    assert.match(c.value, /^EXEMP[A-Z0-9]{13}$/);
    assert.equal(c.redeemBy, '2027-05-16');
  }
  for (const id of ['mensal', 'trimestral', 'anual', 'teste']) {
    assert.deepEqual([...new Set(codes.filter((c) => c.planId === id).map((c) => c.offerId))].sort(), [`${id}-a`, `${id}-b`]);
  }
  assert.notStrictEqual(seedCodes()[0], codes[0]);
});

test('reserva some do estoque e volta ao liberar', () => {
  const { codes } = stores();
  for (let i = 1; i <= 6; i++) assert.ok(codes.reserve('anual', `u${i}@x.com`, i));
  assert.equal(codes.reserve('anual', 'z@x.com', 7), null);
  assert.equal(codes.availability('anual', 'z@x.com'), 'out_of_stock');
  codes.release(1);
  assert.equal(codes.availability('anual', 'z@x.com'), 'ok');
});

test('e-mail que já recebeu todas as ofertas → unavailable_for_customer', () => {
  const { codes } = stores();
  const a = codes.reserve('anual', 'a@x.com', 'h1');
  codes.claim('h1', 'anual', 'a@x.com');
  const b = codes.claim('h2', 'anual', 'a@x.com');
  assert.notEqual(a.offerId, b.offerId);
  assert.equal(codes.availability('anual', 'a@x.com'), 'unavailable_for_customer');
  assert.equal(codes.claim('h3', 'anual', 'a@x.com'), null);
  assert.equal(codes.availability('anual', 'b@x.com'), 'ok');
});

test('claim é idempotente por holder e release depois de entregue é no-op', () => {
  const { codes } = stores();
  codes.reserve('mensal', 'a@x.com', 'h');
  const one = codes.claim('h', 'mensal', 'a@x.com');
  const two = codes.claim('h', 'mensal', 'a@x.com');
  assert.equal(one.value, two.value);
  codes.release('h');
  assert.equal(codes.claim('h', 'mensal', 'a@x.com').value, one.value);
  assert.doesNotThrow(() => codes.release('nenhum'));
});

test('claim sem reserva pega código livre', () => {
  const { codes } = stores();
  assert.ok(codes.claim('h', 'teste', 'a@x.com'));
});

test('pedidos', () => {
  const { orders } = stores();
  orders.insert({ token: 't1', email: 'a@x.com', planId: 'anual', status: 'paying' });
  assert.equal(orders.get('t1').email, 'a@x.com');
  assert.equal(orders.get('x'), null);
  assert.equal(orders.findActive('a@x.com', 'anual').token, 't1');
  assert.equal(orders.findActive('a@x.com', 'mensal'), null);
  assert.equal(orders.update('t1', { status: 'paid' }).status, 'paid');
  assert.equal(orders.findActive('a@x.com', 'anual'), null);
  assert.throws(() => orders.update('x', {}));
});

test('trials', () => {
  const { trials } = stores();
  assert.equal(trials.used('d'), false);
  trials.mark('d');
  assert.equal(trials.used('d'), true);
});

test('mesmo e-mail com duas reservas pega ofertas diferentes', () => {
  const { codes } = stores();
  const a = codes.reserve('anual', 'a@x.com', 'h1');
  const b = codes.reserve('anual', 'a@x.com', 'h2');
  assert.ok(a && b);
  assert.notEqual(a.offerId, b.offerId);
  assert.equal(codes.reserve('anual', 'a@x.com', 'h3'), null);
  assert.equal(codes.availability('anual', 'a@x.com'), 'unavailable_for_customer');
  assert.equal(codes.claim('h4', 'anual', 'a@x.com'), null);
  assert.equal(codes.availability('anual', 'b@x.com'), 'ok');
  codes.release('h2');
  assert.equal(codes.availability('anual', 'a@x.com'), 'ok');
  assert.equal(codes.reserve('anual', 'a@x.com', 'h3').offerId, b.offerId);
});

test('reserva de um e-mail + oferta já recebida → nenhuma oferta elegível', () => {
  const { codes } = stores();
  const got = codes.claim('h1', 'mensal', 'a@x.com');
  const held = codes.reserve('mensal', 'a@x.com', 'h2');
  assert.notEqual(held.offerId, got.offerId);
  assert.equal(codes.reserve('mensal', 'a@x.com', 'h3'), null);
  assert.equal(codes.availability('mensal', 'a@x.com'), 'unavailable_for_customer');
});
