/* ============================================================
   Work Slideshow Modal — vanilla JS, GSAP + Lenis powered
   Same animation stack the original aikawakenichi.com site uses.

   USAGE
   -----
   1. Include GSAP + Lenis via CDN (or your own bundle) before this file:
        <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
        <script src="https://unpkg.com/lenis@1.1.13/dist/lenis.min.js"></script>
   2. Include slideshow-modal.css and this file in your page.
   3. Call WorkSlideshow.open() from any button/action handler:
        document.querySelector('#openWork').addEventListener('click', () => {
          WorkSlideshow.open();
        });
   4. To replace photos: just swap files in /images and update
      the IMAGES array below (or keep filenames identical and
      overwrite the files — zero code changes needed that way).
   ============================================================ */

(function () {
  // ---- 1. CONFIGURE YOUR PHOTOS HERE ----------------------------
  // Easiest swap method: keep these filenames and just replace the
  // files inside /images with your own photos (same names).
  const IMAGES = [
    "images/slide-00.webp",
    "images/slide-01.webp",
    "images/slide-02.webp",
    "images/slide-03.webp",
    "images/slide-04.webp",
    "images/slide-05.webp",
    "images/slide-06.webp",
    "images/slide-07.webp",
    "images/slide-08.webp",
    "images/slide-09.webp",
    "images/slide-10.webp",
    "images/slide-11.webp",
    "images/slide-12.webp",
    "images/slide-13.webp",
    "images/slide-14.webp",
    "images/slide-15.webp",
    "images/slide-16.webp",
    "images/slide-17.webp",
    "images/slide-18.webp",
    "images/slide-19.webp",
    "images/slide-20.webp",
    "images/slide-21.webp",
    "images/slide-22.webp",
    "images/slide-23.webp",
    "images/slide-24.webp",
    "images/slide-25.webp",
    "images/slide-26.webp",
    "images/slide-27.webp",
    "images/slide-28.webp",
    "images/slide-29.webp",
    "images/slide-30.webp",
  ];
  // -----------------------------------------------------------------

  let built = false;
  let lenis = null;
  let modalEl, scrollerEl, counterEl, railEl;
  let slideEls = [];
  let rafId = null;

  function buildDOM() {
    if (built) return;
    built = true;

    modalEl = document.createElement("div");
    modalEl.className = "ws-modal";
    modalEl.innerHTML = `
      <button class="ws-modal__close" aria-label="Close">&times;</button>
      <div class="ws-modal__counter">01 / ${String(IMAGES.length).padStart(2, "0")}</div>
      <div class="ws-modal__rail"></div>
      <div class="ws-modal__scroller">
        ${IMAGES.map(
          (src, i) => `
          <div class="ws-slide" data-index="${i}">
            <img class="ws-slide__img" src="${src}" alt="Work photo ${i + 1}" loading="lazy" />
          </div>`
        ).join("")}
      </div>
    `;
    document.body.appendChild(modalEl);

    scrollerEl = modalEl.querySelector(".ws-modal__scroller");
    counterEl = modalEl.querySelector(".ws-modal__counter");
    railEl = modalEl.querySelector(".ws-modal__rail");
    slideEls = Array.from(modalEl.querySelectorAll(".ws-slide"));

    // build rail dots
    railEl.innerHTML = IMAGES.map(
      (_, i) => `<div class="ws-modal__rail-dot" data-index="${i}"></div>`
    ).join("");

    modalEl.querySelector(".ws-modal__close").addEventListener("click", close);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modalEl.classList.contains("is-open")) close();
    });

    setupScrollObserver();
  }

  function setupScrollObserver() {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const img = entry.target.querySelector(".ws-slide__img");
          const idx = Number(entry.target.dataset.index);

          if (entry.isIntersecting && entry.intersectionRatio > 0.55) {
            // animate the active slide in
            if (window.gsap) {
              gsap.to(img, {
                scale: 1,
                opacity: 1,
                duration: 1.1,
                ease: "power3.out",
              });
            } else {
              img.style.transform = "scale(1)";
              img.style.opacity = "1";
            }
            updateActive(idx);
          } else {
            if (window.gsap) {
              gsap.to(img, {
                scale: 1.08,
                opacity: 0.35,
                duration: 0.8,
                ease: "power2.out",
              });
            } else {
              img.style.transform = "scale(1.08)";
              img.style.opacity = "0.35";
            }
          }
        });
      },
      { root: null, threshold: [0, 0.55, 1] }
    );

    slideEls.forEach((el) => observer.observe(el));
  }

  function updateActive(idx) {
    counterEl.textContent = `${String(idx + 1).padStart(2, "0")} / ${String(
      IMAGES.length
    ).padStart(2, "0")}`;
    railEl.querySelectorAll(".ws-modal__rail-dot").forEach((dot, i) => {
      dot.classList.toggle("is-active", i === idx);
    });
  }

  function initLenis() {
    if (!window.Lenis) return; // graceful fallback to native scroll
    lenis = new Lenis({
      wrapper: scrollerEl,
      content: scrollerEl,
      duration: 1.1,
      smoothWheel: true,
      smoothTouch: false,
    });

    function raf(time) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);
  }

  function destroyLenis() {
    if (lenis) {
      lenis.destroy();
      lenis = null;
    }
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function open() {
    buildDOM();
    document.body.style.overflow = "hidden";
    modalEl.classList.add("is-open");
    initLenis();
    // reset to first slide and play its entrance
    scrollerEl.scrollTop = 0;
    requestAnimationFrame(() => {
      const firstImg = slideEls[0].querySelector(".ws-slide__img");
      if (window.gsap) {
        gsap.to(firstImg, { scale: 1, opacity: 1, duration: 1.1, ease: "power3.out" });
      } else {
        firstImg.style.transform = "scale(1)";
        firstImg.style.opacity = "1";
      }
      updateActive(0);
    });
  }

  function close() {
    if (!modalEl) return;
    modalEl.classList.remove("is-open");
    document.body.style.overflow = "";
    destroyLenis();
  }

  // expose globally
  window.WorkSlideshow = { open, close };
})();
