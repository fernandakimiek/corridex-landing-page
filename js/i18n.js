(function () {
  var STORAGE_KEY = "corridex-lang";
  var translations = window.CORRIDEX_TRANSLATIONS || {};
  var APP_STORE_URL_PT =
    "https://apps.apple.com/br/app/corridex/id6756681755?utm_source=google&utm_medium=search&utm_campaign=landing_corridex";
  var APP_STORE_URL_EN =
    "https://apps.apple.com/app/corridex/id6756681755?utm_source=google&utm_medium=search&utm_campaign=landing_corridex";
  var BADGE_URL_PT =
    "https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/pt-br?size=250x83";
  var BADGE_URL_EN =
    "https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en?size=250x83";
  var HTML_LANG = { pt: "pt-BR", en: "en", es: "es" };

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
  }

  function updateAppStoreLinks(lang) {
    var url = lang === "en" ? APP_STORE_URL_EN : APP_STORE_URL_PT;
    var badgeUrl = lang === "en" ? BADGE_URL_EN : BADGE_URL_PT;
    var navCta = document.getElementById("nav-cta");
    var badgeHero = document.getElementById("badge-hero");
    var badgeCta = document.getElementById("badge-cta");
    var badgeHeroImg = document.getElementById("badge-hero-img");
    var badgeCtaImg = document.getElementById("badge-cta-img");
    document.querySelectorAll(".nav-cta").forEach(function (el) {
      el.href = url;
    });
    if (navCta) navCta.href = url;
    if (badgeHero) badgeHero.href = url;
    if (badgeCta) badgeCta.href = url;
    if (badgeHeroImg) badgeHeroImg.src = badgeUrl;
    if (badgeCtaImg) badgeCtaImg.src = badgeUrl;
  }

  function updateLocalizedImages(lang) {
    document.querySelectorAll("[data-i18n-src]").forEach(function (el) {
      var basePath = el.getAttribute("data-i18n-src");
      if (!basePath) return;
      el.src =
        lang === "en" ? basePath.replace(/(\.\w+)$/, "-en$1") : basePath;
    });
    document.querySelectorAll("[data-i18n-src-brand]").forEach(function (el) {
      var basePath = el.getAttribute("data-i18n-src-brand");
      if (!basePath) return;
      el.src = lang === "en" ? basePath.replace(/(\.\w+)$/, "-en$1") : basePath;
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

  function applyLanguage(lang) {
    lang = lang === "en" ? "en" : "pt";
    document.documentElement.lang = lang === "en" ? "en" : "pt-BR";
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
        schema.downloadUrl = lang === "en" ? APP_STORE_URL_EN : APP_STORE_URL_PT;
        schemaScript.textContent = JSON.stringify(schema);
      } catch (e) {}
    }
    applyI18nAttributes(lang);
    updateAppStoreLinks(lang);
    updateLocalizedImages(lang);
    var langPt = document.getElementById("lang-pt");
    var langEn = document.getElementById("lang-en");
    if (langPt) {
      langPt.classList.toggle("active", lang === "pt");
      langPt.setAttribute("aria-current", lang === "pt" ? "true" : "false");
    }
    if (langEn) {
      langEn.classList.toggle("active", lang === "en");
      langEn.setAttribute("aria-current", lang === "en" ? "true" : "false");
    }
  }

  function initLanding() {
    var saved = localStorage.getItem(STORAGE_KEY);
    var lang = saved === "en" || saved === "pt" ? saved : "pt";
    applyLanguage(lang);
    var langPt = document.getElementById("lang-pt");
    var langEn = document.getElementById("lang-en");
    if (langPt) {
      langPt.addEventListener("click", function () {
        localStorage.setItem(STORAGE_KEY, "pt");
        applyLanguage("pt");
      });
    }
    if (langEn) {
      langEn.addEventListener("click", function () {
        localStorage.setItem(STORAGE_KEY, "en");
        applyLanguage("en");
      });
    }
  }

  function initSupportPage() {
    var saved = localStorage.getItem(STORAGE_KEY);
    var lang = saved === "en" || saved === "pt" ? saved : "pt";
    applySupportPage(lang);
    var langPt = document.getElementById("lang-pt");
    var langEn = document.getElementById("lang-en");
    if (langPt) {
      langPt.addEventListener("click", function () {
        localStorage.setItem(STORAGE_KEY, "pt");
        applySupportPage("pt");
      });
    }
    if (langEn) {
      langEn.addEventListener("click", function () {
        localStorage.setItem(STORAGE_KEY, "en");
        applySupportPage("en");
      });
    }
  }

  function applySupportPage(lang) {
    lang = lang === "en" ? "en" : "pt";
    document.documentElement.lang = lang === "en" ? "en" : "pt-BR";
    updateMetaContent(lang, "support.meta.title", "support.meta.description");
    applyShell(lang);
    var langPt = document.getElementById("lang-pt");
    var langEn = document.getElementById("lang-en");
    if (langPt) {
      langPt.classList.toggle("active", lang === "pt");
      langPt.setAttribute("aria-current", lang === "pt" ? "true" : "false");
    }
    if (langEn) {
      langEn.classList.toggle("active", lang === "en");
      langEn.setAttribute("aria-current", lang === "en" ? "true" : "false");
    }
  }

  window.CorridexI18n = {
    t: t,
    applyLanguage: applyLanguage,
    applyShell: applyShell,
    applySupportPage: applySupportPage,
    updateMetaContent: updateMetaContent,
    initLanding: initLanding,
    initSupportPage: initSupportPage,
    normalizeLang: normalizeLang,
    HTML_LANG: HTML_LANG,
  };
})();
