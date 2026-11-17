import { html } from 'hono/html';
import { copy } from './copy.pt-BR.js';
import { page } from './layout.js';
import {
  Brand, PlanSwitcher, PlanSummary, EmailField, Notice, SubmitButton, LinkButton, planTitle,
} from './components.js';

// Telas completas (página inteira). Cada uma aceita `devBar` (Task 9) e repassa ao layout.

// Escolha do plano. Com `notice` (estoque, e-mail indisponível) o Pix não é gerado:
// a ação é o botão secundário do aviso ("Ver {outro plano}").
// state: 'choose' | 'plan_out_of_stock' | 'unavailable_for_customer'
export function chooseScreen({
  plans, selectedPlanId, email = '', notice, unavailablePlanIds = [], trialHref, emailError,
  state = 'choose', devBar,
}) {
  const selected = plans[selectedPlanId];
  const summaries = notice
    ? ''
    : Object.values(plans)
      .filter((plan) => !unavailablePlanIds.includes(plan.id))
      .map((plan) => PlanSummary({ plan, on: plan.id === selectedPlanId }));
  const heading = notice ? html`${Brand()}<h1>${planTitle(selected)}</h1>` : Brand({ heading: true });
  const body = html`${heading}
<form class="stack" method="post" action="/pix/pedidos" novalidate>
${PlanSwitcher({ plans, selectedPlanId, unavailablePlanIds })}
${notice ? Notice({ ...notice, tone: notice.tone ?? 'warning' }) : summaries}
${EmailField({ value: email, error: emailError })}
${notice ? '' : SubmitButton({ label: copy.pix.cta })}
</form>
${trialHref ? LinkButton({ label: copy.trial.link, href: trialHref, variant: 'plain' }) : ''}`;
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
