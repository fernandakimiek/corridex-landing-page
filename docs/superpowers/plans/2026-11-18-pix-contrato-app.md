# Contrato do link do app com o /pix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/pix` aceita o link do app iOS exatamente como o Guia §3.8 define (`plano=monthly|quarterly|annual&t&teste=1&dcq&dcm`), guarda tokens no servidor com cookies `pix_tok`/`pix_trial`, e nenhuma URL leva token ou e-mail.

**Architecture:** Hono app em `apps/pix/src/app.js` (portável: sem D1/KV/bindings). Lojas em memória em `src/store/memory.js` ganham `tokens` e `trialSessions`. Decodificação do token da Apple num módulo puro novo `src/apple/purchase-token.js`; DeviceCheck simulado em `src/devicecheck/mock.js`. Cookies via `hono/cookie`.

**Tech Stack:** JS (ESM), Hono 4, `node --test` + jsdom. Rodar testes: `cd apps/pix && npm test` (Node ≥ 20; `source ~/.nvm/nvm.sh && nvm use 22` se precisar).

**Spec:** `docs/superpowers/specs/2026-11-18-pix-contrato-app-design.md` (contexto: `.superpowers/issue431/01-comment-6936281913.md` §3.2, §4.5; `03-comment-6936689591.md` §3.8).

## Global Constraints
- Ids de plano: `monthly`, `quarterly`, `annual` (nomes Mensal, Trimestral, Anual; 990/2590/9990 centavos; 1/3/12 meses). `DEFAULT_PLAN_ID = 'annual'`. Plano interno do teste continua `teste`. Sem apelidos para `mensal|trimestral|anual`.
- Parâmetros do app: `plano`, `t`, `teste=1`, `dcq`, `dcm`. Nada de `dc_ler`/`dc_marcar` em lugar nenhum.
- Token `t`: `bundleId` = `br.com.bdk.CorridexApp`, `appAppleId` = `6756681755` (número ou string). Inválido → ignorado, sem erro.
- Cookies: `pix_tok` (7 dias = 604800 s) e `pix_trial` (30 min = 1800 s), ambos `HttpOnly; Secure; SameSite=Lax; Path=/pix`. Valor = id aleatório (`randomId()` de `src/orders.js`), nunca o token.
- Nenhuma URL (href, action de form GET, Location) contém `email=`, `t=`, `dcq=`, `dcm=`. Exceção única: o link de resgate da App Store com `code=`.
- Textos: `copy.code.redeem` = `Resgatar código` (ícone de download mantido); `copy.pending.body` = `Ele chega por e-mail em algumas horas. Pode fechar esta página.`
- `src/app.js` sem APIs exclusivas da Cloudflare. `public/pix/assets/pix.js` < 5000 bytes. Cabeçalhos/CSP atuais inalterados. Páginas continuam funcionando sem JS.
- Nunca commitar `apps/.DS_Store`.

## Review Focus
- `t` malformado (não-base64, JSON inválido, campos faltando, `appAppleId` errado, vencido): a página abre normal, sem cookie e sem 500 → teste na Task 2.
- Mesmo `t` visto duas vezes (app reabre o link): um só registro (`externalPurchaseId`), mesmo id no cookie → Task 2.
- Cookie `pix_tok`/`pix_trial` com id desconhecido ou forjado: tratado como ausente (`origin='site'`; teste → "já usou") → Tasks 2 e 3.
- `plano` inválido junto com `t`: redireciona para `/pix?plano=annual` → Task 2.
- Sessão de teste vencida (30 min) entre abrir e enviar: tela "Este aparelho já usou o teste grátis", sem entregar código → Task 3.

---

### Task 1: Ids dos planos e textos

**Files:**
- Modify: `apps/pix/src/plans.js`, `apps/pix/src/dev/seed.js` (PLAN_TAGS chaves), `apps/pix/src/app.js` (links de `/pix/dev`, `SAMPLE.planId`), `apps/pix/src/page/copy.pt-BR.js`, `apps/pix/src/page/components.js` (`RedeemButton` usa `copy.code.redeem`; `BEST_PLAN_ID` se for literal), comentários "mensal → trimestral → anual".
- Test: todos os `*.test.js` que usam os ids antigos (`choose`, `config`, `dev`, `help`, `orders`, `trial`, `order-routes`, `page/components`, `store/memory`).

