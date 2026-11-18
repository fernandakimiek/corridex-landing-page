import { html } from 'hono/html';
import { copy, t } from './copy.pt-BR.js';
import { page } from './layout.js';
import { brl, maskEmail } from './format.js';
import {
  PlanSwitcher, EmailField, Notice, SubmitButton, LinkButton, planTitle, ActionBar, Hero, ResultHero, ctaLabel,
  FooterLinks, PixPayment, PaymentStatus, PayHero, CopyButton, CopyToast, RefreshNoJs,
  CodeCard, OrderSummary, HelpList, RedeemButton, TrialRequest,
} from './components.js';

// Telas completas (página inteira). Cada uma aceita `devBar` (Task 9) e repassa ao layout.

// Endereço da escolha com um plano. O e-mail nunca vai na URL: quem já tem e-mail
// volta à escolha por POST /pix (campos plano e email).
export const choosePath = (planId) => `/pix?${new URLSearchParams({ plano: planId })}`;

// Escolha do plano (paywall do app): cabeçalho, cartões, grupo do e-mail e links;
// o botão "Gerar Pix · R$ X" fica na barra de ação (form="pedido", fora do form).
// state: 'choose' | 'plan_out_of_stock' | 'unavailable_for_customer'
// Com `notice` não há botão "Gerar Pix": os planos viram links para ?plano=<id>
// (a página continua utilizável sem JS), o aviso fica logo abaixo do cabeçalho e a
// barra traz "Ver {outro plano}" (notice.action = { label, planId }), se houver outro.
// Com e-mail, planos e "Ver …" são botões de POST /pix (form="planos", e-mail oculto).
export function chooseScreen({
  plans, selectedPlanId, email = '', notice, unavailablePlanIds = [], trialHref, emailError,
  state = 'choose', nonce = '', devBar,
}) {
  const selected = plans[selectedPlanId];
  const hero = Hero({ icon: 'bolt', title: copy.choose.title, sub: copy.choose.sub });
  const trial = trialHref ? LinkButton({ label: copy.trial.link, href: trialHref, variant: 'plain' }) : '';
  const nav = { brand: true };

  if (notice) {
    const { action, ...info } = notice;
    // Trocar o e-mail recarrega a escolha deste plano (POST /pix), sem gerar Pix.
    // Sem estoque, o campo só aparece se já há e-mail (ex.: pedido vencido que não renovou).
    const emailForm = state === 'unavailable_for_customer' || (state === 'plan_out_of_stock' && email)
      ? html`<form class="stack" method="post" action="/pix">
<input type="hidden" name="plano" value="${selectedPlanId}">
${EmailField({ value: email, error: emailError })}
${SubmitButton({ label: copy.email.change, variant: 'secondary' })}
</form>`
      : '';
    const body = html`${hero}
${Notice({ ...info, tone: info.tone ?? 'warning' })}
${email
    ? html`<form id="planos" method="post" action="/pix"><input type="hidden" name="email" value="${email}">${PlanSwitcher({ plans, selectedPlanId, unavailablePlanIds, submit: true })}</form>`
    : PlanSwitcher({ plans, selectedPlanId, unavailablePlanIds, linkTo: choosePath })}
${emailForm}
${trial}
${FooterLinks()}`;
    const see = action && (email
      ? SubmitButton({ label: action.label, name: 'plano', value: action.planId, form: 'planos' })
      : LinkButton({ label: action.label, href: choosePath(action.planId) }));
    const bar = see ? ActionBar({ primary: see }) : undefined;
    return page({ title: planTitle(selected), nav, body, bar, state, devBar });
  }

  const body = html`${hero}
<form class="stack" id="pedido" method="post" action="/pix/pedidos" novalidate>
<input type="hidden" name="nonce" value="${nonce}">
${PlanSwitcher({ plans, selectedPlanId, unavailablePlanIds })}
${EmailField({ value: email, error: emailError })}
</form>
${trial}
${FooterLinks()}`;
  const bar = ActionBar({
    primary: SubmitButton({ label: ctaLabel(selected), form: 'pedido' }),
    note: copy.footer.bank,
  });
  return page({ title: planTitle(selected), nav, body, bar, state, devBar });
}

