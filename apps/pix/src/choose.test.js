import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, dom, assertNoEmailInUrls } from './test/helpers.js';

const get = (path, overrides) => makeApp(overrides).app.request(path);
const postForm = (app, path, fields, headers = {}) => app.request(path, { method: 'POST', body: new URLSearchParams(fields), headers });
const post = (path, fields, overrides) => postForm(makeApp(overrides).app, path, fields);
const text = (doc) => doc.body.textContent.replace(/\s+/g, ' ');

const barButton = (doc) => doc.querySelector('.bar button[form=pedido]');

// Sessão do teste grátis: o link do app grava o cookie pix_trial; devolve o cabeçalho Cookie.
async function trialHeaders(app) {
  const res = await app.request('/pix?teste=1&dcq=DCQ&dcm=DCM');
  return { Cookie: res.headers.getSetCookie().find((c) => c.startsWith('pix_trial=')).split(';')[0] };
}

test('GET /pix mostra Anual selecionado com R$ 99,90', async () => {
  const res = await get('/pix');
  assert.equal(res.status, 200);
  const doc = await dom(res);
  const group = doc.querySelector('[role=radiogroup]');
  assert.ok(group);
  const radios = group.querySelectorAll('input[type=radio][name=plano]');
  assert.equal(radios.length, 3);
  const checked = group.querySelector('input:checked');
  assert.equal(checked.value, 'annual');
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
  assert.equal(sub('monthly'), '1 mês');
  assert.equal(sub('quarterly'), '3 meses · R$ 8,63/mês');
  assert.equal(sub('annual'), '1 ano · R$ 8,33/mês');
  assert.match(card('quarterly').textContent, /R\$ 25,90/);
  const badges = doc.querySelectorAll('.badge');
  assert.equal(badges.length, 1);
  assert.equal(badges[0].textContent.trim(), 'Mais vantajoso');
  assert.ok(card('annual').contains(badges[0]));
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
  const { app } = makeApp();
  const doc = await dom(await app.request('/pix', { headers: await trialHeaders(app) }));
  const row = doc.querySelector('main .links');
  assert.deepEqual([...row.querySelectorAll('a')].map((a) => a.textContent.trim()), ['Termos', 'Privacidade', 'Ajuda']);
  assert.doesNotMatch(row.textContent, /Banco Inter/);
  const trial = doc.querySelector('main a[href^="/pix/teste"]');
  assert.ok(trial);
  assert.equal(trial.closest('.bar'), null);
});

