import { html, raw } from 'hono/html';
import { copy, links } from './copy.pt-BR.js';
import { PLANS } from '../plans.js';

// Sem JS, o resumo do plano acompanha o rádio marcado via :has().
// Sem suporte a :has(), fica o resumo do plano que veio do servidor.
const planRules = Object.keys(PLANS)
  .map((id) => `form:has([name=plano][value=${id}]:checked) .sum[data-plan=${id}]`)
  .join(',');

// Tokens do handoff (claro/escuro). Mobile first, 360 px.
const CSS = `
:root{--accent:#007AFF;--accent-ink:#FFF;--bg:#F2F2F7;--surface:#FFF;--label:#000;--label2:#3C3C4399;--separator:#C6C6C8;--fill:#78788029;--success:#248A3D;--success-icon:#34C759;--warning:#C93400;--error:#D70015;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--accent:#0A84FF;--bg:#000;--surface:#1C1C1E;--label:#FFF;--label2:#EBEBF599;--separator:#38383A;--fill:#7676803D;--success:#30D158;--success-icon:#30D158;--warning:#FF9F0A;--error:#FF453A}}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;background:var(--bg);color:var(--label);font:400 1.0625rem/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:max(1rem,env(safe-area-inset-top)) max(1rem,env(safe-area-inset-right)) max(1rem,env(safe-area-inset-bottom)) max(1rem,env(safe-area-inset-left))}
main{flex:1;width:100%;max-width:30rem;margin:0 auto;display:flex;flex-direction:column;gap:1rem}
h1,h2{margin:0;line-height:1.25}
h1{font-size:1.25rem;font-weight:700}
h2{font-size:1.0625rem;font-weight:600}
p,figure{margin:0}
a{color:var(--accent)}
:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
[hidden]{display:none!important}
.note{font-size:.8125rem;color:var(--label2)}
.center{text-align:center}
.stack{display:flex;flex-direction:column;gap:.5rem}
.brand{display:flex;align-items:center;gap:.5rem;font-weight:700}
.brand i{width:22px;height:22px;border-radius:6px;background:var(--accent)}
.card{background:var(--surface);border-radius:12px;padding:1rem}
.btn{display:flex;align-items:center;justify-content:center;width:100%;min-height:2.75rem;padding:.625rem 1rem;border:0;border-radius:12px;font:inherit;font-weight:600;text-align:center;text-decoration:none;cursor:pointer}
.btn-primary{background:var(--accent);color:var(--accent-ink)}
.btn-secondary{background:var(--fill);color:var(--accent)}
.btn-plain{background:none;color:var(--accent);font-weight:400}
.seg{display:flex;min-width:0;margin:0;padding:2px;border:0;border-radius:12px;background:var(--fill)}
.seg legend{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.seg label{flex:1;min-width:0;position:relative;z-index:0;display:flex;min-height:2.75rem;cursor:pointer}
.seg input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:inherit}
.seg .lbl{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:.25rem;font-size:.9375rem;font-weight:600;text-align:center;overflow-wrap:anywhere}
.seg .lbl::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:10px}
.seg :checked+.lbl::before{background:var(--surface);box-shadow:0 1px 3px #0000001f}
.seg :focus-visible+.lbl::before{outline:3px solid var(--accent)}
.seg :disabled+.lbl{cursor:not-allowed;color:var(--label2)}
.seg .tag{font-size:.75rem;font-weight:400;color:var(--warning)}
.sum{display:none}.sum.on{display:block}
@supports selector(:has(a)){form:has([name=plano]:checked) .sum{display:none}${planRules}{display:block}}
.price{font-size:2rem;font-weight:700;font-variant-numeric:tabular-nums}
.field{display:flex;flex-direction:column;gap:.375rem}
.field label{font-weight:600}
.field input{width:100%;min-height:2.75rem;padding:.625rem .75rem;border:1px solid var(--separator);border-radius:10px;background:var(--surface);color:var(--label);font:inherit}
.field input:focus{outline:0;border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 25%,transparent)}
.field [aria-invalid=true]{border-color:var(--error)}
.err{color:var(--error);font-size:.9375rem}
.notice{background:var(--surface);border-radius:12px;border-left:4px solid var(--accent);padding:1rem;display:flex;flex-direction:column;gap:.375rem}
.notice[data-tone=warning]{border-color:var(--warning)}
.notice[data-tone=error]{border-color:var(--error)}
.notice .nt{display:flex;gap:.5rem;align-items:flex-start}
.notice svg{flex:none;width:1.25rem;height:1.25rem;margin-top:.1rem;color:var(--accent)}
.notice[data-tone=warning] svg{color:var(--warning)}
.notice[data-tone=error] svg{color:var(--error)}
.notice .btn{margin-top:.5rem}
.ok{width:4rem;height:4rem;margin:0 auto;color:var(--success-icon)}
.code{display:block;padding:1rem;border-radius:12px;background:var(--surface);font:600 1.25rem/1.3 ui-monospace,"SF Mono",Menlo,monospace;letter-spacing:.08em;font-variant-numeric:tabular-nums;text-align:center;word-break:break-all}
.pixcode{width:100%;padding:.5rem;border:1px solid var(--separator);border-radius:10px;background:var(--surface);color:var(--label2);font:.8125rem ui-monospace,Menlo,monospace;resize:none}
.qr{width:108px;height:108px;margin:0 auto;padding:6px;background:#FFF;border-radius:8px}
.qr svg{display:block;width:100%;height:100%}
.status{display:flex;align-items:center;justify-content:center;gap:.5rem;font-weight:600}
.spin{width:1rem;height:1rem;border:2px solid var(--fill);border-top-color:var(--accent);border-radius:50%;animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(1turn)}}
.toast{min-height:1.4em;text-align:center;color:var(--success);font-weight:600}
dl{margin:0}dt{font-weight:600}dd{margin:0 0 .5rem}
footer{width:100%;max-width:30rem;margin:1.5rem auto 0;text-align:center;font-size:.8125rem;color:var(--label2)}
footer a{display:inline-block;padding:.5rem .25rem;min-height:2.75rem;color:inherit}
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