**Interfaces:**
- Produces: `PLANS.{monthly,quarterly,annual}` com `id` igual à chave; `DEFAULT_PLAN_ID = 'annual'`; seed offers `monthly-a`, `annual-b` etc.; `copy.code.redeem` (substitui `redeemStore`, que sai).

- [ ] **Step 1:** Atualizar testes: troca mecânica dos ids nos testes; adicionar em `choose.test.js`:
  - `'plano=monthly seleciona o Mensal'`: `GET /pix?plano=monthly` → cartão Mensal marcado e CTA `Gerar Pix · R$ 9,90`.
  - `'plano=mensal (id antigo) cai no Anual'`: CTA `Gerar Pix · R$ 99,90`.
  - Em `order-routes.test.js`: tela paga tem botão com texto `Resgatar código`; tela `pending` contém `em algumas horas` e não contém `2 horas`.
- [ ] **Step 2:** `npm test` → falham os novos.
- [ ] **Step 3:** Implementar as trocas. `grep -rnE "'(mensal|trimestral|anual)'|plano=(mensal|trimestral|anual)|redeemStore|2 horas" src public` deve voltar vazio (exceto o teste do id antigo).
- [ ] **Step 4:** `npm test` → tudo passa.
- [ ] **Step 5:** Commit `Pix: ids dos planos do contrato do app e textos da spec`.

### Task 2: Token da Apple (`t`) e cookie `pix_tok`

**Files:**
- Create: `apps/pix/src/apple/purchase-token.js`, `apps/pix/src/apple/purchase-token.test.js`, `apps/pix/src/link.test.js` (rotas da primeira visita)
- Modify: `apps/pix/src/store/memory.js` (+ `tokens`), `apps/pix/src/store/memory.test.js`, `apps/pix/src/orders.js` (`create` aceita `purchaseTokenId`), `apps/pix/src/orders.test.js`, `apps/pix/src/app.js` (`GET /`, `POST /pedidos`)

**Interfaces:**
- Produces:
  - `decodePurchaseToken(raw: string, expected: { bundleId: string, appAppleId: string }, nowMs: number) -> { externalPurchaseId, tokenType, environment: 'Sandbox'|'Production', creationDate: number, expirationDate: number } | null`. `raw` é base64 ou base64url de JSON com `appAppleId`, `bundleId`, `tokenCreationDate` (ms), `externalPurchaseId`, `tokenType`, opcional `tokenExpirationDate` (ms). Validade: `expirationDate = tokenExpirationDate ?? tokenCreationDate + 7 dias`; inválido se `nowMs >= expirationDate` ou `tokenCreationDate > nowMs + 5 min`. Sandbox se `externalPurchaseId` começa com `SANDBOX`. Qualquer falha → `null` (nunca lança). Corta `raw` acima de 4096 caracteres → `null`.
  - `APPLE_APP = { bundleId: 'br.com.bdk.CorridexApp', appAppleId: '6756681755' }` exportado do mesmo arquivo.
  - `stores.tokens.remember(decoded) -> { id }` (idempotente por `externalPurchaseId`; `id = randomId()` na primeira vez) e `stores.tokens.byId(id) -> decoded & { id } | null`.
  - `orders.create({ planId, email, nonce, purchaseTokenId = null })` grava `purchaseTokenId` e `origin: purchaseTokenId ? 'app' : 'site'` no pedido.
  - Em `app.js`: helper `linkRedirect(c, planId)` → `c.redirect('/pix?plano=<id>[&cenario=…só devTools]', 302)`; Task 3 reutiliza.
- `GET /pix`: se a query tiver `t`, `teste`, `dcq` ou `dcm` → processar `t` (válido: `remember`, `setCookie('pix_tok', id, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/pix', maxAge: 604800 })`) e redirecionar com `linkRedirect`. Antes do redirect, respeitar venda pausada? Não: guardar token mesmo pausado é inofensivo, mas a tela pausada não redireciona — **decisão:** processar e redirecionar sempre; a URL limpa mostra a pausa.
- `POST /pedidos`: lê `getCookie(c, 'pix_tok')`; passa `purchaseTokenId` só se `stores.tokens.byId(id)` existir.

