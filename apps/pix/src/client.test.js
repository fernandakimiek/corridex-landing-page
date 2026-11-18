import { test } from 'node:test';
import assert from 'node:assert/strict';

// pix.js é servido como asset estático; importar no Node não pode tocar o DOM.
const load = () => import('../public/pix/assets/pix.js');

test('importar pix.js no Node não lança', async () => {
  await assert.doesNotReject(load());
});

test('nextDelay: 3 s até 2 min, 10 s até 30 min, depois para', async () => {
  const { nextDelay } = await load();
  assert.equal(nextDelay(0), 3000);
  assert.equal(nextDelay(119_999), 3000);
  assert.equal(nextDelay(120_000), 10000);
  assert.equal(nextDelay(1_799_999), 10000);
  assert.equal(nextDelay(1_800_000), null);
});

test('remaining: minutos arredondados para cima, mínimo 0', async () => {
  const { remaining } = await load();
  assert.deepEqual(remaining(60_000 * 29 + 1, 0), { minutes: 30, expired: false });
  assert.deepEqual(remaining(60_000, 0), { minutes: 1, expired: false });
  assert.deepEqual(remaining(0, 0), { minutes: 0, expired: true });
  assert.deepEqual(remaining(0, 1), { minutes: 0, expired: true });
});

test('ctaLabelFor: rótulo do botão da barra vem do data-cta do rádio', async () => {
  const { ctaLabelFor } = await load();
  assert.equal(ctaLabelFor({ dataset: { cta: 'Gerar Pix · R$ 9,90' } }), 'Gerar Pix · R$ 9,90');
  assert.equal(ctaLabelFor({ dataset: {} }), null);
  assert.equal(ctaLabelFor(null), null);
});

test('swapScreen: troca a .screen inteira (paying → delivered), inclusive a barra', async () => {
  const { JSDOM } = await import('jsdom');
  const { swapScreen } = await load();
  const { payingScreen } = await import('./page/screens.js');
  const { PLANS } = await import('./plans.js');
  const T0 = Date.UTC(2026, 10, 17, 15, 0);
  const order = { token: 'tok123', amountCents: 9990, copiaECola: '000201abc', expiresAt: T0 + 30 * 60_000 };
  const paying = String(await payingScreen({ order, plan: PLANS.anual, qrSvg: '<svg></svg>', nowMs: T0 }));
  const { document } = new JSDOM(paying).window;
  assert.match(document.querySelector('.bar').textContent, /Copiar código Pix/);

  const delivered = `<!doctype html><title>Pagamento confirmado · Corridex</title><body>
<div class="screen" data-state="delivered"><header class="nav">Pagamento</header>
<main class="content"><h1>Pagamento confirmado</h1><noscript><a href="/x">sem js</a></noscript></main>
<div class="bar"><a class="btn btn-primary" href="https://apps.apple.com/redeem">Resgatar na App Store</a></div></div></body>`;
  const next = swapScreen(document, delivered);

  const screens = document.querySelectorAll('.screen');
  assert.equal(screens.length, 1);
  assert.equal(screens[0], next);
  assert.equal(next.dataset.state, 'delivered');
  const bars = document.querySelectorAll('.bar');
  assert.equal(bars.length, 1);
  assert.equal(bars[0].textContent.trim(), 'Resgatar na App Store');
  assert.doesNotMatch(document.body.textContent, /Copiar código Pix/);
  assert.equal(document.querySelectorAll('[data-copy]').length, 0);
  assert.equal(document.title, 'Pagamento confirmado · Corridex');
  // <noscript> lido sem scripts viraria HTML visível: sai na troca.
  assert.equal(next.querySelector('noscript'), null);
});

test('swapScreen: resposta sem .screen lança e mantém a tela atual', async () => {
  const { JSDOM } = await import('jsdom');
  const { swapScreen } = await load();
  const { document } = new JSDOM('<div class="screen" data-state="paying"><div class="bar">x</div></div>').window;
  assert.throws(() => swapScreen(document, '<p>erro</p>'));
  assert.equal(document.querySelector('.screen').dataset.state, 'paying');
});

test('pix.js continua abaixo de 5 KB', async () => {
  const { statSync } = await import('node:fs');
  assert.ok(statSync(new URL('../public/pix/assets/pix.js', import.meta.url)).size < 5000);
});
