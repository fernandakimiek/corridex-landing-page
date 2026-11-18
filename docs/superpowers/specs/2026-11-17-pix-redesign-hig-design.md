# Redesenho das telas do Pix (padrão Apple) — design

Data: 2026-11-17 · App: `apps/pix` · Complementa `2026-11-17-pix-telas-mockadas-design.md` (regras, rotas e estados não mudam).

## Por quê

Nos testes no celular, a Fernanda achou ruim o botão "Copiar código Pix" solto no topo e várias telas com o conteúdo espremido no alto. O mockup do handoff era só uma ideia. As telas passam a seguir as Human Interface Guidelines e os padrões que o app Corridex já usa: o paywall e a barra fixa embaixo (`PinnedBar`).

Maquete aprovada: `docs/superpowers/references/2026-11-17-pix-redesign-maquete.html`. Prints: `docs/superpowers/references/pix-redesign/depois-*.png` (comparar com `antes-*.png`).

## Abordagens consideradas

1. **Padrões do próprio app (escolhida).** Escolha igual ao paywall; Pix gerado no formato dos apps de Pix (código com botão de copiar ao lado, passos, QR recolhido); resultados centralizados com ação na barra fixa embaixo.
2. **Manter o layout atual e só ajustar espaçamentos.** Não resolve o botão de copiar fora de contexto. Descartada.
3. **Pix gerado com QR em destaque.** Bom no computador, ruim no celular, onde quem paga não consegue ler o próprio QR. Descartada.

## Padrões

### Estrutura de toda tela
- **Barra de título** de 44 px, centralizada: a marca (quadrado azul + "Corridex") na escolha; nas demais, o título da etapa ("Pagamento", "Teste grátis", "Ajuda").
- **Conteúdo** com margem lateral de 20 px e 24 px entre blocos. Ele rola.
- **Barra de ação fixa embaixo** (equivalente ao `PinnedBar`): fundo translúcido com desfoque, linha fina em cima, botão principal em cápsula de 50 px e ações secundárias abaixo dele.
  - **Margem inferior (pedido da Fernanda):** o botão não pode ficar colado na base. `padding-bottom: calc(env(safe-area-inset-bottom) + 24px)` e `padding-top: 16px`, o que dá no mínimo 24 px de folga sem barra de gestos e cerca de 58 px no iPhone.
  - Telas sem ação principal (por exemplo, "Seu código está a caminho") não têm barra.
- **Telas de resultado** (pago, a caminho, vencido, erro, venda pausada, pedido não encontrado, teste liberado, teste já usado, sem estoque do teste) usam bloco centralizado na vertical: ícone de 64 px, título de 28 px em negrito, texto secundário de 15 px e, se houver, cartões (código, resumo) logo abaixo.
- Termos, Privacidade e Ajuda viram links discretos no fim do conteúdo da escolha. "Pagamento pelo Banco Inter" vai em letra pequena dentro da barra, sob o botão, só na escolha.
- **Barra de simulação (dev):** sai do rodapé fixo e vai para uma faixa estática no topo, acima da barra de título, para nunca disputar espaço com a barra de ação.

