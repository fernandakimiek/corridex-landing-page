import { Hono } from 'hono';

// Tudo vive sob /pix: o site (corridex.app) faz rewrite de /pix/* para este app,
// então o mesmo caminho funciona no Cloudflare Workers hoje e na Vercel depois.
// Não use APIs exclusivas da Cloudflare aqui (D1, KV, bindings): este arquivo
// precisa rodar igual nas duas plataformas.
export const app = new Hono().basePath('/pix');

app.get('/health', (c) => c.json({ ok: true }));