// Telas de resultado: bloco centralizado na vertical (layout 'result') e a ação, se houver,
// na barra de ação. Barra de título: "Pagamento" no pedido, "Teste grátis" no teste e a
// marca nas telas sem etapa (pausado, erro, não encontrado).
const result = (opts) => page({ layout: 'result', ...opts });
const plansBar = (label) => ActionBar({ primary: LinkButton({ label, href: '/pix' }) });

// Venda pausada (PIX_SALES_ENABLED=false, sem provedor ou cenário "pausado"). Sem barra.
export function pausedScreen({ devBar } = {}) {
  const body = ResultHero({ tone: 'info', title: copy.paused.title, body: copy.paused.body });
  return result({ title: copy.paused.title, nav: { brand: true }, body, state: 'sales_paused', devBar });
}

// Pix fora do ar para o plano escolhido (o plano fica no título da aba).
// Com `retryEmail`, "Tentar de novo" volta à escolha por POST /pix (plano `retryPlanId`
// e e-mail em campos ocultos, form="tentar"); sem, é um link para `retryHref`.
export function errorScreen({ planName, retryHref = '/pix', retryPlanId, retryEmail, devBar }) {
  const hero = ResultHero({ tone: 'error', title: copy.down.title, body: copy.down.body });
  const body = retryEmail
    ? html`${hero}
<form id="tentar" method="post" action="/pix"><input type="hidden" name="plano" value="${retryPlanId}"><input type="hidden" name="email" value="${retryEmail}"></form>`
    : hero;
  const retry = retryEmail
    ? SubmitButton({ label: copy.down.cta, form: 'tentar' })
    : LinkButton({ label: copy.down.cta, href: retryHref });
  const bar = ActionBar({ primary: retry });
  return result({ title: planTitle({ name: planName }), nav: { brand: true }, body, bar, state: 'error', devBar });
}

// Endereços do pedido.
export const orderPath = (token) => `/pix/pedido/${encodeURIComponent(token)}`;

// Pagando (formato dos apps de Pix): valor e validade no topo, código com "Copiar",
// passos, QR recolhido e status ao vivo; "Copiar código Pix" na barra.
// O cliente (pix.js) consulta data-status-url e conta até data-expires-at.
export function payingScreen({ order, plan, qrSvg, nowMs, devBar }) {
  const path = orderPath(order.token);
  const body = html`${PayHero({ plan, amountCents: order.amountCents, expiresAt: order.expiresAt, nowMs })}
${PixPayment({ copiaECola: order.copiaECola, qrSvg })}
${PaymentStatus()}`;
  // Sem JS, [data-copy] some (layout) e a barra mostra "Já paguei, atualizar".
  const bar = ActionBar({
    primary: CopyButton({ copiaECola: order.copiaECola }),
    secondary: html`${CopyToast()}${RefreshNoJs({ href: path })}`,
  });
  return page({
    title: t(copy.pix.payTitle, { valor: brl(order.amountCents) }),
    nav: { title: copy.nav.payment },
    body,
    bar,
    state: 'paying',
    data: { statusUrl: `${path}/status`, expiresAt: order.expiresAt },
    devBar,
  });
}

// Pago e entregue: código pronto para resgatar; "Resgatar código" e a ajuda na barra.
export function deliveredScreen({ order, plan, appStoreId, devBar }) {
  const body = html`${ResultHero({ tone: 'success', title: copy.paid.title, body: copy.paid.next })}
${CodeCard({ code: order.code, email: order.email })}
${OrderSummary({ order, plan })}`;
  const bar = ActionBar({
    primary: RedeemButton({ appStoreId, code: order.code.value }),
    secondary: LinkButton({ label: copy.code.help, href: `${orderPath(order.token)}/ajuda`, variant: 'plain' }),
  });
  return result({ title: copy.paid.title, nav: { title: copy.nav.payment }, body, bar, state: 'delivered', devBar });
}

// Ajuda quando o código não funciona: título, dois itens em lista; suporte e voltar na barra.
export function helpScreen({ supportUrl, backHref, devBar }) {
  const body = html`<h1>${copy.help.title}</h1>
${HelpList()}
<p class="note center">${copy.help.hint}</p>`;
  const bar = ActionBar({
    primary: LinkButton({ label: copy.help.cta, href: supportUrl, rel: 'noopener' }),
    secondary: backHref ? LinkButton({ label: copy.help.back, href: backHref, variant: 'plain' }) : undefined,
  });
  return page({ title: copy.help.title, nav: { title: copy.nav.help }, body, bar, state: 'help', devBar });
}

