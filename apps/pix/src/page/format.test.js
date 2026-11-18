import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brl, maskEmail, groupCode, dateBR, dateBRFromMs, timeBR, redeemUrl } from './format.js';
import { t } from './copy.pt-BR.js';

test('brl', () => {
  assert.equal(brl(9990), 'R$ 99,90');
  assert.equal(brl(990), 'R$ 9,90');
  assert.equal(brl(2590), 'R$ 25,90');
  assert.equal(brl(123456), 'R$ 1.234,56');
});

test('maskEmail', () => {
  assert.equal(maskEmail('motorista@email.com'), 'm•••@email.com');
});

test('groupCode', () => {
  assert.equal(groupCode('EXEMP1L0CODIGO0000'), 'EXEMP1 L0CODI GO0000');
});

test('dateBR', () => {
  assert.equal(dateBR('2027-05-16'), '16/05/2027');
});

test('timeBR em America/Sao_Paulo', () => {
  assert.equal(timeBR(Date.UTC(2026, 10, 17, 15, 5)), '12:05');
});

test('redeemUrl', () => {
  assert.equal(
    redeemUrl('6756681755', 'ABC123'),
    'https://apps.apple.com/redeem?ctx=offercodes&id=6756681755&code=ABC123',
  );
});

test('t preenche placeholders', () => {
  assert.equal(t('Ver {plano}', { plano: 'Anual' }), 'Ver Anual');
  assert.equal(t('{a} e {b}', { a: 1 }), '1 e {b}');
});

test('dateBRFromMs usa o fuso de Brasília', () => {
  assert.equal(dateBRFromMs(Date.UTC(2026, 10, 17, 15, 0, 0)), '17/11/2026');
  // 01:30 UTC de 18/11 ainda é 17/11 em Brasília (UTC-3).
  assert.equal(dateBRFromMs(Date.UTC(2026, 10, 18, 1, 30, 0)), '17/11/2026');
});
