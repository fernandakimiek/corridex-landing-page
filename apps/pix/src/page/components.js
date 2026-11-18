import { html, raw } from 'hono/html';
import { copy, t } from './copy.pt-BR.js';
import { brl, maskEmail, groupCode, dateBR, timeBR, redeemUrl } from './format.js';

// Blocos reutilizáveis das telas do Pix. Todo texto vem de copy.pt-BR.js.
// Valores interpolados são escapados pelo hono/html; `raw` só para SVG/CSS nossos
// (e para o SVG do QR, gerado no servidor a partir do copia e cola).

// Ícones no estilo dos SF Symbols "fill" do app (círculo/triângulo cheio + glifo branco).
const svg = (cls, body, box = 28) => `<svg class="${cls}" viewBox="0 0 ${box} ${box}" aria-hidden="true" focusable="false">${body}</svg>`;
const DOT = '<circle cx="14" cy="14" r="13" fill="currentColor"/>';
const GLYPH = {
  check: '<path d="m8.5 14.5 3.8 3.8 7.2-8.3" fill="none" stroke="#FFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  xmark: '<path d="m9.5 9.5 9 9m0-9-9 9" stroke="#FFF" stroke-width="2.6" stroke-linecap="round"/>',
  info: '<rect x="12.6" y="12" width="2.8" height="8.5" rx="1.4" fill="#FFF"/><circle cx="14" cy="8.3" r="1.8" fill="#FFF"/>',
};
const ICONS = {
  info: svg('ic', DOT + GLYPH.info), // info.circle.fill
  // exclamationmark.triangle.fill
  warning: svg('ic', '<path d="M12.1 3.6a2.2 2.2 0 0 1 3.8 0l10.4 18.6a2.2 2.2 0 0 1-1.9 3.3H3.6a2.2 2.2 0 0 1-1.9-3.3Z" fill="currentColor"/><rect x="12.6" y="9.5" width="2.8" height="8.5" rx="1.4" fill="#FFF"/><circle cx="14" cy="21.3" r="1.7" fill="#FFF"/>'),
  error: svg('ic', DOT + GLYPH.xmark), // xmark.circle.fill
  success: svg('ic', DOT + GLYPH.check), // checkmark.circle.fill
};
// Indicador de seleção do cartão de plano: circle / checkmark.circle.fill (22 px).
const PICK = svg('i-off', '<circle cx="11" cy="11" r="10" fill="none" stroke="currentColor" stroke-width="1.5"/>', 22)
  + svg('i-on', '<circle cx="11" cy="11" r="11" fill="currentColor"/><path d="m6.5 11.5 3 3 6-6.8" fill="none" stroke="#FFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>', 22);

// Preenche o modelo do copy permitindo valores HTML (ex.: <span> que o cliente atualiza).
// Partes de texto continuam escapadas.
function tHtml(template, vars) {
  return template.split(/(\{[^{}]+\})/g).map((part) => {
    const m = /^\{([^{}]+)\}$/.exec(part);
    return m && m[1] in vars ? vars[m[1]] : part;
  });
}

export const planTitle = (plan) => t(copy.plan.title, { plano: plan.name });

// Marca (não é título): quadrado na cor do ícone do app + nome.
export function Brand() {
  return html`<div class="brand"><i aria-hidden="true"></i><span>${copy.brand}</span></div>`;
}

// Ícone grande de estado (pago, venceu, erro, info), 44 px como o glifo do app.
export function StateIcon({ tone = 'success' } = {}) {
  return html`<div class="hero-ic" data-tone="${tone}">${raw(ICONS[tone] ?? ICONS.info)}</div>`;
}

// action: { label, href, variant?: 'primary'|'secondary'|'plain' }
export function LinkButton({ label, href, variant = 'primary', rel }) {
  return html`<a class="btn btn-${variant}" href="${href}"${rel ? html` rel="${rel}"` : ''}>${label}</a>`;
}

export function SubmitButton({ label, variant = 'primary', name, value }) {
  return html`<button type="submit" class="btn btn-${variant}"${name ? html` name="${name}" value="${value}"` : ''}>${label}</button>`;
}

