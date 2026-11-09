(function () {
  // Escolha manual de idioma. O vercel.json lê este cookie para não
  // redirecionar quem já escolheu um idioma no menu.
  var LANG_COOKIE = "corridex-lang";
  var LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
  var translations = window.CORRIDEX_TRANSLATIONS || {};
  var APP_STORE_URL_PT =
    "https://apps.apple.com/app/apple-store/id6756681755?pt=128383262&ct=Landpage&mt=8";
  var APP_STORE_URL_EN =
    "https://apps.apple.com/app/apple-store/id6756681755?pt=128383262&ct=Landpage&mt=8";
  var BADGE_URL_PT =
    "https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/pt-br?size=250x83";
  var BADGE_URL_EN =
    "https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en?size=250x83";
  var BADGE_URL_ES =
    "https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/es-mx?size=250x83";
  var HTML_LANG = { pt: "pt-BR", en: "en", es: "es" };

  var LANG_FLAGS = { pt: "🇧🇷", en: "🇺🇸", es: "🇪🇸" };
  var LANG_CODES = { pt: "PT", en: "EN", es: "ES" };

  function t(lang, key) {
    if (translations[lang] && translations[lang][key] !== undefined) {
      return translations[lang][key];
    }
    if (translations.pt && translations.pt[key] !== undefined) {
      return translations.pt[key];
    }
    return "";
  }

  function normalizeLang(lang) {
    return lang === "en" || lang === "es" ? lang : "pt";
  }

  // Idioma da página, gravado no build em <html data-lang>.
  function pageLang() {
    return normalizeLang(document.documentElement.getAttribute("data-lang"));
  }

  // "/en/support" -> "/support"; "/es" -> "/"
  function stripLangPrefix(pathname) {
    var rest = pathname.replace(/^\/(en|es)(?=\/|$)/, "");
    return rest || "/";
  }

  // Endereço da mesma página em outro idioma. PT fica sem prefixo.
  function localizedPath(pathname, lang) {
    var base = stripLangPrefix(pathname);
    lang = normalizeLang(lang);
    if (lang === "pt") return base;
    return "/" + lang + (base === "/" ? "" : base);
  }

  function rememberLang(lang) {
    var cookie =
      LANG_COOKIE +
      "=" +
      normalizeLang(lang) +
      "; Path=/; Max-Age=" +
      LANG_COOKIE_MAX_AGE +
      "; SameSite=Lax";
    if (location.protocol === "https:") cookie += "; Secure";
    try {
      document.cookie = cookie;
    } catch (e) {}
  }

  function goToLang(lang, href) {
    lang = normalizeLang(lang);
    rememberLang(lang);
    if (lang === pageLang()) return;
    location.href =
      (href || localizedPath(location.pathname, lang)) + location.hash;
  }

  function applyI18nAttributes(lang) {
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      var val = t(lang, key);
      if (val) el.textContent = val;
    });
    document.querySelectorAll("[data-i18n-html]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-html");
      var val = t(lang, key);
      if (val) el.innerHTML = val;
    });
    document.querySelectorAll("[data-i18n-alt]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-alt");
      var val = t(lang, key);
      if (val) el.alt = val;
    });
    document.querySelectorAll("[data-i18n-aria-label]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-aria-label");
      var val = t(lang, key);
      if (val) el.setAttribute("aria-label", val);
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-placeholder");
      var val = t(lang, key);
      if (val) el.placeholder = val;
    });
  }

  function updateAppStoreLinks(lang) {
    var url = lang === "en" ? APP_STORE_URL_EN : APP_STORE_URL_PT;
    var badgeUrl =
      lang === "en" ? BADGE_URL_EN : lang === "es" ? BADGE_URL_ES : BADGE_URL_PT;
    var navCta = document.getElementById("nav-cta");
    var badgeHero = document.getElementById("badge-hero");
    var badgeCta = document.getElementById("badge-cta");
    var badgeHeroImg = document.getElementById("badge-hero-img");
    var badgeCtaImg = document.getElementById("badge-cta-img");
    var badgeSupport = document.getElementById("badge-support");
    var badgeSupportImg = document.getElementById("badge-support-img");
    document.querySelectorAll(".nav-cta").forEach(function (el) {
      el.href = url;
    });
    if (navCta) navCta.href = url;
    if (badgeHero) badgeHero.href = url;
    if (badgeCta) badgeCta.href = url;
    if (badgeHeroImg) badgeHeroImg.src = badgeUrl;
    if (badgeCtaImg) badgeCtaImg.src = badgeUrl;
    if (badgeSupport) badgeSupport.href = url;
    if (badgeSupportImg) badgeSupportImg.src = badgeUrl;
  }

  function localizedImageSrc(basePath, lang) {
    var suffix = lang === "en" ? "-en" : lang === "es" ? "-es" : "";
    return suffix ? basePath.replace(/(\.\w+)$/, suffix + "$1") : basePath;
  }

  function updateLocalizedImages(lang) {
    document.querySelectorAll("[data-i18n-src]").forEach(function (el) {
      var basePath = el.getAttribute("data-i18n-src");
      if (!basePath) return;
      el.src = localizedImageSrc(basePath, lang);
    });
    document.querySelectorAll("[data-i18n-src-brand]").forEach(function (el) {
      var basePath = el.getAttribute("data-i18n-src-brand");
      if (!basePath) return;
      el.src = localizedImageSrc(basePath, lang);
    });
  }

  function updateMetaContent(lang, titleKey, descriptionKey) {
    if (titleKey) document.title = t(lang, titleKey);
    if (descriptionKey) {
      var metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) metaDesc.content = t(lang, descriptionKey);
    }
  }

  function applyShell(lang) {
    lang = normalizeLang(lang);
    if (HTML_LANG[lang]) {
      document.documentElement.lang = HTML_LANG[lang];
    }
    applyI18nAttributes(lang);
    updateAppStoreLinks(lang);
  }

  function updateLangDropdown(lang) {
    var toggle = document.getElementById("lang-toggle");
    if (toggle) {
      var flagEl = toggle.querySelector(".lang-flag");
      var codeEl = toggle.querySelector(".lang-code");
      if (flagEl) flagEl.textContent = LANG_FLAGS[lang] || LANG_FLAGS.pt;
      if (codeEl) codeEl.textContent = LANG_CODES[lang] || LANG_CODES.pt;
    }
    ["pt", "en", "es"].forEach(function (code) {
      var el = document.getElementById("lang-" + code);
      if (el) {
        el.setAttribute("aria-selected", code === lang ? "true" : "false");
      }
    });
  }

  function applyLanguage(lang) {
    lang = normalizeLang(lang);
    document.documentElement.lang = HTML_LANG[lang] || "pt-BR";
    document.title = t(lang, "meta.title");
    var metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.content = t(lang, "meta.description");
    var metaKw = document.querySelector('meta[name="keywords"]');
    if (metaKw) metaKw.content = t(lang, "meta.keywords");
    var ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.content = t(lang, "meta.ogTitle");
    var ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.content = t(lang, "meta.ogDescription");
    var ogLocale = document.querySelector('meta[property="og:locale"]');
    if (ogLocale) ogLocale.content = t(lang, "meta.ogLocale");
    var twTitle = document.querySelector('meta[name="twitter:title"]');
    if (twTitle) twTitle.content = t(lang, "meta.twitterTitle");
    var twDesc = document.querySelector('meta[name="twitter:description"]');
    if (twDesc) twDesc.content = t(lang, "meta.twitterDescription");
    var schemaScript = document.querySelector(
      'script[type="application/ld+json"]',
    );
    if (schemaScript) {
      try {
        var schema = JSON.parse(schemaScript.textContent);
        schema.description = t(lang, "meta.schemaDescription");
        schema.downloadUrl =
          lang === "en" ? APP_STORE_URL_EN : APP_STORE_URL_PT;
        schemaScript.textContent = JSON.stringify(schema);
      } catch (e) {}
    }
    applyI18nAttributes(lang);
    updateAppStoreLinks(lang);
    updateLocalizedImages(lang);
    updateLangDropdown(lang);
  }

  function initLangDropdown() {
    var toggle = document.getElementById("lang-toggle");
    var dropdown = document.querySelector(".lang-dropdown");

    if (!toggle || !dropdown) return;

    toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      var isOpen = dropdown.classList.contains("is-open");
      dropdown.classList.toggle("is-open", !isOpen);
      toggle.setAttribute("aria-expanded", !isOpen ? "true" : "false");
    });

    dropdown.querySelectorAll("[data-lang]").forEach(function (item) {
      item.addEventListener("click", function () {
        dropdown.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        goToLang(
          item.getAttribute("data-lang"),
          item.getAttribute("data-href"),
        );
      });
    });

    document.addEventListener("click", function () {
      dropdown.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    });

    dropdown.addEventListener("click", function (e) {
      e.stopPropagation();
    });
  }

  // As páginas já chegam traduzidas do build (scripts/build-pages.mjs).
  // No navegador só falta ligar o menu de idioma.
  function initLanding() {
    initLangDropdown();
  }

  function initSupportPage() {
    syncSupportAlert();
    initLangDropdown();
    document.dispatchEvent(new CustomEvent("corridex:support-i18n-applied"));
  }

  function initLegalPage() {
    document
      .querySelectorAll(".legal-lang-switch [data-lang]")
      .forEach(function (link) {
        link.addEventListener("click", function (e) {
          e.preventDefault();
          goToLang(link.getAttribute("data-lang"), link.getAttribute("href"));
        });
      });
  }

  function syncSupportAlert() {
    var alertEl = document.getElementById("support-status-alert");
    if (!alertEl) return;
    var config = window.CORRIDEX_SUPPORT_ALERT || {};
    alertEl.hidden = !config.enabled;
  }

  function applySupportPage(lang) {
    lang = normalizeLang(lang);
    document.documentElement.lang = HTML_LANG[lang] || "pt-BR";
    updateMetaContent(lang, "support.meta.title", "support.meta.description");
    applyShell(lang);
    updateLangDropdown(lang);
    syncSupportAlert();
    document.dispatchEvent(new CustomEvent("corridex:support-i18n-applied"));
  }

  window.CorridexI18n = {
    t: t,
    applyLanguage: applyLanguage,
    applyShell: applyShell,
    applySupportPage: applySupportPage,
    updateMetaContent: updateMetaContent,
    initLanding: initLanding,
    initSupportPage: initSupportPage,
    initLegalPage: initLegalPage,
    normalizeLang: normalizeLang,
    localizedPath: localizedPath,
    HTML_LANG: HTML_LANG,
  };
})();
