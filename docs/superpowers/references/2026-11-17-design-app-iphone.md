# Design do app iOS Corridex, para espelhar em CSS

Fonte: `/Users/fernandakimiek/Projects/corridex-apps/corridexapp/CorridexApp/`. Abreviações: SC = `Presentation/Common/DesignSystem/SemanticColor.swift`, PT = `Presentation/Subscription/Paywall/DesignSystem/PaywallToken.swift`, PV = `.../Paywall/View/PaywallView.swift`, PC = `.../Paywall/Component/PlanCard.swift`, IN = `Presentation/Common/InlineNotice/DesignSystem/InlineNoticeToken.swift`.
Não há color sets de marca: `Assets.xcassets/AccentColor.colorset/Contents.json` está vazio (só `idiom: universal`, sem cor), então o accent do sistema é systemBlue (PT:17 confirma). Não existem outros color sets. Tudo é cor de sistema ou literal em SC.

## 1. Cores (claro / escuro)
| Token no app | Claro | Escuro | Uso (arquivo:linha) |
|---|---|---|---|
| accentFill = infoFill (CTA primário, preenchimento sob texto branco) | #0064D1 | #0064D1 (fixo, não muda no escuro) | `primaryCTAStyle` PrimaryCTAStyle.swift:21; SC:77-86 |
| accentColor (ícone selecionado, borda de seleção, links) | #007AFF | #0A84FF | PT:11-12; PC:95 |
| infoText (texto/ícone azul sobre tint) | #0064D1 | #2A94FF | SC:71-75 |
| info tint (fundo de badge) | #007AFF a 15% | #0A84FF a 15% | SC:13,36 |
| background da tela (`systemGroupedBackground`) | #F2F2F7 | #000000 | PV:32 |
| card (`secondarySystemGroupedBackground`) | #FFFFFF | #1C1C1E | CardToken.swift:6; PT:21 |
| texto principal (label) | #000000 | #FFFFFF | padrão do Text |
| texto secundário (`.secondary`) | rgba(60,60,67,.60) | rgba(235,235,245,.60) | PV:71,123 |
| texto terciário / círculo não selecionado | rgba(60,60,67,.30) | rgba(235,235,245,.30) | PC:95 |
| borda de card não selecionado (`separator`) | rgba(60,60,67,.29) | rgba(84,84,88,.65) | PT:13 |
| borda selecionada | #007AFF | #0A84FF | PT:12 (2px) |
| passText (sucesso, texto/ícone) | #0E6B2B | #30D158 | SC:44-48 |
| pass (gráfico/ícone redundante) | #34C759 | #30D158 | SC:4 |
| failText / error texto | #B00020 | #FF7A70 | SC:52-56 |
| fail / error (system red) | #FF3B30 | #FF453A | SC:5-7 |
| failFill (CTA destrutivo) | #CA4742 | #CA4742 | SC:82 |
| attentionText (aviso, texto/ícone) | #8C5000 | #FF9F0A | SC:59-63 |
| attention (system orange) | #FF9500 | #FF9F0A | SC:10 |
| attentionFill (badge "Recomendado", sob branco) | #8C5000 | #8C5000 | SC:67; PT:15 |
| average / averageText (âmbar) | #FFAA00 / #8A4A00 | #FFB340 / #FFB340 | SC:18-29 |
| neutralTint | system secondarySystemFill: rgba(120,120,128,.16) | rgba(120,120,128,.32) | SC:34 |
| tintOpacity (fundo de notice/badge) | 0.15 sobre a cor base | idem | SC:36 |
Notas: o mapa app para handoff é: aviso = laranja (`attention`), não vermelho; `SemanticColor.warning` é vermelho (SC:15), mas notices e badges de problema usam `attention` (SubscriptionView.swift:131,150). Ícone do app: azul #275BBC (claro) / #2757A9 (escuro) no centro, fundo branco/cinza (PNG em `AppIcon.appiconset`, amostrado por pixel). Não há wordmark nem logo vetorial.

