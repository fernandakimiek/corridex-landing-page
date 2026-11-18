import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockDeviceCheck } from './mock.js';
import { createMemoryStores } from '../store/memory.js';
import { seedCodes } from '../dev/seed.js';

test('mock: chave do aparelho = dcq; mark marca nas lojas de teste', async () => {
  const { trials } = createMemoryStores({ codes: seedCodes() });
  const dc = createMockDeviceCheck({ trials });
  assert.equal(await dc.isUsed('A'), false);
  await dc.mark('A', 'marca');
  assert.equal(await dc.isUsed('A'), true);
  assert.equal(trials.used('A'), true);
  assert.equal(await dc.isUsed('B'), false);
});
