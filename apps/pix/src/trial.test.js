import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, dom } from './test/helpers.js';

// Tela de resultado: main.content.result, barra "Teste grátis", um único h1 com o texto esperado.
function assertResult(doc, h1, tone) {
  assert.ok(doc.querySelector('.screen > main.content.result'));
  assert.equal(doc.querySelector('header.nav').textContent.trim(), 'Teste grátis');
  const h1s = doc.querySelectorAll('h1');
  assert.equal(h1s.length, 1);
  assert.equal(h1s[0].textContent.trim(), h1);
  assert.equal(h1s[0].closest('.result-hero').dataset.tone, tone);
}
const bar = (doc) => doc.querySelector('.screen > .bar');

// Link do app: GET /pix?teste=1&dcq&dcm. Devolve o cabeçalho Cookie para as próximas requisições.
const LINK = '/pix?teste=1&dcq=DCQ1&dcm=MAR1';
const trialCookie = (res) => res.headers.getSetCookie().find((c) => c.startsWith('pix_trial=')) ?? null;
async function openLink(ctx, path = LINK) {
  const res = await ctx.app.request(path);
  assert.equal(res.status, 302);
  const set = trialCookie(res);
  return set ? { Cookie: set.split(';')[0] } : {};
}
const getTrial = (ctx, headers, query = '') => ctx.app.request(`/pix/teste${query}`, { headers });
const post = (ctx, headers, fields) => ctx.app.request('/pix/teste', { method: 'POST', body: new URLSearchParams(fields), headers });
const ok = { email: 'Motorista@Email.com' };
const h1 = (doc) => doc.querySelector('h1').textContent.trim();

test('link com teste=1&dcq&dcm → 302 sem tokens e Set-Cookie pix_trial Max-Age=1800', async () => {
  const ctx = makeApp();
  const res = await ctx.app.request('/pix?plano=monthly&teste=1&dcq=DCQ1&dcm=MAR1');
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/pix?plano=monthly');
  assert.doesNotMatch(res.headers.get('location'), /dcq|dcm|teste/);
  const cookie = trialCookie(res);
  assert.match(cookie, /^pix_trial=[A-Za-z0-9_-]{22};/);
  assert.match(cookie, /; HttpOnly/);
  assert.match(cookie, /; Secure/);
  assert.match(cookie, /; SameSite=Lax/);
  assert.match(cookie, /; Path=\/pix(;|$)/);
  assert.match(cookie, /; Max-Age=1800(;|$)/);
  assert.doesNotMatch(cookie, /DCQ1|MAR1/);
});

test('aparelho já usado → 302 sem pix_trial', async () => {
  const ctx = makeApp();
  ctx.stores.trials.mark('DCQ1');
  const res = await ctx.app.request(LINK);
  assert.equal(res.status, 302);
  assert.equal(trialCookie(res), null);
});

test('link incompleto, vazio ou longo demais → 302 sem pix_trial', async () => {
  const ctx = makeApp();
  const long = 'x'.repeat(4097);
  for (const path of ['/pix?teste=1&dcq=A', '/pix?teste=1&dcm=B', '/pix?dcq=A&dcm=B', '/pix?teste=1&dcq=&dcm=B', `/pix?teste=1&dcq=${long}&dcm=B`, '/pix?teste=0&dcq=A&dcm=B']) {
    const res = await ctx.app.request(path);
    assert.equal(res.status, 302, path);
    assert.equal(trialCookie(res), null, path);
  }
  assert.ok(trialCookie(await ctx.app.request(`/pix?teste=1&dcq=${'x'.repeat(4096)}&dcm=B`)));
});

test('sem deviceCheck: 302 sem pix_trial, sem link do teste e /pix/teste "já usou"', async () => {
  const ctx = makeApp({ deviceCheck: null });
  const headers = await openLink(ctx);
  assert.deepEqual(headers, {});
  const choose = await dom(await ctx.app.request('/pix'));
  assert.equal(choose.querySelector('a[href="/pix/teste"]'), null);
  assert.equal(h1(await dom(await getTrial(ctx, {}))), 'Este aparelho já usou o teste grátis');
});

