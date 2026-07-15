/* ==========================================================================
   StorySlider — scattered-photo memory viewer
   Vanilla JS, GSAP-optional (falls back to plain CSS transitions if GSAP
   isn't loaded). Original recreation of the scattered-photo-stack /
   annotation-card / prev-next-counter interaction pattern — not extracted
   code from any site.

   USAGE
   -----
   1. Edit the ITEMS array below (or call StorySlider.open(items, startIndex)
      with your own array at runtime — see bottom of file).
   2. Trigger it from wherever your DD game fires an action, e.g.:
         StorySlider.open();               // opens ITEMS at slide 0
         StorySlider.open(null, 3);        // opens ITEMS at slide 3
         StorySlider.open(myCustomItems);  // opens a custom set
   3. Close with StorySlider.close(), the × button, Escape, or swipe-down
      on mobile.
   ========================================================================== */

(function () {
  "use strict";

  // ---- Default content: reuses the same slide-00..30.webp used by the
  // WorkSlideshow modal so this is testable out of the box. Replace the
  // `caption`/`date` strings with your own memory text, and swap `src` to
  // your own images (or point at a different folder entirely).
  const ITEMS = Array.from({ length: 31 }, (_, i) => ({
    src: `images/slide-${String(i).padStart(2, "0")}.webp`,
    date: "",
    caption: "",
  }));

  const GSAP_AVAILABLE = () => typeof window.gsap !== "undefined";

  let root, backdrop, slidesEl, cardEl, cardDate, cardText, counterCur, counterTot, prevBtn, nextBtn, closeBtn;
  let items = ITEMS;
  let index = 0;
  let isZoomed = false;
  let built = false;

  function buildDOM() {
    if (built) return;
    root = document.createElement("div");
    root.id = "story-slider";
    root.hidden = true;
    root.innerHTML = `
      <div class="ss-backdrop"></div>
      <button class="ss-close" aria-label="Close">&times;</button>
      <div class="ss-stage">
        <div class="ss-slides"></div>
        <div class="ss-card">
          <p class="ss-card-date"></p>
          <p class="ss-card-text"></p>
        </div>
      </div>
      <div class="ss-nav">
        <button class="ss-arrow ss-prev" aria-label="Previous">&#8249;</button>
        <span class="ss-counter"><span class="ss-counter-current"></span>/<span class="ss-counter-total"></span></span>
        <button class="ss-arrow ss-next" aria-label="Next">&#8250;</button>
      </div>
    `;
    document.body.appendChild(root);

    backdrop = root.querySelector(".ss-backdrop");
    slidesEl = root.querySelector(".ss-slides");
    cardEl = root.querySelector(".ss-card");
    cardDate = root.querySelector(".ss-card-date");
    cardText = root.querySelector(".ss-card-text");
    counterCur = root.querySelector(".ss-counter-current");
    counterTot = root.querySelector(".ss-counter-total");
    prevBtn = root.querySelector(".ss-prev");
    nextBtn = root.querySelector(".ss-next");
    closeBtn = root.querySelector(".ss-close");

    backdrop.addEventListener("click", close);
    closeBtn.addEventListener("click", close);
    prevBtn.addEventListener("click", () => go(index - 1));
    nextBtn.addEventListener("click", () => go(index + 1));

    document.addEventListener("keydown", (e) => {
      if (root.hidden) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft" || e.key === "PageUp") go(index - 1);
      if (e.key === "ArrowRight" || e.key === "PageDown") go(index + 1);
    });

    built = true;
  }

  function renderSlides() {
    slidesEl.innerHTML = "";
    items.forEach((item, i) => {
      const el = document.createElement("div");
      el.className = "ss-slide";
      el.dataset.index = i;
      el.innerHTML = `<img src="${item.src}" alt="" loading="lazy">`;
      el.addEventListener("click", () => {
        if (i === index) toggleZoom();
        else go(i);
      });
      slidesEl.appendChild(el);
    });
  }

  // ---- Scatter math, approximating the reverse-engineered pattern:
  // background photos get a random rotation in the 15°-45° range (sign
  // alternates by position) and a small random x/y offset, dimmed and
  // stacked behind the active photo by z-index distance.
  function seededRandom(seed, min, max) {
    // deterministic per-index "random" so the scatter doesn't reshuffle
    // every render (keeps the pile looking stable while browsing)
    const x = Math.sin(seed * 999.7) * 10000;
    const frac = x - Math.floor(x);
    return min + frac * (max - min);
  }

  function layout() {
    const slides = slidesEl.querySelectorAll(".ss-slide");
    const total = slides.length;

    slides.forEach((el, i) => {
      const dist = i - index;
      const isActive = i === index;
      const isPast = dist < 0;

      el.classList.toggle("is-active", isActive);
      el.classList.toggle("is-past", isPast);
      el.classList.toggle("is-scattered", !isActive && !isPast);
      el.classList.toggle("is-zoomed", isActive && isZoomed);

      if (isActive) {
        el.style.zIndex = total + 10;
        el.style.transform = "translate(-50%, -50%) rotate(0deg) scale(1)";
        el.style.left = "50%";
        el.style.top = "50%";
        return;
      }

      // scattered / past photos: fan out behind, further ones smaller offset
      const sign = i % 2 === 0 ? 1 : -1;
      const rot = seededRandom(i + 1, 15, 45) * sign;
      const ox = seededRandom(i + 2, -24, 24) * (isPast ? 0.4 : 1);
      const oy = seededRandom(i + 3, -24, 24) * (isPast ? 0.4 : 1);

      el.style.zIndex = total - Math.abs(dist);
      el.style.left = `calc(50% + ${ox}px)`;
      el.style.top = `calc(50% + ${oy}px)`;
      el.style.transform = `translate(-50%, -50%) rotate(${rot}deg) scale(${isPast ? 0.9 : 0.96})`;
    });
  }

  function renderCard() {
    const item = items[index];
    cardDate.textContent = item.date || "";
    cardDate.style.display = item.date ? "" : "none";
    cardText.textContent = item.caption || "";
    cardEl.classList.remove("is-folded");
    // brief fold-out re-trigger on change
    cardEl.classList.remove("is-visible");
    void cardEl.offsetWidth; // force reflow to restart the transition
    requestAnimationFrame(() => cardEl.classList.add("is-visible"));
  }

  function renderCounter() {
    counterCur.textContent = index + 1;
    counterTot.textContent = items.length;
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === items.length - 1;
  }

  function toggleZoom() {
    isZoomed = !isZoomed;
    layout();
  }

  function go(i) {
    if (i < 0 || i >= items.length) return;
    isZoomed = false;
    index = i;
    layout();
    renderCard();
    renderCounter();
    if (GSAP_AVAILABLE()) {
      window.gsap.fromTo(
        cardEl,
        { y: 12 },
        { y: 0, duration: 0.5, ease: "power3.out" }
      );
    }
  }

  function open(customItems, startIndex) {
    buildDOM();
    items = customItems && customItems.length ? customItems : ITEMS;
    index = Math.min(Math.max(startIndex || 0, 0), items.length - 1);
    isZoomed = false;

    renderSlides();
    layout();
    renderCard();
    renderCounter();

    root.hidden = false;
    document.body.style.overflow = "hidden";
    cardEl.classList.add("is-visible");

    if (GSAP_AVAILABLE()) {
      window.gsap.from(backdrop, { opacity: 0, duration: 0.4, ease: "power2.out" });
      window.gsap.from(".ss-slide", {
        opacity: 0,
        stagger: 0.03,
        duration: 0.5,
        ease: "power2.out",
      });
    }
  }

  function close() {
    if (!root || root.hidden) return;
    root.hidden = true;
    document.body.style.overflow = "";
  }

  window.StorySlider = { open, close, go };
})();