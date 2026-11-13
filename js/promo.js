// Modal da promoção de Black Friday. Carregado só em pages/index.html (home);
// abre toda vez que a home carrega. Para desligar, troque ENABLED para false.
// Textos: chaves promo.* em js/translations.js (pt, en, es).
(function () {
  var ENABLED = true;
  var CODE = "BLACKFRIDAY25";
  var REDEEM_URL =
    "https://apps.apple.com/redeem?ctx=offercodes&id=6756681755&code=" + CODE;
  var OPEN_DELAY_MS = 700;

  if (!ENABLED || !window.CorridexI18n) return;

  function lang() {
    return CorridexI18n.normalizeLang(
      document.documentElement.getAttribute("data-lang"),
    );
  }

  function text(key) {
    return CorridexI18n.t(lang(), key);
  }

  function el(tag, className, content) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (content) node.textContent = content;
    return node;
  }

  function copyCode(button) {
    var done = function () {
      button.textContent = text("promo.copied");
      setTimeout(function () {
        button.textContent = text("promo.copy");
      }, 2000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(CODE).then(done, function () {});
    }
  }

  function buildDialog() {
    var dialog = el("dialog", "promo-modal");
    dialog.setAttribute("aria-labelledby", "promo-modal-title");

    var close = el("button", "promo-modal__close", "×");
    close.type = "button";
    close.setAttribute("aria-label", text("promo.close"));

    var tag = el("p", "promo-modal__tag", "BLACK FRIDAY");
    var title = el("h2", "promo-modal__title", text("promo.title"));
    title.id = "promo-modal-title";
    var desc = el("p", "promo-modal__desc", text("promo.desc"));

    var codeRow = el("div", "promo-modal__code-row");
    var code = el("code", "promo-modal__code", CODE);
    var copy = el("button", "promo-modal__copy", text("promo.copy"));
    copy.type = "button";
    copy.addEventListener("click", function () {
      copyCode(copy);
    });
    codeRow.appendChild(code);
    if (navigator.clipboard) codeRow.appendChild(copy);

    var cta = el("a", "promo-modal__cta", text("promo.cta"));
    cta.href = REDEEM_URL;
    cta.target = "_blank";
    cta.rel = "noopener";

    var later = el("button", "promo-modal__later", text("promo.later"));
    later.type = "button";

    var note = el("p", "promo-modal__note", text("promo.note"));

    [close, tag, title, desc, codeRow, cta, later, note].forEach(function (n) {
      dialog.appendChild(n);
    });

    function shut() {
      dialog.close();
    }
    close.addEventListener("click", shut);
    later.addEventListener("click", shut);
    cta.addEventListener("click", shut);
    // Clique no fundo escuro fecha.
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) shut();
    });
    dialog.addEventListener("close", function () {
      dialog.remove();
    });

    return { dialog: dialog, cta: cta };
  }

  function open() {
    var built = buildDialog();
    if (typeof built.dialog.showModal !== "function") return;
    document.body.appendChild(built.dialog);
    built.dialog.showModal();
    built.cta.focus();
  }

  function schedule() {
    setTimeout(open, OPEN_DELAY_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", schedule);
  } else {
    schedule();
  }
})();
