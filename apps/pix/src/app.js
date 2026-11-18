import { Hono } from 'hono';
import { html } from 'hono/html';
import { PLANS, DEFAULT_PLAN_ID } from './plans.js';
import { copy, t, dev } from './page/copy.pt-BR.js';
import { devBarView, page } from './page/layout.js';
import { renderSVG } from 'uqr';
import { createOrderService, normalizeEmail, randomId } from './orders.js';
import {
  chooseScreen, pausedScreen, errorScreen, choosePath, orderPath,
  payingScreen, deliveredScreen, pendingScreen, expiredScreen, notFoundScreen, helpScreen,
  trialRequestScreen, trialUsedScreen, trialDeliveredScreen, trialStockScreen,
} from './page/screens.js';

// Tamanho máximo de um endereço de e-mail (RFC 5321); corta o ?email= pré-preenchido.
const MAX_EMAIL = 254;
// Validade de cada Pix (30 min).
const PIX_TTL_SECONDS = 1800;
// Nonce do formulário: 22 caracteres; folga para não cortar um válido.
const MAX_NONCE = 64;
// Só recursos do próprio domínio; CSS inline (o layout embute o estilo) e SVG inline.
const CSP = "default-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

// Corpo do formulário; corpo malformado (ex.: multipart sem boundary válido) vira formulário vazio.
async function readForm(c) {
  try {
    return await c.req.parseBody();
  } catch {
    return {};
  }
}

// Campo de texto do formulário, aparado e cortado em `max`; ausente ou arquivo → ''.
const formString = (form, key, max) => (typeof form[key] === 'string' ? form[key].trim().slice(0, max) : '');

