# corridex-pix

API e página de pagamento por Pix, servidas em `corridex.app/pix`.

Roda hoje no Cloudflare Workers (plano grátis). O código usa só Hono e APIs web padrão (`fetch`, `Request`, `Response`, WebCrypto) para poder migrar para a Vercel sem reescrever.

## Regras para manter a migração simples

- Toda rota fica sob `/pix` (`app.basePath('/pix')`). O site faz rewrite de `/pix/*` para cá.
- Nada exclusivo da Cloudflare em `src/app.js`: sem D1, KV ou bindings. O banco será Postgres (Neon).
- Tarefas agendadas viram rotas `POST /pix/cron/...` protegidas por segredo. O Cron Trigger da Cloudflare, e depois o cron da Vercel, só chamam essas rotas.
- Segredos só pelo painel ou por `npx wrangler secret put NOME`. Localmente, em `.dev.vars`.

## Comandos

O `wrangler` exige Node 22.12 ou mais novo (`nvm install 22`). Os testes (`node --test`) rodam também no Node 20.

```bash
npm run dev -w apps/pix      # http://localhost:8787/pix/health
npm test -w apps/pix
npm run deploy -w apps/pix   # publica no Cloudflare (requer login: npx wrangler login)
```
