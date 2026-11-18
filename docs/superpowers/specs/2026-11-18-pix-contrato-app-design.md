# Contrato do link do app com o /pix — design

Data: 2026-11-18 · App: `apps/pix` · Origem: item 1 da análise `docs/superpowers/references/2026-11-17-issue-431-lacunas.md` (conflitos 1, 2, 3, 4, 8, 9 e 13). Aprovado pela Fernanda em 2026-11-18.

## Por quê
O app iOS vai abrir `https://corridex.app/pix` com o contrato do Guia de integração (§3.8, issue 431). Hoje o site usa outros nomes (`mensal`, `dc_ler`), ignora o token da Apple e deixa tokens e e-mail na URL. Alinhar agora evita retrabalho no app e cumpre a spec (§4.5, §8, §9): nenhum token nem e-mail na URL.

## Abordagens
1. **Cookies `pix_tok`/`pix_trial` + redirecionamento (escolhida).** Como a §4.5 manda: a primeira visita guarda os tokens no servidor, põe só ids em cookies `HttpOnly` e redireciona para uma URL limpa.
2. **Manter os tokens em campos ocultos.** Ficam no histórico e o pedido não se liga ao token. Descartada.

## Design
1. **Ids dos planos:** `monthly`/`quarterly`/`annual` (nomes Mensal/Trimestral/Anual). Plano desconhecido → Anual. Sem apelidos para os ids antigos (o app ainda não saiu). O plano do teste continua `teste` (interno).
2. **Primeira visita** `GET /pix?plano&t[&teste=1&dcq&dcm]`:
   - `t`: decodificado (base64/base64url de um JSON), conferidos `bundleId` = `br.com.bdk.CorridexApp`, `appAppleId` = `6756681755` e a validade. Válido → guardado (idempotente por `externalPurchaseId`) e cookie `pix_tok=<id>` (`HttpOnly; Secure; SameSite=Lax; Path=/pix`, 7 dias). Inválido → ignorado, sem erro.
   - `teste=1&dcq&dcm`: conferência do aparelho (simulada) com `dcq`; se nunca usou o teste, cria sessão de teste (30 min) guardando `dcm` e o cookie `pix_trial=<id>` (mesmos atributos, 30 min).
   - Havendo qualquer um desses parâmetros, responde 302 para `/pix?plano=<id>` (com `cenario` só no modo de simulação), sem tokens.
3. **Pedido:** nasce com `purchaseTokenId` (do cookie, se o token existir) e `origin` (`app` com token, `site` sem).
4. **Teste grátis:** `/pix/teste` lê só o cookie `pix_trial`; sem campos ocultos com tokens. Sessão inválida, vencida ou aparelho já usado → "Este aparelho já usou o teste grátis". Na entrega, marca o aparelho com `dcm`, apaga a sessão e o cookie. E-mail que já recebeu o teste → mesma tela de sem estoque do teste (nunca "Para este e-mail…").
5. **E-mail fora da URL:** nenhum link nem formulário GET leva `email`. `POST /pix` (campos `plano`, `email`) reabre a escolha com o e-mail preenchido (200, sem redirecionar). "Ver {plano}", trocar de plano no modo de aviso, "Trocar e-mail" e "Tentar de novo" com e-mail usam esse POST. `GET /pix` ignora `?email=`.
6. **Textos:** botão de resgate "Resgatar código" (ícone de download mantido); código atrasado "Ele chega por e-mail em algumas horas. Pode fechar esta página."
7. Testes e `/pix/dev` usam os nomes novos.

## Fora (por enquanto)
Link assinado do lembrete (entra com os e-mails), DeviceCheck real, limite por IP, Turnstile, troca da reserva do código (item 2), banco.

## Decisões minhas (para conferir)
- Validade do `t`: se o JSON trouxer `tokenExpirationDate`, vale até ela; senão, até 7 dias depois de `tokenCreationDate`. Criação no futuro (mais de 5 min) é inválida.
- DeviceCheck simulado: a chave do aparelho é o próprio `dcq`; marcar com `dcm` marca essa chave.
- Cookie `Secure` funciona em `http://localhost` nos navegadores atuais; o modo de simulação segue usando localhost.
