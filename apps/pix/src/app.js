import { Hono } from 'hono';
import { PLANS, DEFAULT_PLAN_ID } from './plans.js';
import { copy, t } from './page/copy.pt-BR.js';
import { chooseScreen, pausedScreen, errorScreen, choosePath } from './page/screens.js';

// Tamanho máximo de um endereço de e-mail (RFC 5321); corta o ?email= pré-preenchido.
const MAX_EMAIL = 254;

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

  // Link do teste grátis: só quando o app manda teste=1 e os dois tokens.
  function trialHref(c) {
    const dcLer = c.req.query('dc_ler');
    const dcMarcar = c.req.query('dc_marcar');
    if (c.req.query('teste') !== '1' || !dcLer || !dcMarcar) return null;
    return `/pix/teste?teste=1&dc_ler=${encodeURIComponent(dcLer)}&dc_marcar=${encodeURIComponent(dcMarcar)}`;
  }

  app.get('/health', (c) => c.json({ ok: true }));

  app.get('/', (c) => {
    const cenario = scenario(c);
    if (salesPaused() || cenario === 'pausado') return c.html(pausedScreen());

    const requested = c.req.query('plano');
    const selectedPlanId = requested && Object.hasOwn(plans, requested) ? requested : DEFAULT_PLAN_ID;
    const selected = plans[selectedPlanId];
    const email = (c.req.query('email') ?? '').slice(0, MAX_EMAIL);

    if (cenario === 'fora-do-ar') {
      return c.html(errorScreen({ planName: selected.name, retryHref: choosePath(selectedPlanId, email) }));
    }

    // Disponibilidade geral; a checagem por e-mail acontece no POST.
    const unavailablePlanIds = planIds().filter((id) => stores.codes.availability(id, '') === 'out_of_stock');
    if (cenario === 'sem-estoque' && !unavailablePlanIds.includes(selectedPlanId)) unavailablePlanIds.push(selectedPlanId);

    let notice;
    let state = 'choose';
    const seeNext = () => {
      const next = nextPlanId(selectedPlanId, unavailablePlanIds);
      return next ? { label: t(copy.seeOther, { plano: plans[next].name }), href: choosePath(next, email) } : undefined;
    };
    if (unavailablePlanIds.includes(selectedPlanId)) {
      state = 'plan_out_of_stock';
      notice = { tone: 'warning', title: t(copy.stock.title, { plano: selected.name }), body: copy.stock.body, action: seeNext() };
    } else if (cenario === 'indisponivel-email') {
      state = 'unavailable_for_customer';
      notice = {
        tone: 'warning',
        title: t(copy.customer.unavailable, { plano: selected.name }),
        body: copy.customer.unavailableBody,
        action: seeNext(),
      };
    }

    return c.html(chooseScreen({
      plans, selectedPlanId, email, notice, unavailablePlanIds, trialHref: trialHref(c), state,
    }));
  });

  return app;
}
