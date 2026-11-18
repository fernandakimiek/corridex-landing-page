import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, dom, assertNoEmailInUrls } from './test/helpers.js';
import { copy } from './page/copy.pt-BR.js';

const T0 = Date.UTC(2026, 10, 17, 15, 0, 0); // 17/11/2026 12:00 em Brasília
const EMAIL = 'motorista@email.com';
const text = (doc) => doc.body.textContent.replace(/\s+/g, ' ');

function setup(overrides) {
  const ctx = makeApp(overrides);
  ctx.clock.set(T0);
  return ctx;
}

const post = (app, path, fields = {}, headers = {}) => app.request(path, { method: 'POST', body: new URLSearchParams(fields), headers });

// Sessão do teste grátis: o link do app grava o cookie pix_trial; devolve o cabeçalho Cookie.
async function trialHeaders(app) {
  const res = await app.request('/pix?teste=1&dcq=DCQ&dcm=DCM');
  return { Cookie: res.headers.getSetCookie().find((c) => c.startsWith('pix_trial=')).split(';')[0] };
}
const trialInputs = (doc) => doc.querySelectorAll('input[name=teste], input[name=dcq], input[name=dcm], input[name=dc_ler], input[name=dc_marcar]');

async function createOrder(ctx, fields = { plano: 'annual', email: EMAIL }) {
  const res = await post(ctx.app, '/pix/pedidos', fields);
  assert.equal(res.status, 303);
  const location = res.headers.get('location');
  const token = location.split('/').pop();
  return { location, token, order: () => ctx.stores.orders.get(token) };
}

const lastTxid = (order) => order.txids.at(-1);

// Tela de resultado: main.content.result, um único h1 com o texto esperado.
function assertResult(doc, h1) {
  assert.ok(doc.querySelector('.screen > main.content.result'));
  const h1s = doc.querySelectorAll('h1');
  assert.equal(h1s.length, 1);
  assert.equal(h1s[0].textContent.trim(), h1);
  assert.ok(h1s[0].closest('.result-hero'));
}
const bar = (doc) => doc.querySelector('.screen > .bar');

test('POST válido → 303 para /pix/pedido/<token>', async () => {
  const ctx = setup();
  const { location, token } = await createOrder(ctx);
  assert.match(location, /^\/pix\/pedido\/[A-Za-z0-9_-]{16,}$/);
  assert.equal(ctx.stores.orders.get(token).status, 'paying');
});

const FOLLOWING = 4; // Node.DOCUMENT_POSITION_FOLLOWING
const before = (a, b) => Boolean(a.compareDocumentPosition(b) & FOLLOWING);

async function payingDoc() {
  const ctx = setup();
  const { location, order } = await createOrder(ctx);
  const res = await ctx.app.request(location);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  return { ctx, location, order, doc: await dom(res) };
}

test('paying: barra "Pagamento", plano, valor e "Vale até HH:MM · N min" no topo', async () => {
  const { doc } = await payingDoc();
  assert.equal(doc.querySelector('.nav').textContent.trim(), 'Pagamento');
  assert.equal(doc.title, 'Pague R$ 99,90 com Pix · Corridex');
  const h1s = doc.querySelectorAll('h1');
  assert.equal(h1s.length, 1);
  // Visível só o valor; o leitor de tela ouve "Pague R$ 99,90 com Pix".
  assert.equal(h1s[0].textContent, 'Pague R$ 99,90 com Pix');
  const visible = h1s[0].cloneNode(true);
  visible.querySelectorAll('.vh').forEach((n) => n.remove());
  assert.equal(visible.textContent, 'R$ 99,90');
  assert.ok(h1s[0].classList.contains('amount'));
  const top = h1s[0].parentElement;
  assert.match(top.textContent.replace(/\s+/g, ' '), /Corridex Anual/);
  // 30 min de validade a partir das 12:00 de Brasília.
  const valid = doc.querySelector('[data-minutes]').closest('p');
  assert.equal(valid.textContent.replace(/\s+/g, ' ').trim(), 'Vale até 12:30 · 30 min');
  assert.equal(doc.querySelector('[data-minutes]').textContent, '30');
  assert.ok(top.contains(valid));
});