// Tudo vive sob /pix: o site (corridex.app) faz rewrite de /pix/* para este app,
// então o mesmo caminho funciona no Cloudflare Workers hoje e na Vercel depois.
// Não use APIs exclusivas da Cloudflare aqui (D1, KV, bindings): este arquivo
// precisa rodar igual nas duas plataformas.
export function createApp({ config, provider, stores, plans = PLANS, now = Date.now }) {
  const app = new Hono().basePath('/pix');

  // Cabeçalhos das páginas HTML (o JSON de /health e /status fica como está).
  app.use('*', async (c, next) => {
    await next();
    if ((c.res.headers.get('content-type') ?? '').startsWith('text/html')) {
      c.res.headers.set('Cache-Control', 'no-store');
      c.res.headers.set('Referrer-Policy', 'no-referrer');
      c.res.headers.set('X-Robots-Tag', 'noindex');
      c.res.headers.set('Content-Security-Policy', CSP);
    }
  });

  // ?cenario= só vale com as ferramentas de simulação ligadas.
  const scenario = (c) => (config.devTools ? c.req.query('cenario') || null : null);
  // Barra de simulação: só com devTools. `orderToken` põe os links de cenário do
  // pedido; `payToken` o botão "Simular pagamento".
  const devBarFor = (c, { orderToken, payToken } = {}) => {
    if (!config.devTools) return undefined;
    return devBarView({
      payAction: payToken ? `/pix/dev/pedido/${payToken}/pagar` : undefined,
      links: orderToken
        ? ['vencido', 'pendente'].map((n) => ({ label: n, href: `${orderPath(orderToken)}?cenario=${n}` }))
        : [],
    });
  };
  const salesPaused = () => !config.salesEnabled || !provider || !stores;
  const planIds = () => Object.keys(plans);

  // Próximo plano disponível: monthly → quarterly → annual → monthly.
  function nextPlanId(fromId, unavailable) {
    const ids = planIds();
    const start = ids.indexOf(fromId);
    for (let i = 1; i < ids.length; i++) {
      const id = ids[(start + i) % ids.length];
      if (!unavailable.includes(id)) return id;
    }
    return null;
  }

  // Sessão do teste grátis: só quando o app manda teste=1 e os dois tokens.
  // `read(nome)` lê da query (GET) ou do formulário (POST, campos ocultos).
  function trialSession(read) {
    const str = (v) => (typeof v === 'string' ? v : '');
    const dcLer = str(read('dc_ler'));
    const dcMarcar = str(read('dc_marcar'));
    if (str(read('teste')) !== '1' || !dcLer || !dcMarcar) return null;
    return { dcLer, dcMarcar };
  }
  // Query da sessão do teste (encodeURIComponent: espaço vira %20, como o app manda).
  const trialQuery = (trial) => `teste=1&dc_ler=${encodeURIComponent(trial.dcLer)}&dc_marcar=${encodeURIComponent(trial.dcMarcar)}`;
  const trialHref = (trial) => (trial ? `/pix/teste?${trialQuery(trial)}` : null);
  // "Voltar aos planos" do teste: a escolha com a mesma sessão.
  const trialBackHref = (trial) => `/pix?${trialQuery(trial)}`;

  app.get('/health', (c) => c.json({ ok: true }));

  // Tela de escolha. `outOfStock` marca o plano como sem estoque (cenário ou pedido
  // recusado); `customerUnavailable`, indisponível para este e-mail.
  // `nonce`: o do formulário enviado (recusa reexibida) ou um novo.
  function chooseView(c, { selectedPlanId, email = '', outOfStock, customerUnavailable, emailError, trial, nonce }) {
    const session = trial === undefined ? trialSession((k) => c.req.query(k)) : trial;
    const selected = plans[selectedPlanId];
    // Disponibilidade geral; a checagem por e-mail acontece no POST.
    const unavailablePlanIds = planIds().filter((id) => stores.codes.availability(id, '') === 'out_of_stock');
    if (outOfStock && !unavailablePlanIds.includes(selectedPlanId)) unavailablePlanIds.push(selectedPlanId);

    let notice;
    let state = 'choose';
    const seeNext = () => {
      const next = nextPlanId(selectedPlanId, unavailablePlanIds);
      return next ? { label: t(copy.seeOther, { plano: plans[next].name }), href: choosePath(next, email) } : undefined;
    };
    if (unavailablePlanIds.includes(selectedPlanId)) {
      state = 'plan_out_of_stock';
      notice = { tone: 'warning', title: t(copy.stock.title, { plano: selected.name }), body: copy.stock.body, action: seeNext() };
    } else if (customerUnavailable) {
      state = 'unavailable_for_customer';
      notice = {
        tone: 'warning',
        title: t(copy.customer.unavailable, { plano: selected.name }),
        body: copy.customer.unavailableBody,
        action: seeNext(),
      };
    }

    return c.html(chooseScreen({
      devBar: devBarFor(c),
      plans, selectedPlanId, email, notice, unavailablePlanIds, trialHref: trialHref(session), trialSession: session, state, emailError,
      nonce: nonce || randomId(),
    }));
  }

  const validPlanId = (id) => (id && Object.hasOwn(plans, id) ? id : DEFAULT_PLAN_ID);

  app.get('/', (c) => {
    const cenario = scenario(c);
    if (salesPaused() || cenario === 'pausado') return c.html(pausedScreen({ devBar: devBarFor(c) }));

    const selectedPlanId = validPlanId(c.req.query('plano'));
    const email = (c.req.query('email') ?? '').slice(0, MAX_EMAIL);

    if (cenario === 'fora-do-ar') {
      return c.html(errorScreen({ devBar: devBarFor(c), planName: plans[selectedPlanId].name, retryHref: choosePath(selectedPlanId, email) }));
    }
    return chooseView(c, {
      selectedPlanId, email, outOfStock: cenario === 'sem-estoque', customerUnavailable: cenario === 'indisponivel-email',
    });
  });

  // Pedidos: só com provedor e lojas. A venda pausada bloqueia novas cobranças,
  // mas quem já pagou continua vendo o pedido.
  const orders = provider && stores
    ? createOrderService({ provider, stores, plans, now, pixTtlSeconds: PIX_TTL_SECONDS })
    : null;

  // Recusa do serviço → tela. Estoque e e-mail voltam à escolha com o aviso.
  function refusal(c, reason, { planId, email, trial = null, nonce }) {
    const base = { selectedPlanId: planId, email, trial, nonce };
    if (reason === 'invalid_email') return chooseView(c, { ...base, emailError: true });
    if (reason === 'plan_out_of_stock') return chooseView(c, { ...base, outOfStock: true });
    if (reason === 'unavailable_for_customer') return chooseView(c, { ...base, customerUnavailable: true });
    if (reason === 'invalid_plan') return chooseView(c, { ...base, selectedPlanId: DEFAULT_PLAN_ID });
    return c.html(errorScreen({ devBar: devBarFor(c), planName: plans[planId].name, retryHref: choosePath(planId, email) }), 503);
  }

  app.post('/pedidos', async (c) => {
    if (salesPaused()) return c.html(pausedScreen({ devBar: devBarFor(c) }));
    const form = await readForm(c);
    const rawPlan = formString(form, 'plano', 32);
    const email = formString(form, 'email', MAX_EMAIL);
    const nonce = formString(form, 'nonce', MAX_NONCE);
    const trial = trialSession((k) => form[k]);
    if (!Object.hasOwn(plans, rawPlan)) return chooseView(c, { selectedPlanId: DEFAULT_PLAN_ID, email, trial, nonce });

    let result;
    try {
      result = await orders.create({ planId: rawPlan, email, nonce });
    } catch {
      result = { ok: false, reason: 'pix_unavailable' };
    }
    if (!result.ok) return refusal(c, result.reason, { planId: rawPlan, email, trial, nonce });
    return c.redirect(orderPath(result.order.token), 303);
  });

  const notFound = (c) => c.html(notFoundScreen({ devBar: devBarFor(c) }), 404);
  // Erro do provedor ao consultar um pedido: tela "Pix indisponível", tentar de novo na mesma página.
  const orderError = (c, token) => {
    const planId = validPlanId(stores?.orders.get(token)?.planId);
    return c.html(errorScreen({ devBar: devBarFor(c), planName: plans[planId].name, retryHref: orderPath(token) }), 503);
  };

  app.get('/pedido/:token', async (c) => {
    if (!orders) return c.html(pausedScreen({ devBar: devBarFor(c) }));
    const token = c.req.param('token');
    let order;
    try {
      order = await orders.get(token);
    } catch {
      return orderError(c, token);
    }
    if (!order) return notFound(c);
    const plan = plans[order.planId];

    const cenario = scenario(c);
    if (cenario === 'vencido') return c.html(expiredScreen({ devBar: devBarFor(c, { orderToken: token }), order, plan }));
    if (cenario === 'pendente') return c.html(pendingScreen({ devBar: devBarFor(c, { orderToken: token }), order }));

    switch (order.status) {
      case 'delivered':
        return c.html(deliveredScreen({ devBar: devBarFor(c, { orderToken: token }), order, plan, appStoreId: config.appStoreId }));
      case 'pending':
        return c.html(pendingScreen({ devBar: devBarFor(c, { orderToken: token }), order }));
      case 'expired':
        return c.html(expiredScreen({ devBar: devBarFor(c, { orderToken: token }), order, plan }));
      default: {
        // SVG do QR é decorativo para leitor de tela: o rótulo fica no contêiner role=img.
        const qrSvg = renderSVG(order.copiaECola, { border: 2 }).replace('<svg ', '<svg aria-hidden="true" focusable="false" ');
        return c.html(payingScreen({ devBar: devBarFor(c, { orderToken: token, payToken: token }), order, plan, qrSvg, nowMs: now() }));
      }
    }
  });

  app.get('/pedido/:token/ajuda', async (c) => {
    if (!orders) return c.html(pausedScreen({ devBar: devBarFor(c) }));
    const token = c.req.param('token');
    let order;
    try {
      order = await orders.get(token);
    } catch {
      return orderError(c, token);
    }
    if (!order) return notFound(c);
    return c.html(helpScreen({ devBar: devBarFor(c), supportUrl: config.supportUrl, backHref: orderPath(token) }));
  });

  app.get('/pedido/:token/status', async (c) => {
    c.header('Cache-Control', 'no-store');
    if (!orders) return c.json({ error: 'unavailable' }, 503);
    let order;
    try {
      order = await orders.get(c.req.param('token'));
    } catch {
      return c.json({ error: 'unavailable' }, 503);
    }
    if (!order) return c.json({ error: 'not_found' }, 404);
    return c.json({ status: order.status });
  });

  app.post('/pedido/:token/renovar', async (c) => {
    if (salesPaused() || !orders) return c.html(pausedScreen({ devBar: devBarFor(c) }));
    const token = c.req.param('token');
    let result;
    try {
      result = await orders.renew(token);
    } catch {
      return orderError(c, token);
    }
    if (result.ok || result.reason === 'not_expired') return c.redirect(orderPath(token), 303);
    if (result.reason === 'not_found') return notFound(c);
    if (result.reason === 'pix_unavailable') return orderError(c, token);
    const order = stores.orders.get(token);
    return refusal(c, result.reason, { planId: order.planId, email: order.email });
  });

  // Teste grátis: não depende do Pix, só das lojas. A chave do aparelho é o dc_ler.
  app.get('/teste', (c) => {
    if (!stores || !config.salesEnabled) return c.html(pausedScreen({ devBar: devBarFor(c) }));
    const session = trialSession((k) => c.req.query(k));
    if (!session || scenario(c) === 'teste-usado' || stores.trials.used(session.dcLer)) return c.html(trialUsedScreen({ devBar: devBarFor(c) }));
    return c.html(trialRequestScreen({ devBar: devBarFor(c), ...session, backHref: trialBackHref(session) }));
  });

  app.post('/teste', async (c) => {
    if (!stores || !config.salesEnabled) return c.html(pausedScreen({ devBar: devBarFor(c) }));
    const form = await readForm(c);
    const session = trialSession((k) => form[k]);
    if (!session || stores.trials.used(session.dcLer)) return c.html(trialUsedScreen({ devBar: devBarFor(c) }));
    const rawEmail = formString(form, 'email', MAX_EMAIL);
    const email = normalizeEmail(rawEmail);
    if (!email) {
      return c.html(trialRequestScreen({ devBar: devBarFor(c), ...session, email: rawEmail, error: true, backHref: trialBackHref(session) }));
    }
    // E-mail que já recebeu todas as ofertas do teste: aviso "para este e-mail", não o de estoque.
    if (stores.codes.availability('teste', email) === 'unavailable_for_customer') {
      return c.html(trialStockScreen({ devBar: devBarFor(c), forCustomer: true }));
    }
    const code = stores.codes.claim(`trial:${session.dcLer}`, 'teste', email);
    if (!code) return c.html(trialStockScreen({ devBar: devBarFor(c) }));
    stores.trials.mark(session.dcLer);
    return c.html(trialDeliveredScreen({ devBar: devBarFor(c), code, email, appStoreId: config.appStoreId }));
  });

  // Ferramentas de simulação: só existem com devTools; sem ele, 404 normal.
  if (config.devTools) {
    const SAMPLE = { planId: 'annual', email: 'motorista@email.com' };
    const TRIAL = '/pix/teste?teste=1&dc_ler=dev-ler&dc_marcar=dev-marcar';
    const li = (href, label) => html`<li><a href="${href}">${label}</a></li>`;

    // Catálogo no mesmo layout das telas (legível no celular).
    const section = (title, items) => html`<section class="card stack"><h2>${title}</h2>${items}</section>`;
    app.get('/dev', (c) => c.html(page({
      title: dev.label,
      state: 'dev',
      body: html`<h1>${dev.title}</h1>
${section(dev.choose, html`<ul>${li('/pix', dev.choose)}${li('/pix?plano=monthly', dev.chooseMonthly)}</ul>`)}
${section(dev.scenarios, html`<ul>${['sem-estoque', 'indisponivel-email', 'pausado', 'fora-do-ar'].map((n) => li(`/pix?cenario=${n}`, n))}</ul>`)}
${section(dev.trial, html`<ul>${li(TRIAL, dev.trialRequest)}${li(`${TRIAL}&cenario=teste-usado`, `${dev.trialUsed} (teste-usado)`)}</ul>`)}
${section(dev.orders, html`<form method="post" action="/pix/dev/pedido-exemplo"><button class="btn btn-primary" type="submit">${dev.createOrder}</button></form>`)}
${section(dev.orderScenarios, html`<p class="note">${dev.orderHint}</p><ul><li>vencido</li><li>pendente</li></ul>`)}`,
    })));

    app.post('/dev/pedido-exemplo', async (c) => {
      if (!orders) return c.notFound();
      let result;
      try {
        result = await orders.create(SAMPLE);
      } catch {
        return c.text('Pix indisponível', 503);
      }
      if (!result.ok) return c.text(`Recusado: ${result.reason}`, 409);
      return c.redirect(orderPath(result.order.token), 303);
    });

    app.post('/dev/pedido/:token/pagar', async (c) => {
      if (!orders || typeof provider.markPaid !== 'function') return c.notFound();
      const token = c.req.param('token');
      const order = stores.orders.get(token);
      if (!order) return c.notFound();
      provider.markPaid(order.txids.at(-1));
      return c.redirect(orderPath(token), 303);
    });
  }

  // Rota inexistente: mesma tela amigável do pedido não encontrado.
  app.notFound((c) => notFound(c));

  // Erro inesperado: registra e mostra "Pix indisponível" (503), nunca um 500 cru.
  app.onError((err, c) => {
    console.error(err);
    return c.html(errorScreen({ devBar: devBarFor(c), planName: plans[DEFAULT_PLAN_ID].name, retryHref: '/pix' }), 503);
  });

  return app;
}
