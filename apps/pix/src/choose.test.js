import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, dom } from './test/helpers.js';

const get = (path, overrides) => makeApp(overrides).app.request(path);
const text = (doc) => doc.body.textContent.replace(/\s+/g, ' ');

test('GET /pix mostra Anual selecionado com R$ 99,90', async () => {
  const res = await get('/pix');
  assert.equal(res.status, 200);
  const doc = await dom(res);
  const group = doc.querySelector('[role=radiogroup]');
  assert.ok(group);
  const radios = group.querySelectorAll('input[type=radio][name=plano]');
  assert.equal(radios.length, 3);
  const checked = group.querySelector('input:checked');
  assert.equal(checked.value, 'anual');
  // Rádio nativo: o estado "checked" (aria-checked computado) vem do próprio input.
  assert.equal(checked.checked, true);
  assert.equal(group.querySelectorAll('[aria-checked]').length, 0);
  const on = doc.querySelectorAll('.sum.on');
  assert.equal(on.length, 1);
  assert.equal(on[0].dataset.plan, 'anual');
  assert.match(on[0].textContent, /R\$ 99,90/);
  assert.equal(on[0].querySelector('h1').textContent, 'Corridex Anual');
  assert.equal(doc.querySelector('.brand').tagName, 'DIV'); // marca não é título
  const button = [...doc.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Gerar Pix');
  assert.ok(button);
  const form = button.closest('form');
  assert.equal(form.getAttribute('action'), '/pix/pedidos');
  assert.equal(form.getAttribute('method'), 'post');
  assert.ok(form.contains(group));
  assert.match(doc.querySelector('footer').textContent, /Pagamento pelo Banco Inter/);
  assert.equal(doc.documentElement.getAttribute('lang'), 'pt-BR');
  assert.equal(doc.querySelector('.screen').dataset.state, 'choose');
});

test('?plano=mensal seleciona Mensal R$ 9,90', async () => {
  const doc = await dom(await get('/pix?plano=mensal'));
  assert.equal(doc.querySelector('[role=radiogroup] input:checked').value, 'mensal');
  const on = doc.querySelector('.sum.on');
  assert.equal(on.dataset.plan, 'mensal');
  assert.match(on.textContent, /R\$ 9,90/);
  assert.match(on.textContent, /Corridex Mensal/);
});

test('?plano=xyz cai no Anual', async () => {
  const doc = await dom(await get('/pix?plano=xyz'));
  assert.equal(doc.querySelector('[role=radiogroup] input:checked').value, 'anual');
});

test('email: type=email, autocomplete=email, inputmode=email', async () => {
  const doc = await dom(await get('/pix?email=a%40b.com%22%3E%3Cscript%3E'));
  const input = doc.querySelector('input[name=email]');
  assert.equal(input.getAttribute('type'), 'email');
  assert.equal(input.getAttribute('autocomplete'), 'email');
  assert.equal(input.getAttribute('inputmode'), 'email');
  assert.equal(input.value, 'a@b.com"><script>');
  assert.equal(doc.querySelectorAll('script:not([src])').length, 0);
  const label = doc.querySelector(`label[for="${input.id}"]`);
  assert.equal(label.textContent.trim(), 'Seu e-mail');
});

test('cabeçalhos no-store, no-referrer, noindex', async () => {
  const res = await get('/pix');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(res.headers.get('x-robots-tag'), 'noindex');
  const health = await get('/pix/health');
  assert.equal(health.headers.get('x-robots-tag'), null);
});

test('link do teste só com teste=1 e dois tokens', async () => {
  const without = await dom(await get('/pix?teste=1&dc_ler=abc'));
  assert.equal(without.querySelector('a[href^="/pix/teste"]'), null);
  const doc = await dom(await get('/pix?teste=1&dc_ler=a%20b&dc_marcar=x%26y'));
  const link = doc.querySelector('a[href^="/pix/teste"]');
  assert.ok(link);
  assert.equal(link.getAttribute('href'), '/pix/teste?teste=1&dc_ler=a%20b&dc_marcar=x%26y');
  assert.match(link.textContent, /Testar 7 dias grátis/);
});

test('?cenario=pausado → "A venda por Pix está pausada"; sem devTools o cenário é ignorado', async () => {
  const doc = await dom(await get('/pix?cenario=pausado'));
  assert.match(text(doc), /A venda por Pix está pausada/);
  assert.equal(doc.querySelector('.screen').dataset.state, 'sales_paused');
  assert.equal(doc.querySelector('input[name=email]'), null);
  const off = await dom(await get('/pix?cenario=pausado', { config: { devTools: false } }));
  assert.doesNotMatch(text(off), /pausada/);
  assert.equal(off.querySelector('.screen').dataset.state, 'choose');
});

test('?cenario=sem-estoque → Anual riscado com texto "indisponível" e Notice warning', async () => {
  const doc = await dom(await get('/pix?cenario=sem-estoque'));
  assert.equal(doc.querySelector('.screen').dataset.state, 'plan_out_of_stock');
  const off = doc.querySelector('.plan.off');
  assert.equal(off.querySelector('s').textContent, 'Anual');
  assert.match(off.textContent, /indisponível/);
  assert.equal(off.querySelector('a'), null);
  const notice = doc.querySelector('.notice[data-tone=warning]');
  assert.ok(notice);
  assert.match(notice.textContent, /O Anual está indisponível no Pix agora/);
  const see = notice.querySelector('a.btn-secondary');
  assert.equal(see.textContent.trim(), 'Ver Mensal');
  assert.equal(see.getAttribute('href'), '/pix?plano=mensal');
});

test('sem botão de envio, os outros planos viram links ?plano= (sem rádios soltos)', async () => {
  const doc = await dom(await get('/pix?cenario=sem-estoque'));
  assert.equal(doc.querySelectorAll('input[type=radio]').length, 0);
  assert.equal(doc.querySelector('form[action="/pix/pedidos"]'), null);
  const hrefs = [...doc.querySelectorAll('ul.plans a.plan')].map((a) => a.getAttribute('href'));
  assert.deepEqual(hrefs, ['/pix?plano=mensal', '/pix?plano=trimestral']);
});

test('?cenario=fora-do-ar → "O Pix está indisponível agora" e botão "Tentar de novo"', async () => {
  const doc = await dom(await get('/pix?cenario=fora-do-ar&plano=trimestral'));
  assert.match(text(doc), /O Pix está indisponível agora/);
  assert.match(doc.querySelector('h1').textContent, /Corridex Trimestral/);
  assert.equal(doc.querySelector('[role=alert]').dataset.tone, 'error');
  const retry = [...doc.querySelectorAll('a,button')].find((el) => el.textContent.trim() === 'Tentar de novo');
  assert.ok(retry);
  assert.equal(doc.querySelector('.screen').dataset.state, 'error');
});

test('?cenario=indisponivel-email&plano=mensal → mensagem e botão "Ver Trimestral"', async () => {
  const doc = await dom(await get('/pix?cenario=indisponivel-email&plano=mensal&email=m%40email.com'));
  assert.match(text(doc), /Para este e-mail, o Mensal fica disponível em algumas horas/);
  const see = [...doc.querySelectorAll('a')].find((a) => a.textContent.trim() === 'Ver Trimestral');
  assert.ok(see);
  assert.equal(see.getAttribute('href'), '/pix?plano=trimestral&email=m%40email.com');
  assert.equal(doc.querySelector('h1').textContent, 'Corridex Mensal');
  assert.equal(doc.querySelector('.screen').dataset.state, 'unavailable_for_customer');
  // Plano atual marcado; os outros são links que mantêm o e-mail; nada gera Pix.
  assert.match(doc.querySelector('.plan[aria-current=true]').textContent, /Mensal/);
  const hrefs = [...doc.querySelectorAll('ul.plans a.plan')].map((a) => a.getAttribute('href'));
  assert.deepEqual(hrefs, ['/pix?plano=trimestral&email=m%40email.com', '/pix?plano=anual&email=m%40email.com']);
  assert.equal(doc.querySelectorAll('input[type=radio]').length, 0);
  assert.equal(doc.querySelector('form[action="/pix/pedidos"]'), null);
  const input = doc.querySelector('input[name=email]');
  assert.equal(input.value, 'm@email.com');
  assert.equal(input.form.getAttribute('method'), 'get');
});

test('sem estoque real no armazenamento marca o plano indisponível', async () => {
  const { app, stores } = makeApp();
  for (let i = 0; i < 6; i++) stores.codes.reserve('anual', `x${i}@e.com`, `h${i}`);
  const doc = await dom(await app.request('/pix?plano=mensal'));
  const anual = doc.querySelector('input[name=plano][value=anual]');
  assert.ok(anual.disabled);
  assert.ok(anual.closest('label').classList.contains('off')); // cursor not-allowed no cartão todo
  assert.match(anual.closest('label').textContent, /indisponível/);
  assert.ok(!doc.querySelector('input[name=plano][value=mensal]').disabled);
  // Plano escolhido sem estoque → aviso de estoque.
  const def = await dom(await app.request('/pix'));
  assert.equal(def.querySelector('.screen').dataset.state, 'plan_out_of_stock');
});

test('?email= pré-preenchido é cortado em 254 caracteres', async () => {
  const long = 'a'.repeat(300) + '@email.com';
  const doc = await dom(await get('/pix?email=' + encodeURIComponent(long)));
  assert.equal(doc.querySelector('input[name=email]').value, 'a'.repeat(254));
});

test('config.salesEnabled=false ou provider null → tela pausada', async () => {
  for (const overrides of [{ config: { salesEnabled: false } }, { provider: null }, { stores: null }]) {
    const doc = await dom(await get('/pix', overrides));
    assert.match(text(doc), /A venda por Pix está pausada/);
  }
});

test('texto visível sem palavras proibidas', async () => {
  for (const q of ['', '?cenario=sem-estoque', '?cenario=pausado', '?cenario=fora-do-ar', '?cenario=indisponivel-email']) {
    const res = await get('/pix' + q);
    assert.equal(res.status, 200);
    const doc = await dom(res);
    assert.doesNotMatch(text(doc), /token|oferta|geração|Apple ID|webhook/i);
  }
});
