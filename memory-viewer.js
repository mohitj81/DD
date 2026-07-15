/**
 * Memory Viewer — drop-in module for the DD project
 * ---------------------------------------------------------------------------
 * Recreates the aikawakenichi.com /work page interaction model:
 *   - fixed, fullscreen, black-background overlay (position:fixed, z-index layer)
 *   - inertia/momentum scroll-snap gallery (Lenis-style exponential decay)
 *   - GPU-accelerated transitions using the SITE'S OWN real easing curves:
 *       primary   cubic-bezier(.104,.204,.492,1)
 *       secondary cubic-bezier(.306,.968,.632,1)
 *   - fullscreen single-image "stage" viewer with:
 *       mouse drag to pan, shift/alt+drag to rotate, wheel to zoom,
 *       mobile pinch-to-zoom + two-finger pan, double-tap/double-click zoom
 *
 * Zero required dependencies. No React/build step — plain ES module-ish
 * script matching the rest of the DD project (see slideshow-modal.js).
 *
 * -------------------------- Public API --------------------------------
 *   MemoryViewer.init({ basePath, extensions, probeLimit })
 *   MemoryViewer.openMemory(orbId)
 *   MemoryViewer.close()
 *   MemoryViewer.isOpen()
 * ------------------------------------------------------------------------
 *
 * -------------------------- Image folders --------------------------------
 * Each orb gets its own folder:
 *   memories/<orbId>/manifest.json   (optional, fastest, no 404 probing)
 *   memories/<orbId>/001.jpg
 *   memories/<orbId>/002.jpg
 *   ...
 *
 * manifest.json format (optional but recommended):
 *   { "images": ["001.jpg", "002.jpg", "003.webp", ...] }
 *
 * If manifest.json is absent, the loader probes sequential filenames
 * (001..N) across the configured extensions and stops after a small run
 * of consecutive misses — so "any number of images" works with zero code
 * changes, you just drop files in the folder.
 * ------------------------------------------------------------------------
 */