- [ ] **Step 1: Testes** (`purchase-token.test.js`) com helper `enc(obj)` = base64url do JSON:
  - `'token válido decodifica'` → campos e `environment: 'Production'`.
  - `'aceita base64 padrão e base64url'`.
  - `'SANDBOX… vira Sandbox'`.
  - `'appAppleId numérico 6756681755 vale'`.
  - `'null para bundleId errado, appAppleId errado, vencido, criação no futuro, JSON inválido, não-base64, campos faltando, mais de 4096 caracteres'` (um assert por caso).
  - `memory.test.js`: `'tokens.remember é idempotente por externalPurchaseId'`; `'byId desconhecido → null'`.
  - `orders.test.js`: `'pedido com purchaseTokenId tem origin app'`; `'sem token tem origin site e purchaseTokenId null'`.
  - `link.test.js`:
    - `'GET /pix?plano=monthly&t=<válido> → 302 para /pix?plano=monthly e Set-Cookie pix_tok HttpOnly Secure SameSite=Lax Path=/pix Max-Age=604800'`; o Location não contém `t=`.
    - `'mesmo t duas vezes → mesmo valor de cookie'`.
    - `'t inválido → 302 sem Set-Cookie'`.
    - `'plano=xyz&t=… → Location /pix?plano=annual'`.
    - `'POST /pix/pedidos com cookie pix_tok válido → pedido origin app'` (ler `stores.orders.get(token)` pelo Location); `'cookie forjado → origin site'`.
    - `'GET /pix sem parâmetros do app → 200 (sem redirect)'`.
- [ ] **Step 2:** `npm test` → falham.
- [ ] **Step 3:** Implementar. Decodificação: normalizar `-`→`+`, `_`→`/`, completar `=`, `atob`, `TextDecoder`, `JSON.parse` em `try`.
- [ ] **Step 4:** `npm test` → tudo passa.
- [ ] **Step 5:** Commit `Pix: token da Apple guardado no servidor e ligado ao pedido`.

### Task 3: Sessão do teste grátis (`dcq`/`dcm`, cookie `pix_trial`)

**Files:**
- Create: `apps/pix/src/devicecheck/mock.js`
- Modify: `apps/pix/src/store/memory.js` (+ `trialSessions`; `trials` continua), `apps/pix/src/app.js` (`GET /`, `/teste` GET/POST, `chooseView`, remover `trialSession(read)`/`trialQuery`/`trialBackHref`, `/pix/dev` links), `apps/pix/src/page/screens.js` (`trialRequestScreen` sem `dcLer/dcMarcar`; remover `forCustomer` de `trialStockScreen`), `apps/pix/src/page/components.js` (remover `TrialFields`; `TrialRequest` sem tokens), `apps/pix/src/worker.js` (passar `deviceCheck`), `apps/pix/src/test/helpers.js` (`makeApp` aceita/cria `deviceCheck`), `apps/pix/src/trial.test.js`, `apps/pix/src/link.test.js`, `apps/pix/src/dev.test.js`, `apps/pix/src/page/components.test.js`

**Interfaces:**
- Consumes: `linkRedirect` (Task 2), `randomId`.
- Produces:
  - `createMockDeviceCheck({ trials })` → `{ async isUsed(dcq) -> boolean, async mark(deviceKey, dcm) -> void }`; simulação: chave do aparelho = `dcq` (usa `trials.used/mark`).
  - `stores.trialSessions.create({ deviceKey, markToken, expiresAt }) -> id`, `.get(id, nowMs) -> session | null` (null se vencida), `.delete(id)`.
  - `createApp({ …, deviceCheck })`; sem `deviceCheck` o link do teste não aparece.
- `GET /pix` com `teste=1&dcq&dcm` (strings não vazias, ≤ 4096): se `!(await deviceCheck.isUsed(dcq))` → cria sessão (expira em `now() + 1800000`) e `setCookie('pix_trial', id, { …mesmos atributos, maxAge: 1800 })`; depois `linkRedirect`. Junto com `t`, os dois cookies saem no mesmo 302.
- Escolha mostra "Testar 7 dias grátis" (`href="/pix/teste"`) só com sessão válida no cookie.
- `GET /pix/teste`: sessão válida → formulário; senão `trialUsedScreen`. `POST /pix/teste`: sessão inválida/vencida → `trialUsedScreen`; e-mail inválido → formulário com erro; `availability('teste', email) !== 'ok'` ou sem código → `trialStockScreen()` (sem estoque); entrega: `deviceCheck.mark(session.deviceKey, session.markToken)`, `trialSessions.delete`, `deleteCookie(c, 'pix_trial', { path: '/pix' })`, `trialDeliveredScreen`.
- Cenário dev `teste-usado` continua valendo em `GET /pix/teste`.
- `/pix/dev`: link do teste = `/pix?teste=1&dcq=dev-<randomId()>&dcm=dev-marcar` (aparelho novo a cada carga do catálogo) e o de `teste-usado`.

