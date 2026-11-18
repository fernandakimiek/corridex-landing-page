# Issue #431 (Pix no Brasil): o que a spec pede e o que já existe

Data: 2026-11-17 · Branch: `feat/pix-telas-simuladas` · Código: `apps/pix` (159 testes passando com `node --test`).

Fontes lidas: issue (`.superpowers/issue431/00-issue.md`), Spec do site (`01-…`), Plano do site com 13 tarefas (`02-…`), Guia de integração (`03-…`), Revisão (`04-…`), Spec do app iOS (`05-…`). Do nosso lado: `apps/pix/README.md`, `src/app.js`, `src/orders.js`, `src/store/memory.js`, `src/pix/*`, `src/page/*`, `public/pix/assets/pix.js`, os testes, as duas specs de 2026-11-17 e `2026-11-17-pix-pendencias-antes-do-inter.md`.

Neste documento, "§" aponta para uma seção da Spec do site (01), "Tarefa N" para uma tarefa do Plano (02), "Guia §" para o Guia (03), "F/A" para os achados da Revisão (04) e "App §" para a Spec do app (05).

---

## 1. Resumo

- **Quanto está pronto:** cerca de **15% do escopo do site e da nota fiscal**. As **telas** estão adiantadas (perto de 80% da Tarefa 9), e a lógica de pedido existe só **simulada** (provedor falso e memória). A **Spec do app iOS (05) não foi começada** (0%).
- **O que existe:** a página `/pix` com todos os estados, o pedido com Pix simulado (BR Code válido, prazo de 30 min, status ao vivo, Pix vencido, gerar novo), o estoque por oferta e por e-mail (em memória), a tela do teste grátis sem validação de aparelho, a página de ajuda e o modo de simulação (`/pix/dev`).
- **Os maiores blocos que faltam:**
  1. **Banco e transações:** Postgres, migração, `UnitOfWork`, `allocate` idempotente, a máquina de estados da §4.4 (Tarefas 2, 3, 6).
  2. **Provedor real:** Banco Inter no lugar do Mercado Pago (cobrança, webhook, conciliação, estorno) (Tarefas 4, 6).
  3. **Apple:** o token `t` e o cookie `pix_tok`, as notificações v2, o livro `report_lines` e o relatório mensal; DeviceCheck real (Tarefas 5, 7, 8, 10).
  4. **Operação:** fila de e-mail, lembretes, alertas, resumo diário, crons, importação de códigos e runbook (Tarefas 10, 11).
  5. **Nota fiscal:** a fila de notas e o projeto `corridex-fiscal` com o A1 (Tarefas 7A, 12).
- **O que bloqueia de fora:**
  - a **conta PJ no Banco Inter** (credenciais e certificado da API);
  - as respostas da **Apple** aos B1, B2, B3 e B6, e o entitlement B4;
  - as **chaves da Apple** (relatório e DeviceCheck) e a URL de notificações no App Store Connect;
  - o **certificado A1** e a produção restrita da NFS-e;
  - a **oferta do teste grátis**, que ainda não existe no App Store Connect (Guia §4).

---

## 2. Requisito por requisito

Legenda: ✅ feito · 🟡 parcial (simulado ou diferente) · ❌ falta · ➖ fora deste repositório.

### 2.1 Base, arquitetura e configuração

| Requisito | Status | Onde está ou o que falta | Observação |
|---|---|---|---|
| Rotas todas sob `/pix` (§4.1, §4.5) | ✅ | `src/app.js` (`basePath('/pix')`) | As rotas de API têm outros nomes (seção 4) |
| Camadas `domain/application/ports/adapters/composition` com dependency-cruiser no CI (§4.2, Tarefa 1) | ❌ | Hoje: `app.js` (rotas e telas), `orders.js` (regras), `store/memory.js` | `createApp({config, provider, stores})` já injeta dependências, o que é um começo de `composition` |
| TypeScript strict, Zod, Vitest (stack do Plano) | 🟡 | JS puro com `node --test` e jsdom | Decisão nossa (spec das telas). Seção 4, item 14 |
| `loadEnv` com Zod listando todas as variáveis que faltam (Tarefa 1) | ❌ | `src/config.js` só lê `PIX_DEV_TOOLS` e `PIX_SALES_ENABLED` | — |
| `PIX_SALES_ENABLED`: só "true"/"false", **false por padrão** (Tarefa 1) | 🟡 | `src/config.js`: `!== 'false'`, ou seja, **true por padrão** | Hoje a página fica pausada mesmo assim, porque sem `PIX_DEV_TOOLS` não há provedor (`worker.js`). Seção 4, item 10 |
| Variáveis do projeto, todas Sensitive (Restrições globais, Guia §2) | ❌ | Só `.dev.vars` local | Lista muda com o Inter (seção 3) |
| Falha fechada sem provedor real | ✅ | `src/worker.js`, `salesPaused()` em `app.js` | Não está na spec; é uma proteção nossa |
| Ferramentas de simulação nunca em produção | 🟡 | `config.devTools`; 404 sem a flag (`dev.test.js`) | Pendência aberta: o deploy precisa recusar `PIX_DEV_TOOLS=true` |