## 2. Tipografia (SwiftUI padrão, sem `.rounded`, sem monospaced; só SF Pro)
| Uso | Estilo | CSS |
|---|---|---|
| Título do hero (headline do paywall) | `.title2.bold()` PV:66 | 1.375rem (22px), 700, centro |
| Subtítulo | `.subheadline` secondary PV:70 | 0.9375rem (15px), 400 |
| Título do plano, preço | `.headline` PC:62,77 | 1.0625rem (17px), 600 |
| Corpo | `.body` | 1.0625rem (17px), 400 |
| Botão CTA | `.fontWeight(.semibold)` sobre fonte do controle `.large` PV:109,115 | 1.0625rem, 600 |
| Rodapé/links | `.footnote` PV:144 | 0.8125rem (13px) |
| Texto de legenda ("/mês") | `.caption` PC:80 | 0.75rem (12px) |
| Selo de economia, termos legais | `.caption2` (.semibold) PC:66; PV:126 | 0.6875rem (11px), 600 |
| Badge de status | `.caption.bold()` SubscriptionView.swift:38 | 0.75rem, 700 |
| Glifo hero | `.system(size: 44)` PV:62 / PT:4 | ícone de 44px |
Fonte CSS: `-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif`. Nenhum design rounded/serif encontrado (grep `.rounded`/`monospaced` sem ocorrência de fonte). Para o código Pix, monoespaçada é decisão do web.

