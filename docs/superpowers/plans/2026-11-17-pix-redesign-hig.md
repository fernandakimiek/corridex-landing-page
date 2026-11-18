# Redesenho das telas do Pix (padrão Apple) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar todas as telas de `apps/pix` no padrão aprovado: barra de título, conteúdo com respiro, resultados centralizados e ação principal numa barra fixa embaixo com margem inferior generosa.

**Architecture:** Só a camada de página muda (`src/page/*`, `public/pix/assets/pix.js` e seletores nos testes). `layout.page()` passa a montar barra de título + conteúdo + barra de ação; as telas declaram o que vai em cada parte. Os formulários continuam funcionando sem JS: o botão da barra usa o atributo `form="<id>"`.

**Tech Stack:** Hono `hono/html`, CSS inline, JS puro, `node --test` + jsdom.

**Spec:** `docs/superpowers/specs/2026-11-17-pix-redesign-hig-design.md` (complementa `2026-11-17-pix-telas-mockadas-design.md`). Maquete aprovada: `docs/superpowers/references/2026-11-17-pix-redesign-maquete.html`; prints `docs/superpowers/references/pix-redesign/depois-*.png`.

## Global Constraints

- Rotas, estados, regras, cabeçalhos (no-store, no-referrer, noindex, CSP), nonce e simulação **não mudam**. Testes de comportamento continuam valendo; só seletores de layout podem ser ajustados.
- Todo texto visível vem de `src/page/copy.pt-BR.js`. Chaves novas conforme a seção "Textos novos" da spec.
- Contraste ≥ 4,5:1 para todo texto, nos dois temas; tokens de cor atuais do `layout.js` continuam.
- Tudo funciona sem JS. `pix.js` < 5 KB sem minificar.
- Barra de ação: `position: sticky; bottom: 0`, `padding: 16px 20px calc(env(safe-area-inset-bottom) + 24px)`, fundo translúcido com `backdrop-filter: blur(20px)` e fallback opaco, linha superior de 0,5 px. Botão em cápsula com `min-height: 50px`.
- Margem lateral do conteúdo: 20 px. Espaço entre blocos: 24 px. Ícone de resultado: 64 px. Título de resultado: 1.75rem/700. Valor no Pix gerado: 2.125rem/700.
- Barra de simulação: faixa estática no topo (fora do fluxo de ação), só com devTools.
- Testes: `npm test -w apps/pix` no Node 20.
- Commits em português, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Formulário sem JS com botão na barra.** O botão fica fora do `<form>` e precisa de `form="<id>"`. Enviar sem JS tem que postar plano, e-mail, nonce e os campos do teste. Teste na Task 2.
2. **Teclado aberto no iPhone.** A barra sticky não pode cobrir o campo de e-mail focado. O conteúdo precisa de espaço inferior suficiente para rolar o campo acima da barra. Verificação manual na Task 4.
3. **Troca do `<main>` pelo `pix.js`.** Quando o Pix gerado vira pago, a barra de ação também muda. O swap precisa trocar o bloco que contém conteúdo **e** barra, não só o conteúdo. Teste na Task 3.
4. **Dois botões de copiar.** Ambos copiam o mesmo código e anunciam uma vez só no `role="status"`. Teste na Task 3.
5. **Valor no botão "Gerar Pix · R$ X".** Com JS, acompanha o plano marcado; sem JS, mostra o do plano carregado. Nunca mostra um valor diferente do que será cobrado após o POST. Teste na Task 2.

---

### Task 1: Estrutura da página (barra de título, conteúdo, barra de ação, herói de resultado)

**Files:** Modify `apps/pix/src/page/layout.js`, `apps/pix/src/page/components.js`, `apps/pix/src/page/copy.pt-BR.js`; Test `apps/pix/src/page/components.test.js`, `apps/pix/src/layout.test.js` (novo)

**Interfaces:**
- Produces:
  - `page({ title, nav: { brand?: boolean, title?: string }, body, bar?, layout?: 'flow'|'result', state, data?, devBar? })`. Estrutura: `<body>` → devBar (topo, se houver) → `<div class="screen" data-state=… data-*>` contendo `<header class="nav">`, `<main class="content [result]">body</main>` e `bar` (se houver). Os atributos `data-state`/`data-*` saem do `<main>` e vão para `.screen`, que é o bloco que o `pix.js` troca. O rodapé global some.
  - `ActionBar({ primary?, secondary?, note? }) → html` → `<div class="bar">` com o botão principal (já renderizado), as ações secundárias e a nota pequena.
  - `ResultHero({ tone: 'success'|'warning'|'error'|'info'|'clock'|'gift', title, body? }) → html` → ícone de 64 px + `<h1>` + `<p class="sub">`.
  - `SubmitButton({ label, variant, name, value, form? })` ganha `form`.
  - `NavBar` interno ao layout: marca (quadrado + "Corridex") ou título centralizado.
  - Copy: as chaves `nav.payment`, `nav.trial`, `nav.help` e as demais da seção "Textos novos" da spec.

