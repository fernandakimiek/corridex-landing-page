import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp } from './test/helpers.js';

// Primeira visita vinda do app: guarda o token da Apple no servidor e limpa a URL.
const T0 = Date.UTC(2026, 10, 18, 15, 0, 0);
const enc = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const appToken = (externalPurchaseId = 'compra-1') => enc({
  appAppleId: 6756681755,
  bundleId: 'br.com.bdk.CorridexApp',
  tokenCreationDate: T0 - 60_000,
  externalPurchaseId,
  tokenType: 'ACQUISITION',
});

function setup(overrides) {
  const ctx = makeApp(overrides);
  ctx.clock.set(T0);
  return ctx;
}

const get = (app, path, headers = {}) => app.request(path, { headers });
const cookieValue = (res) => /pix_tok=([^;]*)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? null;
const post = (app, path, fields, headers = {}) => app.request(path, { method: 'POST', body: new URLSearchParams(fields), headers });

test('GET /pix?plano=monthly&t=<válido> → 302 para /pix?plano=monthly e Set-Cookie pix_tok HttpOnly Secure SameSite=Lax Path=/pix Max-Age=604800', async () => {
  const { app, stores } = setup();
  const res = await get(app, `/pix?plano=monthly&t=${appToken()}`);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/pix?plano=monthly');
  assert.doesNotMatch(res.headers.get('location'), /t=/);
  const cookie = res.headers.get('set-cookie');
  assert.match(cookie, /^pix_tok=[A-Za-z0-9_-]{22};/);
  assert.match(cookie, /; HttpOnly/);
  assert.match(cookie, /; Secure/);
  assert.match(cookie, /; SameSite=Lax/);
  assert.match(cookie, /; Path=\/pix(;|$)/);
  assert.match(cookie, /; Max-Age=604800/);
  assert.equal(stores.tokens.byId(cookieValue(res)).externalPurchaseId, 'compra-1');
});

test('mesmo t duas vezes → mesmo valor de cookie', async () => {
  const { app } = setup();
  const t = appToken();
  const a = await get(app, `/pix?plano=monthly&t=${t}`);
  const b = await get(app, `/pix?plano=annual&t=${t}`);
  assert.ok(cookieValue(a));
  assert.equal(cookieValue(b), cookieValue(a));
});

test('t inválido → 302 sem Set-Cookie', async () => {
  const { app } = setup();
  const res = await get(app, '/pix?plano=quarterly&t=lixo');
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/pix?plano=quarterly');
  assert.equal(res.headers.get('set-cookie'), null);
});

test('plano=xyz&t=… → Location /pix?plano=annual', async () => {
  const { app } = setup();
  const res = await get(app, `/pix?plano=xyz&t=${appToken()}`);
  assert.equal(res.headers.get('location'), '/pix?plano=annual');
});

test('cenario só segue no redirect com devTools', async () => {
  const on = await get(setup().app, `/pix?plano=monthly&t=${appToken()}&cenario=sem-estoque`);
  assert.equal(on.headers.get('location'), '/pix?plano=monthly&cenario=sem-estoque');
  const off = await get(setup({ config: { devTools: false } }).app, `/pix?plano=monthly&t=${appToken()}&cenario=sem-estoque`);
  assert.equal(off.headers.get('location'), '/pix?plano=monthly');
});

test('venda pausada (sem lojas) também redireciona, sem cookie', async () => {
  const { app } = setup({ stores: null });
  const res = await get(app, `/pix?plano=monthly&t=${appToken()}`);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/pix?plano=monthly');
  assert.equal(res.headers.get('set-cookie'), null);
});

async function orderFrom(ctx, headers) {
  const res = await post(ctx.app, '/pix/pedidos', { plano: 'annual', email: 'motorista@email.com' }, headers);
  assert.equal(res.status, 303);
  return ctx.stores.orders.get(res.headers.get('location').split('/').pop());
}

test('POST /pix/pedidos com cookie pix_tok válido → pedido origin app', async () => {
  const ctx = setup();
  const id = cookieValue(await get(ctx.app, `/pix?plano=annual&t=${appToken()}`));
  const order = await orderFrom(ctx, { Cookie: `pix_tok=${id}` });
  assert.equal(order.origin, 'app');
  assert.equal(order.purchaseTokenId, id);
});

test('cookie forjado → origin site', async () => {
  const ctx = setup();
  const order = await orderFrom(ctx, { Cookie: 'pix_tok=forjado' });
  assert.equal(order.origin, 'site');
  assert.equal(order.purchaseTokenId, null);
});

test('GET /pix sem parâmetros do app → 200 (sem redirect)', async () => {
  const { app } = setup();
  for (const path of ['/pix', '/pix?plano=monthly', '/pix?plano=monthly&email=m%40email.com']) {
    const res = await get(app, path);
    assert.equal(res.status, 200, path);
    assert.equal(res.headers.get('set-cookie'), null, path);
  }
});

test('qualquer parâmetro do app (t, teste, dcq, dcm) → 302 para a URL limpa', async () => {
  const { app } = setup();
  for (const q of ['t=', 'teste=1', 'teste=0', 'dcq=a', 'dcm=b', 'teste=1&dcq=a&dcm=b']) {
    const res = await get(app, `/pix?plano=monthly&${q}`);
    assert.equal(res.status, 302, q);
    assert.equal(res.headers.get('location'), '/pix?plano=monthly', q);
  }
});

test('t e teste juntos → dois Set-Cookie num 302', async () => {
  const { app } = setup();
  const res = await get(app, `/pix?plano=monthly&t=${appToken()}&teste=1&dcq=DCQ&dcm=DCM`);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/pix?plano=monthly');
  const cookies = res.headers.getSetCookie();
  assert.equal(cookies.length, 2);
  assert.ok(cookies.some((c) => /^pix_tok=[A-Za-z0-9_-]{22};.*Max-Age=604800/.test(c)));
  assert.ok(cookies.some((c) => /^pix_trial=[A-Za-z0-9_-]{22};.*Max-Age=1800/.test(c)));
});
