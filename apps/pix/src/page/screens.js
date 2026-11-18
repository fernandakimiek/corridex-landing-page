import { html } from 'hono/html';
import { copy, t } from './copy.pt-BR.js';
import { page } from './layout.js';
import { brl, maskEmail, dateBRFromMs } from './format.js';
import {
  Brand, PlanSwitcher, PlanSummary, EmailField, Notice, SubmitButton, LinkButton, planTitle,
  StateIcon, FooterLinks, PixPayment, PaymentStatus, CodeDelivery, CodeHelp, TrialRequest, TrialFields,
} from './components.js';

// Telas completas (página inteira). Cada uma aceita `devBar` (Task 9) e repassa ao layout.

// Endereço da escolha com um plano (e o e-mail, se houver).
export function choosePath(planId, email) {
  const q = new URLSearchParams({ plano: planId });
  if (email) q.set('email', email);
  return `/pix?${q}`;
}

// Escolha do plano.
// state: 'choose' | 'plan_out_of_stock' | 'unavailable_for_customer'
// Com `notice` não há botão "Gerar Pix": os planos viram links para ?plano=<id>
// (a página continua utilizável sem JS) e o aviso traz "Ver {outro plano}".
export function chooseScreen({
  plans, selectedPlanId, email = '', notice, unavailablePlanIds = [], trialHref, trialSession, emailError,
  state = 'choose', nonce = '', devBar,
}) {
  const selected = plans[selectedPlanId];
  const trial = trialHref ? LinkButton({ label: copy.trial.link, href: trialHref, variant: 'plain' }) : '';

  if (notice) {
    // Trocar o e-mail recarrega a escolha deste plano (GET), sem gerar Pix.
    // Sem estoque, o campo só aparece se já há e-mail (ex.: pedido vencido que não renovou).
    const emailForm = state === 'unavailable_for_customer' || (state === 'plan_out_of_stock' && email)
      ? html`<form class="stack" method="get" action="/pix">
<input type="hidden" name="plano" value="${selectedPlanId}">${TrialFields(trialSession)}
${EmailField({ value: email, error: emailError })}
${SubmitButton({ label: copy.email.change, variant: 'secondary' })}
</form>`
      : '';
    const body = html`${Brand()}
<h1>${planTitle(selected)}</h1>
${PlanSwitcher({ plans, selectedPlanId, unavailablePlanIds, linkTo: (id) => choosePath(id, email) })}
${Notice({ ...notice, tone: notice.tone ?? 'warning' })}
${emailForm}
${trial}
${FooterLinks()}`;
    return page({ title: planTitle(selected), body, state, devBar });
  }

  // Um resumo por plano disponível; o h1 de cada um é "Corridex {Plano}".
  // Só o do plano marcado aparece (CSS :has; sem :has, o escolhido no servidor).
  const summaries = Object.values(plans)
    .filter((plan) => !unavailablePlanIds.includes(plan.id))
    .map((plan) => PlanSummary({ plan, on: plan.id === selectedPlanId, heading: 'h1' }));
  const body = html`${Brand()}
${summaries}
<form class="stack" method="post" action="/pix/pedidos" novalidate>
<input type="hidden" name="nonce" value="${nonce}">${TrialFields(trialSession)}
${PlanSwitcher({ plans, selectedPlanId, unavailablePlanIds })}
${EmailField({ value: email, error: emailError })}
${SubmitButton({ label: copy.pix.cta })}
</form>
${trial}
${FooterLinks()}`;
  return page({ title: planTitle(selected), body, state, devBar });
}

// Venda pausada (PIX_SALES_ENABLED=false, sem provedor ou cenário "pausado").
export function pausedScreen({ devBar } = {}) {
  const body = html`${Brand()}
${Notice({ tone: 'info', title: copy.paused.title, body: copy.paused.body, heading: 'h1' })}`;
  return page({ title: copy.paused.title, body, state: 'sales_paused', devBar });
}

// Pix fora do ar para o plano escolhido.
export function errorScreen({ planName, retryHref = '/pix', devBar }) {
  const title = planTitle({ name: planName });
  const body = html`<h1>${title}</h1>
${Notice({ tone: 'error', title: copy.down.title, body: copy.down.body })}
${LinkButton({ label: copy.down.cta, href: retryHref })}`;
  return page({ title, body, state: 'error', devBar });
}

// Endereços do pedido.
export const orderPath = (token) => `/pix/pedido/${encodeURIComponent(token)}`;

// Pagando: copiar código antes do QR; status ao vivo; link sem JS para atualizar.
// O cliente (pix.js) consulta data-status-url e conta até data-expires-at.
export function payingScreen({ order, qrSvg, nowMs, devBar }) {
  const path = orderPath(order.token);
  const title = t(copy.pix.payTitle, { valor: brl(order.amountCents) });
  const body = html`<h1>${title}</h1>
${PixPayment({ copiaECola: order.copiaECola, qrSvg })}
${PaymentStatus({ expiresAt: order.expiresAt, nowMs, refreshHref: path })}`;
  return page({
    title, body, state: 'paying', data: { statusUrl: `${path}/status`, expiresAt: order.expiresAt }, devBar,
  });
}