test('paying: cartão do código com "Copiar" ao lado, código completo recolhido, passos e QR, nessa ordem', async () => {
  const { doc, order } = await payingDoc();
  const code = doc.querySelector('.card.code');
  assert.ok(code);
  const short = code.querySelector('.row [data-copy]');
  assert.ok(short, 'botão Copiar na linha do código');
  assert.equal(short.getAttribute('type'), 'button');
  assert.equal(short.textContent.trim(), 'Copiar');
  assert.equal(short.getAttribute('aria-label'), 'Copiar código Pix');
  const v = code.querySelector('.row .v');
  assert.equal(v.textContent, order().copiaECola);
  assert.equal(v.getAttribute('aria-hidden'), 'true');
  const more = code.querySelector('details');
  assert.equal(more.open, false);
  assert.equal(more.querySelector('summary').textContent.trim(), 'Ver código completo');
  const area = more.querySelector('textarea#pix-code[readonly]');
  assert.equal(area.value, order().copiaECola);
  assert.ok(area.getAttribute('aria-labelledby') || doc.querySelector('label[for=pix-code]'));
  assert.ok(!more.querySelector('summary').contains(area));
  // Nenhum controle dentro de <summary> (Review: nome acessível e interação aninhada).
  assert.equal(doc.querySelectorAll('summary button, summary a, summary input, summary textarea').length, 0);

  const steps = doc.querySelector('ol.steps');
  assert.deepEqual([...steps.querySelectorAll('li')].map((li) => li.textContent.replace(/\d/g, '').trim()), [
    'Copie o código acima', 'Abra o app do seu banco', 'Escolha Pix Copia e Cola e cole',
  ]);

  const qrDetails = doc.querySelector('details.qr');
  assert.equal(qrDetails.open, false);
  assert.equal(qrDetails.querySelector('summary').textContent.trim(), 'Mostrar QR Code');
  const qr = qrDetails.querySelector('[role=img]');
  assert.equal(qr.getAttribute('aria-label'), 'QR Code do Pix');
  assert.equal(qr.querySelector('svg').getAttribute('aria-hidden'), 'true');
  assert.match(qrDetails.textContent, /Ou leia o QR Code com outro aparelho\./);

  assert.ok(before(code, steps), 'código antes dos passos');
  assert.ok(before(steps, qrDetails), 'passos antes do QR');
});

test('paying: dois [data-copy] com o mesmo valor e um único role=status para o aviso', async () => {
  const { doc, order } = await payingDoc();
  const buttons = [...doc.querySelectorAll('[data-copy]')];
  assert.equal(buttons.length, 2);
  for (const b of buttons) {
    assert.equal(b.dataset.copy, order().copiaECola);
    assert.equal(b.dataset.copied, 'Código copiado. Cole no app do seu banco.');
  }
  const statuses = doc.querySelectorAll('[role=status]');
  assert.equal(statuses.length, 1);
  assert.ok(doc.querySelector('.screen').contains(statuses[0]));
  assert.ok(buttons.every((b) => !b.contains(statuses[0])));
});

test('paying: barra com "Copiar código Pix"; status ao vivo; "Já paguei, atualizar" só sem JS', async () => {
  const { doc, location, order } = await payingDoc();
  const bar = doc.querySelector('.screen > .bar');
  const main = bar.querySelector('button.btn-primary[data-copy]');
  assert.equal(main.textContent.trim(), 'Copiar código Pix');
  assert.equal(main.getAttribute('type'), 'button');
  assert.equal(main.dataset.copy, order().copiaECola);
  assert.equal(bar.querySelectorAll('[data-copy]').length, 1);

  const live = doc.querySelector('[aria-live=polite]');
  assert.equal(live.textContent.trim(), 'Aguardando pagamento. Esta tela muda sozinha.');
  assert.ok(live.querySelector('.dot'));
  // jsdom roda sem scripts: o conteúdo de <noscript> vira HTML de verdade.
  // Na barra, para ela nunca ficar vazia sem JS (os botões de copiar somem).
  const refresh = [...bar.querySelectorAll('noscript a')].find((a) => a.textContent.trim() === 'Já paguei, atualizar');
  assert.equal(refresh.getAttribute('href'), location);
  assert.equal(doc.querySelectorAll('noscript a').length, 1);
  // Sem JS, [data-copy] fica escondido (estilo dentro de <noscript> no head).
  assert.match(doc.querySelector('head noscript style').textContent, /\[data-copy\]\{display:none\}/);
});

