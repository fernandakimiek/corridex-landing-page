import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { html } from 'hono/html';
import { page, devBarView } from './page/layout.js';
import { copy } from './page/copy.pt-BR.js';

const doc = async (h) => new JSDOM(String(await h)).window.document;
const bar = html`<div class="bar"><button class="btn btn-primary">Ok</button></div>`;

test('page com bar: .screen > .nav + main.content + .bar, nessa ordem', async () => {
  const d = await doc(page({ title: 'X', nav: { title: copy.nav.payment }, body: html`<p>oi</p>`, bar, state: 'paying' }));
  const screen = d.querySelector('body > .screen');
  assert.ok(screen);
  const kids = [...screen.children].map((el) => `${el.tagName.toLowerCase()}.${el.className}`);
  assert.deepEqual(kids, ['header.nav', 'main.content', 'div.bar']);
  assert.equal(screen.querySelector('.nav').textContent.trim(), 'Pagamento');
  assert.equal(screen.querySelector('main').textContent.trim(), 'oi');
});

test('page sem bar: não há .bar; nav padrão é a marca', async () => {
  const d = await doc(page({ title: 'X', body: html`<p>oi</p>`, state: 'choose' }));
  assert.equal(d.querySelector('.bar'), null);
  const nav = d.querySelector('.screen > header.nav');
  assert.ok(nav.querySelector('.brand'));
  assert.match(nav.textContent, /Corridex/);
});

test('data-state e data-* ficam em .screen, não no main', async () => {
  const d = await doc(page({ body: '', state: 'paying', data: { statusUrl: '/s', expiresAt: 5 } }));
  const screen = d.querySelector('.screen');
  assert.equal(screen.dataset.state, 'paying');
  assert.equal(screen.dataset.statusUrl, '/s');
  assert.equal(screen.dataset.expiresAt, '5');
  assert.equal(d.querySelector('main').hasAttribute('data-state'), false);
});

test('devBar vem antes de .screen, no topo do body', async () => {
  const d = await doc(page({ body: '', state: 'choose', devBar: devBarView() }));
  const first = d.body.firstElementChild;
  assert.ok(first.classList.contains('devbar'));
  assert.ok(first.nextElementSibling.classList.contains('screen'));
});

test("layout 'result' gera main.content.result", async () => {
  const d = await doc(page({ body: '', state: 'delivered', layout: 'result' }));
  assert.ok(d.querySelector('main.content.result'));
  const flow = await doc(page({ body: '', state: 'choose' }));
  assert.equal(flow.querySelector('main.result'), null);
});

test('sem <footer> global', async () => {
  const d = await doc(page({ body: '', state: 'choose' }));
  assert.equal(d.querySelector('footer'), null);
});

test('CSS: campos têm scroll-margin, btn-plain 15px, toast vazio some', () => {
  const out = String(page({ title: 'x', body: html`<p>x</p>` }));
  assert.match(out, /\.field input,\.pixcode\{scroll-margin-bottom:11rem\}/);
  assert.match(out, /\.btn-plain\{min-height:44px;[^}]*font-size:\.9375rem/);
  assert.match(out, /\.bar>\.toast:empty\{[^}]*background:none/);
  assert.match(out, /\.note\.inset\{padding-left:16px\}|\.note\.inset,|,\.note\.inset/);
});
