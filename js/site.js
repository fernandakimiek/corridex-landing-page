function initFaq() {
  document.querySelectorAll(".faq-question").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var item = btn.closest(".faq-item");
      var isOpen = item.classList.contains("is-open");
      document.querySelectorAll(".faq-item").forEach(function (el) {
        el.classList.remove("is-open");
        el.querySelector(".faq-question").setAttribute("aria-expanded", "false");
      });
      if (!isOpen) {
        item.classList.add("is-open");
        btn.setAttribute("aria-expanded", "true");
      }
    });
  });
}

function normalizeSearchText(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function initFaqSearch() {
  var input = document.getElementById("faq-search-input");
  var emptyMsg = document.getElementById("faq-search-empty");
  var section = document.querySelector(".support-faq");
  if (!input || !section) return;

  function setItemOpen(item, open) {
    var btn = item.querySelector(".faq-question");
    item.classList.toggle("is-open", open);
    if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function filterFaq() {
    var query = normalizeSearchText(input.value.trim());
    var items = section.querySelectorAll(".faq-item");
    var visibleCount = 0;

    if (!query) {
      items.forEach(function (item) {
        item.classList.remove("faq-item--hidden");
        setItemOpen(item, false);
      });
      section.querySelectorAll(".faq-category-title").forEach(function (title) {
        title.classList.remove("faq-category-title--hidden");
        var list = title.nextElementSibling;
        if (list && list.classList.contains("faq-list")) {
          list.classList.remove("faq-list--hidden");
        }
      });
      if (emptyMsg) emptyMsg.hidden = true;
      return;
    }

    items.forEach(function (item) {
      var question = item.querySelector(".faq-question span");
      var answer = item.querySelector(".faq-answer");
      var text = normalizeSearchText(
        (question ? question.textContent : "") +
          (answer ? answer.textContent : ""),
      );
      var matches = text.indexOf(query) !== -1;

      item.classList.toggle("faq-item--hidden", !matches);
      setItemOpen(item, matches);

      if (matches) visibleCount++;
    });

    section.querySelectorAll(".faq-category-title").forEach(function (title) {
      var list = title.nextElementSibling;
      if (!list || !list.classList.contains("faq-list")) return;
      var hasVisible = list.querySelector(".faq-item:not(.faq-item--hidden)");
      title.classList.toggle("faq-category-title--hidden", !hasVisible);
      list.classList.toggle("faq-list--hidden", !hasVisible);
    });

    if (emptyMsg) emptyMsg.hidden = visibleCount > 0;
  }

  input.addEventListener("input", filterFaq);
  document.addEventListener("corridex:support-i18n-applied", filterFaq);
}

function prefersReducedMotion() {
  return (
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// Faixas que passam sozinhas (apps e depoimentos). Duplica os itens para o
// loop não ter emenda; as cópias ficam escondidas de leitores de tela.
// Com "reduzir movimento", a faixa fica parada e rola com o dedo.
function initMarquees() {
  if (prefersReducedMotion()) return;
  document.querySelectorAll("[data-marquee]").forEach(function (marquee) {
    var track = marquee.querySelector(".marquee__track");
    if (!track || track.getAttribute("data-cloned")) return;
    Array.prototype.slice.call(track.children).forEach(function (item) {
      var clone = item.cloneNode(true);
      clone.setAttribute("aria-hidden", "true");
      clone.querySelectorAll("a, button").forEach(function (el) {
        el.setAttribute("tabindex", "-1");
      });
      track.appendChild(clone);
    });
    track.setAttribute("data-cloned", "true");
    // Mesma velocidade em qualquer largura: ~40px por segundo.
    var seconds = Math.max(20, Math.round(track.scrollWidth / 2 / 40));
    marquee.style.setProperty("--marquee-duration", seconds + "s");
    marquee.classList.add("is-running");
  });
}

// Cartão "mínimo e ideal": os dois controles deslizam entre alguns valores
// e a barra colorida acompanha, como na tela do critério no app.
var BAND_DEMO_MAX = 5;
var BAND_DEMO_STEPS = [
  [1.65, 3.5],
  [2.0, 2.8],
  [1.3, 3.2],
];

function initBandDemo() {
  var root = document.querySelector("[data-band-demo]");
  if (!root || prefersReducedMotion()) return;

  var i18n = window.CorridexI18n;
  var lang = i18n
    ? i18n.normalizeLang(document.documentElement.getAttribute("data-lang"))
    : "pt";
  var minTexts = root.querySelectorAll('[data-band-text="min"]');
  var idealTexts = root.querySelectorAll('[data-band-text="ideal"]');

  function money(value) {
    if (lang === "en") return "$" + value.toFixed(2) + "/mi";
    var amount = value.toFixed(2).replace(".", ",");
    return (lang === "es" ? "$" : "R$ ") + amount + "/km";
  }
  var current = BAND_DEMO_STEPS[0];
  function paint(min, ideal) {
    current = [min, ideal];
    root.style.setProperty("--band-min", (min / BAND_DEMO_MAX) * 100 + "%");
    root.style.setProperty("--band-ideal", (ideal / BAND_DEMO_MAX) * 100 + "%");
    // Como no app, os controles andam de R$ 0,05 em R$ 0,05.
    var minText = money(Math.round(min * 20) / 20);
    var idealText = money(Math.round(ideal * 20) / 20);
    minTexts.forEach(function (el) {
      el.textContent = minText;
    });
    idealTexts.forEach(function (el) {
      el.textContent = idealText;
    });
  }

  var step = 0;
  var timer = null;
  var frame = null;
  paint(current[0], current[1]);

  function ease(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }
  function animateTo(target) {
    var start = null;
    var origin = current;
    function tick(now) {
      if (start === null) start = now;
      var t = Math.min(1, (now - start) / 1100);
      var k = ease(t);
      paint(
        origin[0] + (target[0] - origin[0]) * k,
        origin[1] + (target[1] - origin[1]) * k,
      );
      if (t < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
  }
  function play() {
    clearInterval(timer);
    timer = setInterval(function () {
      step = (step + 1) % BAND_DEMO_STEPS.length;
      animateTo(BAND_DEMO_STEPS[step]);
    }, 2800);
  }
  function stop() {
    clearInterval(timer);
    cancelAnimationFrame(frame);
  }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) play();
      else stop();
    }).observe(root);
  } else {
    play();
  }
}

// "Como funciona": o celular acompanha o passo escolhido e troca sozinho.
function initHowItWorks() {
  var root = document.querySelector("[data-how]");
  if (!root) return;
  var steps = root.querySelectorAll("[data-how-step]");
  var visuals = root.querySelectorAll(".how__visual");
  if (!steps.length || steps.length !== visuals.length) return;

  var current = 0;
  var timer = null;
  var autoplay = !prefersReducedMotion();

  function select(n) {
    current = n;
    for (var i = 0; i < steps.length; i++) {
      var on = i === n;
      steps[i].classList.toggle("is-on", on);
      steps[i].setAttribute("aria-pressed", on ? "true" : "false");
      visuals[i].classList.toggle("is-on", on);
    }
  }
  function start() {
    clearInterval(timer);
    if (!autoplay) return;
    timer = setInterval(function () {
      select((current + 1) % steps.length);
    }, 4000);
  }
  function stop() {
    clearInterval(timer);
  }

  steps.forEach(function (step) {
    var n = parseInt(step.getAttribute("data-how-step"), 10);
    step.addEventListener("click", function () {
      select(n);
      start();
    });
    step.addEventListener("mouseenter", function () {
      select(n);
      stop();
    });
    step.addEventListener("mouseleave", start);
  });
  root.addEventListener("focusin", stop);
  root.addEventListener("focusout", start);

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) start();
      else stop();
    }).observe(root);
  } else {
    start();
  }
}