test('escolha com sessão mostra link /pix/teste; sem sessão não mostra', async () => {
  const ctx = makeApp();
  const headers = await openLink(ctx);
  const doc = await dom(await ctx.app.request('/pix', { headers }));
  const link = doc.querySelector('main a[href^="/pix/teste"]');
  assert.ok(link);
  assert.equal(link.getAttribute('href'), '/pix/teste');
  assert.match(link.textContent, /Testar 7 dias grátis/);
  assert.equal(link.closest('.bar'), null);
  const plain = await dom(await ctx.app.request('/pix'));
  assert.equal(plain.querySelector('a[href^="/pix/teste"]'), null);
  const forged = await dom(await ctx.app.request('/pix', { headers: { Cookie: 'pix_trial=forjado' } }));
  assert.equal(forged.querySelector('a[href^="/pix/teste"]'), null);
});

test('GET com sessão: pedido do e-mail, sem campos ocultos', async () => {
  const ctx = makeApp();
  const res = await getTrial(ctx, await openLink(ctx));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const doc = await dom(res);
  assert.equal(h1(doc), 'Testar 7 dias grátis');
  assert.match(doc.body.textContent, /Liberar 7 dias grátis/);
  assert.equal(doc.querySelectorAll('input[type=hidden]').length, 0);
});

test('GET com sessão: cabeçalho, barra com "Liberar 7 dias grátis" (form) e "Voltar aos planos"', async () => {
  const ctx = makeApp();
  const doc = await dom(await getTrial(ctx, await openLink(ctx)));
  assert.equal(doc.querySelector('header.nav').textContent.trim(), 'Teste grátis');
  const hero = doc.querySelector('main .hero');
  assert.ok(hero.querySelector('svg[aria-hidden=true]'));
  assert.equal(hero.querySelector('h1').textContent.trim(), 'Testar 7 dias grátis');
  assert.equal(hero.querySelector('.sub').textContent.trim(), 'Sem pagamento. Não renova sozinho.');
  const form = doc.getElementById('teste');
  assert.equal(form.getAttribute('action'), '/pix/teste');
  assert.ok(form.contains(doc.querySelector('input[name=email]')));
  const bar = doc.querySelector('.screen > .bar');
  const button = bar.querySelector('button[form=teste]');
  assert.equal(button.textContent.trim(), 'Liberar 7 dias grátis');
  assert.equal(button.closest('form'), null);
  assert.equal(button.form, form);
  const back = [...bar.querySelectorAll('a')].find((a) => a.textContent.trim() === 'Voltar aos planos');
  assert.ok(back);
  assert.equal(back.getAttribute('href'), '/pix');
});

test('envio do formulário completo do teste → código liberado', async () => {
  const ctx = makeApp();
  const headers = await openLink(ctx);
  const doc = await dom(await getTrial(ctx, headers));
  const form = doc.getElementById('teste');
  const fields = [...doc.querySelectorAll('input')].filter((el) => el.form === form && el.name);
  const body = new URLSearchParams(fields.map((el) => [el.name, el.value]));
  assert.deepEqual([...body.keys()], ['email']);
  body.set('email', 'motorista@email.com');
  const res = await ctx.app.request(form.getAttribute('action'), { method: 'POST', body, headers });
  assert.equal(h1(await dom(res)), '7 dias grátis liberados');
});

test('GET sem sessão, cookie forjado e cenário teste-usado: mesma tela "já usou"', async () => {
  const ctx = makeApp();
  const headers = await openLink(ctx);
  for (const [h, q] of [[{}, ''], [{ Cookie: 'pix_trial=forjado' }, ''], [headers, '?cenario=teste-usado']]) {
    const doc = await dom(await getTrial(ctx, h, q));
    assertResult(doc, 'Este aparelho já usou o teste grátis', 'info');
    const plans = bar(doc).querySelector('a.btn-primary');
    assert.equal(plans.textContent.trim(), 'Ver planos');
    assert.equal(plans.getAttribute('href'), '/pix');
  }
});