test('paying: data-status-url e data-expires-at na .screen', async () => {
  const { doc, location, order } = await payingDoc();
  const screen = doc.querySelector('.screen');
  assert.equal(screen.dataset.state, 'paying');
  assert.equal(screen.dataset.statusUrl, `${location}/status`);
  assert.equal(screen.dataset.expiresAt, String(order().expiresAt));
});

test('após markPaid: delivered centralizado; cartão "Seu código" com prazo e e-mail; resumo em lista; barra "Resgatar código" e ajuda', async () => {
  const ctx = setup();
  const { location, order } = await createOrder(ctx);
  ctx.provider.markPaid(lastTxid(order()));
  const doc = await dom(await ctx.app.request(location));
  assert.equal(doc.querySelector('.screen').dataset.state, 'delivered');
  assertResult(doc, 'Pagamento confirmado');
  assert.equal(doc.querySelector('.nav').textContent.trim(), 'Pagamento');
  const hero = doc.querySelector('.result-hero[data-tone=success]');
  assert.ok(hero);
  assert.equal(hero.querySelector('.sub').textContent.trim(), 'Falta um toque para ativar seu acesso.');
  const code = order().code.value;
  // Cartão do código: rótulo, código agrupado (soletrado para leitor de tela) e linha de prazo/e-mail.
  const out = doc.querySelector('main output.code');
  const card = out.closest('.card');
  assert.equal(doc.getElementById('code-label').textContent.trim(), 'Seu código');
  assert.ok(card.contains(doc.getElementById('code-label')));
  assert.equal(out.querySelector('[aria-hidden=true]').textContent, code.match(/.{1,6}/g).join(' '));
  assert.equal(doc.getElementById('code-spelled').textContent, code.split('').join(' '));
  assert.equal(card.querySelector('.note').textContent.trim(), 'Resgate até 16/05/2027 · enviado para m•••@email.com');
  const page = text(doc);
  assert.ok(!page.includes(EMAIL));
  // Resumo em lista: plano — valor; Pago em — data · Pix.
  const rows = [...doc.querySelectorAll('main dl.rows > div')].map((row) => [row.querySelector('dt').textContent.trim(), row.querySelector('dd').textContent.trim()]);
  assert.deepEqual(rows, [['Corridex Anual', 'R$ 99,90'], ['Pago em', '17/11/2026 · Pix']]);
  // Barra: resgate (link exato, ícone decorativo) e "O código não funcionou?".
  const b = bar(doc);
  const redeem = b.querySelector('a.btn-primary');
  assert.equal(redeem.textContent.trim(), 'Resgatar código');
  assert.equal(redeem.getAttribute('href'), `https://apps.apple.com/redeem?ctx=offercodes&id=6756681755&code=${code}`);
  assert.equal(redeem.querySelector('svg').getAttribute('aria-hidden'), 'true');
  const help = [...b.querySelectorAll('a')].find((a) => a.textContent.trim() === 'O código não funcionou?');
  assert.equal(help.getAttribute('href'), `${location}/ajuda`);
  assert.equal(doc.querySelectorAll('main a.btn').length, 0);
});

test('status JSON acompanha: paying → delivered', async () => {
  const ctx = setup();
  const { location, order } = await createOrder(ctx);
  let res = await ctx.app.request(`${location}/status`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'paying' });
  ctx.provider.markPaid(lastTxid(order()));
  res = await ctx.app.request(`${location}/status`);
  assert.deepEqual(await res.json(), { status: 'delivered' });
});

test('vencido: relógio, "Este Pix venceu", barra "Gerar novo Pix" posta para /renovar, sem campo de e-mail', async () => {
  const ctx = setup();
  const { location } = await createOrder(ctx);
  ctx.clock.set(T0 + 1801 * 1000);
  const doc = await dom(await ctx.app.request(location));
  const screen = doc.querySelector('.screen');
  assert.equal(screen.dataset.state, 'expired');
  assert.equal(screen.dataset.statusUrl, `${location}/status`);
  assertResult(doc, 'Este Pix venceu');
  assert.equal(doc.querySelector('.nav').textContent.trim(), 'Pagamento');
  assert.equal(doc.querySelector('.result-hero').dataset.tone, 'warning');
  assert.match(doc.querySelector('.result-hero .sub').textContent, /Gere outro, leva um segundo\./);
  assert.match(text(doc), /Se você já pagou, espere/);
  assert.match(doc.title, /Corridex Anual/);
  const form = doc.querySelector(`form[action="${location}/renovar"]`);
  assert.ok(form);
  assert.equal(form.getAttribute('method'), 'post');
  assert.equal(form.id, 'renovar');
  const button = bar(doc).querySelector('button[type=submit].btn-primary');
  assert.equal(button.textContent.trim(), 'Gerar novo Pix');
  assert.equal(button.getAttribute('form'), 'renovar');
  assert.equal(button.closest('form'), null);
  assert.equal(button.form, form);
  assert.equal(doc.querySelector('input[type=email]'), null);
});

