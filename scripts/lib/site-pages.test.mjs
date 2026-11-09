import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import {
  LANGS,
  PAGES,
  SITE_ORIGIN,
  pagePath,
  pageUrl,
  outputFile,
  localizeHref,
  renderAllPages,
  buildSitemap,
} from "./site-pages.mjs";

const ROOT = new URL("../../", import.meta.url);
const translations = (() => {
  const ctx = { window: {} };
  vm.runInNewContext(readFileSync(new URL("js/translations.js", ROOT), "utf8"), ctx);
  return ctx.window.CORRIDEX_TRANSLATIONS;
})();

const outputs = renderAllPages(ROOT);
const docs = new Map(
  [...outputs].map(([file, html]) => [file, new JSDOM(html).window.document]),
);

test("pagePath: PT sem prefixo, EN/ES com prefixo e sem barra final", () => {
  assert.equal(pagePath("", "pt"), "/");
  assert.equal(pagePath("support", "pt"), "/support");
  assert.equal(pagePath("", "en"), "/en");
  assert.equal(pagePath("terms", "es"), "/es/terms");
  assert.equal(pageUrl("privacy", "en"), "https://corridex.app/en/privacy");
});

test("outputFile: arquivos que o cleanUrls da Vercel serve em cada endereço", () => {
  assert.equal(outputFile("", "pt"), "index.html");
  assert.equal(outputFile("support", "pt"), "support.html");
  assert.equal(outputFile("", "en"), "en/index.html");
  assert.equal(outputFile("terms", "es"), "es/terms.html");
});

test("localizeHref: leva links internos para o idioma da página", () => {
  assert.equal(localizeHref("/", "en"), "/en");
  assert.equal(localizeHref("/privacy", "es"), "/es/privacy");
  assert.equal(localizeHref("/support", "pt"), "/support");
  assert.equal(
    localizeHref("https://corridex.app/support#termos-das-plataformas", "en"),
    "/en/support#termos-das-plataformas",
  );
  assert.equal(localizeHref("https://corridex.app/en/terms", "en"), "/en/terms");
  assert.equal(localizeHref("suporte.html", "es"), "/es/support");
  assert.equal(localizeHref("/termos.html", "en"), "/en/terms");
  assert.equal(localizeHref("privacidade.html", "pt"), "/privacy");
});

test("localizeHref: não mexe em âncoras, e-mails e sites externos", () => {
  for (const href of [
    "#faq",
    "mailto:contato@corridex.app",
    "https://apps.apple.com/app/apple-store/id6756681755",
    "/app-update/v1.json",
    "/images/logo.png",
  ]) {
    assert.equal(localizeHref(href, "en"), href);
  }
});

test("gera as 12 páginas (4 páginas x 3 idiomas)", () => {
  assert.equal(outputs.size, PAGES.length * LANGS.length);
  for (const page of PAGES) {
    for (const lang of LANGS) {
      assert.ok(outputs.has(outputFile(page.slug, lang)), outputFile(page.slug, lang));
    }
  }
});

test("cada página declara o próprio idioma, canonical e as alternativas hreflang", () => {
  for (const page of PAGES) {
    for (const lang of LANGS) {
      const doc = docs.get(outputFile(page.slug, lang));
      const where = outputFile(page.slug, lang);
      assert.equal(doc.documentElement.getAttribute("data-lang"), lang, where);
      assert.equal(
        doc.documentElement.lang,
        { pt: "pt-BR", en: "en", es: "es" }[lang],
        where,
      );
      const canonicals = doc.querySelectorAll('link[rel="canonical"]');
      assert.equal(canonicals.length, 1, where);
      assert.equal(canonicals[0].href, pageUrl(page.slug, lang), where);

      const alternates = Object.fromEntries(
        [...doc.querySelectorAll('link[rel="alternate"][hreflang]')].map((l) => [
          l.getAttribute("hreflang"),
          l.href,
        ]),
      );
      assert.deepEqual(
        alternates,
        {
          pt: pageUrl(page.slug, "pt"),
          en: pageUrl(page.slug, "en"),
          es: pageUrl(page.slug, "es"),
          "x-default": pageUrl(page.slug, "en"),
        },
        where,
      );
    }
  }
});

