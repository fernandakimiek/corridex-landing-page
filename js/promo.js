// Modal da promoção de Black Friday. Carregado só em pages/index.html (home);
// abre toda vez que a home carrega. Para desligar, troque ENABLED para false.
// Textos: chaves promo.* em js/translations.js (pt, en, es).
(function () {
  var ENABLED = true;
  var REDEEM_BASE =
    "https://apps.apple.com/redeem?ctx=offercodes&id=6756681755&code=";
  // Um cartão por plano. O primeiro aparece em destaque.
  var OFFERS = [
    { plan: "promo.annual", percent: 25, code: "BLACKFRIDAY25" },
    { plan: "promo.quarterly", percent: 15, code: "BLACKFRIDAY15" },
  ];
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

  function copyCode(button, code) {
    if (!navigator.clipboard || !navigator.clipboard.writeText) return;
    navigator.clipboard.writeText(code).then(function () {
      button.textContent = text("promo.copied");
      setTimeout(function () {
        button.textContent = text("promo.copy");
      }, 2000);
    }, function () {});
  }

  function buildOffer(offer, featured, shut) {
    var card = el("div", "promo-offer" + (featured ? " promo-offer--featured" : ""));

    var head = el("div", "promo-offer__head");
    head.appendChild(el("span", "promo-offer__plan", text(offer.plan)));
    head.appendChild(el("span", "promo-offer__percent", offer.percent + "% OFF"));
    card.appendChild(head);

    var actions = el("div", "promo-offer__actions");
    actions.appendChild(el("code", "promo-offer__code", offer.code));
    if (navigator.clipboard) {
      var copy = el("button", "promo-offer__copy", text("promo.copy"));
      copy.type = "button";
      copy.addEventListener("click", function () {
        copyCode(copy, offer.code);
      });
      actions.appendChild(copy);
    }
    var redeem = el("a", "promo-offer__redeem", text("promo.cta"));
    redeem.href = REDEEM_BASE + offer.code;
    redeem.target = "_blank";
    redeem.rel = "noopener";
    redeem.addEventListener("click", shut);
    actions.appendChild(redeem);
    card.appendChild(actions);

    return { card: card, redeem: redeem };
  }

  function buildDialog() {
    var dialog = el("dialog", "promo-modal");
    dialog.setAttribute("aria-labelledby", "promo-modal-title");

    function shut() {
      dialog.close();
    }

    var close = el("button", "promo-modal__close", "×");
    close.type = "button";
    close.setAttribute("aria-label", text("promo.close"));

    var tag = el("p", "promo-modal__tag", "BLACK FRIDAY");
    var title = el("h2", "promo-modal__title", text("promo.title"));
    title.id = "promo-modal-title";
    var trial = el("p", "promo-modal__trial", "🎁 " + text("hero.trial"));

    var pick = el("p", "promo-modal__pick", text("promo.pick"));
    var offers = el("div", "promo-modal__offers");
    var first = null;
    OFFERS.forEach(function (offer, i) {
      var built = buildOffer(offer, i === 0, shut);
      if (!first) first = built.redeem;
      offers.appendChild(built.card);
    });

    var desc = el("p", "promo-modal__desc", text("promo.desc"));

    var later = el("button", "promo-modal__later", text("promo.later"));
    later.type = "button";

    var note = el("p", "promo-modal__note", text("promo.note"));

    [close, tag, title, trial, pick, offers, desc, later, note].forEach(function (n) {
      dialog.appendChild(n);
    });

    close.addEventListener("click", shut);
    later.addEventListener("click", shut);
    // Clique no fundo escuro fecha.
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) shut();
    });
    dialog.addEventListener("close", function () {
      dialog.remove();
    });

    return { dialog: dialog, focus: first };
  }

  function open() {
    var built = buildDialog();
    if (typeof built.dialog.showModal !== "function") return;
    document.body.appendChild(built.dialog);
    built.dialog.showModal();
    built.focus.focus();
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
