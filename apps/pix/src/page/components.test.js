import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { PixPayment, PayHero, PaymentStatus, CodeCard, OrderSummary, HelpList, RedeemButton, TrialRequest, Notice, EmailField } from './components.js';
import { copy } from './copy.pt-BR.js';

const frag = async (h) => new JSDOM(`<body>${await h}</body>`).window.document;

test('PixPayment: código com "Copiar" ao lado (fora do summary), código completo recolhido, passos e QR', async () => {
  const doc = await frag(PixPayment({ copiaECola: '000201<x>', qrSvg: '<svg></svg>' }));
  const button = doc.querySelector('.code .row [data-copy]');
  assert.equal(button.textContent, copy.pix.copyShort);
  assert.equal(button.getAttribute('aria-label'), copy.pix.copy);
  assert.equal(button.dataset.copy, '000201<x>');
  assert.equal(button.dataset.copied, copy.pix.copied);
  assert.equal(doc.querySelector('.code details summary').textContent, copy.pix.showCode);
  assert.equal(doc.querySelector('.code details #pix-code').value, '000201<x>');
  assert.equal(doc.querySelectorAll('summary button').length, 0);
  const qr = doc.querySelector('details.qr [role=img]');
  assert.equal(qr.getAttribute('aria-label'), copy.pix.qrAlt);
  assert.ok(button.compareDocumentPosition(qr) & 4); // código vem antes
  assert.equal(doc.querySelectorAll('ol.steps li').length, 3);
});

test('PayHero: plano, valor e "Vale até HH:MM · N min"', async () => {
  const doc = await frag(PayHero({
    plan: { name: 'Anual' }, amountCents: 9990,
    expiresAt: Date.UTC(2026, 10, 17, 15, 30), nowMs: Date.UTC(2026, 10, 17, 15, 0),
  }));
  assert.equal(doc.querySelector('h1.amount').textContent, 'Pague R$ 99,90 com Pix');
  assert.equal(doc.querySelectorAll('h1.amount .vh').length, 2);
  assert.match(doc.body.textContent.replace(/\s+/g, ' '), /Corridex Anual Pague R\$ 99,90 com Pix Vale até 12:30 · 30 min/);
  assert.equal(doc.querySelector('[data-minutes]').textContent, '30');
});

test('PaymentStatus: aria-live polite com o ponto de status', async () => {
  const doc = await frag(PaymentStatus());
  assert.equal(doc.querySelector('[aria-live=polite]').textContent, copy.pix.waitingLong);
  assert.ok(doc.querySelector('[aria-live=polite] .dot'));
});

test('CodeCard: rótulo, código agrupado e soletrado, "Resgate até … · enviado para …"', async () => {
  const doc = await frag(CodeCard({
    code: { value: 'EXEMP1L0CODIGO0000', redeemBy: '2027-05-16' }, email: 'motorista@email.com',
  }));
  const card = doc.querySelector('.card');
  assert.equal(card.querySelector('#code-label').textContent, copy.code.label);
  const out = card.querySelector('output.code');
  assert.equal(out.getAttribute('aria-labelledby'), 'code-label code-spelled');
  assert.equal(out.querySelector('[aria-hidden=true]').textContent, 'EXEMP1 L0CODI GO0000');
  assert.equal(doc.getElementById('code-spelled').textContent, 'E X E M P 1 L 0 C O D I G O 0 0 0 0');
  assert.equal(card.querySelector('.note').textContent, 'Resgate até 16/05/2027 · enviado para m•••@email.com');
  // Sem prazo ou sem e-mail: só o que existir.
  const noDate = await frag(CodeCard({ code: { value: 'ABC' }, email: 'motorista@email.com' }));
  assert.equal(noDate.querySelector('.note').textContent, 'Também enviamos para m•••@email.com. O código vale uma vez só.');
  const noEmail = await frag(CodeCard({ code: { value: 'ABC', redeemBy: '2027-05-16' } }));
  assert.equal(noEmail.querySelector('.note').textContent, 'Resgate até 16/05/2027.');
  const none = await frag(CodeCard({ code: { value: 'ABC' } }));
  assert.equal(none.querySelector('.note'), null);
});

test('RedeemButton: link exato da App Store com ícone decorativo', async () => {
  const doc = await frag(RedeemButton({ appStoreId: '6756681755', code: 'EXEMP1L0CODIGO0000' }));
  const a = doc.querySelector('a.btn-primary');
  assert.equal(a.getAttribute('href'), 'https://apps.apple.com/redeem?ctx=offercodes&id=6756681755&code=EXEMP1L0CODIGO0000');
  assert.equal(a.textContent, copy.code.redeem);
  assert.equal(a.querySelector('svg').getAttribute('aria-hidden'), 'true');
});