test('POST /pix/teste entrega código, marca o aparelho e apaga o cookie (Max-Age=0)', async (t) => {
  const ctx = makeApp();
  const mark = t.mock.method(ctx.deviceCheck, 'mark');
  const headers = await openLink(ctx);
  const res = await post(ctx, headers, ok);
  assert.equal(res.status, 200);
  assert.equal(mark.mock.callCount(), 1);
  assert.deepEqual(mark.mock.calls[0].arguments, ['DCQ1', 'MAR1']);
  assert.equal(ctx.stores.trials.used('DCQ1'), true);
  const cleared = trialCookie(res);
  assert.match(cleared, /^pix_trial=;/);
  assert.match(cleared, /; Max-Age=0/);
  assert.match(cleared, /; Path=\/pix(;|$)/);
  const doc = await dom(res);
  assertResult(doc, '7 dias grátis liberados', 'info');
  assert.ok(doc.querySelector('.result-hero svg.tint'), 'ícone de presente');
  assert.equal(doc.querySelector('.result-hero .sub').textContent.trim(), 'Depois dos 7 dias, nada é cobrado.');
  assert.equal(doc.getElementById('code-label').textContent.trim(), 'Seu código');
  assert.ok(doc.querySelector('main .card output.code'));
  assert.match(doc.querySelector('main .card .note').textContent, /enviado para m•••@email\.com$/);
  assert.equal(doc.querySelector('main dl'), null);
  const redeem = bar(doc).querySelector('a.btn-primary');
  assert.equal(redeem.textContent.trim(), 'Resgatar código');
  assert.match(redeem.getAttribute('href'), /^https:\/\/apps\.apple\.com\/redeem\?ctx=offercodes&id=6756681755&code=.+/);
  assert.equal(bar(doc).querySelectorAll('a').length, 1);
  assert.ok(![...doc.querySelectorAll('a')].some((a) => a.textContent.includes('não funcionou')));
  // A sessão acabou: o mesmo cookie já não vale.
  assert.equal(h1(await dom(await post(ctx, headers, ok))), 'Este aparelho já usou o teste grátis');
});

test('segundo link do mesmo dcq não cria sessão', async () => {
  const ctx = makeApp();
  await post(ctx, await openLink(ctx), ok);
  const res = await ctx.app.request(LINK);
  assert.equal(res.status, 302);
  assert.equal(trialCookie(res), null);
  // Outro aparelho continua podendo abrir o teste.
  assert.ok((await openLink(ctx, '/pix?teste=1&dcq=DCQ2&dcm=MAR2')).Cookie);
});

test('duas sessões do mesmo aparelho: depois da entrega pela primeira, a segunda → já usou', async (t) => {
  const ctx = makeApp();
  const mark = t.mock.method(ctx.deviceCheck, 'mark');
  const first = await openLink(ctx);
  const second = await openLink(ctx);
  assert.ok(first.Cookie && second.Cookie);
  assert.notEqual(first.Cookie, second.Cookie);
  assert.equal(h1(await dom(await post(ctx, first, ok))), '7 dias grátis liberados');
  assert.equal(h1(await dom(await getTrial(ctx, second))), 'Este aparelho já usou o teste grátis');
  assert.equal(h1(await dom(await post(ctx, second, { email: 'outro@email.com' }))), 'Este aparelho já usou o teste grátis');
  assert.equal(mark.mock.callCount(), 1);
});

test('sessão vencida (clock + 31 min) → Este aparelho já usou o teste grátis', async () => {
  const ctx = makeApp();
  const T0 = Date.UTC(2026, 10, 18, 15, 0, 0);
  ctx.clock.set(T0);
  const headers = await openLink(ctx);
  ctx.clock.set(T0 + 29 * 60_000);
  assert.equal(h1(await dom(await getTrial(ctx, headers))), 'Testar 7 dias grátis');
  ctx.clock.set(T0 + 31 * 60_000);
  assert.equal(h1(await dom(await getTrial(ctx, headers))), 'Este aparelho já usou o teste grátis');
  assert.equal(h1(await dom(await post(ctx, headers, ok))), 'Este aparelho já usou o teste grátis');
  assert.equal(ctx.stores.trials.used('DCQ1'), false);
  const choose = await dom(await ctx.app.request('/pix', { headers }));
  assert.equal(choose.querySelector('a[href^="/pix/teste"]'), null);
});

