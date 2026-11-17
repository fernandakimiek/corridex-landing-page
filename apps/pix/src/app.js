import { Hono } from 'hono';
import { PLANS } from './plans.js';

// Tudo vive sob /pix: o site (corridex.app) faz rewrite de /pix/* para este app,
// então o mesmo caminho funciona no Cloudflare Workers hoje e na Vercel depois.
// Não use APIs exclusivas da Cloudflare aqui (D1, KV, bindings): este arquivo
// precisa rodar igual nas duas plataformas.
export function createApp({ config, provider, stores, plans = PLANS, now = Date.now }) {
  const app = new Hono().basePath('/pix');
  app.use('*', async (c, next) => {
    c.set('deps', { config, provider, stores, plans, now });
    await next();
  });

  app.get('/health', (c) => c.json({ ok: true }));

  return app;
}
