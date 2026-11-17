# Telas do Pix com pagamento simulado — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página `/pix` completa (todos os estados do handoff) servida pelo Worker `apps/pix`, com provedor Pix simulado e lojas em memória, pronta para trocar pelo Inter depois.

**Architecture:** Hono gera o HTML no servidor (`hono/html`); cada pedido tem uma URL (`/pix/pedido/:token`) cujo estado é decidido no servidor por um serviço de pedidos. Provedor Pix e lojas entram por injeção em `createApp(...)`. Um módulo JS pequeno, servido como asset estático, faz consulta de status, cópia e prazo.

**Tech Stack:** Cloudflare Workers, Hono 4, `hono/html`, `uqr` (QR em SVG), `node --test`, jsdom (testes).

**Spec:** `docs/superpowers/specs/2026-11-17-pix-telas-mockadas-design.md` — ler antes de cada tarefa. Handoff visual: https://claude.ai/artifact/GR4vNDrqcayTxJQvidjS46 (tokens, mockups, tabela de textos).

## Global Constraints

- `apps/pix/src/app.js` e tudo que ele importa: sem D1, KV, bindings ou APIs exclusivas da Cloudflare. Só Hono e APIs web.
- Node: testes rodam com `node --test` no Node 20 (`npm test -w apps/pix`). Sem TypeScript, sem JSX, sem build.
- Preços em centavos: Mensal `990`, Trimestral `2590`, Anual `9990`. IDs: `mensal`, `trimestral`, `anual`; teste grátis usa estoque `teste`.
- Validade do Pix: 1800 s. Consulta do cliente: 3 s até 2 min, depois 10 s até 30 min.
- Todo texto visível vem de `src/page/copy.pt-BR.js`, com as chaves do handoff. Nunca: "token", "oferta", "geração", "Apple ID", "webhook" em texto visível.
- Valores em reais exibidos como `R$ 99,90` (espaço comum). E-mail mascarado `m•••@email.com`. Código exibido em grupos de 6 separados por espaço.
- `PIX_DEV_TOOLS === 'true'` liga simulação; qualquer outro valor: rotas `/pix/dev/*` 404, `?cenario=` ignorado, provedor simulado recusa iniciar.
- `PIX_SALES_ENABLED === 'false'` → venda pausada. Sem provedor configurado → venda pausada (falha fechada).
- Rodapé: "Pagamento pelo Banco Inter".
- Respostas HTML: `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`; sem analytics; sem fonte ou script de terceiros.
- Link "Resgatar código": `https://apps.apple.com/redeem?ctx=offercodes&id=6756681755&code=<código>`.
- Suporte: `https://wa.me/message/ON3GNOTDII42F1`.
- Commits em português, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Duplo envio / recarregar o POST de "Gerar Pix"** — mesmo e-mail e plano com pedido `paying` ainda válido deve reaproveitar o pedido, não reservar outro código. Teste na Task 4.
2. **Pix pago depois de vencer** — pedido `expired` cuja cobrança aparece paga vira `delivered` (ou `pending` sem estoque). Teste na Task 4.
3. **Token inexistente ou inventado** em `/pix/pedido/:token` e `/status` — página 404 amigável / JSON 404, nunca erro 500. Teste na Task 6.
4. **E-mail com maiúsculas ou espaços** (`" Motorista@Email.com "`) — normalizado antes da regra "indisponível para este e-mail". Teste na Task 4.
5. **Consulta repetida depois de entregue** — `get()` chamado várias vezes nunca entrega um segundo código. Teste na Task 4.

---

## Estrutura de arquivos

```
apps/pix/
  package.json                 + uqr, + jsdom (dev)
  wrangler.toml                + [assets]
  public/pix/assets/pix.js     cliente (Task 10)
  src/app.js                   createApp + rotas
  src/worker.js                monta config/provedor/lojas pelo env
  src/config.js                configFromEnv
  src/plans.js                 PLANS
  src/pix/brcode.js            EMV + CRC16
  src/pix/mock-provider.js
  src/store/memory.js
  src/orders.js                regras de pedido
  src/dev/seed.js              códigos de exemplo
  src/page/copy.pt-BR.js
  src/page/format.js
  src/page/layout.js           <head>, CSS, barra dev
  src/page/components.js
  src/page/screens.js
  src/test/helpers.js          makeApp, dom
  src/*.test.js                (um por módulo)
```

