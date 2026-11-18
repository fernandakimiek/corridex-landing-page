# Pix: pendências antes de ligar o Inter

Levantadas nas revisões da branch `feat/pix-telas-simuladas` (telas com pagamento simulado). Nada aqui afeta a simulação; tudo precisa estar resolvido antes de um provedor real.

## Obrigatórias
- **Duplo envio concorrente cria duas cobranças.** `orders.create` só insere o pedido depois do `await createCharge`. Com rede real, dois POST simultâneos passam pelo `findActive`. Resolver com trava por `email|plano|nonce` ou inserção provisória + chave única no Postgres.
- **Pagamento com valor errado ou txid extra pago não fica registrado.** Hoje o pedido só não é entregue. Registrar para conciliação/estorno.
- **Fixação de nonce por POST de outro site.** Rejeitar POST com `Origin`/`Sec-Fetch-Site` de outro site, ou ligar o nonce a um cookie SameSite.
- **Uso de `PIX_DEV_TOOLS=true` em produção.** Garantir que o deploy recuse (ex.: checar host `corridex.app`).
- **Cache do `pix.js`.** Adicionar versão na URL antes do primeiro deploy.
- **Teste grátis sem validação.** DeviceCheck e Turnstile reais (hoje qualquer `dc_ler` vale).

## Recomendadas
- Separar `apps/pix/src/app.js` em `routes/{choose,orders,trial,dev}.js` antes de somar webhook e crons.
- `app.onError` devolve HTML também em `/status` (o cliente espera JSON).
- Pedido pago após vencer pode ir para "a caminho" por causa de reserva não paga do mesmo e-mail; revisar política de estoque.
- Quem conhece um e-mail pode abrir pedidos novos e esgotar as ofertas daquele e-mail por ~30 min.
- E-mail em query string (`?email=`) fica no histórico e em logs.
- Contraste de borda dos planos não selecionados < 3:1 (igual ao app).
