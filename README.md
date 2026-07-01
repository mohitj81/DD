# Work Slideshow Modal — drop-in for the DD project

A standalone, vanilla-JS recreation of the page-to-page scroll-snap photo
slideshow from aikawakenichi.com's /work page. Built with the same
animation stack the original site uses (GSAP + Lenis), so the feel —
smooth inertia scroll, snap-to-photo, scale/fade transitions — matches
closely. This is an original recreation, not extracted code (the
original is bundled/obfuscated and tightly coupled to its own Nuxt app,
so it isn't something that can be lifted out directly).

## Files
- `slideshow-modal.css` — modal + slide styling
- `slideshow-modal.js` — modal logic, scroll-snap, animations
- `images/slide-00.webp` … `slide-30.webp` — the 31 work-page photos

## 1. Install into DD
Copy `slideshow-modal.css`, `slideshow-modal.js`, and the `images/` folder
into your DD project root (or wherever you keep static assets).

## 2. Add to index.html
Right before `</body>`, add:

```html
<link rel="stylesheet" href="slideshow-modal.css">

<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<script src="https://unpkg.com/lenis@1.1.13/dist/lenis.min.js"></script>
<script src="slideshow-modal.js"></script>
```

(GSAP/Lenis are optional — without them the modal still works with plain
CSS transitions, just slightly less smooth.)

## 3. Trigger it from your existing action
Wherever your "sub window opens at an action" trigger lives in
`experience.js` (or wherever that click/event handler is), call:

```js
WorkSlideshow.open();
```

To close it programmatically: `WorkSlideshow.close()`. It also closes on
the × button or Escape key automatically.

## 4. Replacing the photos
Two options:

**A — Zero code changes (recommended):** keep the filenames
`slide-00.webp` through `slide-30.webp` and just overwrite the files in
`/images` with your own photos (same names, any image content). Fewer
photos than 31 is fine, the modal will just show fewer slides — but if
you remove files you also need to delete the corresponding lines from
the `IMAGES` array in `slideshow-modal.js` (see step below).

**B — Custom filenames/count:** open `slideshow-modal.js`, find the
`IMAGES` array near the top, and edit the list of paths directly:

```js
const IMAGES = [
  "images/your-photo-1.jpg",
  "images/your-photo-2.jpg",
  // ...add or remove as many as you like
];
```

Images can be `.jpg`, `.png`, or `.webp` — any format works.

## Notes
- The modal is `position: fixed`, full-screen, z-index 9999, so it
  layers cleanly over a Three.js canvas like DD's.
- It pauses page scroll while open (`overflow: hidden` on `<body>`) and
  restores it on close.
- For best performance with many large images, keep them web-optimized
  (the originals here are already compressed `.webp`).