---

### Task 1: `createApp`, configuração e planos

**Files:**
- Modify: `apps/pix/src/app.js`, `apps/pix/src/worker.js`, `apps/pix/src/app.test.js`, `apps/pix/package.json`
- Create: `apps/pix/src/config.js`, `apps/pix/src/plans.js`, `apps/pix/src/test/helpers.js`, `apps/pix/src/config.test.js`

**Interfaces:**
- Produces:
  - `PLANS: Record<'mensal'|'trimestral'|'anual', { id, name: 'Mensal'|'Trimestral'|'Anual', durationLabel: '1 mês'|'3 meses'|'1 ano', amountCents }>` e `DEFAULT_PLAN_ID = 'anual'`.
  - `configFromEnv(env) → { devTools: boolean, salesEnabled: boolean, appStoreId: '6756681755', supportUrl: string }`.
  - `createApp({ config, provider, stores, plans = PLANS, now = Date.now }) → Hono` (basePath `/pix`). `provider` pode ser `null`.
  - `src/test/helpers.js`: `makeApp(overrides?) → { app, provider, stores, clock }` (devTools ligado, provedor simulado, lojas com seed; `clock.set(ms)` controla `now`) — completado nas Tasks 3/4; nesta task devolve só `app` com `provider: null, stores: null`. `dom(res) → Promise<Document>` via jsdom.

- [ ] **Step 1: Testes**

```js
// config.test.js
test('devTools só com "true"', () => {
  assert.equal(configFromEnv({ PIX_DEV_TOOLS: 'true' }).devTools, true);
  assert.equal(configFromEnv({ PIX_DEV_TOOLS: '1' }).devTools, false);
  assert.equal(configFromEnv({}).devTools, false);
});
test('vendas ligadas salvo "false"', () => {
  assert.equal(configFromEnv({}).salesEnabled, true);
  assert.equal(configFromEnv({ PIX_SALES_ENABLED: 'false' }).salesEnabled, false);
});
test('preços dos planos', () => {
  assert.deepEqual(Object.values(PLANS).map((p) => [p.id, p.amountCents]),
    [['mensal', 990], ['trimestral', 2590], ['anual', 9990]]);
});
// app.test.js: os dois testes atuais passam a usar makeApp().app
```

- [ ] **Step 2:** `npm test -w apps/pix` → FAIL (módulos inexistentes).
- [ ] **Step 3:** Implementar. `npm i -w apps/pix uqr` e `npm i -D -w apps/pix jsdom`. `worker.js` exporta `{ fetch(req, env, ctx) }` que cria o app uma vez por isolate (cache em variável de módulo) a partir de `configFromEnv(env)`; provedor e lojas entram na Task 3.
- [ ] **Step 4:** `npm test -w apps/pix` → PASS.
- [ ] **Step 5:** Commit "Pix: createApp com configuração e planos".

---

### Task 2: BR Code (Pix copia e cola)

**Files:** Create `apps/pix/src/pix/brcode.js`, `apps/pix/src/pix/brcode.test.js`

**Interfaces:**
- Produces: `crc16(str) → string` (4 hex maiúsculos); `buildBrCode({ key, name, city, amountCents, txid, description? }) → string`.

- [ ] **Step 1: Testes**

```js
test('crc16 CCITT-FALSE', () => assert.equal(crc16('123456789'), '29B1'));
test('monta campos EMV e CRC válido', () => {
  const s = buildBrCode({ key: 'teste@corridex.app', name: 'CORRIDEX', city: 'SAO PAULO',
    amountCents: 9990, txid: 'PEDIDO123', description: 'TESTE - NAO PAGUE' });
  assert.ok(s.startsWith('000201'));
  assert.ok(s.includes('0014br.gov.bcb.pix'));
  assert.ok(s.includes('5303986'));
  assert.ok(s.includes('540599.90'));
  assert.ok(s.includes('5802BR'));
  assert.ok(s.includes('0509PEDIDO123'));
  assert.equal(s.slice(-4), crc16(s.slice(0, -4)));
  assert.equal(s.slice(-8, -4), '6304');
});
test('corta nome em 25 e cidade em 15', () => { /* name de 30 chars → campo 59 com tamanho 25 */ });
```

- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** Implementar. Campo = id(2) + tamanho(2, zero à esquerda) + valor. Ordem: `00`=`01`, `26`{`00`=`br.gov.bcb.pix`, `01`=key, `02`=description?}, `52`=`0000`, `53`=`986`, `54`=valor com ponto e 2 casas, `58`=`BR`, `59`=name, `60`=city, `62`{`05`=txid (máx. 25)}, `63`=CRC. CRC16: polinômio `0x1021`, inicial `0xFFFF`, sobre o payload inteiro incluindo `6304`.
- [ ] **Step 4:** rodar → PASS.
- [ ] **Step 5:** Commit "Pix: montagem do BR Code com CRC16".

---

### Task 3: Provedor simulado, lojas em memória e seed

**Files:** Create `apps/pix/src/pix/mock-provider.js`, `apps/pix/src/store/memory.js`, `apps/pix/src/dev/seed.js`, testes `mock-provider.test.js`, `memory.test.js`; Modify `apps/pix/src/test/helpers.js`, `apps/pix/src/worker.js`

**Interfaces:**
- Consumes: `buildBrCode` (Task 2).
- Produces:
  - `createMockPixProvider({ devTools, now }) → { createCharge({ txid, amountCents, expiresInSeconds }) → Promise<{ copiaECola, expiresAt: number }>, getCharge(txid) → Promise<{ status: 'ATIVA'|'CONCLUIDA', amountCents } | null>, markPaid(txid) → void }`. Lança `Error('mock provider exige PIX_DEV_TOOLS=true')` se `!devTools`. Chave fictícia `teste@corridex.app`, descrição `TESTE - NAO PAGUE`. Pagamento aceito mesmo após `expiresAt` (status continua `ATIVA` até `markPaid`).
  - `createMemoryStores({ codes: SeedCode[] })` com `SeedCode = { value, planId, offerId, redeemBy: 'AAAA-MM-DD' }`:
    - `orders.insert(order)`, `orders.get(token) → order|null`, `orders.update(token, patch) → order`, `orders.findActive(email, planId) → order|null` (status `paying`).
    - `codes.availability(planId, email) → 'ok'|'out_of_stock'|'unavailable_for_customer'` — `out_of_stock`: nenhum código livre no plano; `unavailable_for_customer`: há livres, mas só de ofertas que o e-mail já recebeu.
    - `codes.reserve(planId, email, holderId) → code|null`, `codes.release(holderId)`, `codes.claim(holderId, planId, email) → code|null` (usa a reserva do holder ou pega um livre elegível; marca entregue e registra e-mail→oferta; chamado de novo com o mesmo holder devolve o mesmo código).
    - `trials.used(deviceKey) → boolean`, `trials.mark(deviceKey)`.
  - `seedCodes() → SeedCode[]`: por plano (`mensal`, `trimestral`, `anual`, `teste`), 2 ofertas × 3 códigos; valor de 18 caracteres maiúsculos começando com `EXEMP`; `redeemBy` `2027-05-16`.
  - `makeApp()` agora com provedor simulado e lojas com seed.

- [ ] **Step 1: Testes** (principais asserções)

```js
test('provedor recusa sem devTools', () =>
  assert.throws(() => createMockPixProvider({ devTools: false, now: Date.now }), /PIX_DEV_TOOLS/));
test('cobrança ATIVA até markPaid', async () => { /* createCharge → getCharge.status 'ATIVA'; markPaid → 'CONCLUIDA'; amountCents 9990 */ });
test('expiresAt = now + ttl', async () => { /* now fixo 1000 → expiresAt 1000 + 1800_000 */ });
test('reserva some do estoque e volta ao liberar', () => { /* 6 códigos anual; 6 reservas → availability 'out_of_stock'; release(1) → 'ok' */ });
test('e-mail que já recebeu todas as ofertas → unavailable_for_customer', () => {
  /* claim de um código da oferta A e um da B para a@x.com → availability('anual','a@x.com') === 'unavailable_for_customer'; para b@x.com === 'ok' */
});
test('claim é idempotente por holder', () => { /* claim(h) duas vezes → mesmo value */ });
test('trials', () => { /* used false → mark → used true */ });
```

- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** Implementar. `worker.js`: se `config.devTools`, cria provedor simulado e lojas com `seedCodes()`; senão `provider: null, stores: null` (venda pausada pela Task 5).
- [ ] **Step 4:** rodar → PASS.
- [ ] **Step 5:** Commit "Pix: provedor simulado e lojas em memória".