test('renovar → 303 e volta a paying', async () => {
  const ctx = setup();
  const { location, order } = await createOrder(ctx);
  const firstTxid = lastTxid(order());
  ctx.clock.set(T0 + 1801 * 1000);
  await ctx.app.request(location); // vence
  const res = await post(ctx.app, `${location}/renovar`);
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), location);
  const doc = await dom(await ctx.app.request(location));
  assert.equal(doc.querySelector('.screen').dataset.state, 'paying');
  assert.notEqual(lastTxid(order()), firstTxid);
});

test('renovar um pedido ainda em pagamento só volta para ele', async () => {
  const ctx = setup();
  const { location } = await createOrder(ctx);
  const res = await post(ctx.app, `${location}/renovar`);
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), location);
});

test('renovar sem código disponível → escolha com aviso de estoque e e-mail', async () => {
  const ctx = setup();
  const { location } = await createOrder(ctx);
  ctx.clock.set(T0 + 1801 * 1000);
  await ctx.app.request(location); // vence e libera
  // Outro motorista leva todos os códigos do anual.
  for (let i = 0; i < 6; i++) ctx.stores.codes.reserve('annual', `outro${i}@email.com`, `h${i}`);
  const res = await post(ctx.app, `${location}/renovar`);
  assert.equal(res.status, 200);
  const doc = await dom(res);
  assert.equal(doc.querySelector('.screen').dataset.state, 'plan_out_of_stock');
  assert.match(text(doc), /O Anual está indisponível no Pix agora/);
  // Os outros planos são botões de POST /pix; o e-mail enviado é o do campo editável, nunca na URL.
  const card = doc.querySelector('ul.plans button.plan[value=monthly]');
  assert.equal(card.form.getAttribute('action'), '/pix');
  const emailControls = [...card.form.elements].filter((el) => el.name === 'email');
  assert.equal(emailControls.length, 1);
  assert.equal(emailControls[0], doc.querySelector('input[type=email]'));
  assert.notEqual(emailControls[0].type, 'hidden');
  assert.equal(emailControls[0].value, EMAIL);
  assertNoEmailInUrls(doc, 'renovar recusado');
});

test('pending: centralizado, "Seu código está a caminho", para onde vai e sem barra', async () => {
  const ctx = setup();
  const { location, order } = await createOrder(ctx);
  ctx.provider.markPaid(lastTxid(order()));
  // Sem código para entregar: a reserva sumiu e o estoque acabou.
  ctx.stores.codes.release(order().token);
  for (let i = 0; i < 6; i++) ctx.stores.codes.reserve('annual', `outro${i}@email.com`, `h${i}`);
  const doc = await dom(await ctx.app.request(location));
  assert.equal(doc.querySelector('.screen').dataset.state, 'pending');
  assertResult(doc, 'Pagamento confirmado');
  assert.equal(doc.querySelector('.nav').textContent.trim(), 'Pagamento');
  assert.ok(doc.querySelector('.result-hero[data-tone=success]'));
  assert.match(text(doc), /Seu código está a caminho/);
  assert.match(text(doc), /Ele chega por e-mail em algumas horas/);
  assert.doesNotMatch(text(doc), /2 horas/);
  assert.match(text(doc), /Enviaremos para m•••@email\.com\./);
  assert.equal(bar(doc), null);
});