- [ ] **Step 1: Testes** — `layout.test.js`:
  - `page()` com `bar` gera `.screen > .nav + main.content + .bar`;
  - sem `bar`, não há `.bar`;
  - `data-state` e `data-status-url` ficam em `.screen`;
  - devBar renderiza antes de `.screen`;
  - `layout:'result'` gera `main.content.result`;
  - não há `<footer>`.

  `components.test.js`:
  - `ActionBar` com primary + secondary + note, na ordem certa;
  - `ResultHero` com h1, `.sub` e svg `aria-hidden`.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** Implementar. CSS conforme as Global Constraints e a maquete. Em `.content.result`, `flex:1; justify-content:center; text-align:center`. Em `.screen`, `min-height:100dvh; display:flex; flex-direction:column`. As telas atuais seguem chamando `page()` com `body` até as Tasks 2–4 migrarem; para isso `nav` tem padrão `{ brand: true }`, e o comportamento atual dos testes de rota não pode quebrar (ajustar só seletores que dependiam de `main[data-state]` para `.screen[data-state]`).
- [ ] **Step 4:** `npm test -w apps/pix` → PASS.
- [ ] **Step 5:** Commit "Pix: estrutura de tela no padrão do app".

---

### Task 2: Escolha do plano e pedido do teste grátis

**Files:** Modify `apps/pix/src/page/screens.js` (`chooseScreen`, `trialRequestScreen`), `components.js` (`PlanSwitcher` vira cartões, `EmailField` inset, `TrialRequest`), `copy.pt-BR.js`, `apps/pix/public/pix/assets/pix.js`; Test `apps/pix/src/choose.test.js`, `apps/pix/src/trial.test.js`

**Interfaces:**
- Consumes: Task 1 (`page`, `ActionBar`, `SubmitButton({form})`).
- Produces:
  - `perMonth(plan) → string|null` em `format.js`: `null` para 1 mês; senão `brl(Math.floor(amountCents / meses))`. Os meses saem do plano (`months: 1|3|12` em `plans.js`).
  - O form da escolha tem `id="pedido"`; o botão da barra tem `form="pedido"` e `data-price-label`. Cada rádio tem `data-cta="Gerar Pix · R$ X"`.
  - `pix.js`: ao mudar o rádio `name=plano`, troca o texto do botão `[form=pedido]` pelo `data-cta` do rádio.

- [ ] **Step 1: Testes**
  - Cabeçalho com "Assine o Corridex com Pix" e "Pagamento único. Não renova sozinho.".
  - Cartões com "3 meses · R$ 8,63/mês" e "1 ano · R$ 8,33/mês"; o Mensal mostra "1 mês" sem valor mensal.
  - O selo "Mais vantajoso" aparece só no Anual.
  - O botão da barra mostra "Gerar Pix · R$ 99,90", tem `form="pedido"` e não fica dentro do form.
  - Com `?plano=mensal`, o botão mostra "Gerar Pix · R$ 9,90". *(Review Focus 5)*
  - POST simulando o envio do form completo (plano, email, nonce, campos do teste) → 303. *(Review Focus 1: montar o body a partir de todos os inputs com `form` igual a "pedido" ou dentro de `#pedido`)*
  - A barra tem "Pagamento pelo Banco Inter".
  - Os links Termos, Privacidade e Ajuda ficam no conteúdo.
  - Estados de aviso: Notice abaixo do cabeçalho; a barra tem "Ver {plano}" e nenhum botão "Gerar Pix".
  - Teste grátis: cabeçalho "Testar 7 dias grátis"; a barra tem "Liberar 7 dias grátis" (`form`) e o link "Voltar aos planos".
  - `pix.js`: função pura `ctaFor(radio)` (ou equivalente) testada no Node.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** `npm test -w apps/pix` → PASS.
- [ ] **Step 5:** Commit "Pix: escolha do plano no padrão do app".

---

### Task 3: Pix gerado e cliente