### 2.2 Domínio: pedido, dinheiro, datas

| Requisito | Status | Onde está ou o que falta | Observação |
|---|---|---|---|
| Preços 990 / 2590 / 9990 (Decisões) | ✅ | `src/plans.js` | — |
| Nomes Mensal, Trimestral, Anual (Restrições globais) | ✅ | `src/plans.js` | Os **ids** são outros (seção 4, item 1) |
| `Money` (centavos inteiros), `Email` normalizado (Tarefa 2) | 🟡 | Centavos inteiros em todo o código; `normalizeEmail` em `orders.js` (trim + minúsculas) | Sem os tipos `Money`/`Email`; sem `fromReais`/`toMilliunits` |
| `businessDate`/`businessMonth` em America/Sao_Paulo (Tarefa 2, F24) | ❌ | — | Necessário para nota e relatório |
| Máquina de estados `transition(order, event)` pura (§4.4) | 🟡 | `sync()` em `orders.js`, com estados `paying/delivered/pending/expired` | Sem `created`, `paid`, `refunded`, `trial`, `replacement`; nomes diferentes (seção 4, item 5) |
| Pago depois de vencido é aceito (Tarefa 2) | ✅ | `sync()` confere todas as cobranças do pedido, mesmo vencido | — |
| Valor pago diferente → `PaymentAmountMismatch` + alerta (§4.4, Tarefa 6) | 🟡 | `isPaid()` só ignora o pagamento | Pendência: registrar para conciliação e estorno |
| `paid` só com pagamento **relido na API** do provedor (§4.4) | 🟡 | `provider.getCharge(txid)` a cada consulta | Ver seção 3: com o Inter, o `txid` faz o papel do `external_reference` |
| Pix vence em 30 min (§3.1, Restrições globais) | ✅ | `PIX_TTL_SECONDS = 1800` em `app.js` | — |
| `pickOfferCandidates`, `planGenerations`, `replenishNeeded` e teste de propriedade de 24 meses (§5.2, Tarefa 2) | ❌ | `store/memory.js` só escolhe "o primeiro código livre de uma oferta que o e-mail não recebeu" | Sem gerações, `available_after`, validade ≥ 30 dias, nem ordem "a mais antiga primeiro" |

### 2.3 Banco e estoque de códigos

| Requisito | Status | Onde está ou o que falta | Observação |
|---|---|---|---|
| Postgres (Neon, `Pool` WebSocket) com todas as tabelas da §4.3 (Tarefa 3) | ❌ | `store/memory.js` (Map em memória) | README confirma Postgres/Neon como plano |
| `UnitOfWork` + `SELECT … FOR UPDATE` no pedido (§4.4, F4) | ❌ | — | Pendência obrigatória: dois POST simultâneos criam duas cobranças |
| `allocate` idempotente, `SKIP LOCKED`, `UNIQUE(offer_id, customer_id)` e `UNIQUE(order_id)` (§5.3, Guia §3.3) | 🟡 | `codes.claim/reserve` em memória: devolvem o código que o pedido já tem e respeitam "uma oferta por e-mail" | A regra existe; a garantia sob concorrência só vem com o banco |
| Plano disponível ou não **na abertura da página** (§5.3, F19) | ✅ | `chooseView` em `app.js`; `PlanSwitcher` com nome riscado e selo | — |
| Checagem **por e-mail** antes de gerar o Pix; sem oferta, nada é cobrado (§5.3, F8) | ✅ | `codes.availability(planId, email)` em `orders.js` | — |
| **Nada reservado antes do pagamento** (§9, "Robô criando Pix") | 🟡 | Nós **reservamos** o código por 30 min ao gerar o Pix | Seção 4, item 6 |
| Lote só entrega 1 h depois e com validade ≥ 30 dias (Restrições globais, F21) | ❌ | `seed.js` só tem `redeemBy` | — |
| `codes.status` `void`, desativação de geração | ❌ | — | — |

### 2.4 Pagamento (era Mercado Pago; agora Banco Inter)

| Requisito | Status | Onde está ou o que falta | Observação |
|---|---|---|---|
| Criar o Pix: pedido criado **antes**, idempotência pelo id do pedido (§6.1) | 🟡 | `reserveAndCharge` cria a cobrança e **só depois** grava o pedido (`orders.create`) | Pendência obrigatória. Com o Inter, o `txid` (gerado por nós) faz a idempotência: gravar o pedido com o `txid` antes de chamar |
| Só o e-mail; sem CPF, nome ou endereço (§6.1) | ✅ | Formulário da escolha | Conferir se a cobrança do Inter aceita sem `devedor` |
| QR e "copia e cola" (§3.1) | ✅ | `uqr` no servidor (`app.js`); `PixPayment` | Simulado: BR Code de `src/pix/brcode.js` com chave falsa e "TESTE - NAO PAGUE" |
| Toque duplo reaproveita o mesmo Pix (§3.4, F36) | 🟡 | Por `nonce` do formulário, não por e-mail+plano | Seção 4, item 7 |
| Webhook: validação, resposta < 2 s, `waitUntil`, `processed_at` só depois (§6.2) | ❌ | — | Muda com o Inter (seção 3) |
| Tabela de status do provedor (§6.3) | ❌ | O mock só tem `ATIVA` e `CONCLUIDA` | Refazer para os status de cobrança do Inter |
| Conciliação a cada 5 min (§6.4) | ❌ | Hoje a página relê o provedor a cada consulta (`get` → `sync`) | Spec §11: a consulta de status **nunca** chama o provedor; só lê o banco |
| Estorno: pedido `refunded`, nota cancelada ou `skipped`, linha `refund` no relatório (§6.5) | ❌ | — | — |
| Provedor fora do ar: tela "Pix indisponível" (§3.4) | ✅ | `errorScreen`, 503 | — |
| Venda pausada (§3.4) | ✅ | `pausedScreen` | — |

