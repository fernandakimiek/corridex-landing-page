import { html } from 'hono/html';
import { copy } from './copy.pt-BR.js';
import { page } from './layout.js';
import {
  Brand, PlanSwitcher, PlanSummary, EmailField, Notice, SubmitButton, LinkButton, planTitle,
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
  plans, selectedPlanId, email = '', notice, unavailablePlanIds = [], trialHref, emailError,
  state = 'choose', devBar,
}) {
  const selected = plans[selectedPlanId];
  const trial = trialHref ? LinkButton({ label: copy.trial.link, href: trialHref, variant: 'plain' }) : '';

  if (notice) {
    // Trocar o e-mail recarrega a escolha deste plano (GET), sem gerar Pix.
    const emailForm = state === 'unavailable_for_customer'
      ? html`<form method="get" action="/pix"><input type="hidden" name="plano" value="${selectedPlanId}">${EmailField({ value: email, error: emailError })}</form>`
      : '';
    const body = html`${Brand()}
<h1>${planTitle(selected)}</h1>
${PlanSwitcher({ plans, selectedPlanId, unavailablePlanIds, linkTo: (id) => choosePath(id, email) })}
${Notice({ ...notice, tone: notice.tone ?? 'warning' })}
${emailForm}
${trial}`;
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
${PlanSwitcher({ plans, selectedPlanId, unavailablePlanIds })}
${EmailField({ value: email, error: emailError })}
${SubmitButton({ label: copy.pix.cta })}
</form>
${trial}`;
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