// Ofertas reais (prints dos testes do app, com endereços borrados) e o
// que o Corridex mostraria para elas com os mínimos de exemplo:
// R$ 2,00/km · R$ 40/h · nota 4,50 · passageiro até 3 km
// (Lyft: US$ 1,00/mi · US$ 30/h · nota 4,50).
var HERO_RIDES = [
  {
    platform: "99",
    badgeBg: "#ffd000",
    badgeFg: "#000",
    currency: "BRL",
    unit: "km",
    verdict: "good",
    price: 32.47,
    distance: 13.5,
    minutes: 26,
    rating: 4.95,
    ratingCount: 573,
    perDistance: { value: 2.41, diff: 0.41 },
    perHour: { value: 74.93, diff: 34.93 },
    ratingDiff: 0.45,
    pickupFar: null,
  },
  {
    platform: "UBER",
    badgeBg: "#000",
    badgeFg: "#fff",
    currency: "BRL",
    unit: "km",
    verdict: "bad",
    price: 13.63,
    distance: 11.7,
    minutes: 22,
    rating: 4.97,
    ratingCount: null,
    perDistance: { value: 1.16, diff: -0.84 },
    perHour: { value: 37.17, diff: -2.83 },
    ratingDiff: 0.47,
    pickupFar: 4.1,
  },
  {
    platform: "LYFT",
    badgeBg: "#ff00bf",
    badgeFg: "#fff",
    currency: "USD",
    unit: "mi",
    verdict: "good",
    price: 12.12,
    distance: 9.5,
    minutes: 15,
    rating: 4.9,
    ratingCount: null,
    perDistance: { value: 1.28, diff: 0.28 },
    perHour: { value: 48.48, diff: 18.48 },
    ratingDiff: 0.4,
    pickupFar: null,
  },
];

