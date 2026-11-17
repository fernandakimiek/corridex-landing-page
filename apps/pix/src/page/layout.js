import { html, raw } from 'hono/html';
import { copy, links, dev } from './copy.pt-BR.js';
import { PLANS } from '../plans.js';

// Sem JS, o resumo do plano acompanha o rádio marcado via :has().
// Sem suporte a :has(), fica o resumo do plano que veio do servidor.
const planRules = Object.keys(PLANS)
  .map((id) => `main:has([name=plano][value=${id}]:checked) .sum[data-plan=${id}]`)
  .join(',');

// Visual do app iPhone (app-design.md): cores de sistema, cartões 16 px, botões cápsula.
// Contraste: todo texto ≥ 4,5:1 sobre o fundo onde aparece, nos dois temas.
// Ajustes em relação ao app estão comentados nos tokens.
const CSS = `
:root{color-scheme:light dark;
--bg:#F2F2F7;--surface:#FFF;--label:#000;
/* app: rgba(60,60,67,.6) = 3,5:1; opaco #6C6C70 dá 4,7:1 no fundo */
--label2:#6C6C70;--label3:#3C3C434D;
--accent:#007AFF;--accent-fill:#0064D1;--accent-ink:#FFF;
/* app infoText #0064D1 dá 4,2:1 sobre o tint azul; #005FC7 dá 4,5:1 */
--info-text:#005FC7;
--card-border:#3C3C434A;--field-border:#C6C6C8;--fill:#78788033;
--success-text:#0E6B2B;--warning-text:#8C5000;--warning-icon:#FF9500;--error-text:#B00020;--error-icon:#FF3B30;
--brand:#275BBC}
@media (prefers-color-scheme:dark){:root{
--bg:#000;--surface:#1C1C1E;--label:#FFF;--label2:#EBEBF599;--label3:#EBEBF54D;
--accent:#0A84FF;--info-text:#2A94FF;
--card-border:#545458A6;--field-border:#38383A;--fill:#7878805C;
--success-text:#30D158;--warning-text:#FF9F0A;--warning-icon:#FF9F0A;--error-text:#FF7A70;--error-icon:#FF453A;
--brand:#2757A9}}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;background:var(--bg);color:var(--label);font:400 1.0625rem/1.4 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;padding:max(1rem,env(safe-area-inset-top)) max(1rem,env(safe-area-inset-right)) max(1rem,env(safe-area-inset-bottom)) max(1rem,env(safe-area-inset-left))}
main{flex:1;width:100%;max-width:30rem;margin:0 auto;display:flex;flex-direction:column;gap:1.5rem}
h1,h2{margin:0;line-height:1.25}
h1{font-size:1.375rem;font-weight:700}
h2{font-size:1.0625rem;font-weight:600}
p,figure{margin:0}
a{color:var(--info-text)}
:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
[hidden]{display:none!important}
.vh{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.note{font-size:.8125rem;color:var(--label2)}
.center{text-align:center}
.stack{display:flex;flex-direction:column;gap:.5rem}
.brand{display:flex;align-items:center;gap:.5rem;font-weight:600}
.brand i{width:22px;height:22px;border-radius:6px;background:var(--brand)}
.card{background:var(--surface);border-radius:16px;padding:1rem}
.hero{flex-direction:column;gap:.5rem;text-align:center}
.hero p:first-of-type{font-size:.9375rem;color:var(--label2)}
.hero-ic{display:flex;justify-content:center;color:var(--accent)}
.hero-ic .ic{width:44px;height:44px}
[data-tone=info]{--tone:var(--accent);--tone-text:var(--info-text)}
[data-tone=success]{--tone:var(--success-text);--tone-text:var(--success-text)}
[data-tone=warning]{--tone:var(--warning-icon);--tone-text:var(--warning-text)}
[data-tone=error]{--tone:var(--error-icon);--tone-text:var(--error-text)}
.hero-ic[data-tone]{color:var(--tone-text)}
.btn{display:flex;align-items:center;justify-content:center;width:100%;min-height:50px;padding:.75rem 1.25rem;border:0;border-radius:999px;font:inherit;font-weight:600;text-align:center;text-decoration:none;cursor:pointer}
.btn-primary{background:var(--accent-fill);color:var(--accent-ink)}
/* app: fill translúcido; azul sobre fill dá 4,0:1, então fundo surface (5,6:1) */
.btn-secondary{background:var(--surface);color:var(--info-text)}
.btn-plain{min-height:44px;background:none;color:var(--info-text);font-size:.8125rem;font-weight:400}
.plans{position:relative;display:flex;flex-direction:column;gap:.75rem;min-width:0;margin:0;padding:0;border:0;list-style:none}
.plan{position:relative;display:block;color:inherit;text-decoration:none;cursor:pointer}
.plan input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:inherit}
.pc{display:flex;align-items:center;gap:1rem;min-height:2.75rem;padding:1rem;border:2px solid var(--card-border);border-radius:16px;background:var(--surface)}
.pc svg{flex:none;width:22px;height:22px}
.i-off{color:var(--label3)}.i-on{display:none;color:var(--accent)}
:checked+.pc,.cur .pc{border-color:var(--accent)}
:checked+.pc .i-on,.cur .i-on{display:block}
:checked+.pc .i-off,.cur .i-off{display:none}
:focus-visible+.pc{outline:3px solid var(--accent);outline-offset:2px}
.pn{flex:1;min-width:0;font-weight:600;overflow-wrap:anywhere}
.pp{font-weight:600;font-variant-numeric:tabular-nums}
.plan.off{cursor:not-allowed}.off .pc{color:var(--label2)}
.tag{display:inline-block;padding:2px 8px;border-radius:999px;background:color-mix(in srgb,var(--warning-icon) 15%,var(--surface));color:var(--warning-text);font-size:.75rem;font-weight:700}
.sum{display:none}.sum.on{display:flex}
@supports selector(:has(a)){main:has([name=plano]:checked) .sum{display:none}${planRules}{display:flex}}
.price{font-size:2rem;font-weight:700;font-variant-numeric:tabular-nums}
.field{display:flex;flex-direction:column;gap:.375rem}
.field label{font-weight:600}
.field input{width:100%;min-height:2.75rem;padding:.625rem .75rem;border:1px solid var(--field-border);border-radius:10px;background:var(--surface);color:var(--label);font:inherit}
.field input:focus{outline:0;border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 25%,transparent)}
.field [aria-invalid=true]{border-color:var(--error-icon)}
.err{color:var(--error-text);font-size:.9375rem}
.notice{display:grid;grid-template-columns:40px 1fr;gap:.25rem 12px;padding:1rem;border-radius:16px;background:var(--surface);background:color-mix(in srgb,var(--tone) 15%,var(--bg))}
.notice>*{grid-column:2}
.notice>.ic{grid-column:1;grid-row:1/span 2;width:28px;height:28px;color:var(--tone-text)}
.notice>h1,.notice>h2{font-size:1.0625rem;font-weight:600;color:var(--tone-text)}
.notice>.btn{grid-column:1/-1;margin-top:.75rem}
.code{display:block;padding:1rem;border-radius:16px;background:var(--surface);font:600 1.25rem/1.3 ui-monospace,"SF Mono",Menlo,monospace;letter-spacing:.08em;font-variant-numeric:tabular-nums;text-align:center;word-break:break-all}
.pixcode{width:100%;padding:.5rem;border:1px solid var(--field-border);border-radius:10px;background:var(--surface);color:var(--label2);font:.8125rem ui-monospace,Menlo,monospace;resize:none}
/* QR legível por outro celular: até 13rem, quadrado, fundo branco mesmo no tema escuro */
.qr{width:min(13rem,70vw);aspect-ratio:1;margin:0 auto;padding:6px;background:#FFF;border-radius:8px}
.qr svg{display:block;width:100%;height:100%}
.status{display:flex;align-items:center;justify-content:center;gap:.5rem;font-weight:600}
.spin{width:1rem;height:1rem;border:2px solid var(--fill);border-top-color:var(--accent);border-radius:50%;animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(1turn)}}
.toast{min-height:1.4em;text-align:center;color:var(--success-text);font-weight:600}
footer{width:100%;max-width:30rem;margin:1.5rem auto 0;text-align:center;font-size:.8125rem;color:var(--label2)}
footer a{display:inline-block;padding:.75rem .25rem;min-height:44px;color:var(--info-text)}
body:has(.devbar){padding-bottom:calc(3.25rem + env(safe-area-inset-bottom))}
.devbar{position:fixed;left:0;right:0;bottom:0;z-index:10;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:.25rem .75rem;padding:.375rem 1rem calc(.375rem + env(safe-area-inset-bottom));background:var(--surface);border-top:1px solid var(--card-border);font-size:.75rem;color:var(--label2)}
.devbar a{color:var(--info-text)}
.devbar form{margin:0}
.devbar button{min-height:32px;padding:0 .75rem;border:1px solid var(--field-border);border-radius:999px;background:none;color:var(--info-text);font:inherit;cursor:pointer}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

const DATA_KEY = /^[a-z][a-z0-9-]*$/;
const kebab = (k) => k.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);

function dataAttrs(data = {}) {
  return Object.entries(data).map(([key, value]) => {
    const name = kebab(key);
    if (!DATA_KEY.test(name)) throw new Error(`atributo data inválido: ${key}`);
    return html` data-${raw(name)}="${String(value)}"`;
  });
}

export function page({ title, body, state, data, devBar }) {
  return html`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#F2F2F7" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
<title>${title ? `${title} · ${copy.brand}` : copy.brand}</title>
<style>${raw(CSS)}</style>
<script type="module" src="/pix/assets/pix.js"></script>
</head>
<body>
<main data-state="${state}"${dataAttrs(data)}>
${body}
</main>
<footer>
<p>${copy.footer.bank} · <a href="${links.terms}">${copy.footer.terms}</a> · <a href="${links.privacy}">${copy.footer.privacy}</a> · <a href="${links.help}">${copy.footer.help}</a></p>
</footer>
${devBar ?? ''}
</body>
</html>`;
}

// Barra de simulação (só com devTools). `payAction`: form "Simular pagamento";
// `links`: [{label, href}] extras (cenários do pedido).
export function devBarView({ payAction, links: extra = [] } = {}) {
  return html`<aside class="devbar" aria-label="${dev.label}">
<strong>${dev.label}</strong>
<a href="/pix/dev">${dev.catalog}</a>
${extra.map((l) => html`<a href="${l.href}">${l.label}</a>`)}
${payAction ? html`<form method="post" action="${payAction}"><button type="submit">${dev.pay}</button></form>` : ''}
</aside>`;
}
