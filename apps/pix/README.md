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

## Link do app

O app iOS abre o site assim:

```
/pix?plano=<id>&t=<token da Apple>[&teste=1&dcq=<consulta>&dcm=<marcação>]
```

- **Planos:** `monthly` (Mensal), `quarterly` (Trimestral) e `annual` (Anual). Plano desconhecido ou ausente abre o Anual. O teste grátis usa o plano interno `teste`.
- **`t`:** token da compra externa da Apple (base64 ou base64url de um JSON). O servidor confere `bundleId` (`br.com.bdk.CorridexApp`), `appAppleId` (`6756681755`) e a validade. Token válido é guardado no servidor; inválido é ignorado, sem erro.
- **`teste=1`, `dcq`, `dcm`:** teste grátis. Se o aparelho (chave = `dcq`) nunca usou o teste, o servidor abre uma sessão de teste e guarda o `dcm`.
- **Cookies:** a primeira visita grava só ids, `pix_tok` (token da Apple, 7 dias) e `pix_trial` (sessão do teste, 30 min). Os dois são `HttpOnly`, `Secure`, `SameSite=Lax` e `Path=/pix`.
- **Redirect:** com qualquer um de `t`, `teste`, `dcq` ou `dcm`, a resposta é 302 para `/pix?plano=<id>`, sem tokens na URL.
- **Pedido:** nasce com `origin` `app` (há token da Apple) ou `site` (não há), ligado ao token guardado.
- **Teste grátis:** `/pix/teste` lê só o cookie `pix_trial`. Sessão inválida, vencida ou aparelho que já usou mostra "Este aparelho já usou o teste grátis". Ao entregar o código, o aparelho é marcado (na simulação, pela chave `dcq`) e a sessão e o cookie são apagados.
- **DeviceCheck simulado:** ainda não há DeviceCheck real. Em desenvolvimento a chave do aparelho é o próprio `dcq`, e marcar usa essa chave (o `dcm` é ignorado na simulação).
- **Teste grátis por enquanto:** só funciona com `PIX_DEV_TOOLS=true`. Sem DeviceCheck nenhuma sessão do teste abre.
- **E-mail nunca na URL:** `GET /pix` ignora `?email=`. Quem precisa reabrir a escolha com o e-mail preenchido (trocar e-mail, outro plano no aviso, tentar de novo) usa `POST /pix` com `plano` e `email`.

## Simulação

Para ver e testar todas as telas sem Banco Inter nem banco de dados, ligue as ferramentas de simulação. Crie `apps/pix/.dev.vars` (já ignorado pelo git) com:

```
PIX_DEV_TOOLS=true
```

Depois, com Node 22 (`nvm use 22`; o `wrangler` não roda no Node 20):

```bash
npm run dev -w apps/pix
```

Abra `http://localhost:8787/pix/dev`. O catálogo tem links para cada tela (inclusive o link do app do teste grátis) e cenário (`?cenario=sem-estoque`, `indisponivel-email`, `pausado`, `fora-do-ar`, `vencido`, `pendente`, `teste-usado`) e um botão para criar um pedido de exemplo. Nas páginas aparece a barra "Simulação"; na página do Pix, "Simular pagamento" marca o pedido como pago, e a página aberta em outra aba muda sozinha para "Pagamento confirmado".

Sem `PIX_DEV_TOOLS=true` (produção), `/pix/dev` e as rotas `/pix/dev/*` respondem 404, `?cenario=` é ignorado e a barra não aparece.

Enquanto o Pix real (Banco Inter + banco de dados) não existe, sem `PIX_DEV_TOOLS=true` não há provedor nem lojas: a página inteira mostra "A venda por Pix está pausada" (falha fechada), não só as rotas de simulação somem.

### No celular

- **Mesma rede Wi‑Fi:** rode `npx wrangler dev --ip 0.0.0.0` dentro de `apps/pix` e abra no celular `http://<ip-do-mac>:8787/pix/dev` (o IP aparece em Ajustes do Sistema → Wi‑Fi → Detalhes, ou com `ipconfig getifaddr en0`).
- **Fora da rede (ou se o Wi‑Fi bloquear):** com o `npm run dev` rodando, `cloudflared tunnel --url http://localhost:8787` mostra um endereço `https://….trycloudflare.com`; abra `/pix/dev` nele.

O navegador só libera a área de transferência em `https` (ou `localhost`). Pelo IP da rede, "Copiar código Pix" cai no plano B e seleciona o código; para testar a cópia de verdade no celular, use o túnel.

Os dados da simulação ficam na memória: reiniciar o `wrangler` apaga os pedidos.