(function (global) {
  "use strict";

  var CONFIG = {
    basePath: "memories/",
    manifestName: "manifest.json",
    extensions: ["jpg", "jpeg", "png", "webp"],
    probeLimit: 200,          // hard ceiling on probed filenames
    probeMissStreak: 4,       // stop probing after this many consecutive misses
    filenamePad: 3,           // 001, 002, ... 
    preloadRadius: 2,         // eagerly preload N images around current index
    primaryEase: "cubic-bezier(.104,.204,.492,1)",
    secondaryEase: "cubic-bezier(.306,.968,.632,1)",
    snapDuration: 550,
    stageSettleDuration: 350,
  };

  // ---------------------------------------------------------------------
  // DOM scaffold — injected once, reused for every openMemory() call
  // ---------------------------------------------------------------------
  var root, loadingEl, galleryEl, trackEl, listEl, counterEl, closeBtn;
  var stageEl, stageViewport, stageImg, stagePrev, stageNext, stageHint;
  var mounted = false;

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function mount() {
    if (mounted) return;
    root = el("div", "mv-root");
    root.setAttribute("aria-hidden", "true");

    loadingEl = el("div", "mv-loading", '<div class="mv-loading__mark"></div>');

    galleryEl = el("div", "mv-gallery");
    trackEl = el("div", "mv-gallery__track");
    listEl = el("div", "mv-gallery__list");
    trackEl.appendChild(listEl);
    galleryEl.appendChild(trackEl);

    counterEl = el("div", "mv-counter", "");
    closeBtn = el("button", "mv-close", closeIconSvg());
    closeBtn.setAttribute("aria-label", "Close");

    stageEl = el("div", "mv-stage");
    stageViewport = el("div", "mv-stage__viewport");
    stageImg = el("img", "mv-stage__img --settling");
    stageImg.draggable = false;
    stageViewport.appendChild(stageImg);
    stagePrev = el("button", "mv-stage__nav mv-stage__nav--prev", chevronSvg(true));
    stageNext = el("button", "mv-stage__nav mv-stage__nav--next", chevronSvg(false));
    stageHint = el("div", "mv-stage__hint", "drag to pan · wheel/pinch to zoom · shift+drag to rotate");
    stageEl.appendChild(stageViewport);
    stageEl.appendChild(stagePrev);
    stageEl.appendChild(stageNext);
    stageEl.appendChild(stageHint);

    root.appendChild(loadingEl);
    root.appendChild(galleryEl);
    root.appendChild(stageEl);
    root.appendChild(counterEl);
    root.appendChild(closeBtn);
    document.body.appendChild(root);

    bindGlobalEvents();
    bindStageEvents();
    mounted = true;
  }

  function closeIconSvg() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">' +
      '<path d="M5 5l14 14M19 5L5 19"/></svg>';
  }
  function chevronSvg(left) {
    var d = left ? "M15 4l-8 8 8 8" : "M9 4l8 8-8 8";
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">' +
      '<path d="' + d + '"/></svg>';
  }

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------
  var state = {
    orbId: null,
    images: [],       // resolved absolute/relative URLs, in order
    items: [],         // { el, imgEl, loaded }
    trackY: 0,          // current momentum-scroll offset (px, negative = scrolled down)
    stageIndex: -1,     // -1 = gallery mode, >=0 = stage open on this image
  };

  // ---------------------------------------------------------------------
  // Image discovery: manifest.json first, else probe sequential filenames
  // ---------------------------------------------------------------------
  function resolveFolder(orbId) {
    var folder = CONFIG.basePath.replace(/\/?$/, "/") + orbId + "/";
    var manifestUrl = folder + CONFIG.manifestName;

    return fetch(manifestUrl, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("no manifest");
        return res.json();
      })
      .then(function (json) {
        var list = (json && json.images) || [];
        return list.map(function (name) { return folder + name; });
      })
      .catch(function () {
        return probeFolder(folder);
      });
  }

  function pad(n, width) {
    var s = String(n);
    while (s.length < width) s = "0" + s;
    return s;
  }

  // Probes 001.jpg, 001.jpeg, 001.png, 001.webp, 002... in parallel batches,
  // stops once a consecutive run of fully-missing indices is hit.
  function probeFolder(folder) {
    return new Promise(function (resolve) {
      var found = [];
      var misses = 0;
      var i = 1;

      function probeOne(index) {
        var name = pad(index, CONFIG.filenamePad);
        var candidates = CONFIG.extensions.map(function (ext) {
          return folder + name + "." + ext;
        });
        return Promise.all(
          candidates.map(function (url) {
            return new Promise(function (res) {
              var img = new Image();
              img.onload = function () { res(url); };
              img.onerror = function () { res(null); };
              img.src = url;
            });
          })
        ).then(function (results) {
          return results.find(function (u) { return u; }) || null;
        });
      }

      function step() {
        if (i > CONFIG.probeLimit || misses >= CONFIG.probeMissStreak) {
          resolve(found);
          return;
        }
        var idx = i++;
        probeOne(idx).then(function (url) {
          if (url) {
            found[idx - 1] = url;
            misses = 0;
          } else {
            misses++;
          }
          step();
        });
      }
      step();
    }).then(function (found) {
      return found.filter(Boolean);
    });
  }

  // ---------------------------------------------------------------------
  // Preloading / lazy loading
  // ---------------------------------------------------------------------
  var lazyObserver = null;
  function getLazyObserver() {
    if (lazyObserver) return lazyObserver;
    lazyObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var wrap = entry.target;
          wrap.classList.toggle("--in-view", entry.isIntersecting);
          if (entry.isIntersecting) loadImage(wrap._mvImgEl, wrap._mvSrc);
        });
      },
      { root: galleryEl, rootMargin: "60% 0px 60% 0px", threshold: 0.05 }
    );
    return lazyObserver;
  }

  function loadImage(imgEl, src) {
    if (imgEl.src === src || imgEl._mvLoading) return;
    imgEl._mvLoading = true;
    var pre = new Image();
    pre.onload = function () {
      imgEl.src = src;
      imgEl.classList.add("--loaded");
    };
    pre.src = src;
  }

  function preloadAround(index) {
    var lo = Math.max(0, index - CONFIG.preloadRadius);
    var hi = Math.min(state.images.length - 1, index + CONFIG.preloadRadius);
    for (var i = lo; i <= hi; i++) {
      var url = state.images[i];
      var img = new Image();
      img.src = url;
    }
  }

  // ---------------------------------------------------------------------
  // Gallery build
  // ---------------------------------------------------------------------
  function buildGallery(images) {
    listEl.innerHTML = "";
    state.items = [];
    var observer = getLazyObserver();

    images.forEach(function (src, i) {
      var item = el("div", "mv-gallery__item");
      var figure = el("div", "mv-gallery__figure");
      var img = el("img", "mv-gallery__img");
      img.alt = "Memory " + (i + 1);
      var index = el("div", "mv-gallery__index", pad(i + 1, 2) + " / " + pad(images.length, 2));

      figure.appendChild(img);
      figure.appendChild(index);
      item.appendChild(figure);
      listEl.appendChild(item);

      item._mvImgEl = img;
      item._mvSrc = src;
      observer.observe(item);

      figure.addEventListener("click", function () { openStage(i); });

      state.items.push({ el: item, imgEl: img, loaded: false });
    });

    state.trackY = 0;
    trackEl.style.transform = "translate3d(0,0,0)";
    updateCounter(0, images.length);
  }

  function updateCounter(i, total) {
    counterEl.textContent = pad(i + 1, 2) + " — " + pad(total, 2);
  }

  // ---------------------------------------------------------------------
  // Momentum scroll (Lenis-style exponential decay, no external dep)
  // ---------------------------------------------------------------------
  var momentum = {
    velocity: 0,
    raf: null,
    dragging: false,
    lastY: 0,
    lastT: 0,
  };

  function trackHeight() { return listEl.getBoundingClientRect().height; }
  function viewportHeight() { return galleryEl.clientHeight; }

  function clampY(y) {
    var max = 0;
    var min = Math.min(0, viewportHeight() - trackHeight());
    return Math.min(max, Math.max(min, y));
  }

  function setTrackY(y, immediate) {
    state.trackY = clampY(y);
    trackEl.style.transform = "translate3d(0," + state.trackY + "px,0)";
    if (!immediate) syncInView();
  }

  function syncInView() {
    var vh = viewportHeight();
    state.items.forEach(function (it) {
      var r = it.el.getBoundingClientRect();
      var gr = galleryEl.getBoundingClientRect();
      var top = r.top - gr.top;
      var visible = top < vh * 0.9 && top + r.height > vh * 0.1;
      it.el.classList.toggle("--in-view", visible);
      if (visible && !it.loaded) {
        loadImage(it.imgEl, it.el._mvSrc);
        it.loaded = true;
      }
    });
  }

  function stopMomentum() {
    if (momentum.raf) cancelAnimationFrame(momentum.raf);
    momentum.raf = null;
  }

  function runMomentum() {
    stopMomentum();
    function frame() {
      momentum.velocity *= 0.92; // friction — matches Lenis' snappy-but-soft decay feel
      if (Math.abs(momentum.velocity) < 0.05) {
        momentum.velocity = 0;
        momentum.raf = null;
        return;
      }
      setTrackY(state.trackY + momentum.velocity);
      momentum.raf = requestAnimationFrame(frame);
    }
    momentum.raf = requestAnimationFrame(frame);
  }

  function onWheel(e) {
    if (state.stageIndex >= 0) return; // stage handles its own wheel (zoom)
    e.preventDefault();
    momentum.velocity += -e.deltaY * 0.6;
    momentum.velocity = Math.max(-60, Math.min(60, momentum.velocity));
    setTrackY(state.trackY - e.deltaY * 0.6);
    runMomentum();
  }

  function onTouchStartGallery(e) {
    if (state.stageIndex >= 0) return;
    momentum.dragging = true;
    momentum.lastY = e.touches[0].clientY;
    momentum.lastT = performance.now();
    stopMomentum();
  }
  function onTouchMoveGallery(e) {
    if (!momentum.dragging || state.stageIndex >= 0) return;
    var y = e.touches[0].clientY;
    var t = performance.now();
    var dy = y - momentum.lastY;
    var dt = Math.max(1, t - momentum.lastT);
    momentum.velocity = (dy / dt) * 16;
    setTrackY(state.trackY + dy);
    momentum.lastY = y;
    momentum.lastT = t;
  }
  function onTouchEndGallery() {
    if (!momentum.dragging) return;
    momentum.dragging = false;
    runMomentum();
  }

  // ---------------------------------------------------------------------
  // Fullscreen "stage" viewer — drag pan / rotate / wheel+pinch zoom
  // ---------------------------------------------------------------------
  var stage = {
    x: 0, y: 0, scale: 1, rotation: 0,
    pointers: {},          // active pointers by id
    pinchStartDist: 0,
    pinchStartScale: 1,
    dragStart: null,       // {x,y,px,py}
    rotating: false,
  };

  function resetStageTransform(animate) {
    stage.x = 0; stage.y = 0; stage.scale = 1; stage.rotation = 0;
    applyStageTransform(animate);
  }

  function applyStageTransform(animate) {
    stageImg.classList.toggle("--settling", !!animate);
    var t = "translate3d(" + stage.x + "px," + stage.y + "px,0) " +
      "scale(" + stage.scale + ") rotate(" + stage.rotation + "deg)";
    stageImg.style.transform = t;
  }

  function markInteracted() { root.classList.add("--interacted"); }

  function openStage(index) {
    state.stageIndex = index;
    resetStageTransform(false);
    var src = state.images[index];
    stageImg.classList.remove("--loaded");
    var pre = new Image();
    pre.onload = function () {
      stageImg.src = src;
      stageImg.classList.add("--loaded");
    };
    pre.src = src;
    root.classList.add("--stage-open");
    preloadAround(index);
  }

  function closeStage() {
    state.stageIndex = -1;
    root.classList.remove("--stage-open");
    root.classList.remove("--interacted");
  }

  function stageStep(dir) {
    var next = state.stageIndex + dir;
    if (next < 0 || next >= state.images.length) return;
    openStage(next);
  }

  function bindStageEvents() {
    stagePrev.addEventListener("click", function () { stageStep(-1); });
    stageNext.addEventListener("click", function () { stageStep(1); });
    stageImg.addEventListener("dblclick", function (e) {
      markInteracted();
      if (stage.scale > 1.01) {
        resetStageTransform(true);
      } else {
        stage.scale = 2.2;
        applyStageTransform(true);
      }
    });

    // Pointer events unify mouse + touch + pen.
    stageViewport.addEventListener("pointerdown", function (e) {
      stage.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      stageViewport.setPointerCapture(e.pointerId);
      var count = Object.keys(stage.pointers).length;

      if (count === 1) {
        stage.dragStart = {
          x: e.clientX, y: e.clientY,
          px: stage.x, py: stage.y,
          rotating: e.shiftKey || e.altKey,
          startRotation: stage.rotation,
        };
        stageViewport.classList.add("--panning");
      } else if (count === 2) {
        var pts = Object.values(stage.pointers);
        stage.pinchStartDist = dist(pts[0], pts[1]);
        stage.pinchStartScale = stage.scale;
        stage.pinchMidStart = mid(pts[0], pts[1]);
      }
    });

    stageViewport.addEventListener("pointermove", function (e) {
      if (!stage.pointers[e.pointerId]) return;
      stage.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var count = Object.keys(stage.pointers).length;

      if (count === 1 && stage.dragStart) {
        markInteracted();
        var dx = e.clientX - stage.dragStart.x;
        var dy = e.clientY - stage.dragStart.y;
        if (stage.dragStart.rotating) {
          stage.rotation = stage.dragStart.startRotation + dx * 0.3;
        } else {
          stage.x = stage.dragStart.px + dx;
          stage.y = stage.dragStart.py + dy;
        }
        applyStageTransform(false);
      } else if (count === 2) {
        markInteracted();
        var pts = Object.values(stage.pointers);
        var d = dist(pts[0], pts[1]);
        var ratio = d / (stage.pinchStartDist || d);
        stage.scale = clamp(stage.pinchStartScale * ratio, 1, 5);
        applyStageTransform(false);
      }
    });

    function endPointer(e) {
      delete stage.pointers[e.pointerId];
      stageViewport.classList.remove("--panning");
      if (Object.keys(stage.pointers).length === 0) {
        stage.dragStart = null;
        // snap back if zoomed out below 1 or dragged too far with scale=1
        if (stage.scale <= 1.01) {
          resetStageTransform(true);
        } else {
          applyStageTransform(true);
        }
      }
    }
    stageViewport.addEventListener("pointerup", endPointer);
    stageViewport.addEventListener("pointercancel", endPointer);

    stageViewport.addEventListener("wheel", function (e) {
      e.preventDefault();
      markInteracted();
      var delta = -e.deltaY * 0.0015;
      stage.scale = clamp(stage.scale * (1 + delta), 1, 5);
      applyStageTransform(false);
    }, { passive: false });
  }

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  function mid(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  // ---------------------------------------------------------------------
  // Open / close orchestration
  // ---------------------------------------------------------------------
  function bindGlobalEvents() {
    closeBtn.addEventListener("click", close);
    galleryEl.addEventListener("wheel", onWheel, { passive: false });
    galleryEl.addEventListener("touchstart", onTouchStartGallery, { passive: true });
    galleryEl.addEventListener("touchmove", onTouchMoveGallery, { passive: true });
    galleryEl.addEventListener("touchend", onTouchEndGallery, { passive: true });

    document.addEventListener("keydown", function (e) {
      if (!root.classList.contains("--open")) return;
      if (e.key === "Escape") {
        if (state.stageIndex >= 0) closeStage();
        else close();
      } else if (state.stageIndex >= 0 && e.key === "ArrowRight") {
        stageStep(1);
      } else if (state.stageIndex >= 0 && e.key === "ArrowLeft") {
        stageStep(-1);
      }
    });
  }

  function open(orbId) {
    mount();
    state.orbId = orbId;
    window.dispatchEvent(new CustomEvent("memory-viewer-open"));
    root.classList.add("--open");
    root.classList.remove("--loaded");
    root.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";

    resolveFolder(orbId).then(function (images) {
      state.images = images;
      buildGallery(images);
      preloadAround(0);
      root.classList.add("--loaded");
      syncInView();
    });
  }

  function close() {
    if (!root) return;
    window.dispatchEvent(new CustomEvent("memory-viewer-close"));
    root.classList.remove("--open", "--stage-open", "--interacted");
    state.stageIndex = -1;
    stopMomentum();
    document.body.style.overflow = "";
    root.setAttribute("aria-hidden", "true");
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------
  global.MemoryViewer = {
    init: function (opts) {
      Object.assign(CONFIG, opts || {});
      mount();
    },
    openMemory: function (orbId) {
      if (!orbId) { console.warn("MemoryViewer.openMemory: orbId required"); return; }
      open(String(orbId));
    },
    close: close,
    isOpen: function () { return !!(root && root.classList.contains("--open")); },
  };
})(window);