---

### Task 4: Serviço de pedidos (regras)

**Files:** Create `apps/pix/src/orders.js`, `apps/pix/src/orders.test.js`

**Interfaces:**
- Consumes: provedor e lojas (Task 3), `PLANS`.
- Produces: `createOrderService({ provider, stores, plans, now, pixTtlSeconds = 1800 })`:
  - `normalizeEmail(raw) → string|null` (exportada; trim + minúsculas; `null` se não casar `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`).
  - `create({ planId, email }) → Promise<{ ok: true, order } | { ok: false, reason: 'invalid_plan'|'invalid_email'|'plan_out_of_stock'|'unavailable_for_customer'|'pix_unavailable' }>`
  - `get(token) → Promise<order|null>` (sincroniza antes de devolver)
  - `renew(token) → Promise<{ ok: true, order } | { ok: false, reason }>` (só de `expired`; mesmo token, nova cobrança, nova reserva)
  - `Order = { token, planId, email, amountCents, txids: string[], copiaECola, expiresAt, status: 'paying'|'delivered'|'pending'|'expired', code: SeedCode|null, paidAt: number|null, createdAt }`
  - Token: 16 bytes de `crypto.getRandomValues` em base64url. txid: 25 caracteres `[A-Za-z0-9]`.

Regras de `get` (sincronização), nesta ordem:
1. `delivered` ou `pending` → devolve como está.
2. Se alguma cobrança de `txids` está `CONCLUIDA` → `codes.claim(token, ...)`: com código → `delivered`; sem → `pending`. Grava `paidAt`.
3. Se `paying` e `now() >= expiresAt` → `codes.release(token)`, `expired`.

- [ ] **Step 1: Testes**

```js
test('cria pedido paying com reserva e cobrança', async () => { /* ok, status 'paying', amountCents 9990, txids.length 1, copiaECola começa com '000201' */ });
test('e-mail inválido / plano inválido', async () => { /* reasons 'invalid_email', 'invalid_plan' */ });
test('sem estoque não cria cobrança', async () => { /* esgota 'anual' → reason 'plan_out_of_stock'; provider.createCharge não chamado */ });
test('normaliza e-mail', async () => { /* create com ' Motorista@Email.com ' → order.email 'motorista@email.com' */ }); // Review Focus 4
test('duplo envio reaproveita pedido ativo', async () => { /* duas creates iguais → mesmo token; availability consumiu 1 código */ }); // Review Focus 1
test('pago → delivered com código', async () => { /* markPaid(txid) → get → 'delivered', code.value começa com 'EXEMP' */ });
test('get repetido não entrega outro código', async () => { /* 3× get → mesmo code.value; estoque caiu só 1 */ }); // Review Focus 5
test('vence e libera reserva', async () => { /* clock + 1800_000 → 'expired'; estoque voltou */ });
test('pago depois de vencer → delivered', async () => { /* expired; markPaid → get → 'delivered' */ }); // Review Focus 2
test('pago depois de vencer sem estoque → pending', async () => { /* expired; esgota com outros e-mails; markPaid → 'pending', code null */ });
test('renew gera nova cobrança no mesmo token', async () => { /* expired → renew → paying, txids.length 2, expiresAt novo */ });
test('provedor falha → pix_unavailable e libera reserva', async () => { /* provider.createCharge rejeita → reason 'pix_unavailable'; estoque intacto */ });
```

- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** Implementar `orders.js`.
- [ ] **Step 4:** rodar → PASS.
- [ ] **Step 5:** Commit "Pix: regras de pedido, reserva e vencimento".

---

### Task 5: Layout, textos, componentes e tela de escolha (`GET /pix`)

**Files:** Create `apps/pix/src/page/copy.pt-BR.js`, `format.js`, `layout.js`, `components.js`, `screens.js`, testes `format.test.js`, `choose.test.js`; Modify `apps/pix/src/app.js`

