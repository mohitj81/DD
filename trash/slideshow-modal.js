/* ============================================================
   Work Slideshow Modal — vanilla JS, GSAP + Lenis powered
   Two layouts, toggled via the pill nav's mode button:
     - "vertical"  : full-bleed scroll-snap gallery
     - "scrapbook" : draggable, scattered polaroid-framed photos

   Opening the modal also flips $store.isMenuOpen, which your
   pause menu already ties into your game's isPaused() checks —
   so the game freezes underneath automatically.

   USAGE
   -----
   1. Include GSAP + Lenis via CDN before this file:
        <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
        <script src="https://unpkg.com/lenis@1.1.13/dist/lenis.min.js"></script>
   2. Include slideshow-modal.css and this file in your page.
   3. Call WorkSlideshow.open() from any button/action handler.
   4. To replace photos: swap files in /images and update IMAGES
      below (or keep filenames identical and overwrite the files).
   ============================================================ */

(function () {
  // ---- 1. CONFIGURE YOUR PHOTOS HERE ----------------------------
  const IMAGES = Array.from({ length: 31 }, (_, i) =>
    `images/slide-${String(i).padStart(2, "0")}.webp`
  );

  // ---- 2. CONFIGURE THE CATEGORY LABEL --------------------------
  const CATEGORY_LABEL = "GALLERY";

  // ---- 3. SCRAPBOOK LAYOUT TUNING --------------------------------
  const SCRAP_SPACING_X = 260;     // avg horizontal distance between polaroids
  const SCRAP_JITTER_X = 40;       // random +/- added to spacing
  const SCRAP_JITTER_Y = 90;       // random vertical scatter range
  const SCRAP_ROTATION_MAX = 9;    // degrees, +/-
  const SCRAP_SEED = 1337;         // change for a different scatter pattern
  // -----------------------------------------------------------------

  let built = false;
  let lenis = null;
  let modalEl, scrollerEl, railEl;
  let scrapWrapEl, scrapCanvasEl, polaroidEls = [];
  let navThumbEl, navCounterEl, navModeBtn;
  let slideEls = [];
  let rafId = null;
  let currentIndex = 0;
  let layout = "vertical"; // "vertical" | "scrapbook"

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  let scrapLayout = [];

  function computeScrapLayout() {
    const rand = mulberry32(SCRAP_SEED);
    let cursorX = 0;
    scrapLayout = IMAGES.map(() => {
      cursorX += SCRAP_SPACING_X + (rand() * 2 - 1) * SCRAP_JITTER_X;
      const y = (rand() * 2 - 1) * SCRAP_JITTER_Y;
      const rot = (rand() * 2 - 1) * SCRAP_ROTATION_MAX;
      return { x: cursorX, y, rot };
    });
  }

  function buildDOM() {
    if (built) return;
    built = true;
    computeScrapLayout();

    modalEl = document.createElement("div");
    modalEl.className = "ws-modal";
    modalEl.innerHTML = `
      <button class="ws-modal__close" aria-label="Close">&times;</button>
      <div class="ws-modal__rail"></div>

      <div class="ws-modal__scroller ws-modal__scroller--vertical">
        ${IMAGES.map(
          (src, i) => `
          <div class="ws-slide" data-index="${i}">
            <img class="ws-slide__img" src="${src}" alt="Photo ${i + 1}" loading="lazy" />
          </div>`
        ).join("")}
      </div>

      <div class="ws-scrap ws-scrap--hidden">
        <div class="ws-scrap__canvas">
          ${scrapLayout
            .map(
              (pos, i) => `
            <div class="ws-polaroid" data-index="${i}" style="transform: translate(${pos.x}px, ${pos.y}px) rotate(${pos.rot}deg);">
              <div class="ws-polaroid__inner">
                <img class="ws-polaroid__img" src="${IMAGES[i]}" alt="Photo ${i + 1}" loading="lazy" draggable="false" />
              </div>
            </div>`
            )
            .join("")}
        </div>
      </div>

      <nav class="ws-nav">
        <button class="ws-nav__back" aria-label="Back">
          <svg viewBox="0 0 24 24" class="ws-nav__back-svg">
            <path d="M15,5 L7,12 L15,19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="bevel"/>
          </svg>
        </button>

        <div class="ws-nav__container">
          <button class="ws-nav__hit ws-nav__hit--left" aria-label="Previous"></button>
          <button class="ws-nav__hit ws-nav__hit--right" aria-label="Next"></button>

          <div class="ws-nav__thumb">
            <img class="ws-nav__thumb-img" src="${IMAGES[0]}" alt="" />
          </div>

          <div class="ws-nav__text">
            <span class="ws-nav__category-label">Category</span>
            <span class="ws-nav__category-name">${CATEGORY_LABEL}</span>
          </div>

          <div class="ws-nav__counter">
            <span class="ws-nav__counter-current">01</span>
            <span class="ws-nav__counter-sep">/</span>
            <span class="ws-nav__counter-total">${String(IMAGES.length).padStart(2, "0")}</span>
          </div>
        </div>

        <button class="ws-nav__mode" aria-label="Toggle layout">
          <svg viewBox="0 0 24 24" class="ws-nav__mode-svg">
            <rect x="4" y="4" width="7" height="16" fill="none" stroke="currentColor" stroke-width="1.6"/>
            <rect x="13" y="4" width="7" height="16" fill="none" stroke="currentColor" stroke-width="1.6"/>
          </svg>
        </button>
      </nav>
    `;
    document.body.appendChild(modalEl);

    scrollerEl = modalEl.querySelector(".ws-modal__scroller");
    railEl = modalEl.querySelector(".ws-modal__rail");
    slideEls = Array.from(modalEl.querySelectorAll(".ws-slide"));

    scrapWrapEl = modalEl.querySelector(".ws-scrap");
    scrapCanvasEl = modalEl.querySelector(".ws-scrap__canvas");
    polaroidEls = Array.from(modalEl.querySelectorAll(".ws-polaroid"));

    navThumbEl = modalEl.querySelector(".ws-nav__thumb-img");
    navCounterEl = modalEl.querySelector(".ws-nav__counter-current");
    navModeBtn = modalEl.querySelector(".ws-nav__mode");

    railEl.innerHTML = IMAGES.map(
      (_, i) => `<div class="ws-modal__rail-dot" data-index="${i}"></div>`
    ).join("");

    modalEl.querySelector(".ws-modal__close").addEventListener("click", close);
    modalEl.querySelector(".ws-nav__back").addEventListener("click", close);
    navModeBtn.addEventListener("click", toggleLayout);
    modalEl.querySelector(".ws-nav__hit--left").addEventListener("click", () => stepSlide(-1));
    modalEl.querySelector(".ws-nav__hit--right").addEventListener("click", () => stepSlide(1));

    polaroidEls.forEach((el) => {
      el.addEventListener("click", () => {
        const idx = Number(el.dataset.index);
        focusScrapIndex(idx, true);
      });
    });

    document.addEventListener("keydown", (e) => {
      if (!modalEl.classList.contains("is-open")) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") stepSlide(-1);
      if (e.key === "ArrowRight") stepSlide(1);
    });

    setupScrollObserver();
    setupScrapDrag();
  }

  function setupScrollObserver() {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const img = entry.target.querySelector(".ws-slide__img");
          const idx = Number(entry.target.dataset.index);

          if (entry.isIntersecting && entry.intersectionRatio > 0.55) {
            if (window.gsap) {
              gsap.to(img, { scale: 1, opacity: 1, duration: 1.1, ease: "power3.out" });
            } else {
              img.style.transform = "scale(1)";
              img.style.opacity = "1";
            }
            if (layout === "vertical") setActiveIndex(idx);
          } else {
            if (window.gsap) {
              gsap.to(img, { scale: 1.08, opacity: 0.35, duration: 0.8, ease: "power2.out" });
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

  let scrapX = 0, scrapY = 0;
  let scrapBoundsX = [0, 0], scrapBoundsY = [0, 0];

  function computeScrapBounds() {
    const vw = window.innerWidth;
    const last = scrapLayout[scrapLayout.length - 1];
    const first = scrapLayout[0];
    const halfCard = 110;
    const minX = -(last.x + halfCard - vw + halfCard);
    const maxX = -(first.x - halfCard) + halfCard;
    scrapBoundsX = [Math.min(minX, 0), Math.max(maxX, 0)];
    scrapBoundsY = [-SCRAP_JITTER_Y - 60, SCRAP_JITTER_Y + 60];
  }

  function applyScrapTransform(withEase) {
    if (window.gsap && withEase) {
      gsap.to(scrapCanvasEl, { x: scrapX, y: scrapY, duration: 0.45, ease: "power3.out" });
    } else if (window.gsap) {
      gsap.set(scrapCanvasEl, { x: scrapX, y: scrapY });
    } else {
      scrapCanvasEl.style.transform = `translate(${scrapX}px, ${scrapY}px)`;
    }
  }

  function clampScrap() {
    scrapX = Math.max(scrapBoundsX[0], Math.min(scrapBoundsX[1], scrapX));
    scrapY = Math.max(scrapBoundsY[0], Math.min(scrapBoundsY[1], scrapY));
  }

  function updateNearestScrapIndex() {
    const vw = window.innerWidth;
    const viewportCenter = vw / 2 - scrapX;
    let closest = 0;
    let closestDist = Infinity;
    scrapLayout.forEach((pos, i) => {
      const d = Math.abs(pos.x - viewportCenter);
      if (d < closestDist) { closestDist = d; closest = i; }
    });
    setActiveIndex(closest);
  }

  function setupScrapDrag() {
    let isDown = false;
    let startPointerX = 0, startPointerY = 0;
    let startX = 0, startY = 0;

    scrapWrapEl.addEventListener("pointerdown", (e) => {
      if (layout !== "scrapbook") return;
      isDown = true;
      startPointerX = e.clientX;
      startPointerY = e.clientY;
      startX = scrapX;
      startY = scrapY;
      scrapWrapEl.classList.add("is-dragging");
      scrapWrapEl.setPointerCapture(e.pointerId);
    });
    scrapWrapEl.addEventListener("pointermove", (e) => {
      if (!isDown) return;
      scrapX = startX + (e.clientX - startPointerX);
      scrapY = startY + (e.clientY - startPointerY);
      clampScrap();
      applyScrapTransform(false);
      updateNearestScrapIndex();
    });
    const endDrag = () => {
      isDown = false;
      scrapWrapEl.classList.remove("is-dragging");
    };
    scrapWrapEl.addEventListener("pointerup", endDrag);
    scrapWrapEl.addEventListener("pointercancel", endDrag);

    scrapWrapEl.addEventListener(
      "wheel",
      (e) => {
        if (layout !== "scrapbook") return;
        e.preventDefault();
        scrapX -= e.deltaY || e.deltaX;
        clampScrap();
        applyScrapTransform(false);
        updateNearestScrapIndex();
      },
      { passive: false }
    );
  }

  function focusScrapIndex(idx, ease) {
    const pos = scrapLayout[idx];
    scrapX = window.innerWidth / 2 - pos.x;
    scrapY = -pos.y;
    clampScrap();
    applyScrapTransform(ease);
    setActiveIndex(idx);
  }

  function stepSlide(dir) {
    const next = Math.max(0, Math.min(IMAGES.length - 1, currentIndex + dir));
    if (layout === "vertical") {
      slideEls[next].scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      focusScrapIndex(next, true);
    }
  }

  function setActiveIndex(idx) {
    if (idx === currentIndex) return;
    currentIndex = idx;
    navCounterEl.textContent = String(idx + 1).padStart(2, "0");
    navThumbEl.src = IMAGES[idx];
    railEl.querySelectorAll(".ws-modal__rail-dot").forEach((dot, i) => {
      dot.classList.toggle("is-active", i === idx);
    });
    polaroidEls.forEach((el, i) => el.classList.toggle("is-active", i === idx));
  }

  function toggleLayout() {
    layout = layout === "vertical" ? "scrapbook" : "vertical";
    navModeBtn.classList.toggle("is-scrapbook", layout === "scrapbook");
    scrollerEl.classList.toggle("ws-modal__scroller--hidden", layout === "scrapbook");
    scrapWrapEl.classList.toggle("ws-scrap--hidden", layout === "vertical");

    if (layout === "scrapbook") {
      if (lenis) lenis.stop();
      computeScrapBounds();
      focusScrapIndex(currentIndex, false);
    } else {
      if (lenis) lenis.start();
      slideEls[currentIndex].scrollIntoView({ behavior: "instant", block: "start" });
    }
  }

  function initLenis() {
    if (!window.Lenis) return;
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
    if (lenis) { lenis.destroy(); lenis = null; }
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  function setMenuOpen(isOpen) {
    try {
      const app = document.querySelector('#mm-experience-wrapper').__vue_app__;
      if (app) app.config.globalProperties.$store.isMenuOpen = isOpen;
    } catch (e) {}
  }

  function open(startIndex) {
    buildDOM();
    document.body.style.overflow = "hidden";
    document.body.classList.add("slideshow-active");
    setMenuOpen(true);

    modalEl.classList.add("is-open");
    initLenis();
    computeScrapBounds();

    const idx = Number.isInteger(startIndex) ? Math.max(0, Math.min(IMAGES.length - 1, startIndex)) : 0;
    currentIndex = -1;
    scrollerEl.scrollTop = 0;

    requestAnimationFrame(() => {
      const firstImg = slideEls[idx].querySelector(".ws-slide__img");
      if (window.gsap) {
        gsap.to(firstImg, { scale: 1, opacity: 1, duration: 1.1, ease: "power3.out" });
      } else {
        firstImg.style.transform = "scale(1)";
        firstImg.style.opacity = "1";
      }
      if (idx > 0) slideEls[idx].scrollIntoView({ behavior: "instant", block: "start" });
      focusScrapIndex(idx, false);
      setActiveIndex(idx);
    });
  }

  function close() {
    if (!modalEl) return;
    modalEl.classList.remove("is-open");
    document.body.classList.remove("slideshow-active");
    setMenuOpen(false);
    document.body.style.overflow = "";
    destroyLenis();
  }

  window.WorkSlideshow = { open, close };
})();