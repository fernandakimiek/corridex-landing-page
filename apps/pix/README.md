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

## Simulação

Para ver e testar todas as telas sem Banco Inter nem banco de dados, ligue as ferramentas de simulação. Crie `apps/pix/.dev.vars` (já ignorado pelo git) com:

```
PIX_DEV_TOOLS=true
```

Depois, com Node 22 (`nvm use 22`; o `wrangler` não roda no Node 20):

```bash
npm run dev -w apps/pix
```

Abra `http://localhost:8787/pix/dev`. O catálogo tem links para cada tela e cenário (`?cenario=sem-estoque`, `indisponivel-email`, `pausado`, `fora-do-ar`, `vencido`, `pendente`, `teste-usado`) e um botão para criar um pedido de exemplo. Nas páginas aparece a barra "Simulação"; na página do Pix, "Simular pagamento" marca o pedido como pago, e a página aberta em outra aba muda sozinha para "Pagamento confirmado".

Sem `PIX_DEV_TOOLS=true` (produção), `/pix/dev` e as rotas `/pix/dev/*` respondem 404, `?cenario=` é ignorado e a barra não aparece.

### No celular

- **Mesma rede Wi‑Fi:** rode `npx wrangler dev --ip 0.0.0.0` dentro de `apps/pix` e abra no celular `http://<ip-do-mac>:8787/pix/dev` (o IP aparece em Ajustes do Sistema → Wi‑Fi → Detalhes, ou com `ipconfig getifaddr en0`).
- **Fora da rede (ou se o Wi‑Fi bloquear):** com o `npm run dev` rodando, `cloudflared tunnel --url http://localhost:8787` mostra um endereço `https://….trycloudflare.com`; abra `/pix/dev` nele.

O navegador só libera a área de transferência em `https` (ou `localhost`). Pelo IP da rede, "Copiar código Pix" cai no plano B e seleciona o código; para testar a cópia de verdade no celular, use o túnel.

Os dados da simulação ficam na memória: reiniciar o `wrangler` apaga os pedidos.