**Files:** Modify `screens.js` (`payingScreen`), `components.js` (`PixPayment`, `PaymentStatus`), `copy.pt-BR.js`, `public/pix/assets/pix.js`; Test `apps/pix/src/order-routes.test.js`, `apps/pix/src/client.test.js`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - Tela `paying` com `nav.title = "Pagamento"`.
  - Topo com o nome do plano, o valor em 34 px e `pix.validShort` (com o span de minutos).
  - Cartão do código com `<details class="code">`: o resumo traz o código numa linha com reticências e o botão "Copiar" (`data-copy`); aberto, mostra o `<textarea readonly id="pix-code">` completo.
  - Cartão de passos (`<ol>`); `<details class="qr">` "Mostrar QR Code" com o SVG.
  - Status com `aria-live` (`pix.waitingLong`) e o link "Já paguei, atualizar" dentro de `<noscript>` ou visível só sem JS.
  - Barra com o botão "Copiar código Pix" (`data-copy`).
  - `pix.js`: o swap troca `.screen` inteira, não só o `<main>`. Os dois `[data-copy]` funcionam. O aviso `pix.copied` vai para um único `role="status"` dentro de `.screen`. A contagem atualiza o span de minutos no novo formato.

- [ ] **Step 1: Testes**
  - O código aparece antes dos passos, que aparecem antes do QR.
  - O botão "Copiar" fica dentro do cartão do código.
  - O QR fica dentro de `details` fechado, e o wrapper mantém `role="img"` + `aria-label`.
  - Existem exatamente dois `[data-copy]` com o mesmo valor e um único `[role=status]` para o aviso. *(Review Focus 4)*
  - A barra contém "Copiar código Pix".
  - Aparece "Vale até HH:MM · N min".
  - `.screen` tem `data-status-url` e `data-expires-at`.
  - Client, com jsdom: ao trocar a tela de `paying` para `delivered`, a `.bar` nova mostra "Resgatar na App Store" e a antiga some. *(Review Focus 3; pode usar um HTML de exemplo)*
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS. Conferir `wc -c public/pix/assets/pix.js` < 5000.
- [ ] **Step 5:** Commit "Pix: tela do Pix gerado no padrão dos apps de pagamento".

---

### Task 4: Telas de resultado, ajuda e verificação visual

**Files:** Modify `screens.js` (`deliveredScreen`, `pendingScreen`, `expiredScreen`, `errorScreen`, `pausedScreen`, `notFoundScreen`, `trialUsedScreen`, `trialDeliveredScreen`, `trialStockScreen`, `helpScreen`), `components.js` (`CodeDelivery` vira cartão "SEU CÓDIGO", `OrderSummary` em lista, `CodeHelp`), `copy.pt-BR.js`; Test `order-routes.test.js`, `help.test.js`, `trial.test.js`, `choose.test.js` (pausado/erro)

**Interfaces:**
- Consumes: Task 1 (`ResultHero`, `ActionBar`, `layout:'result'`).
- Produces (barra entre parênteses):
  - **delivered:** ResultHero success, cartão do código com `code.meta`, resumo em lista (`order.paidOnLabel`/`order.paidOnValue`). Barra: link-botão "Resgatar na App Store" para `apps.apple.com/redeem?...` e o link "O código não funcionou?".
  - **pending:** ResultHero success + `pending.title`/`pending.body` + `pending.sentTo`. Sem barra.
  - **expired:** ResultHero `clock` (tom warning), "Este Pix venceu", `expired.body` + `expired.hint`. Barra: botão "Gerar novo Pix" com `form` para o form de renovar.
  - **error:** ResultHero error, `down.*`. Barra: "Tentar de novo".
  - **paused:** ResultHero info, `paused.*`. Sem barra.
  - **not found:** ResultHero info, `notFound.*`. Barra: "Ver planos".
  - **trial used / trial stock:** ResultHero info/warning. Barra: "Ver planos".
  - **trial delivered:** ResultHero `gift` com `trial.delivered`, cartão do código. Barra: "Resgatar na App Store".
  - **help:** `nav.title` "Ajuda", título, dois cartões. Barra: "Falar com o suporte" (`rel=noopener`) e o link "Voltar ao pedido".
  - Remover o que ficou sem uso em `components.js`, `copy.pt-BR.js` e no CSS.

- [ ] **Step 1: Testes**
  - Cada tela tem `main.content.result` e um único `h1`, com o texto esperado.
  - A barra tem a ação certa, ou não existe em pending e pausado.
  - O link de resgate continua com o formato exato.
  - Expired: o botão da barra posta para `/renovar` (atributo `form` + `action`).
  - Varredura: nenhuma palavra proibida e nenhum texto fora do copy (o teste existente continua).
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** `npm test -w apps/pix` → PASS.
- [ ] **Step 5:** Commit "Pix: telas de resultado centralizadas com ação embaixo".
