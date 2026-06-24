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
}

function boot(initFn) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFn);
  } else {
    initFn();
  }
}
