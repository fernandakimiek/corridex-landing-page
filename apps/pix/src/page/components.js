import { html, raw } from 'hono/html';
import { copy, t, links } from './copy.pt-BR.js';
import { brl, perMonth, maskEmail, groupCode, dateBR, timeBR, redeemUrl } from './format.js';

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
// Ícones de resultado em fundo tingido (cor do glifo = --tone-text, para contraste).
const TINT = (opacity) => `<circle cx="14" cy="14" r="14" fill="currentColor" opacity="${opacity}"/>`;
const TINTED = {
  // clock: Pix vencido
  clock: svg('ic tint', `${TINT(0.15)}<circle cx="14" cy="14" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M14 9.6v4.8l3 1.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`),
  // gift: teste grátis
  gift: svg('ic tint', `${TINT(0.12)}<rect x="7.5" y="11" width="13" height="3" rx=".8" fill="currentColor"/><rect x="8.5" y="14.6" width="11" height="6.4" rx=".8" fill="currentColor"/><rect x="13.2" y="11" width="1.6" height="10" fill="#FFF"/><path d="M14 11c-1-2.6-4.2-3.2-4.2-1.2 0 1.2 2.2 1.2 4.2 1.2Zm0 0c1-2.6 4.2-3.2 4.2-1.2 0 1.2-2.2 1.2-4.2 1.2Z" fill="none" stroke="currentColor" stroke-width="1.3"/>`),
  // bolt.fill: cabeçalho da escolha
  bolt: svg('ic tint', `${TINT(0.12)}<path d="M15.3 5.7 8.3 15.3h5.1l-1.3 7 7-9.6h-5.1Z" fill="currentColor"/>`),
};
// Tom (cores) de cada ícone de resultado.
const HERO_TONE = { clock: 'warning', gift: 'info', bolt: 'info' };
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

// `form`: id do formulário quando o botão fica fora dele (ex.: na barra de ação).
export function SubmitButton({ label, variant = 'primary', name, value, form }) {
  return html`<button type="submit" class="btn btn-${variant}"${form ? html` form="${form}"` : ''}${name ? html` name="${name}" value="${value}"` : ''}>${label}</button>`;
}

// Barra de ação presa embaixo (PinnedBar do app): botão principal, ações secundárias
// (um ou vários botões já renderizados) e nota pequena.
export function ActionBar({ primary, secondary, note } = {}) {
  return html`<div class="bar">${primary ?? ''}${secondary ?? ''}${note ? html`<p class="fine">${note}</p>` : ''}</div>`;
}

// Bloco de resultado: ícone de 64 px, título (h1) e texto secundário.
export function ResultHero({ tone = 'success', title, body }) {
  const icon = TINTED[tone] ?? ICONS[tone] ?? ICONS.info;
  return html`<div class="result-hero" data-tone="${HERO_TONE[tone] ?? tone}">${raw(icon)}<h1>${title}</h1>${body ? html`<p class="sub">${body}</p>` : ''}</div>`;
}

// Cabeçalho de etapa (escolha, teste grátis): ícone de 44 px tingido, título e subtítulo.
export function Hero({ icon, title, sub }) {
  return html`<div class="hero" data-tone="${HERO_TONE[icon] ?? 'info'}">${raw(TINTED[icon] ?? '')}<h1>${title}</h1>${sub ? html`<p class="sub">${sub}</p>` : ''}</div>`;
}

// Termos, Privacidade e Ajuda: links discretos no fim do conteúdo da escolha.
export function FooterLinks() {
  return html`<footer class="links"><a href="${links.terms}">${copy.footer.terms}</a> · <a href="${links.privacy}">${copy.footer.privacy}</a> · <a href="${links.help}">${copy.footer.help}</a></footer>`;
}

// Plano com o selo "Mais vantajoso" (menor preço por mês).
const BEST_PLAN_ID = 'anual';

// Rótulo do botão da barra da escolha com o preço do plano.
export const ctaLabel = (plan) => t(copy.pix.ctaWithPrice, { valor: brl(plan.amountCents) });

// Seletor de plano: cartões empilhados como no paywall do app (indicador, nome em negrito
// com a duração e o preço por mês embaixo, preço total à direita, borda 2 px).
// O Anual leva o selo "Mais vantajoso".
// Modo rádio (padrão): rádios reais dentro do form, funciona sem JS e com setas.
// Cada rádio leva em data-cta o rótulo do botão da barra (o pix.js troca ao mudar).
// Modo link (`linkTo(id) → href`): usado quando não há botão de envio (avisos);
// cada plano disponível vira um link para ?plano=<id>.
// Indisponível: nome riscado + selo "indisponível" (nunca só cor), sem interação.
export function PlanSwitcher({ plans, selectedPlanId, unavailablePlanIds = [], linkTo }) {
  const card = (plan, off) => {
    const month = perMonth(plan);
    const detail = month ? t(copy.plan.perMonth, { 'duração': plan.durationLabel, valor: month }) : plan.durationLabel;
    const name = off
      ? html`<s>${plan.name}</s> <span class="tag">${copy.stock.unavailableTag}</span>`
      : html`${plan.name}${plan.id === BEST_PLAN_ID ? html` <span class="badge">${copy.plan.best}</span>` : ''}`;
    return html`<span class="pc">${raw(PICK)}<span class="pt"><span class="pn">${name}</span><span class="pd">${detail}</span></span><span class="pp">${brl(plan.amountCents)}</span></span>`;
  };
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
    return html`<label class="plan${off ? ' off' : ''}"><input type="radio" name="plano" value="${plan.id}" data-cta="${ctaLabel(plan)}"${checked ? raw(' checked') : ''}${off ? raw(' disabled') : ''}>${card(plan, off)}</label>`;
  });
  return html`<fieldset class="plans" role="radiogroup"><legend class="vh">${copy.plan.legend}</legend>${items}</fieldset>`;
}

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