test('e-mail inválido volta à escolha com mensagem ligada por aria-describedby', async () => {
  const ctx = setup();
  const res = await post(ctx.app, '/pix/pedidos', { plano: 'monthly', email: 'sem-arroba' });
  assert.equal(res.status, 200);
  const doc = await dom(res);
  assert.equal(doc.querySelector('.screen').dataset.state, 'choose');
  const input = doc.querySelector('input[type=email]');
  assert.equal(input.value, 'sem-arroba');
  assert.equal(input.getAttribute('aria-invalid'), 'true');
  const ids = input.getAttribute('aria-describedby').split(' ');
  const err = doc.getElementById(ids[0]);
  assert.equal(err.textContent, 'Confira o e-mail. Ele precisa ter @ e um domínio, como nome@email.com.');
  assert.equal(doc.querySelector('[role=radiogroup] input:checked').value, 'monthly');
});

test('token inexistente → 404 com página amigável; /status → 404 JSON', async () => {
  const ctx = setup();
  const res = await ctx.app.request('/pix/pedido/naoexiste');
  assert.equal(res.status, 404);
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(res.headers.get('x-robots-tag'), 'noindex');
  const doc = await dom(res);
  assertResult(doc, 'Pedido não encontrado');
  assert.ok(doc.querySelector('.nav .brand'));
  assert.ok(doc.querySelector('.result-hero[data-tone=info]'));
  assert.match(text(doc), /Confira o link do e-mail ou gere um novo Pix\./);
  const back = bar(doc).querySelector('a.btn-primary');
  assert.equal(back.getAttribute('href'), '/pix');
  assert.equal(back.textContent.trim(), 'Ver planos');
  const status = await ctx.app.request('/pix/pedido/naoexiste/status');
  assert.equal(status.status, 404);
  assert.deepEqual(await status.json(), { error: 'not_found' });
  const renew = await post(ctx.app, '/pix/pedido/naoexiste/renovar');
  assert.equal(renew.status, 404);
  // Cenário não cria pedido.
  assert.equal((await ctx.app.request('/pix/pedido/naoexiste?cenario=vencido')).status, 404);
});

test('recusas de estoque e e-mail do POST /pix/pedidos sem email= em links ou forms GET', async () => {
  const ctx = setup();
  for (let i = 0; i < 6; i++) ctx.stores.codes.reserve('monthly', `outro${i}@email.com`, `h${i}`);
  assertNoEmailInUrls(await dom(await post(ctx.app, '/pix/pedidos', { plano: 'monthly', email: EMAIL })), 'sem estoque');
  assertNoEmailInUrls(await dom(await post(ctx.app, '/pix/pedidos', { plano: 'annual', email: 'sem-arroba' })), 'e-mail inválido');
});

test('POST com plano sem estoque → escolha com aviso', async () => {
  const ctx = setup();
  for (let i = 0; i < 6; i++) ctx.stores.codes.reserve('monthly', `outro${i}@email.com`, `h${i}`);
  const res = await post(ctx.app, '/pix/pedidos', { plano: 'monthly', email: EMAIL });
  assert.equal(res.status, 200);
  const doc = await dom(res);
  assert.equal(doc.querySelector('.screen').dataset.state, 'plan_out_of_stock');
  assert.match(text(doc), /O Mensal está indisponível no Pix agora/);
});

test('POST para quem já recebeu os códigos do plano → aviso por e-mail', async () => {
  const ctx = setup();
  // O e-mail já recebeu as duas ofertas do monthly.
  ctx.stores.codes.claim('x1', 'monthly', EMAIL);
  ctx.stores.codes.claim('x2', 'monthly', EMAIL);
  const res = await post(ctx.app, '/pix/pedidos', { plano: 'monthly', email: EMAIL });
  assert.equal(res.status, 200);
  const doc = await dom(res);
  assert.equal(doc.querySelector('.screen').dataset.state, 'unavailable_for_customer');
  assert.match(text(doc), /Para este e-mail, o Mensal fica disponível em algumas horas/);
  assert.equal(doc.querySelector('input[type=email]').value, EMAIL);
});

test('POST com plano desconhecido ou ausente → escolha com o plano padrão', async () => {
  const ctx = setup();
  for (const fields of [{ plano: 'vitalicio', email: EMAIL }, { email: EMAIL }]) {
    const res = await post(ctx.app, '/pix/pedidos', fields);
    assert.equal(res.status, 200);
    const doc = await dom(res);
    assert.equal(doc.querySelector('.screen').dataset.state, 'choose');
    assert.equal(doc.querySelector('[role=radiogroup] input:checked').value, 'annual');
    assert.equal(doc.querySelector('input[type=email]').value, EMAIL);
  }
});