**Interfaces:**
- Produces:
  - `copy` (objeto aninhado com as chaves do handoff: `plan.summary`, `email.help`, `email.invalid`, `pix.cta`, `pix.copy`, `pix.copied`, `pix.waiting`, `pix.validUntil`, `paid.title`, `paid.next`, `code.redeem`, `code.redeemHint`, `code.sentTo`, `code.redeemBy`, `pending.body`, `expired.title`, `expired.body`, `down.title`, `down.body`, `stock.title`, `paused.title`, `trial.*`, `customer.unavailable`, `trial.used`, `help.title` + os demais textos dos mockups). Placeholders `{plano}`, `{data}` etc. preenchidos por `t(template, vars)`. `pending.body` usa o texto da tabela ("em até 2 horas").
  - `format.js`: `brl(cents) → 'R$ 99,90'`, `maskEmail(e) → 'm•••@email.com'`, `groupCode(v) → 'EXEMP1 L0CODI GO0000'`, `dateBR('2027-05-16') → '16/05/2027'`, `timeBR(ms) → 'HH:MM'` em `America/Sao_Paulo`, `redeemUrl(appStoreId, code)`.
  - `layout.js`: `page({ title, body, state, data?: Record<string,string>, devBar?: HtmlEscapedString }) → HtmlEscapedString` — `<html lang="pt-BR">`, viewport com `viewport-fit=cover`, `<meta name="robots" content="noindex">`, CSS inline com os tokens do handoff (claro/escuro), `<main data-state=… data-*>`, rodapé, `<script type="module" src="/pix/assets/pix.js">`.
  - `components.js`: `PlanSwitcher`, `PlanSummary`, `EmailField`, `PixPayment`, `PaymentStatus`, `CodeDelivery`, `CodeHelp`, `TrialRequest`, `Notice({ tone: 'info'|'warning'|'error', title, body, action? })` — acessibilidade conforme tabela do handoff.
  - `screens.js`: `chooseScreen({ plans, selectedPlanId, email, notice?, unavailablePlanIds, trialHref? })`, `pausedScreen()`, `errorScreen({ planName })` — demais telas nas Tasks 6–8.
  - Em `app.js`: middleware que aplica os cabeçalhos das Global Constraints a respostas HTML; helper `scenario(c) → string|null` (só com `config.devTools`).
  - `GET /pix?plano=&email=&cenario=&teste=&dc_ler=&dc_marcar=`.

- [ ] **Step 1: Testes**

```js
// format.test.js
assert.equal(brl(9990), 'R$ 99,90'); assert.equal(brl(990), 'R$ 9,90');
assert.equal(maskEmail('motorista@email.com'), 'm•••@email.com');
assert.equal(groupCode('EXEMP1L0CODIGO0000'), 'EXEMP1 L0CODI GO0000');
assert.equal(dateBR('2027-05-16'), '16/05/2027');
// choose.test.js (via makeApp + dom)
test('GET /pix mostra Anual selecionado com R$ 99,90', /* [role=radiogroup] com 3 opções; aria-checked=true em Anual; texto 'R$ 99,90'; botão 'Gerar Pix'; rodapé contém 'Pagamento pelo Banco Inter' */);
test('?plano=mensal seleciona Mensal R$ 9,90');
test('?plano=xyz cai no Anual');
test('email: type=email, autocomplete=email, inputmode=email');
test('cabeçalhos no-store, no-referrer, noindex');
test('link do teste só com teste=1 e dois tokens', /* sem → ausente; com → href /pix/teste?... */);
test('?cenario=pausado → "A venda por Pix está pausada"; sem devTools o cenário é ignorado');
test('?cenario=sem-estoque → Anual riscado com texto "indisponível" e Notice warning');
test('?cenario=fora-do-ar → "O Pix está indisponível agora" e botão "Tentar de novo"');
test('?cenario=indisponivel-email&plano=mensal → "Para este e-mail, o Mensal fica disponível em algumas horas" e botão "Ver Trimestral"');
test('config.salesEnabled=false ou provider null → tela pausada');
```

- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** Implementar. CSS mobile first: `min-height: 100dvh`, `padding` com `env(safe-area-inset-*)`, alvos `min-height: 2.75rem`, corpo `1.0625rem`, raio 12 px, `prefers-reduced-motion`. Seletor de plano como `<fieldset role="radiogroup">` com radios reais estilizados (funciona sem JS; a troca de plano é um `<a href="?plano=…">` ou radio + submit).
- [ ] **Step 4:** rodar → PASS.
- [ ] **Step 5:** Commit "Pix: layout, textos e tela de escolha".

---

### Task 6: Criar pedido e página do pedido

**Files:** Modify `apps/pix/src/app.js`, `apps/pix/src/page/screens.js`; Create `apps/pix/src/order-routes.test.js`

