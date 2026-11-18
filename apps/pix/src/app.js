import { Hono } from 'hono';
import { html } from 'hono/html';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { PLANS, DEFAULT_PLAN_ID } from './plans.js';
import { copy, t, dev } from './page/copy.pt-BR.js';
import { devBarView, page } from './page/layout.js';
import { renderSVG } from 'uqr';
import { createOrderService, normalizeEmail, randomId } from './orders.js';
import { decodePurchaseToken, APPLE_APP } from './apple/purchase-token.js';
import {
  chooseScreen, pausedScreen, errorScreen, choosePath, orderPath,
  payingScreen, deliveredScreen, pendingScreen, expiredScreen, notFoundScreen, helpScreen,
  trialRequestScreen, trialUsedScreen, trialDeliveredScreen, trialStockScreen,
} from './page/screens.js';

// Tamanho máximo de um endereço de e-mail (RFC 5321).
const MAX_EMAIL = 254;
// Validade de cada Pix (30 min).
const PIX_TTL_SECONDS = 1800;
// Nonce do formulário: 22 caracteres; folga para não cortar um válido.
const MAX_NONCE = 64;
// Cookie com o id do token da Apple (7 dias, a validade padrão do token).
const TOKEN_COOKIE = 'pix_tok';
const COOKIE_ATTRS = { httpOnly: true, secure: true, sameSite: 'Lax', path: '/pix' };
const TOKEN_COOKIE_OPTIONS = { ...COOKIE_ATTRS, maxAge: 604800 };
// Cookie com o id da sessão do teste grátis (30 min); dcq/dcm ficam só no servidor.
const TRIAL_COOKIE = 'pix_trial';
const TRIAL_TTL_SECONDS = 1800;
const TRIAL_COOKIE_OPTIONS = { ...COOKIE_ATTRS, maxAge: TRIAL_TTL_SECONDS };
// Tamanho máximo de dcq/dcm (tokens do DeviceCheck em base64 ficam bem abaixo).
const MAX_DEVICE_TOKEN = 4096;
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
// `deviceCheck` ({ isUsed(dcq), mark(deviceKey, dcm) }): sem ele o teste grátis não abre.
export function createApp({ config, provider, stores, plans = PLANS, now = Date.now, deviceCheck = null }) {
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

  // Sessão do teste grátis do cookie: { id, deviceKey, markToken } ou null (sem cookie,
  // forjado, vencido, ou sem DeviceCheck configurado).
  function trialSession(c) {
    if (!stores || !deviceCheck) return null;
    const id = getCookie(c, TRIAL_COOKIE);
    const session = id ? stores.trialSessions.get(id, now()) : null;
    return session ? { ...session, id } : null;
  }
  // Sessão que ainda vale: o aparelho pode ter usado o teste por outra sessão aberta antes.
  async function usableTrialSession(c) {
    const session = trialSession(c);
    if (!session || await deviceCheck.isUsed(session.deviceKey)) return null;
    return session;
  }

  app.get('/health', (c) => c.json({ ok: true }));

  // Tela de escolha. `outOfStock` marca o plano como sem estoque (cenário ou pedido
  // recusado); `customerUnavailable`, indisponível para este e-mail.
  // `nonce`: o do formulário enviado (recusa reexibida) ou um novo.
  function chooseView(c, { selectedPlanId, email = '', outOfStock, customerUnavailable, emailError, nonce }) {
    const selected = plans[selectedPlanId];
    // Disponibilidade geral; a checagem por e-mail acontece no POST.
    const unavailablePlanIds = planIds().filter((id) => stores.codes.availability(id, '') === 'out_of_stock');
    if (outOfStock && !unavailablePlanIds.includes(selectedPlanId)) unavailablePlanIds.push(selectedPlanId);

    let notice;
    let state = 'choose';
    const seeNext = () => {
      const next = nextPlanId(selectedPlanId, unavailablePlanIds);
      return next ? { label: t(copy.seeOther, { plano: plans[next].name }), planId: next } : undefined;
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
      plans, selectedPlanId, email, notice, unavailablePlanIds, trialHref: trialSession(c) ? '/pix/teste' : null, state, emailError,
      nonce: nonce || randomId(),
    }));
  }

  const validPlanId = (id) => (id && Object.hasOwn(plans, id) ? id : DEFAULT_PLAN_ID);

  // URL limpa da escolha depois da primeira visita do app (sem t= e afins).
  function linkRedirect(c, planId) {
    const cenario = scenario(c);
    const extra = cenario ? `&cenario=${encodeURIComponent(cenario)}` : '';
    return c.redirect(`/pix?plano=${encodeURIComponent(planId)}${extra}`, 302);
  }

  // Token da Apple válido: guardado no servidor, o cookie leva só o id. Inválido é ignorado.
  function rememberPurchaseToken(c, raw) {
    if (!stores) return;
    const decoded = decodePurchaseToken(raw, APPLE_APP, now());
    if (!decoded) return;
    const { id } = stores.tokens.remember(decoded);
    setCookie(c, TOKEN_COOKIE, id, TOKEN_COOKIE_OPTIONS);
  }

  // Link do teste grátis (teste=1, dcq, dcm): aparelho que nunca usou → sessão no servidor,
  // o cookie leva só o id. Incompleto, já usado ou sem DeviceCheck é ignorado.
  async function openTrialSession(c) {
    if (!stores || !deviceCheck) return;
    const token = (v) => typeof v === 'string' && v.length > 0 && v.length <= MAX_DEVICE_TOKEN;
    const dcq = c.req.query('dcq');
    const dcm = c.req.query('dcm');
    if (c.req.query('teste') !== '1' || !token(dcq) || !token(dcm)) return;
    if (await deviceCheck.isUsed(dcq)) return;
    const id = stores.trialSessions.create({ deviceKey: dcq, markToken: dcm, expiresAt: now() + TRIAL_TTL_SECONDS * 1000 });
    setCookie(c, TRIAL_COOKIE, id, TRIAL_COOKIE_OPTIONS);
  }

  // "Tentar de novo" da escolha: com e-mail, POST /pix (plano + e-mail); sem, link.
  const retryTo = (planId, email) => ({
    planName: plans[planId].name, retryHref: choosePath(planId), retryPlanId: planId, retryEmail: email || undefined,
  });

  // Escolha (GET e POST /pix): pausa, cenários de simulação e a tela de escolha.
  function chooseRoute(c, { planId, email }) {
    const cenario = scenario(c);
    if (salesPaused() || cenario === 'pausado') return c.html(pausedScreen({ devBar: devBarFor(c) }));
    const selectedPlanId = validPlanId(planId);
    if (cenario === 'fora-do-ar') return c.html(errorScreen({ devBar: devBarFor(c), ...retryTo(selectedPlanId, email) }));
    return chooseView(c, {
      selectedPlanId, email, outOfStock: cenario === 'sem-estoque', customerUnavailable: cenario === 'indisponivel-email',
    });
  }

  app.get('/', async (c) => {
    // Primeira visita do app (t, teste, dcq ou dcm): processa e redireciona sempre
    // (a URL limpa mostra a pausa, se houver). Os dois cookies saem no mesmo 302.
    if (['t', 'teste', 'dcq', 'dcm'].some((k) => c.req.query(k) !== undefined)) {
      const rawToken = c.req.query('t');
      if (rawToken !== undefined) rememberPurchaseToken(c, rawToken);
      await openTrialSession(c);
      return linkRedirect(c, validPlanId(c.req.query('plano')));
    }

    // O e-mail nunca vem da URL (?email= é ignorado); só do POST abaixo.
    return chooseRoute(c, { planId: c.req.query('plano'), email: '' });
  });

  // Escolha com e-mail já digitado (Trocar e-mail, outro plano no aviso, Tentar de novo):
  // mesma tela do GET, com o e-mail vindo do formulário e não da URL.
  app.post('/', async (c) => {
    const form = await readForm(c);
    return chooseRoute(c, { planId: formString(form, 'plano', 32), email: formString(form, 'email', MAX_EMAIL) });
  });

  // Pedidos: só com provedor e lojas. A venda pausada bloqueia novas cobranças,
  // mas quem já pagou continua vendo o pedido.
  const orders = provider && stores
    ? createOrderService({ provider, stores, plans, now, pixTtlSeconds: PIX_TTL_SECONDS })
    : null;

  // Recusa do serviço → tela. Estoque e e-mail voltam à escolha com o aviso.
  function refusal(c, reason, { planId, email, nonce }) {
    const base = { selectedPlanId: planId, email, nonce };
    if (reason === 'invalid_email') return chooseView(c, { ...base, emailError: true });
    if (reason === 'plan_out_of_stock') return chooseView(c, { ...base, outOfStock: true });
    if (reason === 'unavailable_for_customer') return chooseView(c, { ...base, customerUnavailable: true });
    if (reason === 'invalid_plan') return chooseView(c, { ...base, selectedPlanId: DEFAULT_PLAN_ID });
    return c.html(errorScreen({ devBar: devBarFor(c), ...retryTo(planId, email) }), 503);
  }

  app.post('/pedidos', async (c) => {
    if (salesPaused()) return c.html(pausedScreen({ devBar: devBarFor(c) }));
    const form = await readForm(c);
    const rawPlan = formString(form, 'plano', 32);
    const email = formString(form, 'email', MAX_EMAIL);
    const nonce = formString(form, 'nonce', MAX_NONCE);
    if (!Object.hasOwn(plans, rawPlan)) return chooseView(c, { selectedPlanId: DEFAULT_PLAN_ID, email, nonce });

    // Só um id que o servidor conhece liga o pedido ao app; cookie forjado vira pedido do site.
    const tokenId = getCookie(c, TOKEN_COOKIE);
    const purchaseTokenId = tokenId && stores.tokens.byId(tokenId) ? tokenId : null;
    let result;
    try {
      result = await orders.create({ planId: rawPlan, email, nonce, purchaseTokenId });
    } catch {
      result = { ok: false, reason: 'pix_unavailable' };
    }
    if (!result.ok) return refusal(c, result.reason, { planId: rawPlan, email, nonce });
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

  // Teste grátis: não depende do Pix, só das lojas e do DeviceCheck. A sessão vem do cookie.
  app.get('/teste', async (c) => {
    if (!stores || !config.salesEnabled) return c.html(pausedScreen({ devBar: devBarFor(c) }));
    if (scenario(c) === 'teste-usado' || !(await usableTrialSession(c))) return c.html(trialUsedScreen({ devBar: devBarFor(c) }));
    return c.html(trialRequestScreen({ devBar: devBarFor(c) }));
  });

  app.post('/teste', async (c) => {
    if (!stores || !config.salesEnabled) return c.html(pausedScreen({ devBar: devBarFor(c) }));
    const session = await usableTrialSession(c);
    if (!session) return c.html(trialUsedScreen({ devBar: devBarFor(c) }));
    const form = await readForm(c);
    const rawEmail = formString(form, 'email', MAX_EMAIL);
    const email = normalizeEmail(rawEmail);
    if (!email) return c.html(trialRequestScreen({ devBar: devBarFor(c), email: rawEmail, error: true }));
    // Sem estoque ou e-mail que já recebeu o teste: a mesma tela de sem estoque.
    const code = stores.codes.availability('teste', email) === 'ok'
      ? stores.codes.claim(`trial:${session.deviceKey}`, 'teste', email)
      : null;
    if (!code) return c.html(trialStockScreen({ devBar: devBarFor(c) }));
    await deviceCheck.mark(session.deviceKey, session.markToken);
    stores.trialSessions.delete(session.id);
    deleteCookie(c, TRIAL_COOKIE, { path: '/pix' });
    return c.html(trialDeliveredScreen({ devBar: devBarFor(c), code, email, appStoreId: config.appStoreId }));
  });

  // Ferramentas de simulação: só existem com devTools; sem ele, 404 normal.
  if (config.devTools) {
    const SAMPLE = { planId: 'annual', email: 'motorista@email.com' };
    const li = (href, label) => html`<li><a href="${href}">${label}</a></li>`;

    // Catálogo no mesmo layout das telas (legível no celular).
    const section = (title, items) => html`<section class="card stack"><h2>${title}</h2>${items}</section>`;
    app.get('/dev', (c) => c.html(page({
      title: dev.label,
      state: 'dev',
      body: html`<h1>${dev.title}</h1>
${section(dev.choose, html`<ul>${li('/pix', dev.choose)}${li('/pix?plano=monthly', dev.chooseMonthly)}</ul>`)}
${section(dev.scenarios, html`<ul>${['sem-estoque', 'indisponivel-email', 'pausado', 'fora-do-ar'].map((n) => li(`/pix?cenario=${n}`, n))}</ul>`)}
${section(dev.trial, html`<ul>${li(`/pix?teste=1&dcq=dev-${randomId()}&dcm=dev-marcar`, dev.trialRequest)}${li('/pix/teste?cenario=teste-usado', `${dev.trialUsed} (teste-usado)`)}</ul>`)}
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