### 2.5 Teste grátis (DeviceCheck)

| Requisito | Status | Onde está ou o que falta | Observação |
|---|---|---|---|
| Link "Testar 7 dias grátis" só com sessão de teste (§3.2) | 🟡 | Aparece com `teste=1` e dois tokens na URL | Sem sessão no servidor; os tokens ficam na URL e em campos ocultos |
| Ler o bit 0 com `dcq` na primeira visita; sessão de 30 min com `dcm` em cookie `pix_trial` (§3.2, §4.5, Tarefa 7) | ❌ | Qualquer valor não vazio vale. A "chave do aparelho" é o próprio `dc_ler` (`stores.trials`) | Nomes diferentes (seção 4, item 2) |
| Marcar o bit com `dcm` **antes** de entregar; falha ao marcar → nada entregue (§3.2) | ❌ | `stores.trials.mark` depois do `claim` | — |
| Turnstile em "Liberar 7 dias grátis" (§3.2) | ❌ | — | O CSP de `app.js` precisa liberar o Turnstile |
| Mesma mensagem para aparelho usado e sessão inválida (§3.2) | ✅ | `trialUsedScreen` ("Este aparelho já usou o teste grátis") | — |
| Sem confirmação de e-mail (§3.2, F31) | ✅ | `POST /pix/teste` | — |
| Pedido `kind='trial'`, e-mail "Teste grátis", linha no relatório conforme B3 (Tarefa 7) | ❌ | O teste não cria pedido nem e-mail | — |
| Respostas só `not_eligible` ou `trial_out_of_stock` (Tarefa 7) | 🟡 | Temos também "indisponível para este e-mail" no teste (`trialStockScreen({forCustomer})`) | Seção 4, item 9 |
| Limites: teste 5/h por IP; `GET /pix` com `teste=1` 10/h por IP; desafio do firewall fora do Brasil (§9, Restrições globais) | ❌ | — | Seção 3 (Cloudflare) |

### 2.6 Apple: token, notificações e relatório

| Requisito | Status | Onde está ou o que falta | Observação |
|---|---|---|---|
| `GET /pix?t=…`: decodificar, conferir `bundleId`, `appAppleId` e validade; gravar; cookie `pix_tok` com o **id**; 303 sem token (§4.5, F1) | ❌ | `GET /pix` ignora `t` | Sem isso, toda venda sai no relatório como "sem compra" |
| Pedido nasce ligado ao token; `origin` `app`/`site`; janela de 7 dias (§7, F1) | ❌ | — | — |
| `POST /pix/api/apple/notifications` com JWS conferido (`EXTERNAL_PURCHASE_TOKEN`) (§7, F3) | ❌ | — | Depende de configurar a URL no App Store Connect |
| Livro `report_lines`, duplicados, `no_line`, `unrecognized` (§7, F2) | ❌ | — | — |
| Envio mensal (dia 2, 06h BRT, repete até o dia 10; alerta urgente no dia 10) com `requestIdentifier` gravado antes (§7) | ❌ | — | Prazo da Apple: dia 15 |
| Conciliação mensal com o histórico de notificações (§7) | ❌ | — | — |
| Link de resgate `apps.apple.com/redeem?ctx=offercodes&id=6756681755&code=…` (§3.1, Guia §1) | ✅ | `redeemUrl` em `src/page/format.js` | — |
| "Resgate até DD/MM" (validade do lote) (§3.1, F32) | ✅ | `CodeCard` com `redeemBy` | Simulado (`seed.js`) |

### 2.7 E-mails

| Requisito | Status | Onde está ou o que falta | Observação |
|---|---|---|---|
| Fila `email_outbox` na mesma transação, novas tentativas por até 24 h, alerta (§6.6, F5) | ❌ | — | — |
| E-mails: código, código atrasado, nota fiscal, teste grátis, lembrete (§6.6) | ❌ | — | A tela já diz "Também enviamos para {email}" e o campo diz "Enviamos o código e a nota fiscal"; hoje nada é enviado |
| Remetente `nao-responda@corridex.app` com SPF, DKIM e DMARC (§6.6) | ❌ | — | — |
| Lembrete 3 dias antes, uma vez só (`reminder_sent_at`), com descadastro (§3.3, §6.6, F17) | ❌ | — | — |
| Link do lembrete com e-mail **assinado e com validade** (`LINK_SIGNING_SECRET`) (§3.3) | ❌ | Hoje o e-mail vai aberto em `?email=` (`choosePath`) | Seção 4, item 8 |
| `GET /pix/api/unsubscribe?c=<assinado>` (Tarefa 8) | ❌ | — | — |
| Linguagem simples, sem "token", "oferta", "geração", "Apple ID" (§6.6) | ✅ | Regra escrita no topo de `copy.pt-BR.js` | Vale para as telas; os e-mails ainda não existem |