test('OrderSummary: lista plano — valor e "Pago em" — data · Pix', async () => {
  const plan = { name: 'Anual' };
  const doc = await frag(OrderSummary({ order: { amountCents: 9990, paidAt: Date.UTC(2026, 10, 17, 15) }, plan }));
  const rows = [...doc.querySelectorAll('dl.card.rows > div')].map((r) => [r.querySelector('dt').textContent, r.querySelector('dd').textContent]);
  assert.deepEqual(rows, [['Corridex Anual', 'R$ 99,90'], ['Pago em', '17/11/2026 · Pix']]);
  const unpaid = await frag(OrderSummary({ order: { amountCents: 9990, paidAt: null }, plan }));
  assert.equal(unpaid.querySelectorAll('dl > div').length, 1);
});

test('HelpList e TrialRequest', async () => {
  const help = await frag(HelpList());
  assert.deepEqual([...help.querySelectorAll('.card.rows h2')].map((h) => h.textContent), [copy.help.account, copy.help.wait]);
  assert.equal(help.querySelector('a, button'), null);
  const trial = await frag(TrialRequest({ email: 'a"b' }));
  assert.equal(trial.querySelector('[name=email]').value, 'a"b');
  assert.equal(trial.querySelectorAll('input[type=hidden]').length, 0);
  // O botão fica na barra de ação (form="teste"), fora do formulário.
  assert.equal(trial.querySelector('form').id, 'teste');
  assert.equal(trial.querySelector('button'), null);
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

test('ActionBar: principal, secundárias e nota, nessa ordem', async () => {
  const { ActionBar, LinkButton, SubmitButton } = await import('./components.js');
  const doc = await frag(ActionBar({
    primary: SubmitButton({ label: 'Gerar', form: 'f1' }),
    secondary: LinkButton({ label: 'Voltar', href: '/pix', variant: 'plain' }),
    note: 'Pagamento pelo Banco Inter',
  }));
  const bar = doc.querySelector('div.bar');
  assert.ok(bar);
  const kids = [...bar.children];
  assert.equal(kids.length, 3);
  assert.equal(kids[0].tagName, 'BUTTON');
  assert.equal(kids[0].getAttribute('form'), 'f1');
  assert.equal(kids[1].textContent, 'Voltar');
  assert.equal(kids[2].textContent, 'Pagamento pelo Banco Inter');
  assert.ok(kids[2].classList.contains('fine'));
  const only = await frag(ActionBar({ primary: SubmitButton({ label: 'X' }) }));
  assert.equal(only.querySelector('.bar').children.length, 1);
});

test('ResultHero: ícone aria-hidden, h1 e .sub', async () => {
  const { ResultHero } = await import('./components.js');
  for (const tone of ['success', 'warning', 'error', 'info', 'clock', 'gift']) {
    const doc = await frag(ResultHero({ tone, title: 'Título', body: 'Texto' }));
    const svg = doc.querySelector('svg');
    assert.ok(svg, tone);
    assert.equal(svg.getAttribute('aria-hidden'), 'true');
    assert.equal(doc.querySelector('h1').textContent, 'Título');
    assert.equal(doc.querySelector('p.sub').textContent, 'Texto');
    assert.ok(svg.compareDocumentPosition(doc.querySelector('h1')) & 4);
  }
  // Várias linhas de texto secundário, na ordem.
  const lines = await frag(ResultHero({ tone: 'success', title: 'T', body: ['Um', 'Dois'] }));
  assert.deepEqual([...lines.querySelectorAll('p.sub')].map((p) => p.textContent), ['Um', 'Dois']);
  const noBody = await frag(ResultHero({ tone: 'info', title: 'T' }));
  assert.equal(noBody.querySelector('.sub'), null);
});

test('PlanSwitcher com submit: outros planos são <button name=plano> (sem links); atual e indisponível sem interação', async () => {
  const { PlanSwitcher } = await import('./components.js');
  const { PLANS } = await import('../plans.js');
  const doc = await frag(PlanSwitcher({ plans: PLANS, selectedPlanId: 'monthly', unavailablePlanIds: ['annual'], submit: true }));
  const buttons = [...doc.querySelectorAll('ul.plans button.plan')];
  assert.deepEqual(buttons.map((b) => [b.getAttribute('type'), b.name, b.value]), [['submit', 'plano', 'quarterly']]);
  assert.equal(doc.querySelectorAll('a').length, 0);
  assert.equal(doc.querySelector('.plan[aria-current=true] button'), null);
  assert.equal(doc.querySelector('.plan.off button'), null);
});