**Interfaces:**
- Consumes: `createOrderService` (Task 4), telas da Task 5, `renderSVG` de `uqr`.
- Produces:
  - `POST /pix/pedidos` (form `plano`, `email`) → `303 Location: /pix/pedido/<token>`; erro de escolha → 200 com `chooseScreen` + Notice (`invalid_email` → `email.invalid` no campo com `aria-describedby`; `plan_out_of_stock` → `stock.title`; `unavailable_for_customer` → `customer.unavailable`; `pix_unavailable` → `errorScreen`). Venda pausada → `pausedScreen`.
  - `GET /pix/pedido/:token` → telas `payingScreen({ order, qrSvg, nowMs })`, `deliveredScreen({ order, plan, appStoreId })` (inclui resumo: plano, preço, "Pago em dd/mm/aaaa por Pix"), `pendingScreen({ order })`, `expiredScreen({ order, plan })` (form `POST …/renovar`), ou `notFoundScreen()` com status 404. `<main data-state>` igual ao status; em `paying`, `data-status-url` e `data-expires-at`.
  - `GET /pix/pedido/:token/status` → `{ status }` ou 404 `{ error: 'not_found' }`.
  - `POST /pix/pedido/:token/renovar` → 303 para o pedido (ou tela de estoque se não houver código).
  - Cenários no pedido (dev): `vencido`, `pendente` forçam a tela correspondente.

- [ ] **Step 1: Testes**

```js
test('POST válido → 303 para /pix/pedido/<token>');
test('paying: botão "Copiar código Pix" antes do QR, SVG com aria-label, "Aguardando pagamento…" em aria-live=polite, "Vale até"');
test('paying: data-status-url e data-expires-at no main');
test('após markPaid: delivered com "Resgatar código" → href apps.apple.com/redeem?ctx=offercodes&id=6756681755&code=…, código agrupado, e-mail mascarado, "Resgate até 16/05/2027"');
test('status JSON acompanha: paying → delivered');
test('vencido: "Este Pix venceu", form renovar, sem campo de e-mail');
test('renovar → 303 e volta a paying');
test('pending: "Seu código está a caminho"');
test('e-mail inválido volta à escolha com mensagem ligada por aria-describedby');
test('token inexistente → 404 com página amigável; /status → 404 JSON'); // Review Focus 3
```

- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** Implementar. Botão sem JS: em `paying`, link "Já paguei, atualizar" para a própria URL.
- [ ] **Step 4:** rodar → PASS.
- [ ] **Step 5:** Commit "Pix: criar pedido e página do pedido".

---

### Task 7: "O código não funcionou?"

**Files:** Modify `apps/pix/src/app.js`, `screens.js`; Create `apps/pix/src/help.test.js`

**Interfaces:** `GET /pix/pedido/:token/ajuda` → `helpScreen({ supportUrl })`; 404 se o token não existir. `deliveredScreen` ganha o link "O código não funcionou?" para essa rota.

- [ ] **Step 1: Testes** — título `help.title`; cartões "Confira a conta Apple" e "Novo código pode levar 1 hora"; botão "Falar com o suporte" com `href` `https://wa.me/message/ON3GNOTDII42F1`; nenhum botão de "mandar outro código"; link presente na tela entregue.
- [ ] **Step 2:** rodar → FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5:** Commit "Pix: ajuda quando o código não funciona".

---

### Task 8: Teste grátis

**Files:** Modify `apps/pix/src/app.js`, `screens.js`; Create `apps/pix/src/trial.test.js`

**Interfaces:**
- `GET /pix/teste?teste=1&dc_ler=…&dc_marcar=…` → `trialRequestScreen({ dcLer, dcMarcar, email })` (tokens em campos ocultos). Falta de qualquer token, `trials.used(dc_ler)` ou `?cenario=teste-usado` → `trialUsedScreen()` (mesma mensagem para todos os casos).
- `POST /pix/teste` (`email`, `dc_ler`, `dc_marcar`) → `normalizeEmail`; `codes.claim('trial:' + dc_ler, 'teste', email)`; `trials.mark(dc_ler)`; `trialDeliveredScreen({ code, email, appStoreId })` com título "7 dias grátis liberados" (reusa `CodeDelivery`). Sem código → Notice `stock.title` com plano "Teste grátis".