### 2.8 Nota fiscal (NFS-e)

| Requisito | Status | Onde está ou o que falta | Observação |
|---|---|---|---|
| Nota `pending` na transação do pagamento; DPS numerada por sequência do Postgres (§6.7, F9, F10) | ❌ | — | — |
| Fila: retry a cada 15 min por 24 h; `failed` com alerta; `skipped` e cancelamento no estorno (Tarefa 7A) | ❌ | — | — |
| Rascunho com descrição exata e competência em Brasília (Tarefa 7A) | ❌ | — | — |
| Projeto `corridex-fiscal`: DPS, XMLDSig, mTLS com A1, HMAC em toda rota, `GET /dps/{id}` (§6.7, Tarefa 12) | ➖ | Não existe projeto | Projeto separado por desenho. Seção 3: onde hospedar |
| Validade do A1 no resumo e alerta 30 dias antes (§6.7) | ❌ | — | — |
| Primeira nota da produção restrita aprovada pela Contabilizei (Tarefa 12, passo 6) | ❌ | — | Depende do A1 |

### 2.9 Página `/pix`: estados, UI e acessibilidade

| Requisito | Status | Onde está ou o que falta | Observação |
|---|---|---|---|
| Todos os estados da §8 | ✅ | `src/page/screens.js`: escolha, pagando, pago, a caminho, vencido, sem estoque, indisponível para o e-mail, pausado, erro, teste (pedido, liberado, já usado) | Mais: pedido não encontrado, ajuda, sem estoque do teste. Nomes diferentes (seção 4, item 12) |
| Um reducer `pixPageReducer` no cliente (§8, Tarefa 9) | 🟡 | Estado decidido **no servidor**; o cliente troca a tela quando o status muda (`pix.js`) | Decisão nossa, registrada na spec das telas |
| Textos todos num arquivo (§8) | ✅ | `src/page/copy.pt-BR.js` | Alguns textos diferem (seção 4, itens 3 e 4) |
| Componentes da §8 | 🟡 | `PlanSwitcher`, `EmailField`, `PixPayment`, `PaymentStatus`, `TrialRequest`, `Notice` existem; `PlanSummary`, `CodeDelivery`, `CodeHelp` viraram `OrderSummary`, `CodeCard`, `HelpList` | Sem regra de negócio nos componentes ✅ |
| Consulta de status: 3 s até 2 min, 10 s até 30 min (§3.1, Tarefa 9) | ✅ | `nextDelay` em `public/pix/assets/pix.js` | Também pausa com a aba escondida |
| Aparência do app: azul do sistema, fonte do sistema, fundos agrupados, claro e escuro, 360 px, alvos de 44 px (§8) | ✅ | `src/page/layout.js` | Redesenho HIG deliberado (seção 3) |
| WCAG 2.2 AA: `rem`, zoom 200%, `aria-live`, ícone + texto, foco visível, `prefers-reduced-motion` (§8) | 🟡 | Tudo presente em `layout.js`/`components.js` | Falta a prova automática: e2e com Playwright + axe (Tarefa 9). Pendência: contraste da borda dos planos < 3:1 |
| Sem fonte nem script de terceiros; LCP < 2 s em 4G (§8) | 🟡 | CSS inline, `pix.js` pequeno, sem fontes externas | LCP não medido |
| Sem analytics em `/pix/*` (§8) | ✅ | Nenhum script de analytics | — |
| Código e e-mail **nunca na URL**, exceto no link de resgate (§8) | 🟡 | Código: ✅. E-mail: ❌ (`?email=` em `choosePath`) | Seção 4, item 8 |
| `no-referrer`, `no-store`, `noindex` em **todo** `/pix/:path*` (§8, Guia §3.7) | 🟡 | Só nas respostas HTML; o JSON de status só tem `no-store`; `pix.js` (estático) sem eles | Tarefa 8 testa o status com os três |
| Rodapé com Termos, Privacidade e Ajuda (§8) | ✅ | `FooterLinks` | — |
| Páginas legais atualizadas: CDC art. 49, provedor de pagamento, NFS-e, retenções, exclusão (§8, Tarefa 9, F18) | ❌ | `apps/website/terms.html` e `privacy.html` não falam de Pix | Com o Inter, citar o Inter, não o Mercado Pago |
| "O código não funcionou? Fale com a gente" (§3.4) | ✅ | `helpScreen` em `/pix/pedido/:token/ajuda` (WhatsApp) | A troca do código (runbook) não existe |
| Página do pedido `/pix/pedido/:token` com token de 128 bits (§4.1, §9) | ✅ | `randomId()` (16 bytes) em `orders.js` | — |

