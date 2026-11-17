import { JSDOM } from 'jsdom';
import { createApp } from '../app.js';
import { PLANS } from '../plans.js';
import { createMockPixProvider } from '../pix/mock-provider.js';
import { createMemoryStores } from '../store/memory.js';
import { seedCodes } from '../dev/seed.js';

export function makeApp(overrides = {}) {
  let t = null;
  const clock = { now: () => t ?? Date.now(), set: (ms) => { t = ms; } };
  const config = {
    devTools: true,
    salesEnabled: true,
    appStoreId: '6756681755',
    supportUrl: 'https://wa.me/message/ON3GNOTDII42F1',
    ...overrides.config,
  };
  const provider = 'provider' in overrides
    ? overrides.provider
    : createMockPixProvider({ devTools: true, now: () => clock.now() });
  const stores = 'stores' in overrides
    ? overrides.stores
    : createMemoryStores({ codes: seedCodes() });
  const plans = 'plans' in overrides ? overrides.plans : PLANS;
  const now = 'now' in overrides ? overrides.now : () => clock.now();
  const app = createApp({ config, provider, stores, plans, now });
  return { app, provider, stores, clock };
}

export async function dom(res) {
  return new JSDOM(await res.text()).window.document;
}