test('envio do formulário completo (rádio, e-mail, nonce) com sessão do teste → 303 para o pedido', async () => {
  const { app } = makeApp();
  const doc = await dom(await postForm(app, '/pix', { email: 'm@email.com' }, await trialHeaders(app)));
  const form = doc.getElementById('pedido');
  const fields = [...doc.querySelectorAll('input, button, select, textarea')]
    .filter((el) => el.form === form && el.name && !el.disabled)
    .filter((el) => !(el.type === 'radio' || el.type === 'checkbox') || el.checked)
    .filter((el) => el.tagName !== 'BUTTON');
  const body = new URLSearchParams(fields.map((el) => [el.name, el.value]));
  assert.deepEqual([...new Set(body.keys())].sort(), ['email', 'nonce', 'plano']);
  assert.equal(body.get('plano'), 'annual');
  const res = await app.request(form.getAttribute('action'), { method: 'POST', body });
  assert.equal(res.status, 303);
  assert.match(res.headers.get('location'), /^\/pix\/pedido\//);
});

test('?plano=monthly seleciona Mensal e a barra mostra "Gerar Pix · R$ 9,90"', async () => {
  const doc = await dom(await get('/pix?plano=monthly'));
  assert.equal(doc.querySelector('[role=radiogroup] input:checked').value, 'monthly');
  assert.equal(barButton(doc).textContent.trim(), 'Gerar Pix · R$ 9,90');
  assert.match(doc.title, /Corridex Mensal/);
});

test('plano=mensal (id antigo) cai no Anual', async () => {
  const doc = await dom(await get('/pix?plano=mensal'));
  assert.equal(doc.querySelector('[role=radiogroup] input:checked').value, 'annual');
  assert.equal(barButton(doc).textContent.trim(), 'Gerar Pix · R$ 99,90');
});

test('?plano=xyz cai no Anual', async () => {
  const doc = await dom(await get('/pix?plano=xyz'));
  assert.equal(doc.querySelector('[role=radiogroup] input:checked').value, 'annual');
});

test('email: type=email, autocomplete=email, inputmode=email', async () => {
  const doc = await dom(await post('/pix', { email: 'a@b.com"><script>' }));
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

test('?cenario=pausado → "A venda por Pix está pausada"; sem devTools o cenário é ignorado', async () => {
  const doc = await dom(await get('/pix?cenario=pausado'));
  assert.match(text(doc), /A venda por Pix está pausada/);
  assert.equal(doc.querySelector('.screen').dataset.state, 'sales_paused');
  assert.ok(doc.querySelector('.screen > main.content.result'));
  assert.equal(doc.querySelectorAll('h1').length, 1);
  assert.equal(doc.querySelector('h1').textContent.trim(), 'A venda por Pix está pausada');
  assert.equal(doc.querySelector('h1').closest('.result-hero').dataset.tone, 'info');
  assert.ok(doc.querySelector('header.nav .brand'));
  assert.equal(doc.querySelector('.bar'), null);
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
  assert.equal(see.getAttribute('href'), '/pix?plano=monthly');
  assert.doesNotMatch(doc.querySelector('.bar').textContent, /Gerar Pix/);
  assert.equal([...doc.querySelectorAll('button')].filter((b) => /Gerar Pix/.test(b.textContent)).length, 0);
});

test('sem botão de envio, os outros planos viram links ?plano= (sem rádios soltos)', async () => {
  const doc = await dom(await get('/pix?cenario=sem-estoque'));
  assert.equal(doc.querySelectorAll('input[type=radio]').length, 0);
  assert.equal(doc.querySelector('form[action="/pix/pedidos"]'), null);
  const hrefs = [...doc.querySelectorAll('ul.plans a.plan')].map((a) => a.getAttribute('href'));
  assert.deepEqual(hrefs, ['/pix?plano=monthly', '/pix?plano=quarterly']);
});

test('?cenario=fora-do-ar → "O Pix está indisponível agora" e botão "Tentar de novo"', async () => {
  const doc = await dom(await get('/pix?cenario=fora-do-ar&plano=quarterly'));
  assert.ok(doc.querySelector('.screen > main.content.result'));
  assert.equal(doc.querySelectorAll('h1').length, 1);
  assert.equal(doc.querySelector('h1').textContent.trim(), 'O Pix está indisponível agora');
  assert.equal(doc.querySelector('h1').closest('.result-hero').dataset.tone, 'error');
  assert.match(text(doc), /Tente de novo em alguns minutos/);
  assert.match(doc.title, /Corridex Trimestral/);
  assert.ok(doc.querySelector('header.nav .brand'));
  const retry = doc.querySelector('.screen > .bar a.btn-primary');
  assert.equal(retry.textContent.trim(), 'Tentar de novo');
  assert.equal(retry.getAttribute('href'), '/pix?plano=quarterly');
  assert.equal(doc.querySelector('.screen').dataset.state, 'error');
});

test('?cenario=indisponivel-email&plano=monthly → mensagem e botão "Ver Trimestral"', async () => {
  const doc = await dom(await post('/pix?cenario=indisponivel-email', { plano: 'monthly', email: 'm@email.com' }));
  assert.match(text(doc), /Para este e-mail, o Mensal fica disponível em algumas horas/);
  const see = doc.querySelector('.bar button.btn-primary');
  assert.equal(see.textContent.trim(), 'Ver Trimestral');
  assert.equal(see.name, 'plano');
  assert.equal(see.value, 'quarterly');
  assert.ok(doc.querySelector('.notice').previousElementSibling.classList.contains('hero'));
  assert.equal(doc.querySelector('h1').textContent.trim(), 'Assine o Corridex com Pix');
  assert.match(doc.title, /Corridex Mensal/);
  assert.equal([...doc.querySelectorAll('button')].filter((b) => /Gerar Pix/.test(b.textContent)).length, 0);
  assert.equal(doc.querySelector('.screen').dataset.state, 'unavailable_for_customer');
  // Plano atual marcado; os outros são botões de POST /pix que mantêm o e-mail; nada gera Pix.
  assert.match(doc.querySelector('.plan[aria-current=true]').textContent, /Mensal/);
  const cards = [...doc.querySelectorAll('ul.plans button.plan')];
  assert.deepEqual(cards.map((b) => [b.name, b.value]), [['plano', 'quarterly'], ['plano', 'annual']]);
  assert.equal(doc.querySelectorAll('ul.plans a').length, 0);
  for (const b of cards) {
    assert.equal(b.form.getAttribute('method'), 'post');
    assert.equal(b.form.getAttribute('action'), '/pix');
  }
  assert.equal(doc.querySelectorAll('input[type=radio]').length, 0);
  assert.equal(doc.querySelector('form[action="/pix/pedidos"]'), null);
  const input = doc.querySelector('input[name=email]:not([type=hidden])');
  assert.equal(input.value, 'm@email.com');
  assert.equal(input.form.getAttribute('method'), 'post');
  assert.equal(input.form.getAttribute('action'), '/pix');
});

test('sem estoque real no armazenamento marca o plano indisponível', async () => {
  const { app, stores } = makeApp();
  for (let i = 0; i < 6; i++) stores.codes.reserve('annual', `x${i}@e.com`, `h${i}`);
  const doc = await dom(await app.request('/pix?plano=monthly'));
  const anual = doc.querySelector('input[name=plano][value=annual]');
  assert.ok(anual.disabled);
  assert.ok(anual.closest('label').classList.contains('off')); // cursor not-allowed no cartão todo
  assert.match(anual.closest('label').textContent, /indisponível/);
  assert.ok(!doc.querySelector('input[name=plano][value=monthly]').disabled);
  // Plano escolhido sem estoque → aviso de estoque.
  const def = await dom(await app.request('/pix'));
  assert.equal(def.querySelector('.screen').dataset.state, 'plan_out_of_stock');
});

test('POST /pix: e-mail do formulário é cortado em 254 caracteres', async () => {
  const long = 'a'.repeat(300) + '@email.com';
  const doc = await dom(await post('/pix', { email: long }));
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


test('POST /pix com plano=quarterly&email=a@b.com → 200, cartão Trimestral marcado, campo com a@b.com', async () => {
  const res = await post('/pix', { plano: 'quarterly', email: 'a@b.com' });
  assert.equal(res.status, 200);
  const doc = await dom(res);
  assert.equal(doc.querySelector('.screen').dataset.state, 'choose');
  assert.equal(doc.querySelector('[role=radiogroup] input:checked').value, 'quarterly');
  assert.equal(doc.querySelector('input[name=email]').value, 'a@b.com');
  assert.equal(barButton(doc).textContent.trim(), 'Gerar Pix · R$ 25,90');
});

test('POST /pix: plano inválido cai no Anual; venda pausada → tela pausada', async () => {
  const doc = await dom(await post('/pix', { plano: 'xyz', email: 'a@b.com' }));
  assert.equal(doc.querySelector('[role=radiogroup] input:checked').value, 'annual');
  const paused = await dom(await post('/pix', { plano: 'annual', email: 'a@b.com' }, { config: { salesEnabled: false } }));
  assert.equal(paused.querySelector('.screen').dataset.state, 'sales_paused');
  const scenario = await dom(await post('/pix?cenario=pausado', { plano: 'annual' }));
  assert.equal(scenario.querySelector('.screen').dataset.state, 'sales_paused');
});

test('POST /pix: cenario só pela query e só com devTools', async () => {
  const body = await dom(await post('/pix', { plano: 'annual', email: 'a@b.com', cenario: 'sem-estoque' }));
  assert.equal(body.querySelector('.screen').dataset.state, 'choose');
  const off = await dom(await post('/pix?cenario=sem-estoque', { plano: 'annual' }, { config: { devTools: false } }));
  assert.equal(off.querySelector('.screen').dataset.state, 'choose');
});

test('POST /pix mantém o link do teste grátis com a sessão do cookie', async () => {
  const { app } = makeApp();
  const doc = await dom(await postForm(app, '/pix', { plano: 'annual', email: 'a@b.com' }, await trialHeaders(app)));
  assert.ok(doc.querySelector('main a[href="/pix/teste"]'));
  const plain = await dom(await postForm(app, '/pix', { plano: 'annual', email: 'a@b.com' }));
  assert.equal(plain.querySelector('a[href="/pix/teste"]'), null);
});

test('GET /pix?email=a@b.com ignora o e-mail', async () => {
  const doc = await dom(await get('/pix?email=a%40b.com'));
  assert.equal(doc.querySelector('input[name=email]').value, '');
  const notice = await dom(await get('/pix?cenario=indisponivel-email&plano=monthly&email=a%40b.com'));
  assert.equal(notice.querySelector('input[name=email]').value, '');
  assertNoEmailInUrls(notice, 'indisponivel-email GET');
});

test('aviso Ver Trimestral com e-mail é botão de POST com email oculto', async () => {
  const doc = await dom(await post('/pix?cenario=sem-estoque', { plano: 'annual', email: 'a@b.com' }));
  const see = doc.querySelector('.bar button.btn-primary');
  assert.equal(see.textContent.trim(), 'Ver Mensal');
  assert.equal(see.getAttribute('type'), 'submit');
  assert.equal(see.closest('form'), null);
  assert.equal(see.name, 'plano');
  assert.equal(see.value, 'monthly');
  const form = see.form;
  assert.equal(form.getAttribute('method'), 'post');
  assert.equal(form.getAttribute('action'), '/pix');
  const hidden = form.querySelector('input[type=hidden][name=email]');
  assert.equal(hidden.value, 'a@b.com');
  assert.equal(doc.querySelectorAll('a.btn').length, 0);
  // Sem e-mail, continuam links.
  const plain = await dom(await get('/pix?cenario=sem-estoque'));
  assert.equal(plain.querySelector('.bar a.btn-primary').getAttribute('href'), '/pix?plano=monthly');
});

test('Tentar de novo com e-mail é POST /pix', async () => {
  const doc = await dom(await post('/pix?cenario=fora-do-ar', { plano: 'quarterly', email: 'a@b.com' }));
  assert.equal(doc.querySelector('.screen').dataset.state, 'error');
  assert.match(doc.title, /Corridex Trimestral/);
  const retry = doc.querySelector('.screen > .bar button.btn-primary');
  assert.equal(retry.textContent.trim(), 'Tentar de novo');
  assert.equal(retry.closest('form'), null);
  const form = retry.form;
  assert.equal(form.getAttribute('method'), 'post');
  assert.equal(form.getAttribute('action'), '/pix');
  assert.equal(form.querySelector('input[name=plano]').value, 'quarterly');
  assert.equal(form.querySelector('input[name=email]').value, 'a@b.com');
});

test('nenhum href nem form GET de nenhuma tela contém email=', async () => {
  const { app } = makeApp();
  const pages = {
    escolha: await postForm(app, '/pix', { plano: 'annual', email: 'a@b.com' }),
    'sem-estoque': await postForm(app, '/pix?cenario=sem-estoque', { plano: 'annual', email: 'a@b.com' }),
    'indisponivel-email': await postForm(app, '/pix?cenario=indisponivel-email', { plano: 'monthly', email: 'a@b.com' }),
    'fora-do-ar': await postForm(app, '/pix?cenario=fora-do-ar', { plano: 'monthly', email: 'a@b.com' }),
    'GET indisponivel-email': await app.request('/pix?cenario=indisponivel-email&email=a%40b.com'),
  };
  for (const [label, res] of Object.entries(pages)) assertNoEmailInUrls(await dom(res), label);
});
