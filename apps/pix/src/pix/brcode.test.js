import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc16, buildBrCode } from './brcode.js';

// Lê campos EMV (id 2 + tamanho 2 + valor) de uma string; devolve Map id → valor.
function parseFields(str) {
  const out = new Map();
  let i = 0;
  while (i < str.length) {
    const id = str.slice(i, i + 2);
    const len = Number(str.slice(i + 2, i + 4));
    out.set(id, str.slice(i + 4, i + 4 + len));
    i += 4 + len;
  }
  return out;
}

const BASE = { key: 'teste@corridex.app', name: 'CORRIDEX', city: 'SAO PAULO', txid: 'X1' };

test('crc16 CCITT-FALSE', () => assert.equal(crc16('123456789'), '29B1'));

test('monta campos EMV e CRC válido', () => {
  const s = buildBrCode({ key: 'teste@corridex.app', name: 'CORRIDEX', city: 'SAO PAULO',
    amountCents: 9990, txid: 'PEDIDO123', description: 'TESTE - NAO PAGUE' });
  assert.ok(s.startsWith('000201'));
  assert.ok(s.includes('0014br.gov.bcb.pix'));
  assert.ok(s.includes('5303986'));
  assert.ok(s.includes('540599.90'));
  assert.ok(s.includes('5802BR'));
  assert.ok(s.includes('0509PEDIDO123'));
  assert.equal(s.slice(-4), crc16(s.slice(0, -4)));
  assert.equal(s.slice(-8, -4), '6304');
});

test('corta nome em 25 e cidade em 15', () => {
  const s = buildBrCode({ ...BASE, name: 'A'.repeat(30), city: 'B'.repeat(20) });
  const f = parseFields(s);
  assert.equal(f.get('59'), 'A'.repeat(25));
  assert.equal(f.get('60'), 'B'.repeat(15));
  assert.ok(s.includes(`5925${'A'.repeat(25)}`));
  assert.ok(s.includes(`60${'15'}${'B'.repeat(15)}`));
});

test('formata valor a partir de centavos sem erro de ponto flutuante', () => {
  const valor = (amountCents) => parseFields(buildBrCode({ ...BASE, amountCents })).get('54');
  assert.equal(valor(990), '9.90');
  assert.equal(valor(2590), '25.90');
  assert.equal(valor(9990), '99.90');
  assert.equal(valor(100), '1.00');
  assert.equal(valor(5), '0.05');
  assert.equal(valor(1005), '10.05');
});

test('omite sub-campo 02 quando não há descrição', () => {
  const s = buildBrCode({ ...BASE, amountCents: 990 });
  const merchant = parseFields(s).get('26');
  assert.equal(parseFields(merchant).has('02'), false);
  assert.equal(parseFields(merchant).get('00'), 'br.gov.bcb.pix');
  assert.equal(parseFields(merchant).get('01'), BASE.key);
});

test('inclui sub-campo 02 com a descrição quando presente', () => {
  const s = buildBrCode({ ...BASE, amountCents: 990, description: 'TESTE - NAO PAGUE' });
  const merchant = parseFields(parseFields(s).get('26'));
  assert.equal(merchant.get('02'), 'TESTE - NAO PAGUE');
});
