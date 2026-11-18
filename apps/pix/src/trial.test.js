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

const Q = '?teste=1&dc_ler=LER1&dc_marcar=MAR1';
const post = (ctx, fields) => ctx.app.request('/pix/teste', { method: 'POST', body: new URLSearchParams(fields) });
const ok = { teste: '1', dc_ler: 'LER1', dc_marcar: 'MAR1', email: 'Motorista@Email.com' };

test('GET com tokens: pedido do e-mail com campos ocultos', async () => {
  const ctx = makeApp();
  const res = await ctx.app.request(`/pix/teste${Q}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const doc = await dom(res);
  assert.equal(doc.querySelector('h1').textContent.trim(), 'Testar 7 dias grátis');
  assert.match(doc.body.textContent, /Liberar 7 dias grátis/);
  assert.equal(doc.querySelector('input[name=dc_ler]').value, 'LER1');
  assert.equal(doc.querySelector('input[name=dc_marcar]').value, 'MAR1');
  assert.equal(doc.querySelector('input[name=teste]').value, '1');
});

test('GET com tokens: cabeçalho, barra com "Liberar 7 dias grátis" (form) e "Voltar aos planos"', async () => {
  const ctx = makeApp();
  const doc = await dom(await ctx.app.request(`/pix/teste${Q}`));
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
  assert.equal(back.getAttribute('href'), '/pix?teste=1&dc_ler=LER1&dc_marcar=MAR1');
});

test('envio do formulário completo do teste → código liberado', async () => {
  const ctx = makeApp();
  const doc = await dom(await ctx.app.request(`/pix/teste${Q}&email=a%40b.com`));
  const form = doc.getElementById('teste');
  const fields = [...doc.querySelectorAll('input')].filter((el) => el.form === form && el.name);
  const body = new URLSearchParams(fields.map((el) => [el.name, el.value]));
  body.set('email', 'motorista@email.com');
  const res = await ctx.app.request(form.getAttribute('action'), { method: 'POST', body });
  assert.equal((await dom(res)).querySelector('h1').textContent.trim(), '7 dias grátis liberados');
});

test('GET sem token, token parcial, cenário e aparelho usado: mesma tela "já usou"', async () => {
  const ctx = makeApp();
  ctx.stores.trials.mark('USADO');
  for (const url of ['/pix/teste', '/pix/teste?teste=1&dc_ler=LER1', `/pix/teste${Q}&cenario=teste-usado`, '/pix/teste?teste=1&dc_ler=USADO&dc_marcar=X']) {
    const doc = await dom(await ctx.app.request(url));
    assertResult(doc, 'Este aparelho já usou o teste grátis', 'info');
    const plans = bar(doc).querySelector('a.btn-primary');
    assert.equal(plans.textContent.trim(), 'Ver planos', url);
    assert.equal(plans.getAttribute('href'), '/pix');
  }
});

test('POST entrega código e link de resgate; segundo POST → já usou', async () => {
  const ctx = makeApp();
  const res = await post(ctx, ok);
  assert.equal(res.status, 200);
  const doc = await dom(res);
  assertResult(doc, '7 dias grátis liberados', 'info');
  assert.ok(doc.querySelector('.result-hero svg.tint'), 'ícone de presente');
  assert.equal(doc.querySelector('.result-hero .sub').textContent.trim(), 'Depois dos 7 dias, nada é cobrado.');
  assert.equal(doc.getElementById('code-label').textContent.trim(), 'Seu código');
  assert.ok(doc.querySelector('main .card output.code'));
  assert.match(doc.querySelector('main .card .note').textContent, /enviado para m•••@email\.com$/);
  assert.equal(doc.querySelector('main dl'), null);
  const redeem = bar(doc).querySelector('a.btn-primary');
  assert.equal(redeem.textContent.trim(), 'Resgatar na App Store');
  assert.match(redeem.getAttribute('href'), /^https:\/\/apps\.apple\.com\/redeem\?ctx=offercodes&id=6756681755&code=.+/);
  assert.equal(bar(doc).querySelectorAll('a').length, 1);
  assert.ok(![...doc.querySelectorAll('a')].some((a) => a.textContent.includes('não funcionou')));
  const again = await dom(await post(ctx, ok));
  assert.equal(again.querySelector('h1').textContent.trim(), 'Este aparelho já usou o teste grátis');
});

test('POST com e-mail inválido: mensagem ligada ao campo, tokens mantidos, aparelho não marcado', async () => {
  const ctx = makeApp();
  const doc = await dom(await post(ctx, { ...ok, email: 'abc' }));
  const input = doc.querySelector('#email');
  assert.match(input.getAttribute('aria-describedby'), /email-error/);
  assert.match(doc.querySelector('#email-error').textContent, /e-mail/i);
  assert.equal(doc.querySelector('input[name=dc_ler]').value, 'LER1');
  assert.equal(ctx.stores.trials.used('LER1'), false);
});

test('POST sem tokens → já usou', async () => {
  const ctx = makeApp();
  const doc = await dom(await post(ctx, { email: 'a@b.com' }));
  assert.equal(doc.querySelector('h1').textContent.trim(), 'Este aparelho já usou o teste grátis');
});

test('sem estoque do teste: aviso e aparelho não marcado', async () => {
  const ctx = makeApp();
  ctx.stores.codes.claim = () => null;
  const doc = await dom(await post(ctx, ok));
  assertResult(doc, 'O Teste grátis está indisponível no Pix agora', 'warning');
  assert.equal(bar(doc).querySelector('a.btn-primary').textContent.trim(), 'Ver planos');
  assert.equal(ctx.stores.trials.used('LER1'), false);
});

test('sem lojas ou venda pausada → tela de pausa', async () => {
  for (const o of [{ stores: undefined }, { config: { salesEnabled: false } }]) {
    const ctx = makeApp(o);
    assert.match(await (await ctx.app.request(`/pix/teste${Q}`)).text(), /<h1>/);
    const doc = await dom(await post(ctx, ok));
    assert.match(doc.querySelector('h1').textContent, /pausad|indispon|volt/i);
  }
});

test('POST /pix/teste com multipart malformado → nunca 500', async () => {
  const ctx = makeApp();
  const res = await ctx.app.request('/pix/teste', {
    method: 'POST',
    headers: { 'content-type': 'multipart/form-data; boundary=quebrado' },
    body: 'isto não é multipart',
  });
  assert.notEqual(res.status, 500);
  assert.equal(res.status, 200);
});

test('e-mail que já recebeu todas as ofertas do teste → aviso "para este e-mail", aparelho não marcado', async () => {
  const ctx = makeApp();
  ctx.stores.codes.claim('x1', 'teste', 'motorista@email.com');
  ctx.stores.codes.claim('x2', 'teste', 'motorista@email.com');
  const doc = await dom(await post(ctx, ok));
  assertResult(doc, 'Para este e-mail, o Teste grátis fica disponível em algumas horas', 'warning');
  assert.equal(bar(doc).querySelector('a.btn-primary').getAttribute('href'), '/pix');
  assert.match(doc.body.textContent, /Tente mais tarde ou assine pela App Store no app/);
  assert.equal(ctx.stores.trials.used('LER1'), false);
});