test('POST com venda pausada → tela de pausa, sem pedido', async () => {
  const ctx = setup({ config: { salesEnabled: false } });
  const res = await post(ctx.app, '/pix/pedidos', { plano: 'annual', email: EMAIL });
  assert.equal(res.status, 200);
  const doc = await dom(res);
  assert.equal(doc.querySelector('.screen').dataset.state, 'sales_paused');
  assertResult(doc, 'A venda por Pix está pausada');
  assert.equal(bar(doc), null);
});

test('pedido já pago continua visível com a venda pausada', async () => {
  const ctx = makeApp();
  ctx.clock.set(T0);
  const { location, order } = await createOrder(ctx);
  ctx.provider.markPaid(lastTxid(order()));
  const paused = makeApp({ config: { salesEnabled: false }, provider: ctx.provider, stores: ctx.stores });
  const doc = await dom(await paused.app.request(location));
  assert.equal(doc.querySelector('.screen').dataset.state, 'delivered');
});

test('Pix fora do ar ao criar → tela de erro 503', async () => {
  const ctx = setup({ provider: { createCharge: async () => { throw new Error('x'); }, getCharge: async () => null } });
  const res = await post(ctx.app, '/pix/pedidos', { plano: 'quarterly', email: EMAIL });
  assert.equal(res.status, 503);
  const doc = await dom(res);
  assert.equal(doc.querySelector('.screen').dataset.state, 'error');
  assertResult(doc, 'O Pix está indisponível agora');
  assert.ok(doc.querySelector('.result-hero[data-tone=error]'));
  assert.match(doc.title, /Corridex Trimestral/);
  const retry = bar(doc).querySelector('button.btn-primary');
  assert.equal(retry.textContent.trim(), 'Tentar de novo');
  assert.equal(retry.form.getAttribute('method'), 'post');
  assert.equal(retry.form.getAttribute('action'), '/pix');
  assert.equal(retry.form.querySelector('input[name=plano]').value, 'quarterly');
  assert.equal(retry.form.querySelector('input[name=email]').value, EMAIL);
  assertNoEmailInUrls(doc, 'fora do ar ao criar');
});

test('falha ao consultar o Pix → 503 (página e status), nunca 500', async () => {
  const ctx = setup();
  const { location } = await createOrder(ctx);
  ctx.provider.getCharge = async () => { throw new Error('fora'); };
  const res = await ctx.app.request(location);
  assert.equal(res.status, 503);
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(res.headers.get('x-robots-tag'), 'noindex');
  const doc = await dom(res);
  assert.equal(doc.querySelector('.screen').dataset.state, 'error');
  assertResult(doc, 'O Pix está indisponível agora');
  assert.equal(bar(doc).querySelector('a.btn-primary').getAttribute('href'), location);
  const status = await ctx.app.request(`${location}/status`);
  assert.equal(status.status, 503);
  assert.deepEqual(await status.json(), { error: 'unavailable' });
  ctx.clock.set(T0 + 1801 * 1000);
  assert.equal((await post(ctx.app, `${location}/renovar`)).status, 503);
});

test('cenários no pedido: vencido e pendente (só com ferramentas de simulação)', async () => {
  const ctx = setup();
  const { location } = await createOrder(ctx);
  let doc = await dom(await ctx.app.request(`${location}?cenario=vencido`));
  assert.equal(doc.querySelector('.screen').dataset.state, 'expired');
  assert.match(text(doc), /Este Pix venceu/);
  doc = await dom(await ctx.app.request(`${location}?cenario=pendente`));
  assert.equal(doc.querySelector('.screen').dataset.state, 'pending');
  assert.match(text(doc), /Seu código está a caminho/);

  const prod = setup({ config: { devTools: false } });
  const { location: loc2 } = await createOrder(prod);
  doc = await dom(await prod.app.request(`${loc2}?cenario=vencido`));
  assert.equal(doc.querySelector('.screen').dataset.state, 'paying');
});