// Pago, mas o código chega depois por e-mail. Sem barra.
export function pendingScreen({ order, devBar }) {
  const body = html`${ResultHero({ tone: 'success', title: copy.paid.title, body: [copy.pending.title, copy.pending.body] })}
<p class="note">${t(copy.pending.sentTo, { email: maskEmail(order.email) })}</p>`;
  return result({ title: copy.paid.title, nav: { title: copy.nav.payment }, body, state: 'pending', devBar });
}

// Pix vencido: gerar outro para o mesmo pedido ("Gerar novo Pix" na barra, form="renovar").
// Se o pagamento cair depois, o pedido vira "pago"; por isso o status continua
// consultável (data-status-url).
export function expiredScreen({ order, plan, devBar }) {
  const path = orderPath(order.token);
  const body = html`${ResultHero({ tone: 'clock', title: copy.expired.title, body: copy.expired.body })}
<p class="note">${copy.expired.hint}</p>
<form id="renovar" method="post" action="${path}/renovar"></form>`;
  const bar = ActionBar({ primary: SubmitButton({ label: copy.expired.cta, form: 'renovar' }) });
  return result({
    title: planTitle(plan), nav: { title: copy.nav.payment }, body, bar, state: 'expired', data: { statusUrl: `${path}/status` }, devBar,
  });
}

// Pedido inexistente (link errado ou antigo).
export function notFoundScreen({ devBar } = {}) {
  const body = ResultHero({ tone: 'info', title: copy.notFound.title, body: copy.notFound.body });
  return result({ title: copy.notFound.title, nav: { brand: true }, body, bar: plansBar(copy.notFound.cta), state: 'not_found', devBar });
}

// Teste grátis: pedido do e-mail (a sessão do aparelho vem do cookie, não do formulário).
// "Liberar 7 dias grátis" fica na barra (form="teste") com "Voltar aos planos".
export function trialRequestScreen({ email = '', error, devBar } = {}) {
  const body = html`${Hero({ icon: 'gift', title: copy.trial.title, sub: copy.trial.sub })}
${TrialRequest({ email, error, id: 'teste' })}`;
  const bar = ActionBar({
    primary: SubmitButton({ label: copy.trial.cta, form: 'teste' }),
    secondary: LinkButton({ label: copy.trial.back, href: '/pix', variant: 'plain' }),
  });
  return page({ title: copy.trial.title, nav: { title: copy.nav.trial }, body, bar, state: 'trial', devBar });
}

// Mesma mensagem para qualquer motivo (sem sessão, sessão vencida, aparelho já usado).
export function trialUsedScreen({ devBar } = {}) {
  const body = ResultHero({ tone: 'info', title: copy.trial.used, body: copy.trial.usedBody });
  return result({
    title: copy.trial.used, nav: { title: copy.nav.trial }, body, bar: plansBar(copy.trial.seePlans), state: 'trial_used', devBar,
  });
}

// Teste liberado: cartão do código (sem pedido, então sem resumo nem link de ajuda).
export function trialDeliveredScreen({ code, email, appStoreId, devBar }) {
  const body = html`${ResultHero({ tone: 'gift', title: copy.trial.delivered, body: copy.trial.after })}
${CodeCard({ code, email })}`;
  const bar = ActionBar({ primary: RedeemButton({ appStoreId, code: code.value }) });
  return result({ title: copy.trial.delivered, nav: { title: copy.nav.trial }, body, bar, state: 'trial_delivered', devBar });
}

// Teste sem código em estoque (ou sem oferta nova para este e-mail: mesma tela).
export function trialStockScreen({ devBar } = {}) {
  const plano = copy.trial.planName;
  return result({
    title: plano,
    nav: { title: copy.nav.trial },
    body: ResultHero({ tone: 'warning', title: t(copy.stock.title, { plano }), body: copy.stock.body }),
    bar: plansBar(copy.trial.seePlans),
    state: 'trial_out_of_stock',
    devBar,
  });
}
