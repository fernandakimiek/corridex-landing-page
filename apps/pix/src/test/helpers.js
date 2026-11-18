import { JSDOM } from 'jsdom';
import { createApp } from '../app.js';
import { PLANS } from '../plans.js';
import { createMockPixProvider } from '../pix/mock-provider.js';
import { createMemoryStores } from '../store/memory.js';
import { seedCodes } from '../dev/seed.js';
import { createMockDeviceCheck } from '../devicecheck/mock.js';

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
  const deviceCheck = 'deviceCheck' in overrides
    ? overrides.deviceCheck
    : (stores ? createMockDeviceCheck({ trials: stores.trials }) : null);
  const now = 'now' in overrides ? overrides.now : () => clock.now();
  const app = createApp({ config, provider, stores, plans, now, deviceCheck });
  return { app, provider, stores, deviceCheck, clock };
}

export async function dom(res) {
  return new JSDOM(await res.text()).window.document;
}