### 2.10 Segurança e privacidade

| Requisito | Status | Onde está ou o que falta | Observação |
|---|---|---|---|
| Limites: criar Pix 10/h por IP e 5/h por e-mail, fora da memória (§9, Restrições globais) | ❌ | — | No Cloudflare: regras de limite do WAF (seção 3) |
| Turnstile no checkout e no teste (§4.1, §9) | ❌ | — | — |
| Desafio do firewall só fora do Brasil, só nas rotas do teste (§9, Tarefa 11) | ❌ | — | — |
| Proibido em log: código, e-mail, tokens, certificado (Restrições globais) | 🟡 | Não há log de propósito; `app.onError` faz `console.error(err)` | Falta a porta `Logger` que recusa esses campos e o teste |
| Nenhuma resposta diferencia e-mail cliente de não cliente (§9, F12) | 🟡 | O `nonce` impede chegar ao pedido de outra pessoa ✅. O teste grátis diz "Para este e-mail…" ❌ | Seção 4, item 9 |
| LGPD: exclusão em 15 dias; pedidos e notas 5 anos sem e-mail (§9) | ❌ | — | Entra no runbook e na Privacidade |
| Pedido de outro site (POST com nonce de terceiros) | ❌ | — | Não está na spec; pendência nossa (`Origin`/`Sec-Fetch-Site`) |
| CSP restritivo | ✅ | `CSP` em `app.js` | Extra nosso. Lembrar de liberar o Turnstile |

### 2.11 Operação

| Requisito | Status | Onde está ou o que falta | Observação |
|---|---|---|---|
| Crons: reconcile, email-outbox, invoices, inventory, generations, reminders, apple-report, daily-summary, cleanup (Tarefa 10, Guia §3.7) | ❌ | README já define o padrão `POST /pix/cron/...` com segredo | Spec usa `/pix/api/cron/*` e `CRON_SECRET` (seção 4, item 11) |
| Alertas por e-mail, 1 por tipo e chave por hora (`alert_log`) (§10) | ❌ | — | — |
| Alerta de estoque (< 14 dias ou < 100 códigos) com a geração mais nova e os comandos (§5.4) | ❌ | — | — |
| Resumo diário às 08h (§10) | ❌ | — | — |
| Limpeza diária (§10) | ❌ | — | — |
| `import-offer-codes` (geração, lote, `--taken`, `--deactivate`) (§5.4, Tarefa 11) | ❌ | `src/dev/seed.js` tem só códigos falsos `EXEMP…` | A estreia importa 1.500 códigos e o código já entregue em 16/11 |
| Runbook: estornar, reenviar, trocar código, apagar dados, repor estoque, pausar (§10, Tarefa 11) | ❌ | — | — |
| Guia de configuração da hospedagem (`vercel-setup.md`) (Tarefa 11) | ❌ | README tem só dev e deploy | Vira um guia do Cloudflare (seção 3) |
| Ensaio completo em staging (Tarefa 11, passo 4) | ❌ | — | Depende de todos os sandboxes |
| Ligar a venda só com B1 e B4 respondidos (Tarefa 11, passo 6) | ❌ | — | Interruptor `PIX_SALES_ENABLED` já existe |

### 2.12 Testes e critérios de aceite

| Requisito | Status | Onde está ou o que falta | Observação |
|---|---|---|---|
| Testes de unidade e de rota | 🟡 | 159 testes: `order-routes.test.js`, `orders.test.js`, `choose.test.js`, `trial.test.js`, `brcode.test.js` etc. | Cobrem o que existe |
| Os 5 focos da revisão (Plano: função morre entre separar e salvar; pagamento dias depois dentro dos 7 dias; estorno no mês seguinte; 24 meses de gerações; venda às 22h do dia 31) | ❌ | — | Dependem de banco, relatório e datas de negócio |
| Integração com Postgres real (Tarefas 3, 6) | ❌ | — | — |
| Fixtures gravadas do sandbox do provedor, incluindo webhook assinado (Tarefa 4) | ❌ | — | Gravar do sandbox do Inter |
| e2e Playwright + axe, claro e escuro, zoom 200% (Tarefa 9) | ❌ | Feito à mão (prints e revisão) | — |
| Testes de arquitetura (`lint:arch`) (Tarefa 1) | ❌ | — | — |

### 2.13 App iOS (Spec 05 e partes [app] da Spec)

Busca em `/Users/fernandakimiek/Projects/corridex-apps/corridexapp` (branch `master`) por `PixCheckout`, `ExternalPurchaseCustomLink`, `DeviceCheck`/`DCDevice`, `AccessEndingReminder`, `DeclaredAgeRange`, `custom-purchase-link`, `SKExternalPurchaseCustomLinkRegions`: **nada encontrado**. Só existe o resgate de código que já havia (`AppStore.presentOfferCodeRedeemSheet` em `SubscriptionStore.swift`). Não há branch com Pix; o `asc.py` está em `feat/asc-offer-codes` no remoto (a issue cita `feat/asc-free-offer-code`).