### Escolha do plano
- Cabeçalho centralizado: ícone de raio 44 px num círculo azul a 12%, o título "Assine o Corridex com Pix" e o subtítulo "Pagamento único. Não renova sozinho."
- **Cartões de plano** empilhados, como no paywall: indicador de seleção, nome em negrito com a duração e o preço por mês embaixo (Trimestral "3 meses · R$ 8,63/mês", Anual "1 ano · R$ 8,33/mês", Mensal "1 mês") e o preço total à direita. O Anual tem o selo "Mais vantajoso" (fundo #8C5000, texto branco).
- O preço por mês é calculado no servidor (`amountCents / meses`, arredondado para baixo no centavo).
- Grupo de e-mail no estilo inset do iOS: rótulo em caixa alta pequena, campo branco de raio 12 e nota embaixo.
- Barra: "Gerar Pix · R$ 99,90" (o valor acompanha o plano selecionado; sem JS, mostra o do plano carregado) e, sob ele, "Pagamento pelo Banco Inter".
- Os estados de aviso (sem estoque, indisponível para este e-mail, e-mail inválido) mantêm as regras atuais. O aviso aparece logo abaixo do cabeçalho, e a barra mostra a ação adequada ("Ver Trimestral" etc.).

### Pix gerado
- Topo centralizado: nome do plano (secundário), **valor em 34 px negrito** e "Vale até 21:44 · 29 min" com ícone de relógio.
- Grupo "PIX COPIA E COLA": cartão com o código numa linha, cortado com reticências, e um botão "Copiar" com ícone (tint azul a 12%) **ao lado do código**.
- Cartão com os passos numerados: "Copie o código acima", "Abra o app do seu banco", "Escolha Pix Copia e Cola e cole".
- "Mostrar QR Code" recolhido (`<details>`, funciona sem JS); ao abrir, mostra o QR de cerca de 13rem e "Ou leia o QR Code com outro aparelho".
- Status: ponto laranja com "Aguardando pagamento. Esta tela muda sozinha." (`aria-live`). Sem JS, aparece o link "Já paguei, atualizar".
- Barra: "Copiar código Pix". Os dois botões de copiar mostram o mesmo aviso "Código copiado. Cole no app do seu banco.".
- O código completo continua disponível, sem JS, para copiar à mão: ao tocar no cartão, ele expande e mostra o texto inteiro selecionável.

### Pago
- Centralizado: check verde em círculo de 64 px, "Pagamento confirmado" e "Falta um toque para ativar seu acesso."
- Cartão "SEU CÓDIGO" com o código em monoespaçada de 22 px e "Resgate até … · enviado para m•••@email.com".
- Cartão de resumo em lista: "Corridex Anual — R$ 99,90" e "Pago em — 17/11/2026 · Pix".
- Barra: "Resgatar na App Store" com ícone de download, e o link "O código não funcionou?" embaixo.

### Vencido / erro / pausado / não encontrado / teste usado
- Centralizado com o ícone do tom (relógio laranja para vencido, X vermelho para erro, info azul para pausado, não encontrado e teste usado), título e texto.
- Barra com a ação: "Gerar novo Pix", "Tentar de novo", "Ver planos". Venda pausada não tem barra.

### A caminho (pending)
- Centralizado: check verde, "Pagamento confirmado", o aviso de que o código chega por e-mail em até 2 horas e para onde será enviado. Sem barra.

### Teste grátis (pedido) e Ajuda
- Teste grátis: cabeçalho com ícone de presente, "Testar 7 dias grátis" e "Sem pagamento. Não renova sozinho."; grupo de e-mail; barra com "Liberar 7 dias grátis" e o link "Voltar aos planos".
- Ajuda: a barra de título "Ajuda", os dois cartões em lista e a barra com "Falar com o suporte" e o link "Voltar ao pedido".

## Textos novos (copy.pt-BR.js)
`choose.title` "Assine o Corridex com Pix" · `choose.sub` "Pagamento único. Não renova sozinho." · `plan.perMonth` "{duração} · {valor}/mês" · `plan.best` "Mais vantajoso" · `pix.ctaWithPrice` "Gerar Pix · {valor}" · `nav.payment` "Pagamento" · `nav.trial` "Teste grátis" · `nav.help` "Ajuda" · `pix.copyShort` "Copiar" · `pix.step1` "Copie o código acima" · `pix.step2` "Abra o app do seu banco" · `pix.step3` "Escolha Pix Copia e Cola e cole" · `pix.showQr` "Mostrar QR Code" · `pix.waitingLong` "Aguardando pagamento. Esta tela muda sozinha." · `pix.validShort` "Vale até {hora} · {minutos} min" · `code.redeemStore` "Resgatar na App Store" · `code.meta` "Resgate até {data} · enviado para {email}" · `order.paidOnLabel` "Pago em" · `order.paidOnValue` "{data} · Pix". Os textos que ficarem sem uso podem sair.

## Não muda
Rotas, estados, regras de pedido e estoque, cabeçalhos, CSP, nonce, simulação, testes de comportamento (só os seletores de layout se ajustam), tokens de cor e contraste (todo texto continua com no mínimo 4,5:1), funcionar sem JS, `pix.js` < 5 KB.

## Verificação
Prints de 390×844 de todas as telas (script com o Chrome via DevTools Protocol) salvos em `~/Downloads/corridex-pix-prints/v2/` para a Fernanda revisar.
