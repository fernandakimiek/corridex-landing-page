// Gera as páginas do site em cada idioma a partir de pages/*.html.
//
// O texto de cada idioma vem de js/translations.js e é aplicado pelo
// mesmo js/i18n.js que roda no navegador, dentro de um DOM do jsdom.
// Assim o HTML publicado já chega no idioma certo, e o Google indexa
// cada idioma no seu próprio endereço.

import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

export const SITE_ORIGIN = "https://corridex.app";
export const LANGS = ["pt", "en", "es"];
// Idioma mostrado pelo Google para quem não fala nenhum dos três.
export const DEFAULT_LANG = "en";
const HREFLANG = { pt: "pt", en: "en", es: "es" };

// slug: endereço da página sem idioma ("" é a home).
// kind: como aplicar a tradução (cada tipo usa uma função do i18n.js).
export const PAGES = [
  { slug: "", source: "index.html", kind: "landing" },
  { slug: "support", source: "support.html", kind: "support" },
  { slug: "privacy", source: "privacy.html", kind: "legal" },
  { slug: "terms", source: "terms.html", kind: "legal" },
];

// Nomes antigos (e o próprio slug) -> slug. Usado para corrigir links.
const SLUG_ALIASES = {
  "": "",
  "index.html": "",
  support: "support",
  "support.html": "support",
  suporte: "support",
  "suporte.html": "support",
  privacy: "privacy",
  "privacy.html": "privacy",
  privacidade: "privacy",
  "privacidade.html": "privacy",
  terms: "terms",
  "terms.html": "terms",
  termos: "terms",
  "termos.html": "terms",
};

export function pagePath(slug, lang) {
  if (lang === "pt") return "/" + slug;
  return "/" + lang + (slug ? "/" + slug : "");
}

export function pageUrl(slug, lang) {
  return SITE_ORIGIN + pagePath(slug, lang);
}

// Arquivo que o cleanUrls da Vercel serve em pagePath(slug, lang).
export function outputFile(slug, lang) {
  const name = (slug || "index") + ".html";
  return lang === "pt" ? name : `${lang}/${name}`;
}

// Leva um link interno para a mesma página no idioma `lang`.
// Links externos, âncoras, assets e links que já trazem /en ou /es
// ficam como estão.
export function localizeHref(href, lang) {
  if (!href) return href;
  let rest = href;
  if (rest.startsWith(SITE_ORIGIN + "/") || rest === SITE_ORIGIN) {
    rest = rest.slice(SITE_ORIGIN.length) || "/";
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(rest) || rest.startsWith("#")) {
    return href;
  }
  const hashAt = rest.indexOf("#");
  const path = hashAt === -1 ? rest : rest.slice(0, hashAt);
  const hash = hashAt === -1 ? "" : rest.slice(hashAt);
  if (/^\/(en|es)(\/|$)/.test(path)) return path + hash;
  const key = path.replace(/^\//, "");
  if (!(key in SLUG_ALIASES)) return href;
  return pagePath(SLUG_ALIASES[key], lang) + hash;
}

function loadSources(root) {
  const read = (path) => readFileSync(new URL(path, root), "utf8");
  return {
    translationsJs: read("js/translations.js"),
    i18nJs: read("js/i18n.js"),
    pages: Object.fromEntries(PAGES.map((p) => [p.slug, read("pages/" + p.source)])),
  };
}

function applyTranslations(window, page, lang) {
  const { CorridexI18n } = window;
  const doc = window.document;
  if (page.kind === "landing") {
    CorridexI18n.applyLanguage(lang);
  } else if (page.kind === "support") {
    CorridexI18n.applySupportPage(lang);
  } else {
    for (const section of doc.querySelectorAll(".legal-section")) {
      if (section.id === "legal-" + lang) section.classList.add("active");
      else section.remove();
    }
    for (const link of doc.querySelectorAll(".legal-lang-switch [data-lang]")) {
      const linkLang = link.getAttribute("data-lang");
      link.classList.toggle("active", linkLang === lang);
      link.setAttribute("href", pagePath(page.slug, linkLang));
    }
    CorridexI18n.updateMetaContent(
      lang,
      page.slug + ".meta.title",
      page.slug + ".meta.description",
    );
    CorridexI18n.applyShell(lang);
  }
}

function applySeo(doc, page, lang) {
  doc.documentElement.setAttribute("lang", { pt: "pt-BR", en: "en", es: "es" }[lang]);
  doc.documentElement.setAttribute("data-lang", lang);

  const canonical = doc.querySelector('link[rel="canonical"]');
  if (!canonical) throw new Error(`pages/${page.source}: falta <link rel="canonical">`);
  canonical.setAttribute("href", pageUrl(page.slug, lang));

  doc.querySelectorAll('link[rel="alternate"][hreflang]').forEach((l) => l.remove());
  const alternates = [
    ...LANGS.map((l) => [HREFLANG[l], pageUrl(page.slug, l)]),
    ["x-default", pageUrl(page.slug, DEFAULT_LANG)],
  ];
  let anchor = canonical;
  for (const [hreflang, href] of alternates) {
    const link = doc.createElement("link");
    link.setAttribute("rel", "alternate");
    link.setAttribute("hreflang", hreflang);
    link.setAttribute("href", href);
    anchor.after(doc.createTextNode("\n    "), link);
    anchor = link;
  }

  const ogUrl = doc.querySelector('meta[property="og:url"]');
  if (ogUrl) ogUrl.setAttribute("content", pageUrl(page.slug, lang));
}

function localizeLinks(doc, page, lang) {
  for (const a of doc.querySelectorAll("a[href]")) {
    if (a.closest(".legal-lang-switch")) continue;
    a.setAttribute("href", localizeHref(a.getAttribute("href"), lang));
  }
  for (const item of doc.querySelectorAll(".lang-dropdown [data-lang]")) {
    item.setAttribute("data-href", pagePath(page.slug, item.getAttribute("data-lang")));
  }
}

export function renderPage(sources, page, lang) {
  const dom = new JSDOM(sources.pages[page.slug], {
    url: pageUrl(page.slug, lang),
    runScripts: "outside-only",
  });
  const { window } = dom;
  window.eval(sources.translationsJs);
  window.eval(sources.i18nJs);
  applyTranslations(window, page, lang);
  applySeo(window.document, page, lang);
  localizeLinks(window.document, page, lang);
  const html = dom.serialize();
  window.close();
  return html + "\n";
}

// Map: arquivo de saída (relativo à raiz) -> HTML.
export function renderAllPages(root) {
  const sources = loadSources(root);
  const out = new Map();
  for (const page of PAGES) {
    for (const lang of LANGS) {
      out.set(outputFile(page.slug, lang), renderPage(sources, page, lang));
    }
  }
  return out;
}

export function buildSitemap() {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<!-- Gerado por scripts/build-pages.mjs --sitemap. Não edite à mão. -->",
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    '        xmlns:xhtml="http://www.w3.org/1999/xhtml">',
  ];
  for (const page of PAGES) {
    for (const lang of LANGS) {
      lines.push("  <url>", `    <loc>${pageUrl(page.slug, lang)}</loc>`);
      for (const alt of LANGS) {
        lines.push(
          `    <xhtml:link rel="alternate" hreflang="${HREFLANG[alt]}" href="${pageUrl(page.slug, alt)}"/>`,
        );
      }
      lines.push(
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${pageUrl(page.slug, DEFAULT_LANG)}"/>`,
        "  </url>",
      );
    }
  }
  lines.push("</urlset>", "");
  return lines.join("\n");
}
