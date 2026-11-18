import { html, raw } from 'hono/html';
import { copy, dev } from './copy.pt-BR.js';
import { Brand } from './components.js';

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
--brand:#275BBC;
/* barra de ação translúcida (PinnedBar); sem backdrop-filter usa --surface */
--bar-bg:#F9F9F9F0}
@media (prefers-color-scheme:dark){:root{
--bg:#000;--surface:#1C1C1E;--label:#FFF;--label2:#EBEBF599;--label3:#EBEBF54D;
--accent:#0A84FF;--info-text:#2A94FF;
--card-border:#545458A6;--field-border:#38383A;--fill:#7878805C;
--success-text:#30D158;--warning-text:#FF9F0A;--warning-icon:#FF9F0A;--error-text:#FF7A70;--error-icon:#FF453A;
--brand:#2757A9;--bar-bg:#161618F0}}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--label);font:400 1.0625rem/1.4 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
/* Tela: barra de título, conteúdo que rola e barra de ação presa embaixo */
.screen{min-height:100vh;min-height:100dvh;display:flex;flex-direction:column}
.nav{display:flex;align-items:center;justify-content:center;min-height:calc(44px + env(safe-area-inset-top));padding:env(safe-area-inset-top) 20px 0;font-weight:600}
.devbar+.screen .nav{min-height:44px;padding-top:0}
.content{flex:1;width:100%;max-width:calc(30rem + 40px);margin:0 auto;display:flex;flex-direction:column;gap:24px;padding:8px max(20px,env(safe-area-inset-right)) 24px max(20px,env(safe-area-inset-left))}
.content.result{justify-content:center;text-align:center}
.bar{position:sticky;bottom:0;z-index:1;display:flex;flex-direction:column;gap:8px;padding:16px max(20px,env(safe-area-inset-right)) calc(env(safe-area-inset-bottom) + 24px) max(20px,env(safe-area-inset-left));background:var(--surface);border-top:.5px solid var(--card-border)}
@supports ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){.bar{background:var(--bar-bg);-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px)}}
.bar>*{width:100%;max-width:30rem;margin-inline:auto}
.fine{font-size:.75rem;color:var(--label2);text-align:center}
.result-hero{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center}
.result-hero h1{font-size:1.75rem;font-weight:700}
.result-hero .ic{width:64px;height:64px;margin-bottom:4px;color:var(--tone)}
.result-hero .ic.tint{color:var(--tone-text)}
.sub{font-size:.9375rem;color:var(--label2)}
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
/* Cabeçalho de etapa (escolha, teste grátis): ícone 44 px tingido, título 22 px */
.hero{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center}
.hero .ic{width:44px;height:44px;color:var(--tone-text)}
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
.pt{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.pn{font-weight:600;overflow-wrap:anywhere}
.pd{font-size:.8125rem;color:var(--label2)}
/* selo "Mais vantajoso": branco sobre #8C5000 (6,6:1), igual nos dois temas */
.badge{display:inline-block;margin-left:6px;padding:2px 8px;border-radius:999px;background:#8C5000;color:#FFF;font-size:.6875rem;font-weight:700;vertical-align:2px}
.pp{font-weight:600;font-variant-numeric:tabular-nums}
.plan.off{cursor:not-allowed}.off .pc{color:var(--label2)}
.tag{display:inline-block;padding:2px 8px;border-radius:999px;background:color-mix(in srgb,var(--warning-icon) 15%,var(--surface));color:var(--warning-text);font-size:.75rem;font-weight:700}
.field{display:flex;flex-direction:column;gap:.375rem}
/* Grupo inset do iOS: rótulo em caixa alta pequena, campo surface raio 12, nota embaixo */
.field label{padding-left:16px;font-size:.8125rem;color:var(--label2);text-transform:uppercase;letter-spacing:.02em}
.field input{width:100%;min-height:2.75rem;padding:.8125rem 1rem;border:1px solid transparent;border-radius:12px;background:var(--surface);color:var(--label);font:inherit}
.field .note,.field .err{padding-left:16px}
.field input:focus{outline:0;border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 25%,transparent)}
.field [aria-invalid=true]{border-color:var(--error-icon)}
.err{color:var(--error-text);font-size:.9375rem}
.notice{display:grid;grid-template-columns:40px 1fr;gap:.25rem 12px;padding:1rem;border-radius:16px;background:var(--surface);background:color-mix(in srgb,var(--tone) 15%,var(--bg))}
.notice>*{grid-column:2}
.notice>.ic{grid-column:1;grid-row:1/span 2;width:28px;height:28px;color:var(--tone-text)}
.notice>h1,.notice>h2{font-size:1.0625rem;font-weight:600;color:var(--tone-text)}
.notice>.btn{grid-column:1/-1;margin-top:.75rem}
output.code{display:block;padding:1rem;border-radius:16px;background:var(--surface);font:600 1.25rem/1.3 ui-monospace,"SF Mono",Menlo,monospace;letter-spacing:.08em;font-variant-numeric:tabular-nums;text-align:center;word-break:break-all}
/* Pix gerado: topo com valor 34 px, cartão do código, passos, QR recolhido e status */
.pay-hero{display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center}
.amount{font-size:2.125rem;font-weight:700;letter-spacing:-.01em}
.timer{display:inline-flex;align-items:center;gap:6px;font-size:.9375rem;color:var(--label2)}
.timer .i{flex:none;width:16px;height:16px}
.group{display:flex;flex-direction:column;gap:6px}
.glabel{padding-left:16px;font-size:.8125rem;color:var(--label2);text-transform:uppercase;letter-spacing:.02em}
summary{list-style:none;cursor:pointer}
summary::-webkit-details-marker{display:none}
.code summary{display:flex;align-items:center;gap:12px}
.code .v{flex:1;min-width:0;font:.9375rem ui-monospace,"SF Mono",Menlo,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* tint azul 12%: --info-text dá 4,5:1 (claro) e 4,7:1 (escuro) */
.copy{flex:none;display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 14px;border:0;border-radius:999px;background:color-mix(in srgb,var(--accent) 12%,var(--surface));color:var(--info-text);font:inherit;font-size:.9375rem;font-weight:600;cursor:pointer}
.copy .i{width:14px;height:14px}
.pixcode{display:block;width:100%;margin-top:12px;padding:.5rem;border:1px solid var(--field-border);border-radius:10px;background:var(--surface);color:var(--label);font:.8125rem ui-monospace,Menlo,monospace;resize:none;word-break:break-all}
.steps{margin:0;padding:0;list-style:none;display:flex;flex-direction:column}
.steps li{display:flex;align-items:center;gap:12px;padding:12px 0;border-top:.5px solid var(--card-border);font-size:.9375rem}
.steps li:first-child{border-top:0;padding-top:0}
.steps li:last-child{padding-bottom:0}
.steps .n{flex:none;display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:color-mix(in srgb,var(--accent) 12%,var(--surface));color:var(--info-text);font-size:.8125rem;font-weight:700}
.qr summary{display:flex;align-items:center;justify-content:space-between;min-height:24px;color:var(--info-text)}
.chev{width:12px;height:12px}
.qr[open] .chev{transform:rotate(180deg)}
.qr figure{margin-top:16px}
/* QR legível por outro celular: até 13rem, quadrado, fundo branco mesmo no tema escuro */
.qrimg{width:min(13rem,70vw);aspect-ratio:1;margin:0 auto;padding:6px;background:#FFF;border-radius:8px}
.qrimg svg{display:block;width:100%;height:100%}
.status{display:flex;align-items:center;justify-content:center;gap:10px;font-size:.9375rem;color:var(--label2)}
.dot{flex:none;width:10px;height:10px;border-radius:50%;background:var(--warning-icon);box-shadow:0 0 0 4px color-mix(in srgb,var(--warning-icon) 18%,transparent)}
.toast{text-align:center;color:var(--success-text);font-size:.9375rem;font-weight:600}
.links{text-align:center;font-size:.8125rem;color:var(--label2)}
.links a{display:inline-block;padding:.75rem .5rem;min-height:44px;color:var(--info-text);text-decoration:none}
/* Barra de dev: faixa estática no topo, fora do fluxo da barra de ação */
.devbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:.25rem .75rem;padding:calc(.25rem + env(safe-area-inset-top)) 1rem .25rem;background:var(--surface);border-bottom:1px solid var(--card-border);font-size:.75rem;color:var(--label2)}
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

// Barra de título (44 px): marca na escolha, título da etapa nas demais. Não é o <h1>.
function NavBar({ brand, title } = {}) {
  return html`<header class="nav">${brand || !title ? Brand() : html`<span>${title}</span>`}</header>`;
}

// `bar`: ActionBar já renderizada (ou nada). `layout: 'result'` centraliza o conteúdo na vertical.
// data-state/data-* ficam em .screen, o bloco que o pix.js troca.
export function page({ title, nav = { brand: true }, body, bar, layout = 'flow', state, data, devBar }) {
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
${devBar ?? ''}<div class="screen" data-state="${state}"${dataAttrs(data)}>
${NavBar(nav)}
<main class="content${layout === 'result' ? ' result' : ''}">
${body}
</main>
${bar ?? ''}</div>
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