- [ ] **Step 1: Testes** (reescrever `trial.test.js` para o fluxo com cookie; helper que faz o GET do link, lê `Set-Cookie` e manda `Cookie` nas próximas):
  - `'link com teste=1&dcq&dcm → 302 sem tokens e Set-Cookie pix_trial Max-Age=1800'`.
  - `'aparelho já usado → 302 sem pix_trial'`.
  - `'escolha com sessão mostra link /pix/teste; sem sessão não mostra'`.
  - `'POST /pix/teste entrega código, marca o aparelho e apaga o cookie (Max-Age=0)'`; `'segundo link do mesmo dcq não cria sessão'`.
  - `'sessão vencida (clock + 31 min) → Este aparelho já usou o teste grátis'`.
  - `'cookie forjado → já usou'`.
  - `'e-mail que já recebeu o teste → tela de sem estoque, nunca Para este e-mail'` (assert texto não contém `Para este e-mail`).
  - `'nenhum HTML do teste contém dcq, dcm, dc_ler ou dc_marcar'`.
  - `link.test.js`: `'t e teste juntos → dois Set-Cookie num 302'`.
- [ ] **Step 2:** `npm test` → falham.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npm test` → tudo passa.
- [ ] **Step 5:** Commit `Pix: sessão do teste grátis por cookie, sem tokens na URL`.

### Task 4: E-mail fora da URL (`POST /pix`)

**Files:**
- Modify: `apps/pix/src/app.js` (`GET /` ignora `email`; novo `POST /`; erros com e-mail), `apps/pix/src/page/screens.js` (`choosePath(planId)` sem e-mail; modo de aviso), `apps/pix/src/page/components.js` (`PlanSwitcher` no modo de aviso, botão de "Ver {plano}"), `apps/pix/src/choose.test.js`, `apps/pix/src/order-routes.test.js`, `apps/pix/src/page/components.test.js`

**Interfaces:**
- Produces:
  - `POST /pix` com `plano`, `email` (e `cenario` só devTools via query): responde 200 com a escolha (mesma lógica de `GET /`, e-mail preenchido, cortado em 254). Venda pausada → tela pausada.
  - `choosePath(planId) -> '/pix?plano=<id>'`.
  - Componente `PlanForm`/equivalente: no modo de aviso, quando há e-mail, os cartões de plano e "Ver {plano}" são `<button name="plano" value="<id>">` de um `<form method="post" action="/pix">` com `<input type="hidden" name="email">`; sem e-mail, continuam links `choosePath(id)`. "Trocar e-mail" vira `method="post" action="/pix"`. `errorScreen({ retryHref })` ganha `retryEmail`: com e-mail, "Tentar de novo" é botão de POST `/pix` (plano + e-mail); sem, link.
- Visual igual ao atual (botão estilizado como o cartão/link de hoje).

- [ ] **Step 1: Testes:**
  - `'nenhum href nem form GET de nenhuma tela contém email='`: percorrer escolha normal, `cenario=sem-estoque` via POST com e-mail, `indisponivel-email`, recusa de estoque do `POST /pix/pedidos`, erro `fora-do-ar` com e-mail, renovar recusado; assert em todo `a[href]` e `form[method=get]` (inclui inputs) do DOM.
  - `'POST /pix com plano=quarterly&email=a@b.com → 200, cartão Trimestral marcado, campo com a@b.com'`.
  - `'GET /pix?email=a@b.com ignora o e-mail'` (campo vazio).
  - `'aviso Ver Trimestral com e-mail é botão de POST com email oculto'`.
  - `'Tentar de novo com e-mail é POST /pix'`.
- [ ] **Step 2:** `npm test` → falham.
- [ ] **Step 3:** Implementar. Remover a constante/comentário "corta o ?email= pré-preenchido".
- [ ] **Step 4:** `npm test` → tudo passa. Conferir `wc -c public/pix/assets/pix.js` < 5000.
- [ ] **Step 5:** Commit `Pix: e-mail nunca na URL`.

### Task 5: README

**Files:** Modify `apps/pix/README.md`: seção do link do app (parâmetros, cookies, redirect), ids dos planos, simulação do DeviceCheck, `/pix/dev`.

- [ ] **Step 1:** Atualizar. `grep -nE "mensal|dc_ler|email=" apps/pix/README.md` só sobra o nome "Mensal".
- [ ] **Step 2:** `npm test` passa. Commit `Pix: README do contrato do link do app`.
