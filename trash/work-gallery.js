/* work-gallery.js
   Three-phase gallery: vertical scroll-snap stack -> fixed horizontal
   filmstrip (drag to scrub) -> click to open a fullscreen lightbox with
   prev/next. Mirrors aikawakenichi.com's /work interaction pattern
   (structure + GSAP easing/duration values taken from the real captured
   bundle), reimplemented as original code with DD's own assets.

   Requires GSAP (already loaded via CDN in index.html).

   USAGE
   -----
   <link rel="stylesheet" href="work-gallery.css">
   <script src="work-gallery.js"></script>
   WorkGallery.open('orb-3');
   WorkGallery.close();
*/

(function () {
  const SLIDE_COUNT = 31; // slide-00.webp .. slide-30.webp
  const IMG_PATH = (i) => `images/slide-${String(i).padStart(2, '0')}.webp`;

  // easing/duration values pulled from the real site bundle
  const EASE = {
    modal: 'power3.inOut',
    item: 'power2.out',
    drag: 'power1.out',
    lightbox: 'power2.inOut',
  };
  const DUR = { modal: .75, item: .5, drag: .35, lightbox: .55, nudge: .25 };

  let root, verticalEl, horizontalEl, trackEl, fixedEl, fixedImg, counterEl, toggleBtn;
  let built = false;
  let mode = 'vertical'; // 'vertical' | 'horizontal'
  let isOpen = false;
  let lightboxIndex = -1;

  let dragging = false, dragStartX = 0, trackOffset = 0, trackStartOffset = 0, trackMin = 0;

  function build() {
    if (built) return;

    root = document.createElement('div');
    root.id = 'work-gallery';
    root.innerHTML = `
      <button class="wg-close" aria-label="Close gallery">&times;</button>
      <button class="wg-toggle" aria-label="Toggle layout">Slideshow view</button>
      <div class="wg-counter">1 / ${SLIDE_COUNT}</div>

      <div class="wg-vertical">
        <div class="wg-vertical__inner">
          <div class="wg-vertical__body">
            <div class="wg-vertical__rect"></div>
            <div class="wg-vertical__spacing"></div>
          </div>
        </div>
      </div>

      <div class="wg-horizontal">
        <div class="wg-horizontal__track"></div>
      </div>

      <div class="wg-fixed">
        <div class="wg-fixed__inner">
          <button class="wg-fixed__prev" aria-label="Previous"></button>
          <div class="wg-fixed__rect"><img alt=""></div>
          <button class="wg-fixed__next" aria-label="Next"></button>
        </div>
      </div>

      <div class="wg-hint">Scroll or drag to browse</div>
    `;
    document.body.appendChild(root);

    verticalEl = root.querySelector('.wg-vertical');
    horizontalEl = root.querySelector('.wg-horizontal');
    trackEl = root.querySelector('.wg-horizontal__track');
    fixedEl = root.querySelector('.wg-fixed');
    fixedImg = root.querySelector('.wg-fixed__rect img');
    counterEl = root.querySelector('.wg-counter');
    toggleBtn = root.querySelector('.wg-toggle');

    const vertRect = root.querySelector('.wg-vertical__rect');
    for (let i = 0; i < SLIDE_COUNT; i++) {
      const item = document.createElement('div');
      item.className = 'wg-vertical__item';
      item.dataset.index = i;
      item.innerHTML = `<img src="${IMG_PATH(i)}" loading="lazy" alt="Photo ${i + 1}">`;
      item.addEventListener('click', () => openLightbox(i));
      vertRect.appendChild(item);
    }

    for (let i = 0; i < SLIDE_COUNT; i++) {
      const item = document.createElement('div');
      item.className = 'wg-horizontal__item';
      item.dataset.index = i;
      item.innerHTML = `<img src="${IMG_PATH(i)}" loading="lazy" alt="Photo ${i + 1}">`;
      item.addEventListener('click', (e) => {
        if (didDrag) return; // ignore click that was actually a drag
        openLightbox(i);
      });
      trackEl.appendChild(item);
    }

    root.querySelector('.wg-close').addEventListener('click', close);
    toggleBtn.addEventListener('click', () => setMode(mode === 'vertical' ? 'horizontal' : 'vertical'));

    verticalEl.addEventListener('scroll', onVerticalScroll, { passive: true });

    horizontalEl.addEventListener('pointerdown', onDragStart);
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd);
    horizontalEl.addEventListener('wheel', onHorizontalWheel, { passive: false });

    root.querySelector('.wg-fixed__prev').addEventListener('click', () => stepLightbox(-1));
    root.querySelector('.wg-fixed__next').addEventListener('click', () => stepLightbox(1));
    root.querySelector('.wg-fixed__rect').addEventListener('click', closeLightbox);

    document.addEventListener('keydown', (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape') { lightboxIndex >= 0 ? closeLightbox() : close(); }
      if (lightboxIndex >= 0) {
        if (e.key === 'ArrowRight') stepLightbox(1);
        if (e.key === 'ArrowLeft') stepLightbox(-1);
      }
    });

    built = true;
  }

  function onVerticalScroll() {
    const items = verticalEl.querySelectorAll('.wg-vertical__item');
    const midY = verticalEl.scrollTop + verticalEl.clientHeight / 2;
    let closest = 0, closestDist = Infinity;
    items.forEach((el) => {
      const dist = Math.abs((el.offsetTop + el.offsetHeight / 2) - midY);
      if (dist < closestDist) { closestDist = dist; closest = +el.dataset.index; }
    });
    updateCounter(closest);

    const atBottom = verticalEl.scrollTop + verticalEl.clientHeight >= verticalEl.scrollHeight - 4;
    if (atBottom) setMode('horizontal', closest);
  }

  function updateCounter(i) { counterEl.textContent = `${i + 1} / ${SLIDE_COUNT}`; }

  function setMode(next, focusIndex) {
    if (mode === next) return;
    mode = next;
    root.classList.toggle('--is-horizontal', mode === 'horizontal');
    toggleBtn.textContent = mode === 'horizontal' ? 'Grid view' : 'Slideshow view';
    if (mode === 'horizontal') {
      requestAnimationFrame(() => centerOnIndex(focusIndex ?? currentHorizontalIndex(), true));
    }
  }

  function currentHorizontalIndex() {
    const items = trackEl.querySelectorAll('.wg-horizontal__item');
    const centerX = window.innerWidth / 2 - trackOffset;
    let closest = 0, closestDist = Infinity;
    items.forEach((el) => {
      const dist = Math.abs((el.offsetLeft + el.offsetWidth / 2) - centerX);
      if (dist < closestDist) { closestDist = dist; closest = +el.dataset.index; }
    });
    return closest;
  }

  function centerOnIndex(index, animate) {
    const el = trackEl.querySelector(`.wg-horizontal__item[data-index="${index}"]`);
    if (!el) return;
    trackMin = -(trackEl.scrollWidth - window.innerWidth + 60);
    const target = window.innerWidth / 2 - (el.offsetLeft + el.offsetWidth / 2);
    trackOffset = Math.min(0, Math.max(trackMin, target));
    if (window.gsap && animate) {
      gsap.to(trackEl, { x: trackOffset, duration: DUR.item, ease: EASE.item, overwrite: true });
    } else {
      trackEl.style.transform = `translateX(${trackOffset}px)`;
    }
    updateCounter(index);
  }

  let didDrag = false;
  function onDragStart(e) {
    if (mode !== 'horizontal') return;
    dragging = true; didDrag = false;
    dragStartX = e.clientX;
    trackStartOffset = trackOffset;
    horizontalEl.classList.add('--dragging');
    trackMin = -(trackEl.scrollWidth - window.innerWidth + 60);
    if (window.gsap) gsap.killTweensOf(trackEl);
  }
  function onDragMove(e) {
    if (!dragging) return;
    const dx = e.clientX - dragStartX;
    if (Math.abs(dx) > 4) didDrag = true;
    trackOffset = Math.min(0, Math.max(trackMin, trackStartOffset + dx));
    trackEl.style.transform = `translateX(${trackOffset}px)`;
    updateCounter(currentHorizontalIndex());
  }
  function onDragEnd() {
    if (!dragging) return;
    dragging = false;
    horizontalEl.classList.remove('--dragging');
    // settle onto nearest item, like the real site's snap-back
    centerOnIndex(currentHorizontalIndex(), true);
    setTimeout(() => { didDrag = false; }, 0);
  }
  function onHorizontalWheel(e) {
    if (mode !== 'horizontal') return;
    e.preventDefault();
    if (window.gsap) gsap.killTweensOf(trackEl);
    trackMin = -(trackEl.scrollWidth - window.innerWidth + 60);
    trackOffset = Math.min(0, Math.max(trackMin, trackOffset - (e.deltaY + e.deltaX)));
    trackEl.style.transform = `translateX(${trackOffset}px)`;
    updateCounter(currentHorizontalIndex());
  }

  function openLightbox(index) {
    lightboxIndex = index;
    fixedImg.src = IMG_PATH(index);
    updateCounter(index);
    if (window.gsap) {
      gsap.fromTo(fixedEl, { autoAlpha: 0 }, { autoAlpha: 1, duration: DUR.lightbox, ease: EASE.lightbox });
    }
    fixedEl.classList.add('--is-visible');
  }
  function closeLightbox() {
    if (window.gsap) {
      gsap.to(fixedEl, {
        autoAlpha: 0, duration: DUR.nudge, ease: EASE.item,
        onComplete: () => fixedEl.classList.remove('--is-visible'),
      });
    } else {
      fixedEl.classList.remove('--is-visible');
    }
    lightboxIndex = -1;
  }
  function stepLightbox(dir) {
    if (lightboxIndex < 0) return;
    const next = (lightboxIndex + dir + SLIDE_COUNT) % SLIDE_COUNT;
    if (window.gsap) {
      gsap.to(fixedImg, {
        autoAlpha: 0, duration: DUR.nudge, ease: EASE.item,
        onComplete: () => {
          lightboxIndex = next;
          fixedImg.src = IMG_PATH(next);
          updateCounter(next);
          gsap.to(fixedImg, { autoAlpha: 1, duration: DUR.nudge, ease: EASE.item });
        },
      });
    } else {
      lightboxIndex = next;
      fixedImg.src = IMG_PATH(next);
      updateCounter(next);
    }
  }

  function open(startId) {
    build();
    isOpen = true;
    root.classList.add('--is-open');
    document.body.classList.add('wg-active');

    if (window.gsap) {
      gsap.fromTo(root, { autoAlpha: 0 }, { autoAlpha: 1, duration: DUR.modal, ease: EASE.modal });
    } else {
      requestAnimationFrame(() => root.classList.add('--is-visible'));
    }

    mode = 'horizontal'; // force so setMode('vertical') below actually applies classes
    setMode('vertical');
    verticalEl.scrollTop = 0;

    if (typeof startId === 'string') {
      const n = parseInt(startId.replace(/\D/g, ''), 10);
      if (!isNaN(n)) {
        const idx = Math.min(SLIDE_COUNT - 1, n - 1);
        const el = verticalEl.querySelector(`.wg-vertical__item[data-index="${idx}"]`);
        if (el) el.scrollIntoView({ block: 'center' });
      }
    }
  }

  function close() {
    isOpen = false;
    if (lightboxIndex >= 0) closeLightbox();
    if (window.gsap) {
      gsap.to(root, {
        autoAlpha: 0, duration: DUR.nudge, ease: EASE.item,
        onComplete: () => { root.classList.remove('--is-open'); document.body.classList.remove('wg-active'); },
      });
    } else {
      root.classList.remove('--is-visible');
      document.body.classList.remove('wg-active');
      setTimeout(() => root.classList.remove('--is-open'), 400);
    }
  }

  window.WorkGallery = { open, close };
})();