test("título e descrição saem traduzidos no HTML, sem depender de JavaScript", () => {
  const metaKeys = {
    "": "meta",
    support: "support.meta",
    privacy: "privacy.meta",
    terms: "terms.meta",
  };
  for (const page of PAGES) {
    for (const lang of LANGS) {
      const doc = docs.get(outputFile(page.slug, lang));
      const prefix = metaKeys[page.slug];
      assert.equal(doc.title, translations[lang][`${prefix}.title`]);
      assert.equal(
        doc.querySelector('meta[name="description"]').content,
        translations[lang][`${prefix}.description`],
      );
    }
  }
});

test("landing em inglês: textos, imagens e og traduzidos", () => {
  const doc = docs.get("en/index.html");
  const el = doc.querySelector('[data-i18n="nav.download"]');
  assert.equal(el.textContent, translations.en["nav.download"]);
  const hero = doc.querySelector('[data-i18n-src="/images/screenshot-hero.png"]');
  assert.equal(hero.getAttribute("src"), "/images/screenshot-hero-en.png");
  assert.equal(
    doc.querySelector('meta[property="og:locale"]').content,
    translations.en["meta.ogLocale"],
  );
  assert.equal(doc.querySelector('meta[property="og:url"]').content, "https://corridex.app/en");
});

test("selo da App Store no idioma da página", () => {
  const locale = { pt: "pt-br", en: "en", es: "es-mx" };
  for (const slug of ["", "support"]) {
    for (const lang of LANGS) {
      const doc = docs.get(outputFile(slug, lang));
      const badges = doc.querySelectorAll('img[src*="download-on-the-app-store"]');
      assert.ok(badges.length > 0, outputFile(slug, lang));
      for (const img of badges) {
        assert.match(
          img.getAttribute("src"),
          new RegExp(`/black/${locale[lang]}\\?`),
          `${outputFile(slug, lang)}: ${img.id}`,
        );
      }
    }
  }
});

test("páginas legais levam só o texto do próprio idioma", () => {
  for (const slug of ["privacy", "terms"]) {
    for (const lang of LANGS) {
      const doc = docs.get(outputFile(slug, lang));
      const sections = doc.querySelectorAll(".legal-section");
      assert.equal(sections.length, 1, `${slug}/${lang}`);
      assert.equal(sections[0].id, `legal-${lang}`);
      assert.ok(sections[0].classList.contains("active"));
      const active = doc.querySelectorAll(".legal-lang-switch a.active");
      assert.equal(active.length, 1);
      assert.equal(active[0].getAttribute("data-lang"), lang);
      for (const other of LANGS) {
        const link = doc.querySelector(`.legal-lang-switch a[data-lang="${other}"]`);
        assert.equal(link.getAttribute("href"), pagePath(slug, other));
      }
    }
  }
});

test("menu de idioma aponta para a mesma página nos outros idiomas", () => {
  for (const slug of ["", "support"]) {
    for (const lang of LANGS) {
      const doc = docs.get(outputFile(slug, lang));
      for (const other of LANGS) {
        const item = doc.querySelector(`.lang-dropdown [data-lang="${other}"]`);
        assert.equal(item.getAttribute("data-href"), pagePath(slug, other));
        assert.equal(item.getAttribute("aria-selected"), String(other === lang));
      }
      assert.equal(
        doc.querySelector("#lang-toggle .lang-code").textContent,
        lang.toUpperCase(),
      );
    }
  }
});

