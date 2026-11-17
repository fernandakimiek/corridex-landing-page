import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { PixPayment, PaymentStatus, CodeDelivery, CodeHelp, TrialRequest, Notice, EmailField } from './components.js';
import { copy } from './copy.pt-BR.js';

const frag = async (h) => new JSDOM(`<body>${await h}</body>`).window.document;

test('PixPayment: copiar antes do QR, QR com rótulo, role=status', async () => {
  const doc = await frag(PixPayment({ copiaECola: '000201<x>', qrSvg: '<svg></svg>' }));
  const button = doc.querySelector('[data-copy]');
  assert.equal(button.textContent, copy.pix.copy);
  assert.equal(button.dataset.copy, '000201<x>');
  const qr = doc.querySelector('[role=img]');
  assert.equal(qr.getAttribute('aria-label'), copy.pix.qrAlt);
  assert.ok(button.compareDocumentPosition(qr) & 4); // botão vem antes
  assert.ok(doc.querySelector('[role=status]'));
});

test('PaymentStatus: aria-live polite, hora e minutos', async () => {
  const doc = await frag(PaymentStatus({ expiresAt: Date.UTC(2026, 10, 17, 15, 30), nowMs: Date.UTC(2026, 10, 17, 15, 0) }));
  assert.match(doc.querySelector('[aria-live=polite]').textContent, /Aguardando pagamento…/);
  assert.match(doc.body.textContent, /Vale até 12:30 \(30 min\)/);
  assert.equal(doc.querySelector('[data-minutes]').textContent, '30');
});

test('CodeDelivery: link de resgate, código agrupado e soletrado, e-mail mascarado', async () => {
  const doc = await frag(CodeDelivery({
    code: { value: 'EXEMP1L0CODIGO0000', redeemBy: '2027-05-16' },
    email: 'motorista@email.com', appStoreId: '6756681755', helpHref: '/pix/pedido/x/ajuda',
  }));
  assert.equal(
    doc.querySelector('a.btn-primary').getAttribute('href'),
    'https://apps.apple.com/redeem?ctx=offercodes&id=6756681755&code=EXEMP1L0CODIGO0000',
  );
  const out = doc.querySelector('output');
  assert.match(out.textContent, /EXEMP1 L0CODI GO0000/);
  assert.equal(doc.getElementById('code-spelled').textContent, 'E X E M P 1 L 0 C O D I G O 0 0 0 0');
  assert.match(doc.body.textContent, /Resgate até 16\/05\/2027\. Também enviamos para m•••@email\.com/);
  assert.ok([...doc.querySelectorAll('a')].some((a) => a.textContent === copy.code.help));
});

test('CodeHelp e TrialRequest', async () => {
  const help = await frag(CodeHelp({ supportUrl: 'https://wa.me/message/ON3GNOTDII42F1' }));
  assert.equal(help.querySelector('a').getAttribute('href'), 'https://wa.me/message/ON3GNOTDII42F1');
  const trial = await frag(TrialRequest({ dcLer: 'a"b', dcMarcar: 'c', email: '' }));
  assert.equal(trial.querySelector('[name=dc_ler]').value, 'a"b');
  assert.equal(trial.querySelector('button').textContent, copy.trial.cta);
});

test('Notice error tem role=alert; EmailField liga o erro por aria-describedby', async () => {
  const n = await frag(Notice({ tone: 'error', title: 'x' }));
  assert.ok(n.querySelector('[role=alert][data-tone=error]'));
  const w = await frag(Notice({ tone: 'warning', title: 'x' }));
  assert.equal(w.querySelector('[role=alert]'), null);
  const f = await frag(EmailField({ value: 'x', error: true }));
  const input = f.querySelector('input');
  assert.equal(input.getAttribute('aria-invalid'), 'true');
  const err = f.getElementById(input.getAttribute('aria-describedby').split(' ')[0]);
  assert.equal(err.textContent, copy.email.invalid);
});
