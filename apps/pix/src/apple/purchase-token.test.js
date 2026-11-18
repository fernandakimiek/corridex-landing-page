import test from 'node:test';
import assert from 'node:assert/strict';
import { decodePurchaseToken, APPLE_APP } from './purchase-token.js';

const NOW = Date.UTC(2026, 10, 18, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64');
const enc = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

const payload = (over = {}) => ({
  appAppleId: '6756681755',
  bundleId: 'br.com.bdk.CorridexApp',
  tokenCreationDate: NOW - 60_000,
  externalPurchaseId: 'e1f2a3b4-0000-4000-8000-000000000001',
  tokenType: 'ACQUISITION',
  ...over,
});

const decode = (raw, now = NOW) => decodePurchaseToken(raw, APPLE_APP, now);

test('APPLE_APP tem bundleId e appAppleId do app', () => {
  assert.deepEqual(APPLE_APP, { bundleId: 'br.com.bdk.CorridexApp', appAppleId: '6756681755' });
});

test('token válido decodifica', () => {
  assert.deepEqual(decode(enc(payload())), {
    externalPurchaseId: 'e1f2a3b4-0000-4000-8000-000000000001',
    tokenType: 'ACQUISITION',
    environment: 'Production',
    creationDate: NOW - 60_000,
    expirationDate: NOW - 60_000 + 7 * DAY,
  });
});

test('tokenExpirationDate explícito define a validade', () => {
  const d = decode(enc(payload({ tokenExpirationDate: NOW + DAY })));
  assert.equal(d.expirationDate, NOW + DAY);
  assert.equal(decode(enc(payload({ tokenExpirationDate: NOW }))), null);
});

test('aceita base64 padrão e base64url', () => {
  // Valores que geram '+', '/' e '=' no base64 padrão.
  const p = payload({ externalPurchaseId: '>>>???~~~', tokenType: 'SERVICES?' });
  const std = b64(p);
  const url = enc(p);
  assert.match(std, /[+/=]/);
  assert.notEqual(std, url);
  assert.equal(decode(std)?.externalPurchaseId, '>>>???~~~');
  assert.equal(decode(url)?.externalPurchaseId, '>>>???~~~');
});

test('SANDBOX… vira Sandbox', () => {
  assert.equal(decode(enc(payload({ externalPurchaseId: 'SANDBOX_e1f2a3b4' }))).environment, 'Sandbox');
});

test('appAppleId numérico 6756681755 vale', () => {
  assert.ok(decode(enc(payload({ appAppleId: 6756681755 }))));
});

test('null para bundleId errado, appAppleId errado, vencido, criação no futuro, JSON inválido, não-base64, campos faltando, mais de 4096 caracteres', () => {
  assert.equal(decode(enc(payload({ bundleId: 'br.com.outro.App' }))), null, 'bundleId errado');
  assert.equal(decode(enc(payload({ appAppleId: '1234567890' }))), null, 'appAppleId errado');
  assert.equal(decode(enc(payload({ tokenCreationDate: NOW - 7 * DAY }))), null, 'vencido');
  assert.equal(decode(enc(payload({ tokenCreationDate: NOW + 6 * 60_000 }))), null, 'criação no futuro');
  assert.equal(decode(Buffer.from('{não é json').toString('base64url')), null, 'JSON inválido');
  assert.equal(decode('%%%não-base64%%%'), null, 'não-base64');
  const { externalPurchaseId, ...semId } = payload();
  assert.equal(decode(enc(semId)), null, 'campos faltando');
  assert.equal(decode(enc(payload({ pad: 'x'.repeat(4096) }))), null, 'mais de 4096 caracteres');
});

test('entrada que não é texto → null', () => {
  assert.equal(decode(undefined), null);
  assert.equal(decode(''), null);
  assert.equal(decode(enc('texto')), null);
});
