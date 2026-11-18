// Entrada do Cloudflare Workers. A lógica fica em app.js, que não depende da plataforma.
import { createApp } from './app.js';
import { configFromEnv } from './config.js';
import { createMockPixProvider } from './pix/mock-provider.js';
import { createMemoryStores } from './store/memory.js';
import { seedCodes } from './dev/seed.js';
import { createMockDeviceCheck } from './devicecheck/mock.js';

let app;

export default {
  fetch(request, env, ctx) {
    if (!app) {
      const config = configFromEnv(env);
      const provider = config.devTools ? createMockPixProvider({ devTools: true, now: Date.now }) : null;
      const stores = config.devTools ? createMemoryStores({ codes: seedCodes() }) : null;
      // Sem deviceCheck o link do teste grátis não aparece (produção, por enquanto).
      const deviceCheck = config.devTools ? createMockDeviceCheck({ trials: stores.trials }) : null;
      app = createApp({ config, provider, stores, deviceCheck });
    }
    return app.fetch(request, env, ctx);
  },
};