// Pix gerado (formato dos apps de pagamento). Ícones pequenos de linha, cor do texto.
const CLOCK = svg('i', '<circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 4.5V8l2.5 1.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>', 16);
const COPY_IC = svg('i', '<rect x="4" y="4" width="8.5" height="8.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M9.5 2.5V2a1 1 0 0 0-1-1H2.5a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1H3" fill="none" stroke="currentColor" stroke-width="1.4"/>', 14);
const CHEVRON = svg('i chev', '<path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>', 12);

const minutesLeft = (expiresAt, nowMs) => Math.max(0, Math.ceil((expiresAt - nowMs) / 60_000));

// Topo do Pix gerado: plano, valor (h1, 34 px) e "Vale até HH:MM · N min".
// [data-minutes] é atualizado pelo cliente (pix.js).
export function PayHero({ plan, amountCents, expiresAt, nowMs }) {
  return html`<div class="pay-hero">
${plan ? html`<p class="sub">${planTitle(plan)}</p>` : ''}
<h1 class="amount">${brl(amountCents)}</h1>
<p class="timer">${raw(CLOCK)}<span>${tHtml(copy.pix.validShort, {
    hora: timeBR(expiresAt),
    minutos: html`<span data-minutes>${minutesLeft(expiresAt, nowMs)}</span>`,
  })}</span></p>
</div>`;
}

// Botão de copiar: o cliente (pix.js) copia data-copy e escreve data-copied no
// único role=status da tela (CopyToast).
const copyAttrs = (code) => html`data-copy="${code}" data-copied="${copy.pix.copied}"`;

// "Copiar código Pix" para a barra de ação.
export function CopyButton({ copiaECola }) {
  return html`<button type="button" class="btn btn-primary" ${copyAttrs(copiaECola)}>${copy.pix.copy}</button>`;
}

// Aviso "Código copiado…" compartilhado pelos dois botões de copiar.
export const CopyToast = () => html`<p class="toast" role="status" data-toast></p>`;

// Pix copia e cola (cartão com o código numa linha e "Copiar" ao lado), passos e QR recolhido.
// Sem JS, tocar no cartão abre o código inteiro num textarea selecionável (também é o
// alvo do cliente quando a área de transferência falha). O QR fica num <details>.
export function PixPayment({ copiaECola, qrSvg }) {
  return html`<div class="group">
<p class="glabel" id="pix-code-label">${copy.pix.codeLabel}</p>
<details class="card code">
<summary><span class="v">${copiaECola}</span><button type="button" class="copy" ${copyAttrs(copiaECola)}>${raw(COPY_IC)}${copy.pix.copyShort}</button></summary>
<textarea id="pix-code" class="pixcode" rows="4" readonly aria-labelledby="pix-code-label">${copiaECola}</textarea>
</details>
</div>
<div class="card"><ol class="steps">
${[copy.pix.step1, copy.pix.step2, copy.pix.step3].map((step, i) => html`<li><span class="n" aria-hidden="true">${i + 1}</span>${step}</li>`)}
</ol></div>
<details class="card qr">
<summary>${copy.pix.showQr}${raw(CHEVRON)}</summary>
<figure class="stack center">
<div class="qrimg" role="img" aria-label="${copy.pix.qrAlt}">${raw(qrSvg ?? '')}</div>
<figcaption class="note">${copy.pix.qrHint}</figcaption>
</figure>
</details>`;
}

// Status do pagamento (aria-live=polite). Sem JS, link para recarregar.
export function PaymentStatus({ refreshHref }) {
  return html`<div class="status" aria-live="polite"><span class="dot" aria-hidden="true"></span><span>${copy.pix.waitingLong}</span></div>
${refreshHref ? html`<noscript>${LinkButton({ label: copy.pix.refresh, href: refreshHref, variant: 'plain' })}</noscript>` : ''}`;
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

// Pedido do teste grátis: tokens do app em campos ocultos. O botão de envio fica na
// barra de ação (SubmitButton com form="teste"), fora do formulário.
export function TrialRequest({ dcLer, dcMarcar, email = '', error, action = '/pix/teste', id = 'teste' }) {
  return html`<form class="stack" id="${id}" method="post" action="${action}">
${TrialFields({ dcLer, dcMarcar })}
${EmailField({ value: email, error })}
<p class="note">${copy.trial.help}</p>
</form>`;
}
