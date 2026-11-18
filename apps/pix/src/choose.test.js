import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, dom } from './test/helpers.js';

const get = (path, overrides) => makeApp(overrides).app.request(path);
const text = (doc) => doc.body.textContent.replace(/\s+/g, ' ');

const barButton = (doc) => doc.querySelector('.bar button[form=pedido]');

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
  // Marca só na barra de título (não é título nem aparece duas vezes).
  assert.equal(doc.querySelectorAll('.brand').length, 1);
  assert.equal(doc.querySelector('.brand').closest('header.nav').tagName, 'HEADER');
  const form = doc.getElementById('pedido');
  assert.equal(form.tagName, 'FORM');
  assert.equal(form.getAttribute('action'), '/pix/pedidos');
  assert.equal(form.getAttribute('method'), 'post');
  assert.ok(form.contains(group));
  assert.equal(doc.documentElement.getAttribute('lang'), 'pt-BR');
  assert.equal(doc.querySelector('.screen').dataset.state, 'choose');
});

test('cabeçalho: ícone, "Assine o Corridex com Pix" e "Pagamento único. Não renova sozinho."', async () => {
  const doc = await dom(await get('/pix'));
  const hero = doc.querySelector('main .hero');
  assert.ok(hero.querySelector('svg[aria-hidden=true]'));
  assert.equal(hero.querySelector('h1').textContent.trim(), 'Assine o Corridex com Pix');
  assert.equal(hero.querySelector('.sub').textContent.trim(), 'Pagamento único. Não renova sozinho.');
  assert.equal(doc.querySelectorAll('h1').length, 1);
});

test('cartões: duração e preço por mês; Mensal só "1 mês"; selo só no Anual', async () => {
  const doc = await dom(await get('/pix'));
  const card = (id) => doc.querySelector(`input[name=plano][value=${id}]`).closest('label');
  const sub = (id) => card(id).querySelector('.pd').textContent.trim();
  assert.equal(sub('mensal'), '1 mês');
  assert.equal(sub('trimestral'), '3 meses · R$ 8,63/mês');
  assert.equal(sub('anual'), '1 ano · R$ 8,33/mês');
  assert.match(card('trimestral').textContent, /R\$ 25,90/);
  const badges = doc.querySelectorAll('.badge');
  assert.equal(badges.length, 1);
  assert.equal(badges[0].textContent.trim(), 'Mais vantajoso');
  assert.ok(card('anual').contains(badges[0]));
});

test('barra: "Gerar Pix · R$ 99,90" com form="pedido", fora do form, e "Pagamento pelo Banco Inter"', async () => {
  const doc = await dom(await get('/pix'));
  const bar = doc.querySelector('.screen > .bar');
  assert.ok(bar);
  const button = barButton(doc);
  assert.equal(button.textContent.trim(), 'Gerar Pix · R$ 99,90');
  assert.equal(button.getAttribute('type'), 'submit');
  assert.equal(button.closest('form'), null);
  assert.equal(button.form, doc.getElementById('pedido'));
  assert.match(bar.querySelector('.fine').textContent, /Pagamento pelo Banco Inter/);
  // Cada rádio leva o rótulo do botão com o próprio preço (o cliente troca ao mudar).
  const ctas = [...doc.querySelectorAll('input[name=plano]')].map((r) => r.dataset.cta);
  assert.deepEqual(ctas, ['Gerar Pix · R$ 9,90', 'Gerar Pix · R$ 25,90', 'Gerar Pix · R$ 99,90']);
  // Só um "Gerar Pix" na página.
  assert.equal([...doc.querySelectorAll('button')].filter((b) => /Gerar Pix/.test(b.textContent)).length, 1);
});

test('Termos, Privacidade e Ajuda no conteúdo (sem o texto do banco); link do teste no conteúdo', async () => {
  const doc = await dom(await get('/pix?teste=1&dc_ler=L&dc_marcar=M'));
  const row = doc.querySelector('main .links');
  assert.deepEqual([...row.querySelectorAll('a')].map((a) => a.textContent.trim()), ['Termos', 'Privacidade', 'Ajuda']);
  assert.doesNotMatch(row.textContent, /Banco Inter/);
  const trial = doc.querySelector('main a[href^="/pix/teste"]');
  assert.ok(trial);
  assert.equal(trial.closest('.bar'), null);
});

test('envio do formulário completo (rádio, e-mail, nonce, teste) → 303 para o pedido', async () => {
  const { app } = makeApp();
  const doc = await dom(await app.request('/pix?teste=1&dc_ler=L&dc_marcar=M&email=m%40email.com'));
  const form = doc.getElementById('pedido');
  const fields = [...doc.querySelectorAll('input, button, select, textarea')]
    .filter((el) => el.form === form && el.name && !el.disabled)
    .filter((el) => !(el.type === 'radio' || el.type === 'checkbox') || el.checked)
    .filter((el) => el.tagName !== 'BUTTON');
  const body = new URLSearchParams(fields.map((el) => [el.name, el.value]));
  assert.deepEqual([...new Set(body.keys())].sort(), ['dc_ler', 'dc_marcar', 'email', 'nonce', 'plano', 'teste']);
  assert.equal(body.get('plano'), 'anual');
  const res = await app.request(form.getAttribute('action'), { method: 'POST', body });
  assert.equal(res.status, 303);
  assert.match(res.headers.get('location'), /^\/pix\/pedido\//);
});

test('?plano=mensal seleciona Mensal e a barra mostra "Gerar Pix · R$ 9,90"', async () => {
  const doc = await dom(await get('/pix?plano=mensal'));
  assert.equal(doc.querySelector('[role=radiogroup] input:checked').value, 'mensal');
  assert.equal(barButton(doc).textContent.trim(), 'Gerar Pix · R$ 9,90');
  assert.match(doc.title, /Corridex Mensal/);
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
  // Aviso logo abaixo do cabeçalho; a ação fica na barra, sem "Gerar Pix".
  assert.ok(notice.previousElementSibling.classList.contains('hero'));
  const see = doc.querySelector('.bar a.btn-primary');
  assert.equal(see.textContent.trim(), 'Ver Mensal');
  assert.equal(see.getAttribute('href'), '/pix?plano=mensal');
  assert.doesNotMatch(doc.querySelector('.bar').textContent, /Gerar Pix/);
  assert.equal([...doc.querySelectorAll('button')].filter((b) => /Gerar Pix/.test(b.textContent)).length, 0);
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
  const see = doc.querySelector('.bar a.btn-primary');
  assert.equal(see.textContent.trim(), 'Ver Trimestral');
  assert.equal(see.getAttribute('href'), '/pix?plano=trimestral&email=m%40email.com');
  assert.ok(doc.querySelector('.notice').previousElementSibling.classList.contains('hero'));
  assert.equal(doc.querySelector('h1').textContent.trim(), 'Assine o Corridex com Pix');
  assert.match(doc.title, /Corridex Mensal/);
  assert.equal([...doc.querySelectorAll('button')].filter((b) => /Gerar Pix/.test(b.textContent)).length, 0);
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