test('páginas do pedido sem palavras proibidas', async () => {
  const ctx = setup();
  const { location, order } = await createOrder(ctx);
  const pages = [
    await ctx.app.request(location),
    await ctx.app.request(`${location}?cenario=vencido`),
    await ctx.app.request(`${location}?cenario=pendente`),
    await ctx.app.request('/pix/pedido/naoexiste'),
  ];
  ctx.provider.markPaid(lastTxid(order()));
  pages.push(await ctx.app.request(location));
  pages.push(await ctx.app.request(`${location}/ajuda`));
  for (const res of pages) {
    const body = text(await dom(res));
    for (const word of [/token/i, /oferta/i, /geração/i, /Apple ID/i, /webhook/i]) assert.doesNotMatch(body, word);
  }
});

// Todo texto visível das telas de resultado vem do copy (modelos com {x} aceitam qualquer valor);
// fora dele, só valores: código, preço.
const leaves = (o) => Object.values(o).flatMap((v) => (typeof v === 'string' ? [v] : leaves(v)));
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const templates = leaves(copy).map((tpl) => new RegExp(`^${tpl.split(/\{[^{}]+\}/).map(escapeRe).join('.+')}$`));
const isValue = (s) => /^R\$ [\d.,]+$/.test(s) || /^[A-Z0-9]+( [A-Z0-9]+)*$/.test(s);

test('telas de resultado: todo texto visível vem do copy', async () => {
  const ctx = setup();
  const { location, order } = await createOrder(ctx);
  const urls = [`${location}?cenario=vencido`, `${location}?cenario=pendente`, '/pix/pedido/naoexiste', '/pix?cenario=pausado', '/pix?cenario=fora-do-ar'];
  const docs = [];
  for (const url of urls) docs.push(await dom(await ctx.app.request(url)));
  ctx.provider.markPaid(lastTxid(order()));
  docs.push(await dom(await ctx.app.request(location)), await dom(await ctx.app.request(`${location}/ajuda`)));
  for (const doc of docs) {
    for (const root of doc.querySelectorAll('.screen > .nav, .screen > main, .screen > .bar')) {
      const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const s = n.textContent.replace(/\s+/g, ' ').trim();
        if (!s) continue;
        assert.ok(templates.some((re) => re.test(s)) || isValue(s), `texto fora do copy: "${s}" (${doc.querySelector('.screen').dataset.state})`);
      }
    }
  }
});

test('e-mail inválido com sessão de teste grátis mantém o link do teste (pelo cookie)', async () => {
  const ctx = setup();
  const headers = await trialHeaders(ctx.app);
  const res = await post(ctx.app, '/pix/pedidos', { plano: 'annual', email: 'sem-arroba' }, headers);
  assert.equal(res.status, 200);
  const doc = await dom(res);
  const link = doc.querySelector('a[href^="/pix/teste"]');
  assert.ok(link);
  assert.equal(link.getAttribute('href'), '/pix/teste');
  assert.equal(trialInputs(doc).length, 0);
  const plain = await dom(await post(ctx.app, '/pix/pedidos', { plano: 'annual', email: 'sem-arroba' }));
  assert.equal(plain.querySelector('a[href^="/pix/teste"]'), null);
});

test('renovar sem provedor configurado → venda pausada, sem erro', async () => {
  const ctx = setup({ provider: null });
  const res = await post(ctx.app, '/pix/pedido/qualquer/renovar');
  assert.equal(res.status, 200);
  assert.equal((await dom(res)).querySelector('.screen').dataset.state, 'sales_paused');
});

// Corpo multipart com boundary quebrado: parseBody lança; a rota não pode dar 500.
const badMultipart = (app, path) => app.request(path, {
  method: 'POST',
  headers: { 'content-type': 'multipart/form-data; boundary=quebrado' },
  body: 'isto não é multipart',
});

test('POST /pix/pedidos com multipart malformado → escolha, nunca 500', async () => {
  const ctx = setup();
  const res = await badMultipart(ctx.app, '/pix/pedidos');
  assert.notEqual(res.status, 500);
  assert.equal(res.status, 200);
  assert.equal((await dom(res)).querySelector('.screen').dataset.state, 'choose');
});

test('erro inesperado → tela "Pix indisponível" 503 (onError), com log', async (t) => {
  const errors = t.mock.method(console, 'error', () => {});
  const ctx = setup();
  ctx.stores.codes.availability = () => { throw new Error('quebrou'); };
  const res = await ctx.app.request('/pix');
  assert.equal(res.status, 503);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const doc = await dom(res);
  assert.equal(doc.querySelector('.screen').dataset.state, 'error');
  assert.match(text(doc), /O Pix está indisponível agora/);
  assert.equal(errors.mock.callCount(), 1);
});