// Seletor de plano: cartões empilhados como no app (indicador + nome + preço, borda 2 px).
// Modo rádio (padrão): rádios reais dentro do form, funciona sem JS e com setas.
// Modo link (`linkTo(id) → href`): usado quando não há botão de envio (avisos);
// cada plano disponível vira um link para ?plano=<id>.
// Indisponível: nome riscado + selo "indisponível" (nunca só cor), sem interação.
export function PlanSwitcher({ plans, selectedPlanId, unavailablePlanIds = [], linkTo }) {
  const card = (plan, off) => html`<span class="pc">${raw(PICK)}<span class="pn">${
    off ? html`<s>${plan.name}</s> <span class="tag">${copy.stock.unavailableTag}</span>` : plan.name
  }</span><span class="pp">${brl(plan.amountCents)}</span></span>`;
  const list = Object.values(plans);
  if (linkTo) {
    const items = list.map((plan) => {
      const off = unavailablePlanIds.includes(plan.id);
      if (off) return html`<li class="plan off">${card(plan, true)}</li>`;
      if (plan.id === selectedPlanId) return html`<li class="plan cur" aria-current="true">${card(plan, false)}</li>`;
      return html`<li><a class="plan" href="${linkTo(plan.id)}">${card(plan, false)}</a></li>`;
    });
    return html`<ul class="plans" aria-label="${copy.plan.legend}">${items}</ul>`;
  }
  const items = list.map((plan) => {
    const off = unavailablePlanIds.includes(plan.id);
    const checked = plan.id === selectedPlanId && !off;
    return html`<label class="plan${off ? ' off' : ''}"><input type="radio" name="plano" value="${plan.id}"${checked ? raw(' checked') : ''}${off ? raw(' disabled') : ''}>${card(plan, off)}</label>`;
  });
  return html`<fieldset class="plans" role="radiogroup"><legend class="vh">${copy.plan.legend}</legend>${items}</fieldset>`;
}

// Cartão do plano. `on` = visível sem depender de :has() (plano escolhido no servidor).
export function PlanSummary({ plan, on = true, heading = 'h2' }) {
  const h = heading === 'h1' ? html`<h1>${planTitle(plan)}</h1>` : html`<h2>${planTitle(plan)}</h2>`;
  return html`<section class="sum hero${on ? ' on' : ''}" data-plan="${plan.id}">
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

// Aviso (InlineNoticeCard do app): fundo no tom a 15%, ícone + título na cor do tom.
// Tom nunca só por cor: ícone e texto. Erro com role=alert.
export function Notice({ tone = 'info', title, body, action, heading = 'h2' }) {
  const h = heading === 'h1' ? html`<h1>${title}</h1>` : html`<h2>${title}</h2>`;
  return html`<section class="notice" data-tone="${tone}"${tone === 'error' ? raw(' role="alert"') : ''}>
${raw(ICONS[tone] ?? ICONS.info)}${h}
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
export function CodeHelp({ supportUrl, backHref }) {
  return html`<section class="card stack"><h2>${copy.help.account}</h2><p>${copy.help.accountBody}</p></section>
<section class="card stack"><h2>${copy.help.wait}</h2><p>${copy.help.waitBody}</p></section>
<div class="stack">
${LinkButton({ label: copy.help.cta, href: supportUrl, rel: 'noopener' })}
<p class="note center">${copy.help.hint}</p>
</div>
${backHref ? LinkButton({ label: copy.help.back, href: backHref, variant: 'plain' }) : ''}`;
}

// Sessão do teste grátis em campos ocultos: se o formulário voltar à escolha, o link continua.
export function TrialFields(trial) {
  if (!trial) return '';
  return html`<input type="hidden" name="teste" value="1"><input type="hidden" name="dc_ler" value="${trial.dcLer}"><input type="hidden" name="dc_marcar" value="${trial.dcMarcar}">`;
}

// Pedido do teste grátis: tokens do app em campos ocultos.
export function TrialRequest({ dcLer, dcMarcar, email = '', error, action = '/pix/teste', backHref = '/pix' }) {
  return html`<form class="stack" method="post" action="${action}">
${TrialFields({ dcLer, dcMarcar })}
${EmailField({ value: email, error })}
${SubmitButton({ label: copy.trial.cta })}
<p class="note center">${copy.trial.help}</p>
</form>
${LinkButton({ label: copy.trial.back, href: backHref, variant: 'plain' })}`;
}
