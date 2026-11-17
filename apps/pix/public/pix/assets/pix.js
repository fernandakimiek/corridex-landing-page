// Cliente da página do Pix. Sem dependências; a página funciona sem ele.
// Consulta o status do pedido, troca o <main> quando muda, atualiza os minutos
// e copia o código. Só toca o DOM no navegador (importável no Node para testes).

// 3 s nos 2 primeiros minutos, 10 s até 30 min, depois para.
export const nextDelay = (elapsedMs) => (elapsedMs < 120_000 ? 3000 : elapsedMs < 1_800_000 ? 10000 : null);

export function remaining(expiresAtMs, nowMs) {
  const ms = expiresAtMs - nowMs;
  return { minutes: Math.max(0, Math.ceil(ms / 60_000)), expired: ms <= 0 };
}

if (typeof document !== 'undefined') {
  const start = Date.now();
  let main = document.querySelector('main');
  let timer = null;
  let tick = null;
  let active = false; // consultando o status deste <main>
  let busy = false;

  const stop = () => { clearTimeout(timer); timer = null; };
  const schedule = () => {
    stop();
    const delay = nextDelay(Date.now() - start);
    if (active && delay != null && !document.hidden) timer = setTimeout(poll, delay);
  };

  // Rede fora ou 503: tenta de novo no ritmo normal. 404: para.
  async function poll() {
    stop();
    if (!active || busy || document.hidden) return;
    busy = true;
    try {
      const res = await fetch(main.dataset.statusUrl, { cache: 'no-store' });
      if (res.status === 404) { active = false; return; }
      if (res.ok) {
        const { status } = await res.json();
        if (status && status !== main.dataset.state) return await swap();
      }
    } catch { /* tenta de novo */ } finally {
      busy = false;
    }
    schedule();
  }

  // Busca a página de novo e troca só o <main>; foco vai para o título.
  async function swap() {
    const res = await fetch(location.href, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const next = doc.querySelector('main');
    if (!next) throw new Error('sem main');
    // Mesmo estado (ex.: ?cenario= na URL): troca, mas não consulta em ciclo.
    const changed = next.dataset.state !== main.dataset.state;
    main.replaceWith(next);
    if (doc.title) document.title = doc.title;
    init(next, changed);
    const h1 = next.querySelector('h1');
    if (h1) { h1.tabIndex = -1; h1.focus(); }
  }

  function countdown() {
    const span = main.querySelector('[data-minutes]');
    if (!span) return;
    const r = remaining(Number(main.dataset.expiresAt), Date.now());
    span.textContent = r.minutes;
    if (r.expired) {
      clearInterval(tick);
      tick = null;
      poll(); // o servidor mostra "vencido"
    }
  }

  function init(m, polling) {
    main = m;
    stop();
    clearInterval(tick);
    tick = null;
    active = polling && Boolean(main.dataset.statusUrl);
    if (main.dataset.expiresAt && main.querySelector('[data-minutes]')) tick = setInterval(countdown, 30_000);
    schedule();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return stop();
    if (tick) countdown();
    poll();
  });

  // Copiar: aviso no role=status; se a área de transferência falhar, seleciona o código.
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest && e.target.closest('[data-copy]');
    if (!btn) return;
    const toast = main.querySelector('[data-toast]');
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      if (toast) {
        toast.textContent = '';
        setTimeout(() => { toast.textContent = btn.dataset.copied; }, 100);
      }
    } catch {
      const field = main.querySelector('#pix-code');
      if (field) { field.focus(); field.select(); }
    }
  });

  if (main) init(main, true);
}
