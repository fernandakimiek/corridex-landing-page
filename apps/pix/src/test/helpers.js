import { JSDOM } from 'jsdom';
import { createApp } from '../app.js';
import { PLANS } from '../plans.js';

export function makeApp(overrides = {}) {
  const clock = { t: null, now() { return this.t ?? Date.now(); }, set(ms) { this.t = ms; } };
  const config = {
    devTools: true,
    salesEnabled: true,
    appStoreId: '6756681755',
    supportUrl: 'https://wa.me/message/ON3GNOTDII42F1',
    ...overrides.config,
  };
  const provider = overrides.provider ?? null;
  const stores = overrides.stores ?? null;
  const plans = overrides.plans ?? PLANS;
  const now = overrides.now ?? (() => clock.now());
  const app = createApp({ config, provider, stores, plans, now });
  return { app, provider, stores, clock };
}

export async function dom(res) {
  return new JSDOM(await res.text()).window.document;
}
