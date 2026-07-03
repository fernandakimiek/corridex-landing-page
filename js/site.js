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

function initTestimonialsCarousel() {
  var carousel = document.querySelector("[data-testimonials-carousel]");
  if (!carousel) return;

  var viewport = carousel.querySelector(".testimonials-viewport");
  var track = carousel.querySelector(".testimonials-track");
  var prevBtn = carousel.querySelector("[data-carousel-prev]");
  var nextBtn = carousel.querySelector("[data-carousel-next]");
  if (!viewport || !track || !prevBtn || !nextBtn) return;

  function getStep() {
    var card = track.querySelector(".testimonial-card");
    if (!card) return viewport.clientWidth;
    var gap = parseFloat(getComputedStyle(track).gap) || 0;
    return card.getBoundingClientRect().width + gap;
  }

  prevBtn.addEventListener("click", function () {
    viewport.scrollBy({ left: -getStep(), behavior: "smooth" });
  });

  nextBtn.addEventListener("click", function () {
    viewport.scrollBy({ left: getStep(), behavior: "smooth" });
  });
}

function initLandingPage() {
  if (window.CorridexI18n) CorridexI18n.initLanding();
  initFaq();
  initTestimonialsCarousel();
}

function initSupportPage() {
  if (window.CorridexI18n) CorridexI18n.initSupportPage();
  initFaq();
  initFaqSearch();
}

function boot(initFn) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFn);
  } else {
    initFn();
  }
}
