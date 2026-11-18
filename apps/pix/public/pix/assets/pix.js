// Cliente do Pix: status do pedido, troca da .screen, minutos e cópia do código.
// Sem dependências; só toca o DOM no navegador (importável no Node para testes).

// 3 s nos 2 primeiros minutos, 10 s até 30 min, depois para.
export const nextDelay = (elapsedMs) => (elapsedMs < 120_000 ? 3000 : elapsedMs < 1_800_000 ? 10000 : null);

export function remaining(expiresAtMs, nowMs) {
  const ms = expiresAtMs - nowMs;
  return { minutes: Math.max(0, Math.ceil(ms / 60_000)), expired: ms <= 0 };
}

// Rótulo do botão da barra da escolha ("Gerar Pix · R$ X") para o rádio de plano.
export const ctaLabelFor = (radio) => radio?.dataset?.cta ?? null;

// Troca a .screen inteira pela do HTML novo. <noscript> parseado viraria HTML visível.
export function swapScreen(doc, text) {
  const d = new doc.defaultView.DOMParser().parseFromString(text, 'text/html');
  const next = d.querySelector('.screen');
  const cur = doc.querySelector('.screen');
  if (!next || !cur) throw new Error('sem .screen');
  next.querySelectorAll('noscript').forEach((n) => n.remove());
  cur.replaceWith(next);
  if (d.title) doc.title = d.title;
  return next;
}

if (typeof document !== 'undefined') {
  const start = Date.now();
  let screen = document.querySelector('.screen');
  let timer = null;
  let tick = null;
  let active = false; // consultando o status desta .screen
  let busy = false;
  let toastTimer; // timer único do aviso de cópia

  const stop = () => { clearTimeout(timer); timer = null; };
  const schedule = () => {
    stop();
    const delay = nextDelay(Date.now() - start);
    if (active && delay != null && !document.hidden) timer = setTimeout(poll, delay);
  };

  // Rede fora ou 503: repete. 404: para.
  async function poll() {
    stop();
    if (!active || busy || document.hidden) return;
    busy = true;
    try {
      const res = await fetch(screen.dataset.statusUrl, { cache: 'no-store' });
      if (res.status === 404) { active = false; return; }
      if (res.ok) {
        const { status } = await res.json();
        if (status && status !== screen.dataset.state) return await swap();
      }
    } catch { /* de novo */ } finally {
      busy = false;
    }
    schedule();
  }

  // Troca a .screen inteira; foco no h1.
  async function swap() {
    const res = await fetch(location.href, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    const prev = screen.dataset.state;
    const next = swapScreen(document, await res.text());
    // Mesmo estado (ex.: ?cenario= na URL): troca, mas não consulta em ciclo.
    init(next, next.dataset.state !== prev);
    const h1 = next.querySelector('h1');
    if (h1) { h1.tabIndex = -1; h1.focus(); }
  }

  function countdown() {
    const span = screen.querySelector('[data-minutes]');
    if (!span) return;
    const r = remaining(Number(screen.dataset.expiresAt), Date.now());
    span.textContent = r.minutes;
    if (r.expired) {
      clearInterval(tick);
      tick = null;
      poll(); // o servidor mostra "vencido"
    }
  }

  function init(m, polling) {
    screen = m;
    stop();
    clearInterval(tick);
    tick = null;
    active = polling && Boolean(screen.dataset.statusUrl);
    if (screen.dataset.expiresAt && screen.querySelector('[data-minutes]')) tick = setInterval(countdown, 30_000);
    schedule();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return stop();
    if (tick) countdown();
    poll();
  });

  // Copiar: aviso no role=status; se falhar, abre "Ver código completo" e seleciona.
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest && e.target.closest('[data-copy]');
    if (!btn) return;
    const toast = screen.querySelector('[data-toast]');
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      if (toast) {
        clearTimeout(toastTimer);
        toast.textContent = '';
        toastTimer = setTimeout(() => {
          toast.textContent = btn.dataset.copied;
          toastTimer = setTimeout(() => { toast.textContent = ''; }, 4000);
        }, 100);
      }
    } catch {
      const field = screen.querySelector('#pix-code');
      if (field) { field.closest('details').open = true; field.focus(); field.select(); field.setSelectionRange(0, field.value.length); }
    }
  });

  // Escolha: o botão da barra acompanha o plano marcado (sem JS, mostra o do servidor).
  const syncCta = (radio) => {
    const label = ctaLabelFor(radio);
    const btn = document.querySelector('button[form=pedido]');
    if (label && btn) btn.textContent = label;
  };
  document.addEventListener('change', (e) => {
    if (e.target.matches && e.target.matches('input[name=plano]')) syncCta(e.target);
  });
  // Voltar pode restaurar outro rádio.
  window.addEventListener('pageshow', () => syncCta(document.querySelector('input[name=plano]:checked')));

  if (screen) init(screen, true);
}
