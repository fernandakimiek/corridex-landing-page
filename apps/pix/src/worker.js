// Entrada do Cloudflare Workers. A lógica fica em app.js, que não depende da plataforma.
import { createApp } from './app.js';
import { configFromEnv } from './config.js';
import { createMockPixProvider } from './pix/mock-provider.js';
import { createMemoryStores } from './store/memory.js';
import { seedCodes } from './dev/seed.js';

let app;

export default {
  fetch(request, env, ctx) {
    if (!app) {
      const config = configFromEnv(env);
      const provider = config.devTools ? createMockPixProvider({ devTools: true, now: Date.now }) : null;
      const stores = config.devTools ? createMemoryStores({ codes: seedCodes() }) : null;
      app = createApp({ config, provider, stores });
    }
    return app.fetch(request, env, ctx);
  },
};