## 3. Forma e espaçamento
- Fundo: `systemGroupedBackground` (cinza #F2F2F7 / preto), cards brancos / #1C1C1E por cima. Telas de configuração usam `.listStyle(.insetGrouped)` (MapAppPickerView.swift:19). PV:32.
- Margem da tela: `.padding()` padrão = 16px; espaço vertical entre seções 24px (PT:5); entre cards de plano 12px (PT:6); entre ícone/título/subtítulo 8px (PV:60).
- Card (PlanCard, CardToken): raio 16px (PT:7; CardToken:4), padding interno 16px (PT:8; CardToken usa 20 em outros cards), borda 2px (PT:9), selecionado azul, não selecionado separator. Sem sombra. Layout: indicador de seleção 22px + título à esquerda + preço à direita, gap 16px (PC:35).
- Notice (InlineNoticeCard): fundo = cor do tom a 15%, raio 16px, padding 16px, ícone 28px em coluna de 40px, gap 12px, sem borda lateral (IN:4-11). Ícone e título na cor de texto do tom.
- Badge (CapsuleBadge): cápsula (raio total), padding 2px vertical x 8px horizontal, fundo tom a 15%, texto `*Text` do tom (CapsuleBadgeToken.swift:4-5). Badge "Recomendado": fundo #8C5000, texto branco, `caption2.bold`.
- Botão primário: `.borderedProminent` + `.controlSize(.large)` + largura total (PV:112-115). Forma iOS 26 = cápsula; altura ~50px (large), fundo #0064D1, texto branco 600. Em CSS: `border-radius:999px; min-height:50px`. (Se quiser versão pré-iOS 26: raio 12px; o repo não fixa a forma, é padrão do sistema.) Desabilitado: opacidade reduzida.
- Links/botões planos: texto accent, `min-height:44px` (PV:167), fonte footnote, separador "·" secundário (PV:155).
- Toolbar: botão fechar `xmark`, título inline (PV:34-41).

## 4. Ícones (SF Symbols)
| Estado | Símbolo | Cor | SVG sugerido |
|---|---|---|---|
| Sucesso/pago/selecionado | `checkmark.circle.fill`; `checkmark.seal.fill` (ativo) | passText / accent | círculo cheio + check branco; seal = estrela de 8 pontas arredondada com check |
| Seleção vazia | `circle` | tertiaryLabel | círculo 22px, traço 1.5px |
| Aviso | `exclamationmark.triangle.fill` | attentionText | triângulo arredondado cheio, "!" branco |
| Problema de conexão/pendente | `exclamationmark.icloud.fill` | attentionText | nuvem cheia com "!" |
| Pagamento com problema | `creditcard.trianglebadge.exclamationmark` | attentionText | cartão com selo triangular |
| Erro/expirado | `xmark.seal.fill`, `xmark.circle.fill` | failText | seal/círculo cheio com X branco |
| Fechar | `xmark` | label | dois traços cruzados 2px |
| Hero do paywall | `bolt.badge.clock.fill` | accent | raio com relógio pequeno, 44px |
| Trial | `gift.fill`; bloqueado `lock.fill` | infoText / secondary | presente / cadeado |
Todos em peso regular, estilo "fill" (PC:93; SubscriptionView.swift:131-156).

## 5. Diferenças vs handoff.md (seção Tokens)
| Item | Handoff | App | Mudar para |
|---|---|---|---|
| --accent (botão primário, preenchimento) | #007AFF / #0A84FF | CTA usa #0064D1 nos dois temas (SC:77-86); #007AFF/#0A84FF só em ícones, borda e links | --accent-fill:#0064D1 (ambos); manter --accent #007AFF/#0A84FF para links/foco; contraste do link azul sobre #F2F2F7 é 3.9:1, preferir #0064D1 (infoText) para texto pequeno |
| texto azul sobre tint (info) | accent | infoText #0064D1 / #2A94FF | --info-text |
| --bg, --surface, --label | iguais | iguais | manter |
| --label2 | #3C3C4399 / #EBEBF599 | iguais (60%) | manter |
| --separator | #C6C6C8 / #38383A (opaco) | borda do card usa `separator` translúcido: rgba(60,60,67,.29) / rgba(84,84,88,.65) | trocar bordas de card; #C6C6C8/#38383A só para linhas opacas |
| --success | #248A3D texto / #34C759 ícone / #30D158 | texto #0E6B2B / #30D158; ícone #34C759 / #30D158 (SC:44-48) | texto #0E6B2B claro |
| --warning | #C93400 / #FF9F0A | texto #8C5000 / #FF9F0A; ícone #FF9500 / #FF9F0A (SC:10,59-63) | --warning-text #8C5000; --warning-icon #FF9500 |
| --error | #D70015 / #FF453A | texto #B00020 / #FF7A70; ícone #FF3B30 / #FF453A (SC:52-56) | --error-text, --error-icon separados |
| Notice | cartão surface + borda esquerda 4px | fundo = tom a 15%, sem borda lateral, raio 16px, padding 16px, ícone 28px (IN:4-11) | `background: color-mix(in srgb, var(--tone) 15%, transparent)`; manter ícone+título (não só cor) |
| Raio de cartão | 12px | 16px (PT:7; IN:6) | 16px |
| Raio de botão | 12px | cápsula (controle `.large` iOS 26), ~50px de altura | 999px, min-height 50px |
| Raio de campo | 10px | sem campo de texto de referência no paywall; list insetGrouped usa raio 10 do sistema | manter 10px (o web precisa de campo) |
| Padding de cartão | múltiplos de 4 | 16px (plano/notice), 20px (CardToken) | 16px |
| Título h1 | 1.25rem/700 | 1.375rem (title2) bold (PV:66) | 1.375rem/700 |
| Corpo 17px, nota 13px | iguais | iguais (body 17, footnote 13) | manter; adicionar caption 12px e caption2 11px |
| Botão secundário (fill, texto accent) | existe | app só tem `.borderedProminent` + links planos no paywall | opcional; manter para "Ver outro plano" com fill rgba(120,120,128,.20/.36) |
| Cor de aviso para "venceu/indisponível" | warning laranja | correto (attention) | manter |
| Código Pix mono | monoespaçada | app não usa monospaced | decisão do web, ok |
| Seleção de plano (seletor) | 3 segmentos | app usa cards empilhados com `circle`/`checkmark.circle.fill` e borda 2px | considerar cards empilhados para parecer com o app |