const nonceOf = (doc) => doc.querySelector('form[action="/pix/pedidos"] input[type=hidden][name=nonce]')?.value;

test('formulário de escolha traz nonce aleatório (16 bytes base64url)', async () => {
  const ctx = setup();
  const a = nonceOf(await dom(await ctx.app.request('/pix')));
  const b = nonceOf(await dom(await ctx.app.request('/pix')));
  assert.match(a, /^[A-Za-z0-9_-]{22}$/);
  assert.notEqual(a, b);
});

test('duplo envio com o mesmo nonce → mesmo pedido; outro nonce nunca leva ao pedido de outra pessoa', async () => {
  const ctx = setup();
  const first = await createOrder(ctx, { plano: 'annual', email: EMAIL, nonce: 'form-1' });
  const again = await createOrder(ctx, { plano: 'annual', email: EMAIL, nonce: 'form-1' });
  assert.equal(again.location, first.location);
  for (const nonce of [undefined, '', 'form-do-atacante']) {
    const fields = { plano: 'annual', email: EMAIL };
    if (nonce !== undefined) fields.nonce = nonce;
    const res = await post(ctx.app, '/pix/pedidos', fields);
    assert.notEqual(res.headers.get('location'), first.location, String(nonce));
  }
});

test('escolha reexibida após recusa mantém o nonce enviado', async () => {
  const ctx = setup();
  const doc = await dom(await post(ctx.app, '/pix/pedidos', { plano: 'annual', email: 'sem-arroba', nonce: 'meu-nonce' }));
  assert.equal(nonceOf(doc), 'meu-nonce');
  const unknown = await dom(await post(ctx.app, '/pix/pedidos', { plano: 'vitalicio', email: EMAIL, nonce: 'meu-nonce' }));
  assert.equal(nonceOf(unknown), 'meu-nonce');
});

test('aviso com campo de e-mail tem botão "Usar este e-mail" e mantém o teste grátis', async () => {
  const ctx = setup();
  const headers = await trialHeaders(ctx.app);
  for (const q of ['indisponivel-email', 'sem-estoque']) {
    const doc = await dom(await post(ctx.app, `/pix?cenario=${q}`, { plano: 'monthly', email: 'm@email.com' }, headers));
    const form = doc.querySelector('input[type=email]').form;
    assert.equal(form.getAttribute('method'), 'post', q);
    assert.equal(form.getAttribute('action'), '/pix', q);
    const button = [...doc.querySelectorAll('button[type=submit]')].find((b) => b.textContent.trim() === 'Usar este e-mail');
    assert.equal(button.form, form, q);
    assert.equal(button.name, 'plano', q);
    assert.equal(button.value, 'monthly', q);
    assert.equal(button.textContent.trim(), 'Usar este e-mail', q);
    assert.ok(button.classList.contains('btn-secondary'), q);
    assert.equal(trialInputs(doc).length, 0, q);
    assert.equal(doc.querySelector('a[href="/pix/teste"]').closest('.bar'), null, q);
  }
});

test('rota inexistente → tela amigável 404 com barra de simulação', async () => {
  const ctx = setup();
  const res = await ctx.app.request('/pix/nada');
  assert.equal(res.status, 404);
  const doc = await dom(res);
  assert.equal(doc.querySelector('.screen').dataset.state, 'not_found');
  assert.match(doc.body.textContent, /Simulação/);
});

test('páginas HTML levam Content-Security-Policy; JSON não', async () => {
  const ctx = setup();
  const res = await ctx.app.request('/pix');
  assert.equal(
    res.headers.get('content-security-policy'),
    "default-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  );
  // O script do cliente é do mesmo domínio (permitido por default-src 'self') e não há script inline.
  const doc = await dom(res);
  const scripts = [...doc.querySelectorAll('script')];
  assert.ok(scripts.length > 0);
  for (const s of scripts) {
    assert.match(s.getAttribute('src') ?? '', /^\/pix\//);
    assert.equal(s.textContent.trim(), '');
  }
  assert.equal((await ctx.app.request('/pix/health')).headers.get('content-security-policy'), null);
});