| Requisito | Status | Observação |
|---|---|---|
| Botão "Pagar com Pix", elegibilidade, aviso de saída nas duas faixas de iOS, token (App §2, §4) | ➖ ❌ | Não começado. Depende do B4 |
| Idade 18+ com Declared Age Range (App §2, §4.2) | ➖ ❌ | Não começado |
| Dois tokens do DeviceCheck no link (App §3.2) | ➖ ❌ | Não começado |
| Lembrete de renovação: cartão, marca da aba, notificação local às 10h (App §5) | ➖ ❌ | Não começado |
| Filtro de Novidades por loja (`storefront:BRA`) (App §7) | ➖ ❌ | Não começado |
| Entitlement, `Info.plist`, textos nos 6 idiomas, testes, notas para o App Review (App §2, §6, §8) | ➖ ❌ | Não começado |
| Oferta do teste grátis (1 semana, só `NEW`) no App Store Connect (Guia §4) | ➖ ❌ | O dono cria pelo `asc.py` |

---

## 3. Divergências deliberadas e o que cada uma muda no plano

### 3.1 Banco Inter PJ no lugar do Mercado Pago

A spec das telas já prevê a troca: a interface do provedor é `createCharge` / `getCharge` (Pix "cob" com `txid`, `PUT/GET /pix/v2/cob/{txid}`). O que muda no plano original:

- **Tarefa 4 inteira:** reescrever como "adapter do Inter". Saem `X-Idempotency-Key`, `external_reference`, `notification_url`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`. Entram a autenticação da API do Inter (OAuth com certificado da conta, conforme a spec das telas) e as variáveis correspondentes.
- **§4.4 e Tarefa 6:** "achar o pedido pelo `external_reference`" vira "achar pelo `txid`". O `txid` é nosso, então ele deve ser gravado no pedido **antes** de chamar o Inter (resolve a pendência do duplo envio e o F6).
- **§6.2 (webhook):** a validação `x-signature` é do Mercado Pago. A do Inter precisa ser lida na documentação dele. A regra que não muda: **sempre reler a cobrança na API** antes de marcar `paid`.
- **§6.3 (status):** trocar a tabela de status do Mercado Pago pela dos status da cobrança do Inter. Manter "status desconhecido gera alerta, sem erro".
- **§6.4 e §6.5 (conciliação e estorno):** a busca por data de atualização e o estorno (no Pix, devolução) passam a usar a API do Inter. Conferir na documentação dele como listar devoluções. `charged_back` e `in_mediation` são do Mercado Pago e podem não existir.
- **Decisões da issue:** "Mercado Pago, conta CNPJ, saque para Nubank PJ" deixa de valer.
- **Textos legais (§8, Tarefa 9):** a Privacidade cita o Inter. O rodapé já diz "Pagamento pelo Banco Inter" (`copy.footer.bank`).
- **Guia §2 e Tarefa 11:** a configuração do webhook e as credenciais de teste passam a ser as do Inter.

### 3.2 Cloudflare Workers no lugar da Vercel

O README mantém o código portável (Hono + APIs web, nada de D1/KV em `app.js`) e o banco planejado é Postgres/Neon. O que muda:

- **§4.1 (peças):** "Vercel Functions" vira Workers; o `waitUntil` do webhook existe no Workers (`ctx.waitUntil`).
- **Crons (Tarefa 10, Guia §3.7):** o `vercel.json` vira Cron Triggers no `wrangler.toml`, chamando as rotas de cron, como o README já define. **Conferir** o limite de Cron Triggers do plano grátis: o plano tem 9 crons, e pode ser preciso um único cron que despacha as tarefas.
- **Limites e anti-robô (§4.1, §9):** "Vercel WAF ou Upstash" vira as regras de limite e o desafio por país do firewall do Cloudflare; o Turnstile é do próprio Cloudflare. A regra "nunca em memória" continua.
- **Cabeçalhos (Guia §3.7):** sem `vercel.json`, eles saem por middleware em `app.js` (já existe, só para HTML) ou por regra do Cloudflare. O `pix.js`, servido como arquivo estático, também precisa deles.
- **Segredos:** "Sensitive na Vercel" vira `wrangler secret put`. "Deployment Protection" (Tarefa 11) não existe igual; manter webhook, notificações da Apple e crons acessíveis.
- **Rewrite de `/pix/*` no site (Guia §3.7):** continua pendente. O site (`apps/website/vercel.json`) ainda não repassa `/pix`.
- **Tarefa 11 (`vercel-setup.md`):** vira um guia do Cloudflare.
- **`corridex-fiscal` (Tarefa 12):** o plano usa Node (`undici` com `.pfx`, `xml-crypto`). No Workers, mTLS e XMLDSig com A1 não funcionam do mesmo jeito. **Decisão aberta:** hospedar o fiscal em Node (Vercel, num time só do dono, como a spec recomenda) ou validar o Workers antes. A separação do A1 continua obrigatória.
- **Plano "Pro"** (Decisões): deixa de ser pré-requisito para o projeto do Pix, mas a recomendação de isolar o fiscal continua.

### 3.3 Telas redesenhadas no padrão Apple (HIG)

- O layout difere dos mockups do Handoff de propósito (`docs/superpowers/specs/2026-11-17-pix-redesign-hig-design.md`). A Tarefa 9 diz "visual e textos **exatamente** os do Handoff": esse ponto deixa de valer para o visual. Os **textos** contratuais da spec devem continuar (seção 4).
- O estado vive no servidor, não num `pixPageReducer` no cliente. O teste `pollDelay` existe como `nextDelay`. Os testes do reducer da Tarefa 9 viram testes de rota por estado (já existem).
- Botões "Copiar" ao lado do código, QR recolhido e barra fixa embaixo atendem a §8 (um botão principal por tela, 44 px).

### 3.4 JS sem TypeScript e sem Clean Architecture formal (decisão das telas)

Não é uma decisão registrada com o dono contra a spec; é uma escolha da etapa das telas. A §4.2 e a Tarefa 1 pedem camadas checadas no CI. Ver a seção 4, item 14.

---

## 4. Conflitos e diferenças de detalhe

| # | Tema | Spec | Nosso código | Recomendação |
|---|---|---|---|---|
| 1 | **Ids dos planos** no link do app | `plano=monthly\|quarterly\|annual` (Guia §3.8, App §3.1) | `mensal\|trimestral\|anual` (`plans.js`). Um `plano=monthly` cai **sem aviso** no Anual (`validPlanId`) | **Corrigir já:** aceitar os ids da spec (manter os nossos como apelido, se quiser). É contrato com o app |
| 2 | **Parâmetros do teste** | `teste=1&dcq=…&dcm=…` (§3.2, Guia §3.8) | `teste=1&dc_ler=…&dc_marcar=…` | A própria spec das telas diz "se forem outros, vale a spec". **Renomear para `dcq`/`dcm`** |
| 3 | Botão de resgate | "Resgatar código" (Restrições globais, §3.1) | "Resgatar na App Store" (`copy.code.redeemStore`) | Voltar para "Resgatar código", ou pedir ao dono para mudar a regra da spec |
| 4 | Código atrasado | "Seu código chega por e-mail **em algumas horas**" (§3.4; o F8 removeu "em até 2 horas") | "Ele chega por e-mail **em até 2 horas**" (`copy.pending.body`) | Usar "em algumas horas": a reposição é manual e um lote leva 1 h para valer |
| 5 | Estados do pedido | `created → pix_pending → paid → fulfilled`, `code_pending`, `expired`, `refunded` (§4.4) | `paying`, `delivered`, `pending`, `expired` | Adotar os nomes da spec ao criar a migração (o status vai para o banco, o relatório e os alertas). Nas telas, só mapear |
| 6 | **Reserva do código** | "Nada é reservado antes do pagamento" (§9); só checar `pickOffer` e separar depois de pago (§5.3) | Reserva por 30 min ao gerar o Pix (`codes.reserve`) | Seguir a spec: reservar deixa um robô (ou quem sabe um e-mail) esgotar o estoque. O caso raro de pago sem código já tem o estado `code_pending` e o alerta |
| 7 | Toque duplo | Reaproveita o `pix_pending` do mesmo cliente e plano (§3.4, §6.1) | Só com o mesmo `nonce` do formulário | **Manter o nosso:** por e-mail, quem sabe um e-mail chegaria ao pedido de outra pessoa (contra §9). Registrar a mudança na spec |
| 8 | E-mail na URL | Nunca, exceto assinado e com validade no lembrete (§3.3, §8) | `/pix?plano=…&email=…` (`choosePath`, `GET /pix`) | Tirar o `?email=`; usar campo de formulário ou parâmetro assinado (`LINK_SIGNING_SECRET`) |
| 9 | Teste para e-mail que já usou | Respostas `not_eligible` ou `trial_out_of_stock`; nenhuma resposta diferencia e-mail cliente (§3.2, §9) | Tela "Para este e-mail, o Teste grátis fica disponível em algumas horas" | Mostrar a mensagem de "sem estoque" (ou a de aparelho já usado). Não revelar o e-mail |
| 10 | `PIX_SALES_ENABLED` padrão | `false` por padrão (Tarefa 1) | `true` se ausente (`config.js`) | Mudar para `false` por padrão antes do provedor real |
| 11 | Rotas | `/pix/api/checkout`, `/pix/api/orders/:token/status`, `/pix/api/trial`, `/pix/api/webhooks/…`, `/pix/api/apple/notifications`, `/pix/api/unsubscribe`, `/pix/api/cron/*` (Tarefa 8) | `POST /pix/pedidos`, `/pix/pedido/:token/status`, `/pix/pedido/:token/renovar`, `/pix/pedido/:token/ajuda`, `/pix/teste`; crons `POST /pix/cron/...` (README) | As nossas funcionam sem JS (formulário + 303), o que é bom. Manter, mas **fixar os nomes das rotas públicas que terceiros chamam** antes de configurá-las: webhook do Inter e `/pix/api/apple/notifications` (a issue já cita essa URL para o App Store Connect) |
| 12 | Nomes dos estados da página | `choose`, `paying`, `delivered`, `pending`, `expired`, `unavailable_plan`, `unavailable_for_customer`, `paused`, `error`, `trial_request`, `trial_delivered`, `trial_not_eligible` (§8) | `plan_out_of_stock`, `sales_paused`, `trial`, `trial_used`, mais `not_found`, `help`, `trial_out_of_stock` | Só nomes internos (`data-state`). Alinhar se for barato; não bloqueia |
| 13 | Teste grátis fora de `/pix` | Tudo na mesma página, com sessão por cookie e 303 sem tokens (§4.5) | Rota própria `/pix/teste` com os tokens na URL e em campos ocultos | Criar a sessão no `GET /pix` (cookie `pix_trial`) e tirar os tokens da URL. A tela separada pode ficar |
| 14 | Stack e camadas | TypeScript strict, Zod, Vitest, dependency-cruiser, camadas da §4.2 | JS, `node --test`, dois arquivos de regra | Decidir com o dono antes do banco. Sugestão: manter JS, mas criar já `domain/`, `ports/`, `adapters/` e uma regra de importação no CI, porque o banco, o Inter, a Apple e a nota entram como adapters |
| 15 | Gerar novo Pix | "Gerar novo Pix (mesmo e-mail)" | O mesmo pedido acumula `txids` | Ok para a página. No banco, decidir se é um pedido novo; o relatório e a nota contam por pedido pago |
| 16 | Consulta de status | Lê só o banco; nunca chama o provedor (§11) | `orders.get` relê o provedor a cada consulta | Com o Inter, mover a releitura para o webhook e a conciliação |
| 17 | Cabeçalhos | Os três em todo `/pix/:path*` | Só no HTML | Aplicar em todas as respostas, inclusive JSON e `pix.js` |

---

## 5. Próximos passos sugeridos, em ordem

### 5.1 Dá para fazer já (sem conta Inter)

1. **Contrato com o app:** aceitar `plano=monthly|quarterly|annual` e `dcq`/`dcm` (itens 1 e 2). Assim o time do app pode começar.
2. **Textos contratuais:** "Resgatar código" e "em algumas horas" (itens 3 e 4). Tirar `?email=` (item 8). Tela do teste sem revelar o e-mail (item 9). `PIX_SALES_ENABLED` falso por padrão (item 10). Cabeçalhos em tudo (item 17).
3. **Decidir com o dono:** reserva antes do pagamento (item 6), stack e camadas (item 14), onde hospedar o `corridex-fiscal` (seção 3.2).
4. **Domínio puro (Tarefa 2):** `Money`, `Email`, datas em Brasília, `transition`, `pickOfferCandidates`, `planGenerations`, `replenishNeeded` e o teste de 24 meses. Não depende de ninguém.
5. **Banco (Tarefa 3):** migração com a §4.3, `UnitOfWork`, `allocate` idempotente, testes com Postgres em Docker. Resolve as pendências de concorrência. Criar o Neon.
6. **Token da Apple na entrada (Tarefa 5, parte pura, e Tarefa 8):** `decodePurchaseToken`, cookie `pix_tok`, sessão `pix_trial`, 303 sem tokens. Dá para testar com tokens montados.
7. **Fila de e-mail e templates (Tarefa 10):** escolher o provedor de e-mail e configurar SPF, DKIM e DMARC em `corridex.app`.
8. **Importação de códigos (Tarefa 11):** `import-offer-codes` contra o banco, com `--taken` para o código entregue em 16/11.
9. **Turnstile e firewall:** criar o widget, regras de limite e o desafio fora do Brasil no Cloudflare; ajustar o CSP.
10. **Páginas legais:** Termos (CDC art. 49) e Privacidade (Inter, NFS-e, retenções, exclusão) em `apps/website`. Rewrite de `/pix/*` no site.
11. **e2e com Playwright + axe** sobre as telas atuais.
12. **Runbook e guia do Cloudflare** (Tarefa 11), começando pelo que já existe (pausar a venda).

### 5.2 Depende de terceiros

| Passo | Depende de |
|---|---|
| Adapter do Inter: cobrança, webhook, conciliação, devolução; fixtures do sandbox (Tarefas 4 e 6 reescritas) | Conta PJ no Inter, credenciais e certificado da API |
| Notificações da Apple e relatório mensal, com teste no sandbox (Tarefas 5 e 10) | Chave "Compras dentro do app"; URL de notificações no App Store Connect; resposta do B3 |
| DeviceCheck real (Tarefa 7) | Chave DeviceCheck; app mandando `dcq`/`dcm` |
| Oferta do teste grátis | Dono cria pelo `asc.py` |
| `corridex-fiscal` e fila de notas (Tarefas 7A e 12) | Certificado A1 (ideal: dedicado); produção restrita; validação com a Contabilizei |
| App iOS (Spec 05) | Entitlement B4 aprovado; termos do Brasil aceitos |
| Ensaio completo em staging e ligar a venda (Tarefa 11) | Tudo acima, mais B1 (obrigatório), B2 e B6 respondidos pela Apple |
