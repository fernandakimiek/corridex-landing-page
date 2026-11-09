# Política de atualização do app

O app iOS lê `https://corridex.app/app-update/v1.json` para saber se a versão instalada ainda serve. Este repositório só publica esse arquivo. A decisão ("qual nível vale agora?") fica no app.

O arquivo em produção começa sem regras: ninguém recebe pedido de atualização. Quem muda isso é um pull request. Não há painel, função nem API.

A leitura no app ainda não foi publicada. Até a primeira versão do app que lê este arquivo, o formato pode ser ajustado. Depois disso, `v1.json` fica congelado: mudança incompatível vira `app-update/v2.json`, e o `v1.json` continua no ar.

## Onde mexer

O arquivo servido é [`app-update/v1.json`](app-update/v1.json). O site não tem pasta `public/`: a Vercel publica a raiz do repositório, então a URL é `/app-update/v1.json`, sem `www`, sem barra no final e sem redirect.

O schema do editor é [`schemas/app-update-v1.schema.json`](schemas/app-update-v1.schema.json), publicado em `https://corridex.app/schemas/app-update-v1.schema.json`. O `"$schema"` no topo do JSON faz o editor apontar erro enquanto você digita. O app ignora esse campo.

## Pelo navegador, sem instalar nada

1. No GitHub, abra [fernandakimiek/corridex-landing-page](https://github.com/fernandakimiek/corridex-landing-page) → `app-update/v1.json` → ícone de lápis (**Edit this file**).
2. Escolha a receita abaixo, abra o arquivo indicado e copie o conteúdo de `rules`. Ajuste versão, data e motivo. O `$schema` e o `schemaVersion` não mudam.
3. **Commit changes…** → marque **Create a new branch for this commit and start a pull request**. Nome sugerido da branch: `politica/<assunto>`.
4. Espere o check `validate-app-update` ficar verde. Se ficar vermelho, a mensagem diz a regra (`id`) e como corrigir, com um exemplo do valor certo.
5. Com o check verde, aprove e faça o merge.
6. Uns 2 minutos depois, abra `https://corridex.app/app-update/v1.json` e confira o conteúdo.
7. Os motoristas recebem a mudança na próxima vez que abrirem o app ou voltarem a ele.

Quem usa VS Code ganha autocompletar por causa do `"$schema"`.

## Regras de bolso

| Campo | Como preencher | Errado |
| --- | --- | --- |
| `minimumVersion` | A **primeira versão boa**. A regra pega quem está **abaixo** dela. Só números e pontos: `2.0.55` | `v2.0.55`, `2.0.55 (812)`, `2.0` querendo dizer `2.0.55` |
| `enforcedFrom` | Data e hora em UTC, terminando em `Z`. Meia-noite de Brasília = `T03:00:00Z` do mesmo dia | `2026-12-01`, `2026-12-01T00:00:00-03:00`, `01/12/2026` |
| `id` | `AAAA-MM-assunto`, em minúsculas. **Novo** quando o sentido muda (outro nível, outra versão); **o mesmo** quando só ajusta o prazo | Reaproveitar o `id` de uma regra antiga para outra coisa |
| `reason` | Um código da tabela abaixo | Texto livre ("corrigimos o bug do Uber") |
| Versão exigida | Precisa **já estar na App Store**; o check do PR recusa antes | Exigir a versão que ainda está em revisão na Apple |

Uma obrigatória com prazo **já avisa** o motorista até a data. Não é preciso uma regra recomendada separada para avisar antes.

## Códigos de motivo

O texto que o motorista lê fica no app, traduzido. O arquivo só carrega o código.

| Código | Quando usar |
| --- | --- |
| `offerReading` | Correção na leitura das ofertas |
| `stability` | O app pode fechar sozinho ou travar |
| `dataSafety` | Risco ao histórico ou aos dados do motorista |
| `security` | Correção de segurança |
| `general` | Qualquer outro |

## Receitas

Nas receitas, a versão de exemplo na App Store é a **2.0.58**, e há motoristas da 2.0.48 à 2.0.58. O resultado de cada receita é o arquivo em `policy-examples/`. Esses arquivos não vão para o ar: servem para copiar sem o JSON da documentação divergir do que o validador aceita. Em 3 de novembro de 2026 a loja respondia **2.0.55**. Copiar `2.0.58` para `v1.json` antes de essa versão existir na App Store deixa o check do pull request vermelho.

### R1. Recomendar a versão nova a quem está abaixo dela

Antes: [`policy-examples/r9-vazio.json`](policy-examples/r9-vazio.json). Depois: [`policy-examples/r1-recomendar.json`](policy-examples/r1-recomendar.json).

| Versão instalada | O motorista vê |
| --- | --- |
| 2.0.58 | Nada |
| 2.0.48 a 2.0.57 | A sheet "Nova versão disponível", uma vez, fora do turno |

### R2. Tornar a recomendação obrigatória com prazo

A mudança de sentido pede um `id` novo. Resultado: [`policy-examples/r2-obrigatoria-prazo.json`](policy-examples/r2-obrigatoria-prazo.json).

| Versão instalada | Até 30/11 (Brasília) | A partir de 1º/12, 00:00 (Brasília) |
| --- | --- | --- |
| 2.0.58 | Nada | Nada |
| 2.0.48 a 2.0.57 | Aviso com o prazo, a cada abertura fora do turno | Bloqueio: não inicia o monitoramento até atualizar |

### R3. Adiar o prazo

Só a data muda, e o `id` é o mesmo. Resultado: [`policy-examples/r3-adiar-prazo.json`](policy-examples/r3-adiar-prazo.json).

O aviso passa a mostrar 8/12. Se a data antiga já tinha passado, quem estava bloqueado volta a só ver o aviso.

### R4. Bloquear agora (emergência)

Sem `enforcedFrom`, a obrigatória vale na hora. Resultado: [`policy-examples/r4-bloquear-agora.json`](policy-examples/r4-bloquear-agora.json).

Para uma versão nova com bug grave que precisa sair de circulação, a regra pede a versão **já corrigida e já publicada** na App Store (por exemplo `2.0.59`, motivo `dataSafety`). Não existe bloquear só a 2.0.58 e deixar a 2.0.57 livre: a regra vale para todo mundo abaixo da versão exigida.

Um turno em andamento nunca é cortado. O bloqueio vale a partir do próximo início.

### R5. Subir a versão obrigatória

Exemplo: era 2.0.55, passa a ser 2.0.58. Muda o sentido, então o `id` é novo. Resultado: [`policy-examples/r5-subir-versao.json`](policy-examples/r5-subir-versao.json).

Quem está na 2.0.55 a 2.0.57 passa a ver o aviso com prazo. Quem estava abaixo da 2.0.55 já estava bloqueado e continua bloqueado: entre uma regra em vigor e um prazo futuro, vale a mais severa.

### R6. Duas faixas ao mesmo tempo

Obrigatória para as muito antigas e recomendada para as recentes. Resultado: [`policy-examples/r6-duas-faixas.json`](policy-examples/r6-duas-faixas.json).

| Versão instalada | O motorista vê |
| --- | --- |
| 2.0.48, 2.0.49 | Bloqueio (motivo: estabilidade) |
| 2.0.50 a 2.0.57 | A sheet recomendada (motivo: leitura de ofertas) |
| 2.0.58 | Nada |

### R7. Desfazer uma obrigatória publicada por engano

Apague a regra, ou rebaixe-a para recomendada. Resultado do rebaixamento: [`policy-examples/r7-desfazer.json`](policy-examples/r7-desfazer.json).

O bloqueio some na próxima leitura de quem tem internet. A cópia guardada no aparelho (7 dias) só é usada quando o app não consegue ler o arquivo, então não segura uma correção.

Se o pull request demorar, use o Instant Rollback abaixo e depois faça o PR.

### R8. Limpar regras antigas

Uma regra pode sair quando nenhuma versão abaixo da `minimumVersion` ainda tem uso relevante. Para saber, consulte o App Store Connect → App Analytics → métricas por versão do app. Resultado de exemplo: [`policy-examples/r8-limpar.json`](policy-examples/r8-limpar.json).

### R9. Voltar ao normal (ninguém recebe pedido)

Resultado: [`policy-examples/r9-vazio.json`](policy-examples/r9-vazio.json). É o mesmo conteúdo do arquivo publicado hoje.

## O que não fazer

- Renomear ou mover `v1.json`: apps já instalados deixam de achar a política e tratam como ilegível (nunca bloqueiam).
- Apagar `schemaVersion` ou mudá-lo para `2` neste arquivo: o app ignora o arquivo inteiro.
- Pôr texto para o motorista em qualquer campo: o texto mora no app, traduzido.
- Exigir uma versão que ainda não está na App Store: o check recusa, e o app também ignoraria a regra.

## Rollback

1. Na página do projeto na Vercel, no bloco **Production Deployment**, clique em **Instant Rollback**, escolha o deploy anterior e confirme. O domínio passa a apontar para ele sem rebuild.
2. Depois de um rollback, a Vercel para de publicar sozinha os próximos merges. Para voltar ao normal, use **Undo Rollback** no mesmo bloco ou promova um deploy novo.
3. No plano Hobby, só dá para voltar ao deploy imediatamente anterior. Para voltar mais, use `git revert` e um pull request.
4. O rollback desfaz o site inteiro. Para tirar só uma regra, prefira o revert.

## O que o build e o PR conferem

No deploy, `npm run build` roda `node scripts/validate-app-update.mjs` e depois gera as páginas do site (veja [Páginas do site e idiomas](#páginas-do-site-e-idiomas)). JSON inválido, fora do schema, `id` repetido, `enforcedFrom` fora de UTC ou arquivo acima de 16 KB derrubam o build. A produção anterior continua no ar.

No pull request para `main`, o check `validate-app-update` faz a mesma validação e ainda consulta a App Store (`id` 6756681755, país `br`). Se alguma regra, recomendada ou obrigatória, pede versão maior do que a que está na loja, o check fica vermelho. Pull request que não mexe na política passa em segundos, sem consultar a Apple.

O comando de build fica só no `vercel.json`. Não duplique o comando no painel da Vercel. O `outputDirectory` é `.` porque o site não tem pasta `public/`: com um comando de build, a Vercel procuraria essa pasta e o deploy do site inteiro falharia. Com a raiz como saída, ela deixa de fora `node_modules` e `package.json`.

O `vercel.json` liga `cleanUrls` e `trailingSlash: false` por causa das páginas do site. Os dois só mexem em arquivos `.html` e em barra no final, então `/app-update/v1.json` continua respondendo o arquivo, sem redirect. Nenhum redirect do `vercel.json` pode tocar em `/app-update/` ou `/schemas/` (há teste para isso).

## Como rodar localmente

Requer Node 20.19 ou mais novo.

```bash
npm install
npm test
npm run validate:app-update
npm run validate:app-update:store
npm run build:pages            # gera as páginas em PT, EN e ES
npx serve .                    # abre em http://localhost:3000 (/, /en, /es/support...)
```

## Páginas do site e idiomas

O site existe em português, inglês e espanhol, cada idioma no seu endereço:

| Página | PT | EN | ES |
| --- | --- | --- | --- |
| Início | `/` | `/en` | `/es` |
| Suporte | `/support` | `/en/support` | `/es/support` |
| Privacidade | `/privacy` | `/en/privacy` | `/es/privacy` |
| Termos | `/terms` | `/en/terms` | `/es/terms` |

### Onde editar

- **Estrutura e texto em PT das páginas:** `pages/index.html`, `pages/support.html`, `pages/privacy.html`, `pages/terms.html`.
- **Textos em cada idioma:** `js/translations.js`. As páginas legais são exceção: o texto completo dos três idiomas fica no próprio `pages/privacy.html` e `pages/terms.html`, em `#legal-pt`, `#legal-en` e `#legal-es`.
- **Não edite** `index.html`, `support.html`, `privacy.html`, `terms.html`, `en/` e `es/` na raiz. Eles são gerados no build por `scripts/build-pages.mjs` e não vão para o git.

O build aplica as traduções com o mesmo `js/i18n.js` que roda no navegador, então o HTML publicado já chega no idioma certo, com título, descrição, `canonical` e `hreflang` próprios. Isso é o que permite ao Google mostrar a versão em inglês para quem busca em inglês.

Ao criar uma página nova ou mudar endereços, ajuste `PAGES` em `scripts/lib/site-pages.mjs` e rode `npm run build:sitemap` para atualizar o `sitemap.xml` (há teste que confere).

### Idioma automático

As regras ficam em `redirects` no `vercel.json` e rodam no CDN da Vercel, sem função. Valem só para os endereços em PT (`/`, `/support`, `/privacy`, `/terms`):

1. Quem escolheu idioma no menu tem o cookie `corridex-lang`. Com `en` ou `es`, vai para a versão nesse idioma; com `pt`, fica.
2. Sem cookie, o navegador decide pelo primeiro idioma do `Accept-Language`: espanhol vai para `/es`, português fica, qualquer outro vai para `/en`.
3. Sem `Accept-Language` (o Googlebot não manda), não há redirecionamento.

Os redirecionamentos por idioma são temporários (307). Os endereços em `/en` e `/es` nunca redirecionam: um link compartilhado abre no idioma do link.

Endereços antigos (`/suporte.html`, `/privacidade.html`, `/termos.html` e as versões sem `.html`) redirecionam de vez (308) para os novos. Âncoras como `#termos-das-plataformas` são mantidas.

## O que ainda precisa de gente, fora deste repositório

- Na proteção da `main`: pull request obrigatório e o check `validate-app-update` obrigatório, sem exigir aprovação de outra pessoa e sem push direto. O repositório é público, então isso funciona no GitHub Free. Se um dia ele ficar privado no plano Free, a proteção deixa de valer e precisa de GitHub Pro ou Team.
- 2FA em toda conta com acesso ao GitHub e à Vercel.
- No painel da Vercel: produção no apex `corridex.app`, `www` redirecionando para ele, Standard Protection (nunca "All Deployments"), Password Protection desligado em produção, e bypass de challenge do Firewall para `/app-update/`.
