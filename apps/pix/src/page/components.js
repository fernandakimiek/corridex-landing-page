import { html, raw } from 'hono/html';
import { copy, t } from './copy.pt-BR.js';
import { brl, maskEmail, groupCode, dateBR, timeBR, redeemUrl } from './format.js';

// Blocos reutilizáveis das telas do Pix. Todo texto vem de copy.pt-BR.js.
// Valores interpolados são escapados pelo hono/html; `raw` só para SVG/CSS nossos
// (e para o SVG do QR, gerado no servidor a partir do copia e cola).

const ICONS = {
  info: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 9v5M10 6v.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  warning: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M10 2 19 18H1Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M10 8v4M10 15v.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  error: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="m6.5 6.5 7 7m0-7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  check: '<svg class="ok" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><circle cx="32" cy="32" r="30" fill="currentColor"/><path d="m19 33 9 9 17-19" fill="none" stroke="#FFF" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

// Preenche o modelo do copy permitindo valores HTML (ex.: <span> que o cliente atualiza).
// Partes de texto continuam escapadas.
function tHtml(template, vars) {
  return template.split(/(\{[^{}]+\})/g).map((part) => {
    const m = /^\{([^{}]+)\}$/.exec(part);
    return m && m[1] in vars ? vars[m[1]] : part;
  });
}

export const planTitle = (plan) => t(copy.plan.title, { plano: plan.name });

// heading: true → a marca é o h1 da página (tela de escolha).
export function Brand({ heading = false } = {}) {
  const inner = html`<i aria-hidden="true"></i><span>${copy.brand}</span>`;
  return heading ? html`<h1 class="brand">${inner}</h1>` : html`<div class="brand">${inner}</div>`;
}

export function CheckIcon() {
  return raw(ICONS.check);
}

// action: { label, href, variant?: 'primary'|'secondary'|'plain' }
export function LinkButton({ label, href, variant = 'primary' }) {
  return html`<a class="btn btn-${variant}" href="${href}">${label}</a>`;
}

export function SubmitButton({ label, variant = 'primary', name, value }) {
  return html`<button type="submit" class="btn btn-${variant}"${name ? html` name="${name}" value="${value}"` : ''}>${label}</button>`;
}

// Seletor de plano: rádios reais (funciona sem JS; setas do teclado nativas).
// Indisponível: rádio desativado, nome riscado e o texto "indisponível" (nunca só cor).
export function PlanSwitcher({ plans, selectedPlanId, unavailablePlanIds = [] }) {
  const items = Object.values(plans).map((plan) => {
    const off = unavailablePlanIds.includes(plan.id);
    const checked = plan.id === selectedPlanId && !off;
    return html`<label><input type="radio" name="plano" value="${plan.id}"${checked ? raw(' checked') : ''}${off ? raw(' disabled') : ''}>${
      off ? html`<span class="lbl"><s>${plan.name}</s><span class="tag">${copy.stock.unavailableTag}</span></span>` : html`<span class="lbl">${plan.name}</span>`
    }</label>`;
  });
  return html`<fieldset class="seg" role="radiogroup"><legend>${copy.plan.legend}</legend>${items}</fieldset>`;
}

// Cartão do plano. `on` = visível sem depender de :has() (plano escolhido no servidor).
export function PlanSummary({ plan, on = true, heading = 'h2' }) {
  const h = heading === 'h1' ? html`<h1>${planTitle(plan)}</h1>` : html`<h2>${planTitle(plan)}</h2>`;
  return html`<section class="card sum stack${on ? ' on' : ''}" data-plan="${plan.id}">
${h}
<p>${t(copy.plan.summary, { 'duração': capitalize(plan.durationLabel) })}</p>
<p><span class="price">${brl(plan.amountCents)}</span><br><span class="note">${copy.plan.payOnce}</span></p>
</section>`;
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// error: true (usa email.invalid) ou um texto. Erro ligado por aria-describedby.
export function EmailField({ value = '', error, id = 'email' }) {
  const errorText = error === true ? copy.email.invalid : error;
  const describedBy = errorText ? `${id}-error ${id}-help` : `${id}-help`;
  return html`<div class="field">
<label for="${id}">${copy.email.label}</label>
<input id="${id}" name="email" type="email" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" required value="${value}" aria-describedby="${describedBy}"${errorText ? raw(' aria-invalid="true"') : ''}>
${errorText ? html`<p class="err" id="${id}-error">${errorText}</p>` : ''}
<p class="note" id="${id}-help">${copy.email.help}</p>
</div>`;
}

// Aviso: tom por ícone + borda + texto; erro com role=alert.
export function Notice({ tone = 'info', title, body, action, heading = 'h2' }) {
  const h = heading === 'h1' ? html`<h1>${title}</h1>` : html`<h2>${title}</h2>`;
  return html`<section class="notice" data-tone="${tone}"${tone === 'error' ? raw(' role="alert"') : ''}>
<div class="nt">${raw(ICONS[tone] ?? ICONS.info)}${h}</div>
${body ? html`<p>${body}</p>` : ''}
${action ? LinkButton({ variant: 'secondary', ...action }) : ''}
</section>`;
}

// Pagamento: "Copiar código Pix" antes do QR. O cliente (pix.js) usa [data-copy]
// e escreve pix.copied no role=status. Sem JS, o copia e cola fica selecionável.
export function PixPayment({ copiaECola, qrSvg }) {
  return html`<div class="stack">
<button type="button" class="btn btn-primary" data-copy="${copiaECola}" data-copied="${copy.pix.copied}">${copy.pix.copy}</button>
<p class="toast" role="status" data-toast></p>
<label class="note" for="pix-code">${copy.pix.codeLabel}</label>
<textarea id="pix-code" class="pixcode" rows="3" readonly>${copiaECola}</textarea>
</div>
<figure class="stack center">
<div class="qr" role="img" aria-label="${copy.pix.qrAlt}">${raw(qrSvg ?? '')}</div>
<figcaption class="note">${copy.pix.qrHint}</figcaption>
</figure>`;
}

const minutesLeft = (expiresAt, nowMs) => Math.max(0, Math.ceil((expiresAt - nowMs) / 60_000));

// Status do pagamento (aria-live=polite) + validade. [data-minutes] é atualizado pelo cliente.
export function PaymentStatus({ expiresAt, nowMs, refreshHref }) {
  return html`<div class="status" aria-live="polite"><span class="spin" aria-hidden="true"></span><span>${copy.pix.waiting}</span></div>
<p class="note center" data-valid-until>${tHtml(copy.pix.validUntil, {
    hora: timeBR(expiresAt),
    minutos: html`<span data-minutes>${minutesLeft(expiresAt, nowMs)}</span>`,
  })}</p>
${refreshHref ? LinkButton({ label: copy.pix.refresh, href: refreshHref, variant: 'plain' }) : ''}`;
}

const spelled = (value) => value.split('').join(' ');

// Entrega do código: botão de resgate, código em <output> (soletrado para leitor de tela),
// prazo, e-mail mascarado e, se houver, link de ajuda.
export function CodeDelivery({ code, email, appStoreId, helpHref }) {
  return html`<div class="stack">
${LinkButton({ label: copy.code.redeem, href: redeemUrl(appStoreId, code.value) })}
<p class="note center">${copy.code.redeemHint}</p>
</div>
<div class="stack">
<p id="code-label"><strong>${copy.code.label}</strong></p>
<output class="code" aria-labelledby="code-label code-spelled"><span aria-hidden="true">${groupCode(code.value)}</span><span id="code-spelled" hidden>${spelled(code.value)}</span></output>
<p class="note">${code.redeemBy ? html`${t(copy.code.redeemBy, { data: dateBR(code.redeemBy) })} ` : ''}${email ? t(copy.code.sentTo, { email: maskEmail(email) }) : ''}</p>
</div>
${helpHref ? LinkButton({ label: copy.code.help, href: helpHref, variant: 'plain' }) : ''}`;
}

// Ajuda quando o código não funciona: dois cartões + suporte.
export function CodeHelp({ supportUrl }) {
  return html`<section class="card stack"><h2>${copy.help.account}</h2><p>${copy.help.accountBody}</p></section>
<section class="card stack"><h2>${copy.help.wait}</h2><p>${copy.help.waitBody}</p></section>
<div class="stack">
${LinkButton({ label: copy.help.cta, href: supportUrl })}
<p class="note center">${copy.help.hint}</p>
</div>`;
}

// Pedido do teste grátis: tokens do app em campos ocultos.
export function TrialRequest({ dcLer, dcMarcar, email = '', error, action = '/pix/teste' }) {
  return html`<form class="stack" method="post" action="${action}">
<input type="hidden" name="dc_ler" value="${dcLer}">
<input type="hidden" name="dc_marcar" value="${dcMarcar}">
${EmailField({ value: email, error })}
${SubmitButton({ label: copy.trial.cta })}
<p class="note center">${copy.trial.help}</p>
</form>
${LinkButton({ label: copy.trial.back, href: '/pix', variant: 'plain' })}`;
}
