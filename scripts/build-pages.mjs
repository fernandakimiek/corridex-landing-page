// Gera as páginas publicadas a partir de pages/*.html e js/translations.js.
//
//   node scripts/build-pages.mjs            escreve index.html, support.html,
//                                           privacy.html, terms.html, en/ e es/
//   node scripts/build-pages.mjs --sitemap  reescreve sitemap.xml
//
// Roda no build da Vercel (npm run build). Os arquivos gerados não vão
// para o git: edite pages/*.html e js/translations.js.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSitemap, renderAllPages } from "./lib/site-pages.mjs";

const ROOT = new URL("../", import.meta.url);

if (process.argv.includes("--sitemap")) {
  writeFileSync(new URL("sitemap.xml", ROOT), buildSitemap());
  console.log("sitemap.xml atualizado");
} else {
  const pages = renderAllPages(ROOT);
  for (const [file, html] of pages) {
    const target = fileURLToPath(new URL(file, ROOT));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, html);
  }
  console.log(`${pages.size} páginas geradas: ${[...pages.keys()].join(", ")}`);
}
