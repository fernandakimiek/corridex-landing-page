import { Hono } from 'hono';
import { PLANS, DEFAULT_PLAN_ID } from './plans.js';
import { copy, t } from './page/copy.pt-BR.js';
import { renderSVG } from 'uqr';
import { createOrderService } from './orders.js';
import {
  chooseScreen, pausedScreen, errorScreen, choosePath, orderPath,
  payingScreen, deliveredScreen, pendingScreen, expiredScreen, notFoundScreen,
} from './page/screens.js';

// Tamanho máximo de um endereço de e-mail (RFC 5321); corta o ?email= pré-preenchido.
const MAX_EMAIL = 254;
// Validade de cada Pix (30 min).
const PIX_TTL_SECONDS = 1800;

// Tudo vive sob /pix: o site (corridex.app) faz rewrite de /pix/* para este app,
// então o mesmo caminho funciona no Cloudflare Workers hoje e na Vercel depois.
// Não use APIs exclusivas da Cloudflare aqui (D1, KV, bindings): este arquivo
// precisa rodar igual nas duas plataformas.
export function createApp({ config, provider, stores, plans = PLANS, now = Date.now }) {
  const app = new Hono().basePath('/pix');
  app.use('*', async (c, next) => {
    c.set('deps', { config, provider, stores, plans, now });
    await next();
  });

  // Cabeçalhos das páginas HTML (o JSON de /health e /status fica como está).
  app.use('*', async (c, next) => {
    await next();
    if ((c.res.headers.get('content-type') ?? '').startsWith('text/html')) {
      c.res.headers.set('Cache-Control', 'no-store');
      c.res.headers.set('Referrer-Policy', 'no-referrer');
      c.res.headers.set('X-Robots-Tag', 'noindex');
    }
  });

  // ?cenario= só vale com as ferramentas de simulação ligadas.
  const scenario = (c) => (config.devTools ? c.req.query('cenario') || null : null);
  const salesPaused = () => !config.salesEnabled || !provider || !stores;
  const planIds = () => Object.keys(plans);

  // Próximo plano disponível: mensal → trimestral → anual → mensal.
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
  const trialHref = (trial) => (trial
    ? `/pix/teste?teste=1&dc_ler=${encodeURIComponent(trial.dcLer)}&dc_marcar=${encodeURIComponent(trial.dcMarcar)}`
    : null);

  app.get('/health', (c) => c.json({ ok: true }));

  // Tela de escolha. `outOfStock` marca o plano como sem estoque (cenário ou pedido
  // recusado); `customerUnavailable`, indisponível para este e-mail.
  function chooseView(c, { selectedPlanId, email = '', outOfStock, customerUnavailable, emailError, trial }) {
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
      plans, selectedPlanId, email, notice, unavailablePlanIds, trialHref: trialHref(session), trialSession: session, state, emailError,
    }));
  }

  const validPlanId = (id) => (id && Object.hasOwn(plans, id) ? id : DEFAULT_PLAN_ID);

  app.get('/', (c) => {
    const cenario = scenario(c);
    if (salesPaused() || cenario === 'pausado') return c.html(pausedScreen());

    const selectedPlanId = validPlanId(c.req.query('plano'));
    const email = (c.req.query('email') ?? '').slice(0, MAX_EMAIL);

    if (cenario === 'fora-do-ar') {
      return c.html(errorScreen({ planName: plans[selectedPlanId].name, retryHref: choosePath(selectedPlanId, email) }));
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
  function refusal(c, reason, { planId, email, trial = null }) {
    const base = { selectedPlanId: planId, email, trial };
    if (reason === 'invalid_email') return chooseView(c, { ...base, emailError: true });
    if (reason === 'plan_out_of_stock') return chooseView(c, { ...base, outOfStock: true });
    if (reason === 'unavailable_for_customer') return chooseView(c, { ...base, customerUnavailable: true });
    if (reason === 'invalid_plan') return chooseView(c, { ...base, selectedPlanId: DEFAULT_PLAN_ID });
    return c.html(errorScreen({ planName: plans[planId].name, retryHref: choosePath(planId, email) }), 503);
  }

  app.post('/pedidos', async (c) => {
    if (salesPaused()) return c.html(pausedScreen());
    const form = await c.req.parseBody();
    const rawPlan = typeof form.plano === 'string' ? form.plano : '';
    const email = (typeof form.email === 'string' ? form.email : '').trim().slice(0, MAX_EMAIL);
    const trial = trialSession((k) => form[k]);
    if (!Object.hasOwn(plans, rawPlan)) return chooseView(c, { selectedPlanId: DEFAULT_PLAN_ID, email, trial });

    let result;
    try {
      result = await orders.create({ planId: rawPlan, email });
    } catch {
      result = { ok: false, reason: 'pix_unavailable' };
    }
    if (!result.ok) return refusal(c, result.reason, { planId: rawPlan, email, trial });
    return c.redirect(orderPath(result.order.token), 303);
  });

  const notFound = (c) => c.html(notFoundScreen(), 404);
  // Erro do provedor ao consultar um pedido: tela "Pix indisponível", tentar de novo na mesma página.
  const orderError = (c, token) => {
    const planId = validPlanId(stores?.orders.get(token)?.planId);
    return c.html(errorScreen({ planName: plans[planId].name, retryHref: orderPath(token) }), 503);
  };

  app.get('/pedido/:token', async (c) => {
    if (!orders) return c.html(pausedScreen());
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
    if (cenario === 'vencido') return c.html(expiredScreen({ order, plan }));
    if (cenario === 'pendente') return c.html(pendingScreen({ order }));

    switch (order.status) {
      case 'delivered':
        return c.html(deliveredScreen({ order, plan, appStoreId: config.appStoreId }));
      case 'pending':
        return c.html(pendingScreen({ order }));
      case 'expired':
        return c.html(expiredScreen({ order, plan }));
      default: {
        // SVG do QR é decorativo para leitor de tela: o rótulo fica no contêiner role=img.
        const qrSvg = renderSVG(order.copiaECola, { border: 2 }).replace('<svg ', '<svg aria-hidden="true" focusable="false" ');
        return c.html(payingScreen({ order, qrSvg, nowMs: now() }));
      }
    }
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
    if (salesPaused() || !orders) return c.html(pausedScreen());
    const token = c.req.param('token');
    let result;
    try {
      result = await orders.renew(token);
    } catch {
      return orderError(c, token);
    }
    if (result.ok || result.reason === 'not_expired') return c.redirect(orderPath(token), 303);
    if (result.reason === 'not_found') return notFound(c);
    const order = stores.orders.get(token);
    if (result.reason === 'pix_unavailable') {
      return c.html(errorScreen({ planName: plans[order.planId].name, retryHref: orderPath(token) }), 503);
    }
    return refusal(c, result.reason, { planId: order.planId, email: order.email });
  });

  return app;
}
