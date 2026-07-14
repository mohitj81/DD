/* aikawa-overlay.js
   Opens the REAL aikawa /work page (self-hosted copy at ./aikawa-site/)
   in a fullscreen iframe overlay. Not a recreation — the actual site's
   compiled JS/CSS, running as-is.

   Usage:
     AikawaOverlay.open()
     AikawaOverlay.close()

   Auto-opens on 'mm-orb-collected'. Toggle off with:
     AikawaOverlay.autoOpenOnOrb = false
*/

(function () {
  const SITE_PATH = "aikawa-site/index.html"; // path to the extracted real site

  let root, iframe;

  function build() {
    root = document.createElement("div");
    root.id = "aikawa-overlay";
    root.innerHTML = `
      <button id="aikawa-overlay__close" aria-label="Close">&times;</button>
      <iframe src="${SITE_PATH}" title="Aikawa Kenichi — Work" loading="eager"></iframe>
    `;
    document.body.appendChild(root);
    iframe = root.querySelector("iframe");
    root.querySelector("#aikawa-overlay__close").addEventListener("click", close);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && root.classList.contains("is-open")) close();
    });
  }

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
    window.dispatchEvent(new CustomEvent("aikawa-overlay-pause", { detail: { paused } }));
  }

  function open() {
    if (!root) build();
    root.classList.add("is-open");
    // reload the iframe fresh each time so it re-plays its intro/animations
    iframe.src = iframe.src;
    setPaused(true);
  }

  function close() {
    if (!root) return;
    root.classList.remove("is-open");
    setPaused(false);
  }

  window.AikawaOverlay = { open, close, autoOpenOnOrb: true };

  window.addEventListener("mm-orb-collected", () => {
    if (window.AikawaOverlay.autoOpenOnOrb) {
      window.AikawaOverlay.open();
    }
  });
})();