test('cookie forjado → já usou', async () => {
  const ctx = makeApp();
  await openLink(ctx);
  const doc = await dom(await post(ctx, { Cookie: 'pix_trial=forjado' }, ok));
  assert.equal(h1(doc), 'Este aparelho já usou o teste grátis');
  assert.equal(ctx.stores.trials.used('DCQ1'), false);
});

test('POST sem cookie → já usou', async () => {
  const ctx = makeApp();
  assert.equal(h1(await dom(await post(ctx, {}, { email: 'a@b.com' }))), 'Este aparelho já usou o teste grátis');
});

test('POST com e-mail inválido: mensagem ligada ao campo, sessão mantida, aparelho não marcado', async () => {
  const ctx = makeApp();
  const headers = await openLink(ctx);
  const res = await post(ctx, headers, { email: 'abc' });
  assert.equal(trialCookie(res), null);
  const doc = await dom(res);
  const input = doc.querySelector('#email');
  assert.match(input.getAttribute('aria-describedby'), /email-error/);
  assert.match(doc.querySelector('#email-error').textContent, /e-mail/i);
  assert.equal(ctx.stores.trials.used('DCQ1'), false);
  assert.equal(h1(await dom(await post(ctx, headers, ok))), '7 dias grátis liberados');
});

test('sem estoque do teste: aviso e aparelho não marcado', async () => {
  const ctx = makeApp();
  ctx.stores.codes.claim = () => null;
  const doc = await dom(await post(ctx, await openLink(ctx), ok));
  assertResult(doc, 'O Teste grátis está indisponível no Pix agora', 'warning');
  assert.equal(bar(doc).querySelector('a.btn-primary').textContent.trim(), 'Ver planos');
  assert.equal(ctx.stores.trials.used('DCQ1'), false);
});

test('e-mail que já recebeu o teste → tela de sem estoque, nunca Para este e-mail', async () => {
  const ctx = makeApp();
  ctx.stores.codes.claim('x1', 'teste', 'motorista@email.com');
  ctx.stores.codes.claim('x2', 'teste', 'motorista@email.com');
  const doc = await dom(await post(ctx, await openLink(ctx), ok));
  assertResult(doc, 'O Teste grátis está indisponível no Pix agora', 'warning');
  assert.equal(doc.querySelector('.screen').dataset.state, 'trial_out_of_stock');
  assert.doesNotMatch(doc.body.textContent, /Para este e-mail/);
  assert.equal(bar(doc).querySelector('a.btn-primary').getAttribute('href'), '/pix');
  assert.equal(ctx.stores.trials.used('DCQ1'), false);
});

test('nenhum HTML do teste contém dcq, dcm, dc_ler ou dc_marcar', async () => {
  const ctx = makeApp();
  const headers = await openLink(ctx);
  const pages = [
    await ctx.app.request('/pix', { headers }),
    await getTrial(ctx, headers),
    await post(ctx, headers, { email: 'abc' }),
    await getTrial(ctx, {}),
    await post(ctx, headers, ok),
  ];
  for (const res of pages) {
    const text = await res.text();
    for (const word of ['dcq', 'dcm', 'dc_ler', 'dc_marcar', 'DCQ1', 'MAR1']) assert.ok(!text.includes(word), word);
  }
});

test('sem lojas ou venda pausada → tela de pausa', async () => {
  for (const o of [{ stores: undefined }, { config: { salesEnabled: false } }]) {
    const ctx = makeApp(o);
    const headers = await openLink(ctx);
    assert.match(await (await getTrial(ctx, headers)).text(), /<h1>/);
    const doc = await dom(await post(ctx, headers, ok));
    assert.match(doc.querySelector('h1').textContent, /pausad|indispon|volt/i);
  }
});

test('POST /pix/teste com multipart malformado → nunca 500', async () => {
  const ctx = makeApp();
  const res = await ctx.app.request('/pix/teste', {
    method: 'POST',
    headers: { 'content-type': 'multipart/form-data; boundary=quebrado', ...(await openLink(ctx)) },
    body: 'isto não é multipart',
  });
  assert.notEqual(res.status, 500);
  assert.equal(res.status, 200);
});