- [ ] **Step 1: Testes** — GET com tokens mostra "Testar 7 dias grátis" e "Liberar 7 dias grátis"; sem tokens → "Este aparelho já usou o teste grátis"; POST entrega código e link de resgate; segundo POST com mesmo `dc_ler` → já usou; e-mail inválido → mensagem `email.invalid`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5:** Commit "Pix: teste grátis simulado".

---

### Task 9: Ferramentas de simulação

**Files:** Modify `apps/pix/src/app.js`, `layout.js`; Create `apps/pix/src/dev.test.js`

**Interfaces:**
- `POST /pix/dev/pedido/:token/pagar` → `provider.markPaid(último txid)` → 303 para o pedido.
- `GET /pix/dev` → catálogo com links para cada estado: escolha, cada `?cenario=` (`sem-estoque`, `indisponivel-email`, `pausado`, `fora-do-ar`, `vencido`, `pendente`, `teste-usado`), teste grátis com tokens falsos, e um botão que cria pedido de exemplo.
- `layout.page` recebe `devBar` quando `config.devTools`: barra fixa discreta no rodapé ("Simulação" + link `/pix/dev` + em `paying` o form "Simular pagamento").

- [ ] **Step 1: Testes** — com devTools: pagar → 303 e pedido `delivered`; `/pix/dev` lista os 7 cenários; barra presente em `paying`. Sem devTools: `/pix/dev` e `/pix/dev/pedido/x/pagar` → 404; nenhuma barra no HTML.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5:** Commit "Pix: ferramentas de simulação em desenvolvimento".

---

### Task 10: Cliente (`pix.js`), assets e verificação no celular

**Files:** Create `apps/pix/public/pix/assets/pix.js`, `apps/pix/src/client.test.js`; Modify `apps/pix/wrangler.toml`, `apps/pix/README.md`

**Interfaces:**
- `pix.js` (módulo ES, < 5 KB sem minificar, sem dependências), exporta funções puras e só toca o DOM se `typeof document !== 'undefined'`:
  - `nextDelay(elapsedMs) → 3000 | 10000 | null` (null a partir de 1 800 000).
  - `remaining(expiresAtMs, nowMs) → { minutes: number, expired: boolean }` (minutos arredondados para cima, mínimo 0).
- Comportamento no DOM (lê `<main data-state>`):
  - `paying`: consulta `data-status-url` com `nextDelay`; pausa com `document.hidden`; ao voltar (`visibilitychange`) consulta na hora; status diferente de `paying` → `fetch(location.href)`, troca o `<main>` pelo do HTML novo (DOMParser), move o foco para o `h1`. Atualiza "({minutos} min)" a cada 30 s.
  - `[data-copy]`: `navigator.clipboard.writeText`; mostra `pix.copied` em `role="status"`; se falhar, seleciona o texto do código.
- `wrangler.toml`: `[assets]` com `directory = "./public"`.
- README: seção "Simulação" (`.dev.vars` com `PIX_DEV_TOOLS=true`, `/pix/dev`, testar no celular com `npx wrangler dev --ip 0.0.0.0` ou `cloudflared tunnel --url http://localhost:8787`).

- [ ] **Step 1: Testes**

```js
assert.equal(nextDelay(0), 3000); assert.equal(nextDelay(119_999), 3000);
assert.equal(nextDelay(120_000), 10000); assert.equal(nextDelay(1_800_000), null);
assert.deepEqual(remaining(60_000 * 29 + 1, 0), { minutes: 30, expired: false });
assert.deepEqual(remaining(0, 1), { minutes: 0, expired: true });
test('importar pix.js no Node não lança');
```

- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** `npm test -w apps/pix` → tudo PASS.
- [ ] **Step 5: Verificação manual** com `npm run dev -w apps/pix` (Node 22) e `.dev.vars` `PIX_DEV_TOOLS=true`:
  - `/pix/dev` → percorrer todos os estados em 360 px (DevTools) e no Safari do iPhone pela rede local.
  - Gerar Pix → copiar → sair da aba → "Simular pagamento" em outra aba → voltar: página vira "Pagamento confirmado" sozinha.
  - Tema escuro, zoom 200% sem rolagem lateral, VoiceOver anuncia mudança de status.
  - `pix.js` < 5 KB (`wc -c`).
- [ ] **Step 6:** Commit "Pix: cliente da página, assets e guia de simulação".
