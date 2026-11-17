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
