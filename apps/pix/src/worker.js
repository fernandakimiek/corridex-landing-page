// Entrada do Cloudflare Workers. A lógica fica em app.js, que não depende da plataforma.
import { createApp } from './app.js';
import { configFromEnv } from './config.js';

let app;

export default {
  fetch(request, env, ctx) {
    app ??= createApp({ config: configFromEnv(env), provider: null, stores: null });
    return app.fetch(request, env, ctx);
  },
};
