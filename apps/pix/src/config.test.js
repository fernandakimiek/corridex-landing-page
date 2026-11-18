import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configFromEnv } from './config.js';
import { PLANS } from './plans.js';

test('devTools só com "true"', () => {
  assert.equal(configFromEnv({ PIX_DEV_TOOLS: 'true' }).devTools, true);
  assert.equal(configFromEnv({ PIX_DEV_TOOLS: '1' }).devTools, false);
  assert.equal(configFromEnv({}).devTools, false);
});

test('vendas ligadas salvo "false"', () => {
  assert.equal(configFromEnv({}).salesEnabled, true);
  assert.equal(configFromEnv({ PIX_SALES_ENABLED: 'false' }).salesEnabled, false);
});

test('preços dos planos', () => {
  assert.deepEqual(
    Object.values(PLANS).map((p) => [p.id, p.amountCents]),
    [['monthly', 990], ['quarterly', 2590], ['annual', 9990]],
  );
});