var HERO_SLIDE_MS = 7000;
var HERO_EXPANDED_MS = 5500;
var HERO_DRAG_FULL_PX = 140;

function heroEl(tag, className, text) {
  var el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function initHeroDemo() {
  var root = document.querySelector("[data-hero-demo]");
  if (!root) return;

  var shots = root.querySelectorAll(".hero-shot");
  var tabs = root.querySelectorAll("[data-hero-tab]");
  var banner = root.querySelector("[data-hero-banner]");
  var slot = root.querySelector("[data-hero-slot]");
  var collapsed = root.querySelector("[data-hero-collapsed]");
  var expanded = root.querySelector("[data-hero-expanded]");
  var dim = root.querySelector("[data-hero-dim]");
  var hint = root.querySelector("[data-hero-hint]");
  if (!banner || !slot || !collapsed || !expanded || shots.length !== HERO_RIDES.length) return;

  var i18n = window.CorridexI18n;
  var lang = i18n ? i18n.normalizeLang(document.documentElement.getAttribute("data-lang")) : "pt";
  var locale = { pt: "pt-BR", en: "en-US", es: "es" }[lang];
  var reduceMotion = prefersReducedMotion();

  function t(key) {
    return i18n ? i18n.t(lang, key) : key;
  }
  function num(value, digits) {
    return value.toLocaleString(locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }
  function symbol(ride) {
    if (ride.currency === "BRL") return "R$";
    return lang === "en" ? "$" : "US$";
  }
  function money(ride, value) {
    return symbol(ride) + " " + num(value, 2);
  }
  function signedMoney(ride, value, suffix) {
    var sign = value < 0 ? "-" : "+";
    return sign + symbol(ride) + " " + num(Math.abs(value), 2) + suffix;
  }
  function verdictWord(verdict) {
    var mark = { good: "🟢", average: "🟠", bad: "🔴" }[verdict];
    return mark + " " + t("hero.demo." + verdict);
  }

  function renderCollapsed(ride) {
    var mark = function (m) {
      return m.diff >= 0 ? "✅ " : "❌ ";
    };
    var title = heroEl("div", "hero-banner__title");
    title.appendChild(heroEl("span", "", verdictWord(ride.verdict) + " " + money(ride, ride.price)));
    title.appendChild(heroEl("small", "", t("hero.demo.now")));

    var subtitle =
      mark(ride.perDistance) +
      money(ride, ride.perDistance.value) +
      "/" +
      ride.unit +
      " · " +
      mark(ride.perHour) +
      money(ride, ride.perHour.value) +
      "/h";

    var body =
      "📍 " +
      num(ride.distance, 1) +
      " " +
      ride.unit +
      " · ⏱ " +
      ride.minutes +
      " min · ⭐ " +
      num(ride.rating, 2).replace(/0$/, "") +
      (ride.ratingCount ? " (" + ride.ratingCount + ")" : "");
    if (ride.pickupFar) body += "\n❌ " + pickupReason(ride);

    var lines = heroEl("div", "hero-banner__lines");
    lines.appendChild(title);
    lines.appendChild(heroEl("div", "hero-banner__subtitle", subtitle));
    lines.appendChild(heroEl("div", "hero-banner__body", body));

    collapsed.replaceChildren(heroEl("div", "hero-banner__icon"), lines);
  }

  function pickupReason(ride) {
    return t("hero.demo.pickupFar").replace("{distance}", num(ride.pickupFar, 1) + " " + ride.unit);
  }

  function metric(label, value, diffText, passed) {
    var col = heroEl("div", "hero-metric " + (passed ? "is-pass" : "is-fail"));
    col.appendChild(heroEl("div", "hero-metric__label", label));
    var valueRow = heroEl("div", "hero-metric__value");
    valueRow.appendChild(heroEl("b", "", value));
    col.appendChild(valueRow);
    col.appendChild(
      heroEl(
        "div",
        "hero-metric__diff",
        diffText + "\n" + t(passed ? "hero.demo.above" : "hero.demo.below"),
      ),
    );
    return col;
  }

  function renderExpanded(ride) {
    var cur = symbol(ride);
    var metrics = heroEl("div", "hero-metrics");
    metrics.appendChild(
      metric(
        cur + "/" + ride.unit,
        num(ride.perDistance.value, 2),
        signedMoney(ride, ride.perDistance.diff, "/" + ride.unit),
        ride.perDistance.diff >= 0,
      ),
    );
    metrics.appendChild(
      metric(
        cur + "/h",
        num(ride.perHour.value, 2),
        signedMoney(ride, ride.perHour.diff, "/h"),
        ride.perHour.diff >= 0,
      ),
    );
    metrics.appendChild(
      metric(
        t("hero.demo.rating"),
        num(ride.rating, 2).replace(/0$/, ""),
        "★ +" + num(ride.ratingDiff, 2),
        ride.ratingDiff >= 0,
      ),
    );

    var footer = heroEl("div", "hero-banner__footer");
    var badge = heroEl("span", "hero-banner__platform", ride.platform);
    badge.style.background = ride.badgeBg;
    badge.style.color = ride.badgeFg;
    footer.appendChild(badge);
    footer.appendChild(
      heroEl(
        "span",
        "hero-banner__total",
        money(ride, ride.price) + " · " + ride.minutes + " min · " + num(ride.distance, 1) + " " + ride.unit,
      ),
    );
    if (ride.verdict === "good") footer.appendChild(heroEl("span", "hero-banner__check", "✔︎"));

    expanded.replaceChildren(metrics, footer);
    if (ride.pickupFar) expanded.appendChild(heroEl("div", "hero-banner__reason", pickupReason(ride)));
    expanded.setAttribute("data-verdict", ride.verdict);
  }

  // progress: 0 = recolhido, 1 = expandido. Os dois ficam no mesmo lugar.
  var progress = 0;
  function setProgress(value) {
    progress = Math.max(0, Math.min(1, value));
    var ch = collapsed.offsetHeight;
    var eh = expanded.offsetHeight;
    slot.style.height = ch + (eh - ch) * progress + "px";
    collapsed.style.opacity = String(1 - Math.min(1, progress * 1.6));
    collapsed.style.transform = "scale(" + (1 + 0.04 * progress) + ")";
    expanded.style.opacity = String(Math.max(0, (progress - 0.25) / 0.75));
    expanded.style.transform = "scale(" + (0.94 + 0.06 * progress) + ")";
    dim.style.opacity = String(progress);
    dim.classList.toggle("is-active", progress > 0);
    var isOpen = progress >= 1;
    banner.setAttribute("aria-expanded", isOpen ? "true" : "false");
    banner.setAttribute("aria-label", t(isOpen ? "hero.demo.collapseLabel" : "hero.demo.expandLabel"));
  }

  var index = -1;
  var slideTimer = null;
  var bannerTimer = null;
  var autoplay = !reduceMotion;
  var isVisible = true;

  function clearTimers() {
    clearTimeout(slideTimer);
    clearTimeout(bannerTimer);
  }
  function schedule(ms) {
    clearTimeout(slideTimer);
    root.classList.remove("is-paused");
    if (!autoplay || !isVisible || document.hidden) {
      root.classList.add("is-paused");
      return;
    }
    slideTimer = setTimeout(function () {
      show((index + 1) % HERO_RIDES.length);
    }, ms);
  }
  function pause() {
    clearTimeout(slideTimer);
    root.classList.add("is-paused");
  }

  function show(next) {
    clearTimers();
    banner.classList.remove("is-in");
    setProgress(0);
    for (var i = 0; i < shots.length; i++) {
      shots[i].classList.remove("is-out");
      if (i === index && next !== index) {
        shots[i].classList.remove("is-on");
        shots[i].classList.add("is-out");
      }
    }
    var shot = shots[next];
    if (next !== index) {
      shot.style.transition = "none";
      shot.style.transform = "translateX(100%)";
      void shot.offsetWidth;
      shot.style.transition = "";
      shot.style.transform = "";
    }
    shot.classList.add("is-on");
    index = next;

    for (var j = 0; j < tabs.length; j++) {
      var on = j === index;
      tabs[j].classList.toggle("is-on", on);
      tabs[j].setAttribute("aria-pressed", on ? "true" : "false");
      var bar = tabs[j].querySelector(".hero-tab__progress");
      if (bar) {
        bar.style.animation = "none";
        void bar.offsetWidth;
        bar.style.animation = "";
        bar.style.animationDuration = HERO_SLIDE_MS + "ms";
      }
    }

    var ride = HERO_RIDES[index];
    bannerTimer = setTimeout(
      function () {
        renderCollapsed(ride);
        renderExpanded(ride);
        setProgress(0);
        banner.classList.add("is-in");
      },
      reduceMotion ? 0 : 900,
    );
    schedule(HERO_SLIDE_MS);
  }

  function hideHint() {
    if (hint) hint.classList.add("is-hidden");
  }
  function settle() {
    if (progress > 0.35) {
      setProgress(1);
      schedule(HERO_EXPANDED_MS);
    } else {
      setProgress(0);
      schedule(3000);
    }
  }

  var dragging = false;
  var startY = 0;
  banner.addEventListener("pointerdown", function (e) {
    dragging = true;
    startY = e.clientY - progress * HERO_DRAG_FULL_PX;
    banner.classList.add("is-dragging");
    if (banner.setPointerCapture) banner.setPointerCapture(e.pointerId);
    pause();
    hideHint();
  });
  banner.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    var scale =
      parseFloat(getComputedStyle(root).getPropertyValue("--hero-phone-scale")) || 1;
    setProgress((e.clientY - startY) / (HERO_DRAG_FULL_PX * scale));
  });
  function endDrag() {
    if (!dragging) return;
    dragging = false;
    banner.classList.remove("is-dragging");
    settle();
  }
  banner.addEventListener("pointerup", endDrag);
  banner.addEventListener("pointercancel", endDrag);

  banner.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      hideHint();
      setProgress(progress >= 1 ? 0 : 1);
      if (progress >= 1) pause();
      else schedule(3000);
    } else if (e.key === "Escape" && progress > 0) {
      setProgress(0);
      schedule(3000);
    }
  });

  dim.addEventListener("click", function () {
    if (progress <= 0) return;
    setProgress(0);
    schedule(2500);
  });

  for (var k = 0; k < tabs.length; k++) {
    tabs[k].addEventListener("click", function (e) {
      show(parseInt(e.currentTarget.getAttribute("data-hero-tab"), 10));
    });
  }

  // Não roda o carrossel com a aba escondida ou a primeira tela fora de vista.
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) pause();
    else if (progress === 0 && !dragging) schedule(HERO_SLIDE_MS);
  });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      isVisible = entries[0].isIntersecting;
      if (!isVisible) pause();
      else if (progress === 0 && !dragging) schedule(HERO_SLIDE_MS);
    }).observe(root);
  }

  show(0);
}

function initLandingPage() {
  if (window.CorridexI18n) CorridexI18n.initLanding();
  initFaq();
  initMarquees();
  initBandDemo();
  initHowItWorks();
  initHeroDemo();
}

function openPlatformTermsFromHash() {
  if (location.hash !== "#termos-das-plataformas") return;
  var item = document.getElementById("termos-das-plataformas");
  if (!item) return;
  var btn = item.querySelector(".faq-question");
  item.classList.remove("faq-item--hidden");
  item.classList.add("is-open");
  if (!btn) return;
  btn.setAttribute("aria-expanded", "true");
  window.requestAnimationFrame(function () {
    item.scrollIntoView({ block: "start" });
    btn.focus({ preventScroll: true });
  });
}

function initFaqHash() {
  document.addEventListener(
    "corridex:support-i18n-applied",
    openPlatformTermsFromHash,
  );
  window.addEventListener("hashchange", openPlatformTermsFromHash);
  openPlatformTermsFromHash();
}

function initSupportPage() {
  if (window.CorridexI18n) CorridexI18n.initSupportPage();
  initFaq();
  initFaqSearch();
  initFaqHash();
}

function boot(initFn) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFn);
  } else {
    initFn();
  }
}
