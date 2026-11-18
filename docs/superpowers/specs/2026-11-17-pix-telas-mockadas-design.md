# Telas do Pix com pagamento simulado — design

Data: 2026-11-17 · App: `apps/pix` · Referência visual: [Handoff do Pix](https://claude.ai/artifact/GR4vNDrqcayTxJQvidjS46)

## Intenção

Construir já a página `corridex.app/pix` com todos os estados do handoff, funcionando de ponta a ponta, sem depender do banco. A conta Inter PJ (provedor Pix escolhido, no lugar do Mercado Pago do handoff) ainda não existe. Quando existir, troca-se só o provedor simulado pelo do Inter; telas, rotas e regras ficam iguais.

Quem usa: motorista de aplicativo, no celular (Android barato ou iPhone, 4G), entre corridas. Mobile first.

## Objetivos

- Todos os estados do handoff navegáveis no celular: `choose`, `paying`, `delivered`, `pending`, `expired`, `error`, `plan_out_of_stock`, `unavailable_for_customer`, `sales_paused`, teste grátis (`request`, `delivered`, `not eligible`), página do pedido e "O código não funcionou?".
- Fluxo real de API com um provedor Pix simulado: criar cobrança → aguardar → pagar (simulado) → entregar código.
- Forçar qualquer estado em desenvolvimento para revisar visual e textos.
- Visual, textos, tokens e acessibilidade iguais ao handoff.

## Fora do escopo (agora)

- Integração com o Inter (mTLS, OAuth, webhook).
- Banco de dados real (Postgres/Neon, conforme README do app). Agora, armazenamento em memória.
- Envio de e-mail, NFS-e, relatório à Apple, DeviceCheck real, Turnstile real, crons.
- Rewrite de `/pix/*` no `vercel.json` do site.

## Anti-objetivos

- Lógica de negócio ou preço decidida no navegador. O servidor decide tudo; o celular só envia plano e e-mail.
- Segredo ou ferramenta de simulação acessível em produção.
- Página pesada: nada de framework no cliente, fonte externa ou script de terceiros (exceto Turnstile, depois).
- Quebrar a regra do README: `src/app.js` sem D1, KV ou bindings da Cloudflare.

## Abordagens consideradas

1. **HTML gerado pelo Worker + JS pequeno (escolhida).** Hono monta o HTML com `hono/html`; CSS inline; um módulo JS de poucos KB para consultar status, copiar e contar o prazo. Sem build nova; testes continuam em `node --test`. Mais leve no 4G, código do servidor nunca vai ao celular.
2. **Preact + TypeScript + Vite.** Mais próximo do vocabulário do handoff (componentes, reducer), mas acrescenta build, dependências e 10–45 KB no celular. Descartada.
3. **Só front estático com estados falsos no navegador.** Mais rápido de fazer, mas não testa a API nem a troca de estados; refaz-se tudo ao ligar o Inter. Descartada.

Escolha da Fernanda: abordagem 1, depois de confirmar que o código visível no navegador não expõe nada sensível (segredos e regras ficam no Worker).

## Design

### Uma URL por pedido, estado decidido no servidor

- `GET /pix?plano=anual` → tela `choose`. Formulário comum (`<form method="post">`), funciona até sem JS.
- `POST /pix/pedidos` (plano, e-mail) → valida, checa estoque e pausa, cria cobrança no provedor, responde `303` para `/pix/pedido/:token`. Erros de escolha (`plan_out_of_stock`, `unavailable_for_customer`, e-mail inválido) voltam à tela `choose` com o aviso; não criam cobrança.
- O formulário de escolha leva um `nonce` aleatório (campo oculto, 16 bytes base64url) que fica gravado no pedido. Um envio só reaproveita o pedido ativo (mesmo e-mail e plano, ainda pagando) se trouxer o mesmo `nonce` (duplo envio do mesmo formulário); sem ele ou com outro, é um pedido novo. Assim, saber o e-mail de alguém não leva ao link do pedido dessa pessoa.
- `GET /pix/pedido/:token` → renderiza o estado atual do pedido: `paying`, `delivered`, `pending` ou `expired`. É a mesma URL da "página do pedido" do e-mail. Recarregar ou voltar do app do banco cai no estado certo.
- `GET /pix/pedido/:token/status` → JSON `{ status }` para a consulta periódica.
- `POST /pix/pedido/:token/renovar` → "Gerar novo Pix" a partir de `expired`, sem pedir e-mail de novo.
- `GET /pix/pedido/:token/ajuda` → "O código não funcionou?".
- `GET /pix/teste` e `POST /pix/teste` → fluxo do teste grátis (só com `teste=1` e tokens do app; agora simulados).
- Venda pausada (`PIX_SALES_ENABLED=false`) e Pix fora do ar (`error`) são tratados no servidor e renderizados como estados.

Isso substitui o `pixPageReducer` do cliente do handoff: o estado vive no servidor e o cliente só pede a página de novo quando o status muda. Os nomes de estado e de componentes do handoff são mantidos nas funções de template.

### Cliente (JS pequeno)

`pix.js`, módulo ES, alvo < 5 KB, sem dependências:

- Em `paying`: consulta `/status` a cada 3 s, depois de 2 min a cada 10 s, até 30 min. Ao mudar, troca o `<main>` pelo HTML novo (fetch da própria página).
- Pausa a consulta com a página escondida e consulta na hora ao voltar (`visibilitychange`): o motorista sai para o app do banco e volta.
- "Copiar código Pix": Clipboard API; se falhar, seleciona o código. Aviso em `role="status"`.
- Contagem do prazo ("Vale até 14:32 (29 min)").
- Sem JS, a página continua utilizável: botão "Já paguei, atualizar" recarrega.

### Provedor Pix e armazenamento (interfaces)

```js
// provider
createCharge({ txid, amountCents, expiresInSeconds }) → { copiaECola, expiresAt }
getCharge(txid) → { status: 'ATIVA' | 'CONCLUIDA' | 'REMOVIDA', amountCents }
```

- `MockPixProvider`: gera um BR Code EMV válido no formato (CRC16 correto) com chave fictícia e descrição "TESTE - NAO PAGUE"; guarda cobranças em memória; `markPaid(txid)` para o painel de simulação.
- `InterPixProvider`: depois, mesma interface (`PUT/GET /pix/v2/cob/{txid}`).
- Lojas em memória atrás de interfaces simples: pedidos, estoque de códigos (alguns códigos de exemplo por plano), testes por aparelho. Trocam-se por Postgres depois.
- O provedor e as lojas são injetados na criação do app (`createApp({ provider, stores, config })`), para testes e para o Worker escolherem a implementação. Em `wrangler dev`, memória vale por isolate: suficiente para simulação.

### QR Code

Gerado no servidor como SVG inline a partir do `copiaECola`, com a biblioteca `uqr` (ESM, sem dependências). Nítido em qualquer tela, nada a baixar no celular.

### Simulação (só em desenvolvimento)

Ativa só com `PIX_DEV_TOOLS=true` (em `.dev.vars`). Em produção as rotas respondem 404.

- `POST /pix/dev/pedido/:token/pagar` → marca como pago (entrega código).
- `?cenario=` em `/pix` e no pedido força: `sem-estoque`, `indisponivel-email`, `pausado`, `fora-do-ar`, `vencido`, `pendente` (pago sem código), `teste-usado`.
- Uma barra discreta de desenvolvimento na página com esses atalhos e "Simular pagamento".
- `/pix/dev` lista links para todos os estados (catálogo para revisão visual).

### Planos e preços

Arquivo de configuração no servidor (`plans.js`), com duração e preço em centavos:

| Plano | Duração | Preço |
|---|---|---|
| Mensal | 1 mês | R$ 9,90 (`990`) |
| Trimestral | 3 meses | R$ 25,90 (`2590`) |
| Anual | 1 ano | R$ 99,90 (`9990`) |

### Visual e textos

- Tokens do handoff (`--accent`, `--bg`, `--surface`, `--label`, `--label2`, `--success`, `--warning`, `--error`), claro e escuro por `prefers-color-scheme`. Fonte do sistema.
- CSS mobile first, inline no `<head>` (LCP). `100dvh`, `env(safe-area-inset-*)`, alvos de 44 px, texto em `rem`.
- Todos os textos em `src/page/copy.pt-BR.js` (JS, não TS), com as chaves do handoff. Nenhum texto solto nos templates.
- Rodapé: "Pagamento pelo Banco Inter".
- Acessibilidade conforme tabela de componentes do handoff (`radiogroup` no seletor, `aria-live` no status, `role="alert"` em erro, código soletrável).
- `/pix/pedido/*`: `noindex`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`. Nenhum analytics.

### Estrutura de arquivos (proposta)

```
apps/pix/
  src/app.js              createApp + rotas (sem bindings Cloudflare)
  src/worker.js           escolhe provider/stores pelo env
  src/plans.js
  src/pix/brcode.js       montagem EMV + CRC16
  src/pix/mock-provider.js
  src/store/memory.js
  src/page/copy.pt-BR.js
  src/page/layout.js      <head>, tokens, CSS
  src/page/components.js  PlanSwitcher, PlanSummary, EmailField, PixPayment, PaymentStatus, CodeDelivery, CodeHelp, TrialRequest, Notice
  src/page/screens.js     uma função por estado
  public/pix/assets/pix.js  script do cliente (Workers static assets)
```

O script do cliente é servido como arquivo estático (`[assets]` no `wrangler.toml`), mantendo `app.js` sem dependência de plataforma. Suas funções puras (agendamento da consulta, formatação do prazo) são exportadas e testadas em Node.

### Testes

- `node --test` com `app.request(...)`: cada rota e cada estado renderiza o texto e os atributos esperados (jsdom, já usado no site, para consultar o HTML).
- BR Code: CRC16 e campos EMV contra exemplo conhecido.
- Fluxo: criar pedido → `paying` → simular pagamento → `delivered` com código; estoque zerado → `pending`; vencido → renovar.
- Rotas `/pix/dev/*` respondem 404 sem `PIX_DEV_TOOLS`.
- Manual: 360 px no Chrome e Safari do iPhone, tema escuro, zoom 200%, VoiceOver no status.

### Ambiente: só desenvolvimento por enquanto *(decisão do Claude)*

- Nada vai para produção nesta etapa. Teste no celular real por `wrangler dev --ip 0.0.0.0` na rede local, ou por túnel (`cloudflared tunnel --url`).
- O app falha fechado: sem provedor real configurado e fora de `PIX_DEV_TOOLS=true`, `/pix` mostra `sales_paused`. O provedor simulado se recusa a iniciar sem `PIX_DEV_TOOLS=true`. Assim um deploy acidental nunca entrega BR Code falso nem código de exemplo.
- As lojas em memória valem por isolate. Em `wrangler dev` (um isolate só) isso basta. Não servem para deploy, de propósito.

### O código entregue

É um código de oferta da Apple (offer code), de uso único, para o plano comprado. "Resgatar código" abre `https://apps.apple.com/redeem?ctx=offercodes&id=6756681755&code=<código>`. É exibido em grupos de 6 caracteres e soletrado pelo leitor de tela. O estoque simulado usa códigos de exemplo no mesmo formato, claramente falsos (`EXEMP1...`), com validade ("Resgate até {data}").

### Estoque e reserva *(decisão do Claude, revisar)*

- Ao criar o pedido, o servidor verifica se há código livre para o plano e para aquele e-mail. Sem código, o Pix não é gerado (`plan_out_of_stock`). Isso segue a regra do handoff: nunca cobrar sem ter o que entregar.
- O código fica **reservado** para o pedido durante a validade do Pix (30 min). Com o pagamento confirmado, a reserva vira entrega (`delivered`). Se o Pix vencer sem pagamento, a reserva é liberada. "Gerar novo Pix" tenta reservar de novo.
- `pending` (pago, sem código) só acontece quando o pagamento chega depois de a reserva ter sido liberada e o estoque acabou. A página diz que o código chega por e-mail e para de consultar o status. Na simulação, `?cenario=pendente` força esse estado.

### Indisponível para este e-mail

Cada código de oferta da Apple vale uma vez por conta Apple, para cada oferta. O servidor registra quais ofertas (lotes de códigos) cada e-mail já recebeu. Se todas as ofertas ativas do plano já foram entregues àquele e-mail, responde `unavailable_for_customer` e não gera o Pix. Na memória: estoque organizado por oferta, mais um registro "e-mail → ofertas recebidas".

### Teste grátis: contrato com o app

Do handoff: o app abre `/pix` com `teste=1` e dois tokens do DeviceCheck, um para ler o estado do aparelho e outro para marcar o aparelho como "já usou". O teste vale uma vez por aparelho, não pede confirmação de e-mail, entrega um código de oferta do estoque do teste (oferta própria de 7 dias) e não gera venda. Nesta etapa os tokens não são validados: qualquer valor não vazio vale como sessão válida, e `?cenario=teste-usado` força o caso negativo. *(Decisão do Claude:)* os parâmetros se chamam `teste`, `dc_ler` e `dc_marcar` e chegam pela query string. **Conferir com a spec da issue #431 antes de ligar o app**: se lá os nomes forem outros, vale a spec.

## Deixado para quem constrói

- Mudar `app.js` de um `app` único para `createApp(...)` com injeção de dependências (refatoração pequena; ajustar `worker.js` e o teste atual).

- Formato exato do token do pedido (aleatório, ≥ 128 bits, URL-safe).
- Detalhes de layout dentro dos tokens e mockups do handoff.
- Organização interna dos testes.
