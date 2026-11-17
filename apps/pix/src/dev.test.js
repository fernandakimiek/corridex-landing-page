import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, dom } from './test/helpers.js';

const post = (app, path, fields = {}) => app.request(path, { method: 'POST', body: new URLSearchParams(fields) });
const SCENARIOS = ['sem-estoque', 'indisponivel-email', 'pausado', 'fora-do-ar', 'vencido', 'pendente', 'teste-usado'];

async function newOrder(ctx) {
  const res = await post(ctx.app, '/pix/pedidos', { plano: 'anual', email: 'motorista@email.com' });
  return res.headers.get('location');
}

test('devTools: pagar → 303 para o pedido, que fica delivered', async () => {
  const ctx = makeApp();
  const location = await newOrder(ctx);
  const res = await post(ctx.app, `/pix/dev/pedido/${location.split('/').pop()}/pagar`);
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), location);
  const page = await ctx.app.request(location);
  assert.match(await page.text(), /data-state="delivered"/);
});

test('devTools: pagar com token desconhecido → 404', async () => {
  const res = await post(makeApp().app, '/pix/dev/pedido/nao-existe/pagar');
  assert.equal(res.status, 404);
});

test('devTools: pagar sem markPaid no provedor → 404', async () => {
  const ctx = makeApp();
  const location = await newOrder(ctx);
  const provider = { ...ctx.provider, markPaid: undefined };
  const other = makeApp({ provider, stores: ctx.stores });
  const res = await post(other.app, `/pix/dev/pedido/${location.split('/').pop()}/pagar`);
  assert.equal(res.status, 404);
});

test('devTools: /pix/dev lista os 7 cenários e links principais', async () => {
  const res = await makeApp().app.request('/pix/dev');
  assert.equal(res.status, 200);
  const html = await res.text();
  for (const s of SCENARIOS) assert.ok(html.includes(s), s);
  const doc = await dom(new Response(html));
  const hrefs = [...doc.querySelectorAll('a')].map((a) => a.getAttribute('href'));
  assert.ok(hrefs.includes('/pix'));
  assert.ok(hrefs.includes('/pix?plano=mensal'));
  assert.ok(hrefs.includes('/pix?cenario=pausado'));
  assert.ok(hrefs.includes('/pix/teste?teste=1&dc_ler=dev-ler&dc_marcar=dev-marcar'));
  assert.ok(hrefs.includes('/pix/teste?teste=1&dc_ler=dev-ler&dc_marcar=dev-marcar&cenario=teste-usado'));
  assert.ok(doc.querySelector('form[method=post][action="/pix/dev/pedido-exemplo"]'));
});

test('devTools: pedido-exemplo cria pedido anual e redireciona', async () => {
  const ctx = makeApp();
  const res = await post(ctx.app, '/pix/dev/pedido-exemplo');
  assert.equal(res.status, 303);
  const loc = res.headers.get('location');
  assert.match(loc, /^\/pix\/pedido\//);
  const order = ctx.stores.orders.get(loc.split('/').pop());
  assert.equal(order.planId, 'anual');
  assert.equal(order.email, 'motorista@email.com');
});

test('devTools: barra em paying com form Simular pagamento; em escolha só link', async () => {
  const ctx = makeApp();
  const location = await newOrder(ctx);
  const token = location.split('/').pop();
  const doc = await dom(await ctx.app.request(location));
  const bar = doc.querySelector('.devbar');
  assert.ok(bar);
  assert.match(bar.textContent, /Simulação/);
  assert.ok(bar.querySelector('a[href="/pix/dev"]'));
  assert.ok(bar.querySelector(`form[method=post][action="/pix/dev/pedido/${token}/pagar"] button`));
  assert.ok(bar.querySelector(`a[href="${location}?cenario=vencido"]`));
  const choose = await dom(await ctx.app.request('/pix'));
  assert.ok(choose.querySelector('.devbar a[href="/pix/dev"]'));
  assert.equal(choose.querySelector('.devbar form'), null);
});

test('sem devTools: /pix/dev, pagar e pedido-exemplo → 404 e nenhuma barra', async () => {
  const ctx = makeApp({ config: { devTools: false } });
  assert.equal((await ctx.app.request('/pix/dev')).status, 404);
  assert.equal((await post(ctx.app, '/pix/dev/pedido/x/pagar')).status, 404);
  assert.equal((await post(ctx.app, '/pix/dev/pedido-exemplo')).status, 404);
  const html = await (await ctx.app.request('/pix')).text();
  assert.ok(!html.includes('class="devbar"'));
  assert.ok(!html.includes('Simulação'));
});
