import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, dom } from './test/helpers.js';

const T0 = Date.UTC(2026, 10, 17, 15, 0, 0); // 17/11/2026 12:00 em Brasília
const EMAIL = 'motorista@email.com';
const text = (doc) => doc.body.textContent.replace(/\s+/g, ' ');

function setup(overrides) {
  const ctx = makeApp(overrides);
  ctx.clock.set(T0);
  return ctx;
}

const post = (app, path, fields = {}) => app.request(path, { method: 'POST', body: new URLSearchParams(fields) });

async function createOrder(ctx, fields = { plano: 'anual', email: EMAIL }) {
  const res = await post(ctx.app, '/pix/pedidos', fields);
  assert.equal(res.status, 303);
  const location = res.headers.get('location');
  const token = location.split('/').pop();
  return { location, token, order: () => ctx.stores.orders.get(token) };
}

const lastTxid = (order) => order.txids.at(-1);

test('POST válido → 303 para /pix/pedido/<token>', async () => {
  const ctx = setup();
  const { location, token } = await createOrder(ctx);
  assert.match(location, /^\/pix\/pedido\/[A-Za-z0-9_-]{16,}$/);
  assert.equal(ctx.stores.orders.get(token).status, 'paying');
});

test('paying: botão "Copiar código Pix" antes do QR, SVG com aria-label, "Aguardando pagamento…" em aria-live=polite, "Vale até"', async () => {
  const ctx = setup();
  const { location, order } = await createOrder(ctx);
  const res = await ctx.app.request(location);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const doc = await dom(res);
  assert.equal(doc.querySelector('h1').textContent, 'Pague R$ 99,90 com Pix');
  const button = doc.querySelector('button[data-copy]');
  assert.equal(button.textContent.trim(), 'Copiar código Pix');
  assert.equal(button.dataset.copy, order().copiaECola);
  assert.equal(doc.querySelector('textarea[readonly]').value, order().copiaECola);
  const qr = doc.querySelector('.qr[role=img]');
  assert.equal(qr.getAttribute('aria-label'), 'QR Code do Pix');
  const svg = qr.querySelector('svg');
  assert.ok(svg);
  assert.equal(svg.getAttribute('aria-hidden'), 'true');
  assert.ok(button.compareDocumentPosition(qr) & doc.defaultView.Node.DOCUMENT_POSITION_FOLLOWING);
  const live = doc.querySelector('[aria-live=polite]');
  assert.match(live.textContent, /Aguardando pagamento…/);
  // 30 min de validade a partir das 12:00 de Brasília.
  assert.match(text(doc), /Vale até 12:30 \(30 min\)/);
  const refresh = [...doc.querySelectorAll('a')].find((a) => a.textContent.trim() === 'Já paguei, atualizar');
  assert.equal(refresh.getAttribute('href'), location);
});

test('paying: data-status-url e data-expires-at na .screen', async () => {
  const ctx = setup();
  const { location, order } = await createOrder(ctx);
  const main = (await dom(await ctx.app.request(location))).querySelector('.screen');
  assert.equal(main.dataset.state, 'paying');
  assert.equal(main.dataset.statusUrl, `${location}/status`);
  assert.equal(main.dataset.expiresAt, String(order().expiresAt));
});

