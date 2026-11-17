# Corridex

Monorepo do Corridex na web, com npm workspaces.

| Pasta | O que é | Onde roda |
| --- | --- | --- |
| [`apps/website`](apps/website) | Site `corridex.app` (páginas em PT, EN e ES) e política de atualização do app (`/app-update/v1.json`) | Vercel, Root Directory `apps/website` |
| [`apps/pix`](apps/pix) | Pagamento por Pix, servido em `corridex.app/pix` | Cloudflare Workers |

O app iOS fica em outro repositório.

## Comandos

```bash
npm install          # instala todos os apps
npm test             # testes de todos os apps
npm run build:website   # build do site (valida a política e gera as páginas)
npm run dev:pix      # API do Pix local em http://localhost:8787/pix/health
```

Cada app tem o próprio README com os detalhes: [site e política de atualização](apps/website/README.md), [Pix](apps/pix/README.md).