// Resumo do pedido: plano, preço e data do pagamento.
function OrderSummary({ order, plan }) {
  const paidOn = order.paidAt != null ? dateBRFromMs(order.paidAt) : null;
  return html`<section class="card stack">
<h2>${copy.order.title}</h2>
<p>${planTitle(plan)} · ${brl(order.amountCents)}</p>
${paidOn ? html`<p class="note">${t(copy.order.paidOn, { data: paidOn })}</p>` : ''}
</section>`;
}

// Pago e entregue: código pronto para resgatar.
export function deliveredScreen({ order, plan, appStoreId, devBar }) {
  const body = html`${StateIcon({ tone: 'success' })}
<div class="stack center"><h1>${copy.paid.title}</h1><p>${copy.paid.next}</p></div>
${CodeDelivery({ code: order.code, email: order.email, appStoreId, helpHref: `${orderPath(order.token)}/ajuda` })}
${OrderSummary({ order, plan })}`;
  return page({ title: copy.paid.title, body, state: 'delivered', devBar });
}

// Ajuda quando o código não funciona.
export function helpScreen({ supportUrl, backHref, devBar }) {
  const body = html`<h1>${copy.help.title}</h1>
${CodeHelp({ supportUrl, backHref })}`;
  return page({ title: copy.help.title, body, state: 'help', devBar });
}

// Pago, mas o código chega depois por e-mail.
export function pendingScreen({ order, devBar }) {
  const body = html`${StateIcon({ tone: 'success' })}
<h1 class="center">${copy.paid.title}</h1>
${Notice({ tone: 'info', title: copy.pending.title, body: copy.pending.body })}
<p class="note center">${t(copy.pending.sentTo, { email: maskEmail(order.email) })}</p>`;
  return page({ title: copy.paid.title, body, state: 'pending', devBar });
}

// Pix vencido: gerar outro para o mesmo pedido. Se o pagamento cair depois,
// o pedido vira "pago"; por isso o status continua consultável (data-status-url).
export function expiredScreen({ order, plan, devBar }) {
  const path = orderPath(order.token);
  const title = planTitle(plan);
  const body = html`<h1 class="center">${title}</h1>
${Notice({ tone: 'warning', title: copy.expired.title, body: copy.expired.body })}
<form class="stack" method="post" action="${path}/renovar">
${SubmitButton({ label: copy.expired.cta })}
<p class="note center">${copy.expired.hint}</p>
</form>`;
  return page({ title, body, state: 'expired', data: { statusUrl: `${path}/status` }, devBar });
}

// Pedido inexistente (link errado ou antigo).
export function notFoundScreen({ devBar } = {}) {
  const body = html`${StateIcon({ tone: 'error' })}
<div class="stack center"><h1>${copy.notFound.title}</h1><p>${copy.notFound.body}</p></div>
${LinkButton({ label: copy.notFound.cta, href: '/pix' })}`;
  return page({ title: copy.notFound.title, body, state: 'not_found', devBar });
}

// Teste grátis: pedido do e-mail. Os tokens do app seguem em campos ocultos.
export function trialRequestScreen({ dcLer, dcMarcar, email = '', error, backHref = '/pix', devBar }) {
  const body = html`<div class="stack"><h1>${copy.trial.title}</h1><p>${copy.trial.sub}</p></div>
${TrialRequest({ dcLer, dcMarcar, email, error, backHref })}`;
  return page({ title: copy.trial.title, body, state: 'trial', devBar });
}

// Mesma mensagem para qualquer motivo (sem token, aparelho já usado).
export function trialUsedScreen({ devBar } = {}) {
  const body = html`${Brand()}
${Notice({ tone: 'info', title: copy.trial.used, body: copy.trial.usedBody, heading: 'h1' })}
${LinkButton({ label: copy.trial.seePlans, href: '/pix' })}`;
  return page({ title: copy.trial.used, body, state: 'trial_used', devBar });
}

// Teste liberado: reusa a entrega do código (sem pedido, então sem link de ajuda).
export function trialDeliveredScreen({ code, email, appStoreId, devBar }) {
  const body = html`${StateIcon({ tone: 'success' })}
<div class="stack center"><h1>${copy.trial.delivered}</h1><p>${copy.trial.after}</p></div>
${CodeDelivery({ code, email, appStoreId })}`;
  return page({ title: copy.trial.delivered, body, state: 'trial_delivered', devBar });
}

// Teste sem código em estoque, ou (`forCustomer`) sem oferta nova para este e-mail.
export function trialStockScreen({ forCustomer = false, devBar } = {}) {
  const plano = copy.trial.planName;
  const notice = forCustomer
    ? { title: t(copy.customer.unavailable, { plano }), body: copy.customer.unavailableBody }
    : { title: t(copy.stock.title, { plano }), body: copy.stock.body };
  const body = html`${Brand()}
${Notice({ tone: 'warning', ...notice, heading: 'h1' })}
${LinkButton({ label: copy.trial.seePlans, href: '/pix' })}`;
  return page({
    title: plano, body, state: forCustomer ? 'trial_unavailable_for_customer' : 'trial_out_of_stock', devBar,
  });
}