test('após markPaid: delivered com "Resgatar código" → href apps.apple.com/redeem?ctx=offercodes&id=6756681755&code=…, código agrupado, e-mail mascarado, "Resgate até 16/05/2027"', async () => {
  const ctx = setup();
  const { location, order } = await createOrder(ctx);
  ctx.provider.markPaid(lastTxid(order()));
  const doc = await dom(await ctx.app.request(location));
  assert.equal(doc.querySelector('.screen').dataset.state, 'delivered');
  assert.equal(doc.querySelector('h1').textContent, 'Pagamento confirmado');
  assert.ok(doc.querySelector('.hero-ic[data-tone=success]'));
  const code = order().code.value;
  const redeem = [...doc.querySelectorAll('a')].find((a) => a.textContent.trim() === 'Resgatar código');
  assert.equal(redeem.getAttribute('href'), `https://apps.apple.com/redeem?ctx=offercodes&id=6756681755&code=${code}`);
  assert.match(doc.querySelector('output.code').textContent, new RegExp(code.match(/.{1,6}/g).join(' ')));
  const page = text(doc);
  assert.match(page, /m•••@email\.com/);
  assert.match(page, /Resgate até 16\/05\/2027/);
  assert.ok(!page.includes(EMAIL));
  // Resumo do pedido.
  assert.match(page, /Seu pedido/);
  assert.match(page, /Corridex Anual/);
  assert.match(page, /R\$ 99,90/);
  assert.match(page, /Pago em 17\/11\/2026 por Pix/);
  assert.ok(page.includes('O código não funcionou?'));
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

test('vencido: "Este Pix venceu", form renovar, sem campo de e-mail', async () => {
  const ctx = setup();
  const { location } = await createOrder(ctx);
  ctx.clock.set(T0 + 1801 * 1000);
  const doc = await dom(await ctx.app.request(location));
  assert.equal(doc.querySelector('.screen').dataset.state, 'expired');
  assert.equal(doc.querySelector('h1').textContent, 'Corridex Anual');
  assert.match(text(doc), /Este Pix venceu/);
  assert.match(text(doc), /Se você já pagou, espere/);
  assert.equal(doc.querySelector('.hero-ic'), null); // só o ícone do aviso
  const form = doc.querySelector(`form[action="${location}/renovar"]`);
  assert.ok(form);
  assert.equal(form.getAttribute('method'), 'post');
  assert.equal(form.querySelector('button').textContent.trim(), 'Gerar novo Pix');
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
  for (let i = 0; i < 6; i++) ctx.stores.codes.reserve('anual', `outro${i}@email.com`, `h${i}`);
  const res = await post(ctx.app, `${location}/renovar`);
  assert.equal(res.status, 200);
  const doc = await dom(res);
  assert.equal(doc.querySelector('.screen').dataset.state, 'plan_out_of_stock');
  assert.match(text(doc), /O Anual está indisponível no Pix agora/);
  assert.ok([...doc.querySelectorAll('a')].some((a) => a.getAttribute('href').includes(`email=${encodeURIComponent(EMAIL)}`)));
  assert.equal(doc.querySelector('input[type=email]').value, EMAIL);
});

test('pending: "Seu código está a caminho"', async () => {
  const ctx = setup();
  const { location, order } = await createOrder(ctx);
  ctx.provider.markPaid(lastTxid(order()));
  // Sem código para entregar: a reserva sumiu e o estoque acabou.
  ctx.stores.codes.release(order().token);
  for (let i = 0; i < 6; i++) ctx.stores.codes.reserve('anual', `outro${i}@email.com`, `h${i}`);
  const doc = await dom(await ctx.app.request(location));
  assert.equal(doc.querySelector('.screen').dataset.state, 'pending');
  assert.equal(doc.querySelector('h1').textContent, 'Pagamento confirmado');
  assert.match(text(doc), /Seu código está a caminho/);
  assert.match(text(doc), /Enviaremos para m•••@email\.com\./);
});

test('e-mail inválido volta à escolha com mensagem ligada por aria-describedby', async () => {
  const ctx = setup();
  const res = await post(ctx.app, '/pix/pedidos', { plano: 'mensal', email: 'sem-arroba' });
  assert.equal(res.status, 200);
  const doc = await dom(res);
  assert.equal(doc.querySelector('.screen').dataset.state, 'choose');
  const input = doc.querySelector('input[type=email]');
  assert.equal(input.value, 'sem-arroba');
  assert.equal(input.getAttribute('aria-invalid'), 'true');
  const ids = input.getAttribute('aria-describedby').split(' ');
  const err = doc.getElementById(ids[0]);
  assert.equal(err.textContent, 'Confira o e-mail. Ele precisa ter @ e um domínio, como nome@email.com.');
  assert.equal(doc.querySelector('[role=radiogroup] input:checked').value, 'mensal');
});

test('token inexistente → 404 com página amigável; /status → 404 JSON', async () => {
  const ctx = setup();
  const res = await ctx.app.request('/pix/pedido/naoexiste');
  assert.equal(res.status, 404);
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(res.headers.get('x-robots-tag'), 'noindex');
  const doc = await dom(res);
  assert.equal(doc.querySelector('h1').textContent, 'Pedido não encontrado');
  assert.match(text(doc), /Confira o link do e-mail ou gere um novo Pix\./);
  const back = doc.querySelector('main a.btn-primary');
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

test('POST com plano sem estoque → escolha com aviso', async () => {
  const ctx = setup();
  for (let i = 0; i < 6; i++) ctx.stores.codes.reserve('mensal', `outro${i}@email.com`, `h${i}`);
  const res = await post(ctx.app, '/pix/pedidos', { plano: 'mensal', email: EMAIL });
  assert.equal(res.status, 200);
  const doc = await dom(res);
  assert.equal(doc.querySelector('.screen').dataset.state, 'plan_out_of_stock');
  assert.match(text(doc), /O Mensal está indisponível no Pix agora/);
});

test('POST para quem já recebeu os códigos do plano → aviso por e-mail', async () => {
  const ctx = setup();
  // O e-mail já recebeu as duas ofertas do mensal.
  ctx.stores.codes.claim('x1', 'mensal', EMAIL);
  ctx.stores.codes.claim('x2', 'mensal', EMAIL);
  const res = await post(ctx.app, '/pix/pedidos', { plano: 'mensal', email: EMAIL });
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
    assert.equal(doc.querySelector('[role=radiogroup] input:checked').value, 'anual');
    assert.equal(doc.querySelector('input[type=email]').value, EMAIL);
  }
});

test('POST com venda pausada → tela de pausa, sem pedido', async () => {
  const ctx = setup({ config: { salesEnabled: false } });
  const res = await post(ctx.app, '/pix/pedidos', { plano: 'anual', email: EMAIL });
  assert.equal(res.status, 200);
  assert.equal((await dom(res)).querySelector('.screen').dataset.state, 'sales_paused');
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
  const res = await post(ctx.app, '/pix/pedidos', { plano: 'trimestral', email: EMAIL });
  assert.equal(res.status, 503);
  const doc = await dom(res);
  assert.equal(doc.querySelector('.screen').dataset.state, 'error');
  assert.equal(doc.querySelector('h1').textContent, 'Corridex Trimestral');
  assert.match(text(doc), /O Pix está indisponível agora/);
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
  assert.equal(doc.querySelector('h1').textContent, 'Corridex Anual');
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
  for (const res of pages) {
    const body = text(await dom(res));
    for (const word of [/token/i, /oferta/i, /geração/i, /Apple ID/i, /webhook/i]) assert.doesNotMatch(body, word);
  }
});

test('e-mail inválido com sessão de teste grátis mantém o link do teste', async () => {
  const ctx = setup();
  const res = await post(ctx.app, '/pix/pedidos', {
    plano: 'anual', email: 'sem-arroba', teste: '1', dc_ler: 'a b', dc_marcar: 'x&y',
  });
  assert.equal(res.status, 200);
  const doc = await dom(res);
  const link = doc.querySelector('a[href^="/pix/teste"]');
  assert.ok(link);
  assert.equal(link.getAttribute('href'), '/pix/teste?teste=1&dc_ler=a%20b&dc_marcar=x%26y');
  // E os campos ocultos continuam no formulário para o próximo envio.
  const form = doc.querySelector('form[action="/pix/pedidos"]');
  assert.equal(form.querySelector('input[name=dc_ler]').value, 'a b');
  assert.equal(form.querySelector('input[name=dc_marcar]').value, 'x&y');
  assert.equal(form.querySelector('input[name=teste]').value, '1');
});

test('escolha via GET com sessão de teste leva os campos ocultos no formulário', async () => {
  const doc = await dom(await setup().app.request('/pix?teste=1&dc_ler=abc&dc_marcar=def'));
  const form = doc.querySelector('form[action="/pix/pedidos"]');
  assert.equal(form.querySelector('input[name=dc_ler]').value, 'abc');
  assert.equal(form.querySelector('input[name=dc_marcar]').value, 'def');
  const plain = await dom(await setup().app.request('/pix'));
  assert.equal(plain.querySelector('form[action="/pix/pedidos"] input[name=dc_ler]'), null);
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
  const first = await createOrder(ctx, { plano: 'anual', email: EMAIL, nonce: 'form-1' });
  const again = await createOrder(ctx, { plano: 'anual', email: EMAIL, nonce: 'form-1' });
  assert.equal(again.location, first.location);
  for (const nonce of [undefined, '', 'form-do-atacante']) {
    const fields = { plano: 'anual', email: EMAIL };
    if (nonce !== undefined) fields.nonce = nonce;
    const res = await post(ctx.app, '/pix/pedidos', fields);
    assert.notEqual(res.headers.get('location'), first.location, String(nonce));
  }
});

test('escolha reexibida após recusa mantém o nonce enviado', async () => {
  const ctx = setup();
  const doc = await dom(await post(ctx.app, '/pix/pedidos', { plano: 'anual', email: 'sem-arroba', nonce: 'meu-nonce' }));
  assert.equal(nonceOf(doc), 'meu-nonce');
  const unknown = await dom(await post(ctx.app, '/pix/pedidos', { plano: 'vitalicio', email: EMAIL, nonce: 'meu-nonce' }));
  assert.equal(nonceOf(unknown), 'meu-nonce');
});

test('aviso com campo de e-mail tem botão "Usar este e-mail" e mantém o teste grátis', async () => {
  const ctx = setup();
  const trial = 'teste=1&dc_ler=LER1&dc_marcar=MAR1';
  for (const q of [`cenario=indisponivel-email&plano=mensal&${trial}`, `cenario=sem-estoque&plano=mensal&email=m%40email.com&${trial}`]) {
    const doc = await dom(await ctx.app.request(`/pix?${q}`));
    const form = doc.querySelector('input[name=email]').form;
    assert.equal(form.getAttribute('method'), 'get', q);
    const button = form.querySelector('button[type=submit]');
    assert.equal(button.textContent.trim(), 'Usar este e-mail', q);
    assert.ok(button.classList.contains('btn-secondary'), q);
    assert.equal(form.querySelector('input[name=teste]').value, '1', q);
    assert.equal(form.querySelector('input[name=dc_ler]').value, 'LER1', q);
    assert.equal(form.querySelector('input[name=dc_marcar]').value, 'MAR1', q);
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
