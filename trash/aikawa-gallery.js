/* aikawa-gallery.js
   Standalone recreation of aikawakenichi.com's /work "Details" page:
   vertical scroll stack -> horizontal drag filmstrip -> fullscreen lightbox.

   WHAT'S REAL (extracted from the live site's compiled bundle):
   - class structure & CSS values (details-vertical/-horizontal/-fixed)
   - horizontal scroll physics constants: ease .105, release power 185,
     drag speed 1.05, wheel speed 1.08, touch speed 1.52
   - transition easings: power3.inOut (mode switch), cubic-bezier(.25,.46,.45,.94)

   WHAT'S APPROXIMATED (not a shader port — see aikawa-gallery.css notes):
   - the real site renders each photo through a WebGL render target with
     chromatic aberration + velocity blur + segment distortion. Here that's
     approximated with a plain CSS blur() tied to scroll velocity. Close in
     feel, not pixel-identical, and much cheaper on the GPU — important since
     this runs alongside the game's own Three.js scene.

   API:
     AikawaGallery.open(slideIndex?)
     AikawaGallery.close()
   Auto-opens on 'mm-orb-collected'. Toggle off with:
     AikawaGallery.autoOpenOnOrb = false
*/

(function () {
  const SLIDE_COUNT = 31;
  const IMG_PATH = (i) => `images/slide-${String(i).padStart(2, "0")}.webp`;

  // real physics constants from the site's glDetails config
  const PHYSICS = {
    ease: 0.105,
    releaseMax: 0.68,
    releasePower: 185,
    dragSpeed: 1.05,
    wheelSpeed: 1.08,
    touchSpeed: 1.52,
  };
  const MAX_BLUR_PX = 6; // cap for the velocity-driven filter approximation

  let root, closeBtn, counterEl;
  let verticalEl, vertRect;
  let horizontalEl, trackEl;
  let fixedEl, fixedImg, fixedPrev, fixedNext;
  let built = false;
  let isOpen = false;
  let mode = "vertical"; // 'vertical' | 'horizontal'
  let lightboxIndex = -1;

  // horizontal drag/scroll state
  let trackOffset = 0, trackTarget = 0, trackMin = 0;
  let dragging = false, didDrag = false, dragStartX = 0, dragStartOffset = 0;
  let lastOffset = 0, velocity = 0;
  let rafId = null;

  function build() {
    if (built) return;
    root = document.createElement("div");
    root.id = "aikawa-gallery";
    root.innerHTML = `
      <button class="aikawa-gallery__close" aria-label="Close">&times;</button>
      <div class="aikawa-gallery__counter">01 / ${String(SLIDE_COUNT).padStart(2, "0")}</div>

      <div class="details-vertical">
        <div class="details-vertical__inner">
          <div class="details-vertical__body">
            <div class="details-vertical__rect"></div>
            <div class="details-vertical__spacing"></div>
          </div>
        </div>
      </div>

      <div class="details-horizontal">
        <div class="details-horizontal__inner">
          <div class="details-horizontal__body">
            <div class="details-horizontal__rect"></div>
          </div>
        </div>
      </div>

      <div class="details-fixed">
        <div class="details-fixed__inner">
          <button class="details-fixed__prev" aria-label="Previous"></button>
          <div class="details-fixed__rect"><img alt=""></div>
          <button class="details-fixed__next" aria-label="Next"></button>
        </div>
      </div>

      <div class="aikawa-gallery__hint">Scroll to browse — click a photo to zoom</div>
    `;
    document.body.appendChild(root);

    closeBtn = root.querySelector(".aikawa-gallery__close");
    counterEl = root.querySelector(".aikawa-gallery__counter");
    verticalEl = root.querySelector(".details-vertical");
    vertRect = root.querySelector(".details-vertical__rect");
    horizontalEl = root.querySelector(".details-horizontal");
    trackEl = root.querySelector(".details-horizontal__rect");
    fixedEl = root.querySelector(".details-fixed");
    fixedImg = root.querySelector(".details-fixed__rect img");
    fixedPrev = root.querySelector(".details-fixed__prev");
    fixedNext = root.querySelector(".details-fixed__next");

    for (let i = 0; i < SLIDE_COUNT; i++) {
      const item = document.createElement("div");
      item.className = "details-vertical__item";
      item.dataset.index = i;
      item.innerHTML = `<img src="${IMG_PATH(i)}" loading="lazy" alt="Memory ${i + 1}">`;
      item.addEventListener("click", () => openLightbox(i));
      vertRect.appendChild(item);
    }
    for (let i = 0; i < SLIDE_COUNT; i++) {
      const item = document.createElement("div");
      item.className = "details-horizontal__item";
      item.dataset.index = i;
      item.innerHTML = `<img src="${IMG_PATH(i)}" loading="lazy" alt="Memory ${i + 1}">`;
      item.addEventListener("click", () => { if (!didDrag) openLightbox(i); });
      trackEl.appendChild(item);
    }

    closeBtn.addEventListener("click", close);
    fixedPrev.addEventListener("click", () => stepLightbox(-1));
    fixedNext.addEventListener("click", () => stepLightbox(1));
    fixedEl.querySelector(".details-fixed__rect").addEventListener("click", closeLightbox);

    verticalEl.addEventListener("scroll", onVerticalScroll, { passive: true });
    horizontalEl.addEventListener("pointerdown", onDragStart);
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", onDragEnd);
    horizontalEl.addEventListener("wheel", onWheel, { passive: false });

    document.addEventListener("keydown", (e) => {
      if (!isOpen) return;
      if (e.key === "Escape") { lightboxIndex >= 0 ? closeLightbox() : close(); }
      if (lightboxIndex >= 0) {
        if (e.key === "ArrowRight") stepLightbox(1);
        if (e.key === "ArrowLeft") stepLightbox(-1);
      }
    });

    built = true;
  }

  function updateCounter(i) {
    counterEl.textContent = `${String(i + 1).padStart(2, "0")} / ${String(SLIDE_COUNT).padStart(2, "0")}`;
  }

  // ---- vertical phase ----
  function onVerticalScroll() {
    const items = vertRect.querySelectorAll(".details-vertical__item");
    const midY = verticalEl.scrollTop + verticalEl.clientHeight / 2;
    let closest = 0, closestDist = Infinity;
    items.forEach((el) => {
      const dist = Math.abs(el.offsetTop + el.offsetHeight / 2 - midY);
      if (dist < closestDist) { closestDist = dist; closest = +el.dataset.index; }
    });
    updateCounter(closest);

    const atBottom = verticalEl.scrollTop + verticalEl.clientHeight >= verticalEl.scrollHeight - 4;
    if (atBottom && mode === "vertical") enterHorizontal(closest);
  }

  function enterHorizontal(focusIndex) {
    mode = "horizontal";
    root.classList.add("--is-horizontal");
    horizontalEl.classList.add("--is-horizontal");
    requestAnimationFrame(() => centerOnIndex(focusIndex ?? currentHorizontalIndex(), true));
    startRaf();
  }

  function enterVertical() {
    mode = "vertical";
    root.classList.remove("--is-horizontal");
    horizontalEl.classList.remove("--is-horizontal");
    stopRaf();
  }

  // ---- horizontal phase (real physics constants) ----
  function currentHorizontalIndex() {
    const items = trackEl.querySelectorAll(".details-horizontal__item");
    const centerX = window.innerWidth / 2 - trackOffset;
    let closest = 0, closestDist = Infinity;
    items.forEach((el) => {
      const dist = Math.abs(el.offsetLeft + el.offsetWidth / 2 - centerX);
      if (dist < closestDist) { closestDist = dist; closest = +el.dataset.index; }
    });
    return closest;
  }

  function recalcMin() {
    trackMin = -(trackEl.scrollWidth - window.innerWidth + 60);
  }

  function centerOnIndex(index, snap) {
    const el = trackEl.querySelector(`.details-horizontal__item[data-index="${index}"]`);
    if (!el) return;
    recalcMin();
    const target = window.innerWidth / 2 - (el.offsetLeft + el.offsetWidth / 2);
    trackTarget = Math.min(0, Math.max(trackMin, target));
    if (snap) trackOffset = trackTarget;
    setActiveItem(index);
    updateCounter(index);
  }

  function setActiveItem(index) {
    trackEl.querySelectorAll(".details-horizontal__item").forEach((el) => {
      el.classList.toggle("--is-active", +el.dataset.index === index);
    });
  }

  function onDragStart(e) {
    if (mode !== "horizontal" || lightboxIndex >= 0) return;
    dragging = true; didDrag = false;
    dragStartX = e.clientX;
    dragStartOffset = trackOffset;
    horizontalEl.setPointerCapture?.(e.pointerId);
    recalcMin();
  }
  function onDragMove(e) {
    if (!dragging) return;
    const dx = (e.clientX - dragStartX) * PHYSICS.dragSpeed;
    if (Math.abs(dx) > 4) didDrag = true;
    trackOffset = Math.min(0, Math.max(trackMin, dragStartOffset + dx));
    trackTarget = trackOffset;
    updateCounter(currentHorizontalIndex());
  }
  function onDragEnd() {
    if (!dragging) return;
    dragging = false;
    const idx = currentHorizontalIndex();
    centerOnIndex(idx, false); // ease toward it via raf, real release curve
    setTimeout(() => { didDrag = false; }, 0);
  }
  function onWheel(e) {
    if (mode !== "horizontal" || lightboxIndex >= 0) return;
    e.preventDefault();
    recalcMin();
    const delta = (e.deltaY + e.deltaX) * PHYSICS.wheelSpeed;
    trackTarget = Math.min(0, Math.max(trackMin, trackTarget - delta));
    trackOffset = trackTarget; // wheel moves target directly, eased below
  }

  function startRaf() {
    if (rafId) return;
    const tick = () => {
      if (mode !== "horizontal") { rafId = null; return; }
      const prev = trackOffset;
      trackOffset += (trackTarget - trackOffset) * PHYSICS.ease;
      trackEl.style.transform = `translateX(${trackOffset}px)`;

      // velocity-driven blur approximation (stand-in for the real
      // WebGL velocity-blur uniform)
      const v = Math.abs(trackOffset - prev);
      velocity += (v - velocity) * 0.3;
      const blur = Math.min(MAX_BLUR_PX, velocity * 0.6);
      root.style.setProperty("--aikawa-blur", blur.toFixed(2) + "px");
      root.classList.toggle("aikawa-gallery--fast", blur > 0.15);

      if (!dragging) updateCounter(currentHorizontalIndex());
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }
  function stopRaf() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    root && root.style.setProperty("--aikawa-blur", "0px");
    root && root.classList.remove("aikawa-gallery--fast");
  }

  // ---- lightbox phase ----
  function openLightbox(index) {
    lightboxIndex = index;
    fixedImg.src = IMG_PATH(index);
    updateCounter(index);
    fixedEl.classList.add("--is-visible");
  }
  function closeLightbox() {
    fixedEl.classList.remove("--is-visible");
    lightboxIndex = -1;
  }
  function stepLightbox(dir) {
    if (lightboxIndex < 0) return;
    const next = (lightboxIndex + dir + SLIDE_COUNT) % SLIDE_COUNT;
    fixedImg.style.opacity = "0";
    setTimeout(() => {
      lightboxIndex = next;
      fixedImg.src = IMG_PATH(next);
      updateCounter(next);
      fixedImg.style.opacity = "1";
    }, 150);
  }

  // ---- game pause hook (same pattern as the previous iframe overlay) ----
  function getStore() {
    try {
      const app = document.querySelector("#mm-experience-wrapper").__vue_app__;
      return app.config.globalProperties.$store;
    } catch (e) {
      return null;
    }
  }
  function setPaused(paused) {
    const store = getStore();
    if (store) store.isMenuOpen = paused;
    window.dispatchEvent(new CustomEvent("aikawa-gallery-pause", { detail: { paused } }));
  }

  function open(startIndex) {
    build();
    isOpen = true;
    root.classList.add("--is-open");
    requestAnimationFrame(() => (root.style.opacity = "1"));
    setPaused(true);

    mode = "horizontal"; // force so enterVertical() below actually applies
    enterVertical();
    verticalEl.scrollTop = 0;

    if (typeof startIndex === "number" && !isNaN(startIndex)) {
      const idx = Math.max(0, Math.min(SLIDE_COUNT - 1, startIndex));
      const el = vertRect.querySelector(`.details-vertical__item[data-index="${idx}"]`);
      if (el) requestAnimationFrame(() => el.scrollIntoView({ block: "center" }));
    }
  }

  function close() {
    isOpen = false;
    if (lightboxIndex >= 0) closeLightbox();
    stopRaf();
    root.style.opacity = "0";
    setTimeout(() => root.classList.remove("--is-open"), 550);
    setPaused(false);
  }

  window.AikawaGallery = { open, close, autoOpenOnOrb: true };

  window.addEventListener("mm-orb-collected", (e) => {
    if (window.AikawaGallery.autoOpenOnOrb) {
      const idx = e && e.detail && typeof e.detail.slideIndex === "number" ? e.detail.slideIndex : undefined;
      window.AikawaGallery.open(idx);
    }
  });
})();