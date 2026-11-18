import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, dom } from './test/helpers.js';

const T0 = Date.UTC(2026, 10, 17, 15, 0, 0);
const SUPPORT = 'https://wa.me/message/ON3GNOTDII42F1';

async function createOrder(ctx) {
  ctx.clock.set(T0);
  const res = await ctx.app.request('/pix/pedidos', {
    method: 'POST', body: new URLSearchParams({ plano: 'annual', email: 'motorista@email.com' }),
  });
  return res.headers.get('location');
}

test('ajuda: barra "Ajuda", título, dois itens em lista, barra com suporte e voltar, sem "mandar outro código"', async () => {
  const ctx = makeApp();
  const location = await createOrder(ctx);
  const res = await ctx.app.request(`${location}/ajuda`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const doc = await dom(res);
  assert.equal(doc.querySelector('header.nav').textContent.trim(), 'Ajuda');
  assert.ok(doc.querySelector('.screen > main.content:not(.result)'));
  assert.equal(doc.querySelectorAll('h1').length, 1);
  assert.equal(doc.querySelector('h1').textContent.trim(), 'O código não funcionou?');
  // Os dois cartões viram um grupo em lista (inset).
  const group = doc.querySelector('main .card.rows');
  const headings = [...group.querySelectorAll('h2')].map((h) => h.textContent.trim());
  assert.deepEqual(headings, ['Confira a conta Apple', 'Novo código pode levar 1 hora']);
  const bar = doc.querySelector('.screen > .bar');
  const support = bar.querySelector('a.btn-primary');
  assert.equal(support.textContent.trim(), 'Falar com o suporte');
  assert.equal(support.getAttribute('href'), SUPPORT);
  assert.equal(support.getAttribute('rel'), 'noopener');
  const back = [...bar.querySelectorAll('a')].find((a) => a.textContent.trim() === 'Voltar ao pedido');
  assert.equal(back.getAttribute('href'), location);
  assert.equal(doc.querySelectorAll('main a.btn').length, 0);
  assert.equal(doc.querySelectorAll('button, form').length, 0);
  assert.doesNotMatch(doc.body.textContent, /outro código|novo código por/i);
});

test('ajuda: funciona com pedido em qualquer status (pago)', async () => {
  const ctx = makeApp();
  const location = await createOrder(ctx);
  ctx.provider.markPaid(ctx.stores.orders.get(location.split('/').pop()).txids.at(-1));
  const res = await ctx.app.request(`${location}/ajuda`);
  assert.equal(res.status, 200);
});

test('ajuda: token desconhecido → 404', async () => {
  const ctx = makeApp();
  const res = await ctx.app.request('/pix/pedido/nao-existe/ajuda');
  assert.equal(res.status, 404);
  assert.match(await res.text(), /Pedido não encontrado/);
});

test('ajuda: erro do provedor → 503', async () => {
  const ctx = makeApp();
  const location = await createOrder(ctx);
  ctx.provider.getCharge = async () => { throw new Error('fora'); };
  assert.equal((await ctx.app.request(`${location}/ajuda`)).status, 503);
});

test('tela entregue tem o link "O código não funcionou?" para a ajuda', async () => {
  const ctx = makeApp();
  const location = await createOrder(ctx);
  ctx.provider.markPaid(ctx.stores.orders.get(location.split('/').pop()).txids.at(-1));
  const doc = await dom(await ctx.app.request(location));
  const a = [...doc.querySelectorAll('.screen > .bar a')].find((x) => x.textContent.trim() === 'O código não funcionou?');
  assert.equal(a.getAttribute('href'), `${location}/ajuda`);
});