test("nenhum link interno aponta para .html nem sai do idioma da página", () => {
  for (const page of PAGES) {
    for (const lang of LANGS) {
      const where = outputFile(page.slug, lang);
      const doc = docs.get(where);
      for (const a of doc.querySelectorAll("a[href]")) {
        const href = a.getAttribute("href");
        if (a.closest(".lang-dropdown, .legal-lang-switch")) continue;
        const internal = href.startsWith("/") || href.startsWith(SITE_ORIGIN);
        if (!internal) continue;
        assert.doesNotMatch(href, /\.html/, `${where}: ${href}`);
        const path = href.replace(SITE_ORIGIN, "").split("#")[0];
        if (lang === "pt") {
          assert.doesNotMatch(path, /^\/(en|es)(\/|$)/, `${where}: ${href}`);
        } else {
          assert.match(path, new RegExp(`^/${lang}(/|$)`), `${where}: ${href}`);
        }
      }
    }
  }
});

test("assets usam caminho absoluto (funcionam dentro de /en e /es)", () => {
  for (const [file, doc] of docs) {
    for (const el of doc.querySelectorAll("[src], link[href]")) {
      const value = el.getAttribute("src") ?? el.getAttribute("href");
      assert.match(value, /^(\/|https:)/, `${file}: ${value}`);
    }
  }
});

test("sitemap.xml publicado está igual ao gerado", () => {
  assert.equal(readFileSync(new URL("sitemap.xml", ROOT), "utf8"), buildSitemap());
});

test("sitemap lista as 12 URLs com as alternativas de idioma", () => {
  const xml = buildSitemap();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.equal(locs.length, 12);
  assert.ok(locs.includes("https://corridex.app/"));
  assert.ok(locs.includes("https://corridex.app/es/terms"));
  assert.ok(!locs.some((l) => l.endsWith(".html")));
  assert.equal(
    (xml.match(/hreflang="x-default" href="https:\/\/corridex\.app\/en"/g) || []).length,
    3,
  );
  assert.match(xml, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/);
});

test("vercel.json: endereços antigos redirecionam de vez para os novos", () => {
  const config = JSON.parse(readFileSync(new URL("vercel.json", ROOT), "utf8"));
  assert.equal(config.cleanUrls, true);
  assert.equal(config.trailingSlash, false);
  const legacy = {
    "/suporte.html": "/support",
    "/suporte": "/support",
    "/privacidade.html": "/privacy",
    "/privacidade": "/privacy",
    "/termos.html": "/terms",
    "/termos": "/terms",
  };
  for (const [source, destination] of Object.entries(legacy)) {
    const rule = config.redirects.find((r) => r.source === source);
    assert.ok(rule, source);
    assert.equal(rule.destination, destination);
    assert.equal(rule.permanent, true);
    assert.equal(rule.has, undefined);
  }
});

test("vercel.json: redirecionamento por idioma é temporário e só nas páginas PT", () => {
  const config = JSON.parse(readFileSync(new URL("vercel.json", ROOT), "utf8"));
  const langRules = config.redirects.filter((r) => r.has);
  assert.ok(langRules.length > 0);
  for (const rule of langRules) {
    assert.equal(rule.permanent, false, rule.source);
    assert.match(rule.source, /^\/(:page\(support\|privacy\|terms\))?$/, rule.source);
    assert.match(rule.destination, /^\/(en|es)(\/:page)?$/, rule.destination);
  }
  for (const rule of config.redirects) {
    assert.doesNotMatch(rule.source, /app-update|schemas/, rule.source);
  }
});

test("vercel.json: robôs (Google, Bing...) nunca são redirecionados pela detecção", () => {
  const config = JSON.parse(readFileSync(new URL("vercel.json", ROOT), "utf8"));
  const detection = config.redirects.filter((r) =>
    (r.has || []).some((h) => h.key === "accept-language"),
  );
  assert.equal(detection.length, 4);
  for (const rule of detection) {
    const ua = (rule.missing || []).find((m) => m.key === "user-agent");
    assert.ok(ua, rule.source);
    const re = new RegExp(`^${ua.value}$`);
    for (const agent of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; Google-InspectionTool/1.0;)",
      "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    ]) {
      assert.match(agent, re);
    }
    assert.doesNotMatch(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      re,
    );
  }
});
