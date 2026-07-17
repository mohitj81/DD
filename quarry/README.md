# The Quarry House — extracted from HAR capture

This package was rebuilt by extracting every response body that was actually
present in the HAR file (`mfisher-apollonas_com.har`) and writing it back out
to its original path, so the folder structure matches exactly what the live
site serves.

## ✅ Extracted byte-for-byte (identical to production)

- `mfisher-apollonas.com/gallery.html` — full server-rendered `/gallery` page,
  including the embedded `__NEXT_DATA__` (Prismic CMS content for that page)
- All CSS: `_next/static/css/*.css` (3 files)
- All JS bundles: `_next/static/chunks/**/*.js` (webpack runtime, framework,
  main, `_app`, shared chunks, `gallery` page, `index` page)
- Fonts: `WT_Kormelink_Roman.woff2`, `WT_Kormelink_Italic.woff2`,
  `Knockout.woff2`, `SangBleuOGSans-Light.woff2`
- Audio: `click.mp3`, `hover.mp3`, `bg-music.mp3`, `nature.mp3`,
  `stone-turning.mp3`
- `images/transition-mask.png`, `images/env.hdr` (HDRI lighting map for the
  3D viewer)
- `draco-gltf/draco_decoder.wasm` + `draco_wasm_wrapper.js` (glTF mesh
  compression, used to load the 3D model)
- `favicon.ico`
- `_next/data/.../index.json` — the actual Prismic CMS JSON payload that
  drives the homepage content (room descriptions, image slices, ordering)
- Next.js build manifests (`_buildManifest.js`, `_ssgManifest.js`, etc.)
- Gallery photography — 5 room photos in each requested size, referenced
  directly from `images.prismic.io` (Prismic's own CDN, not re-hosted here)

## 🛠 Reconstructed (not literally captured, rebuilt from what was captured)

- `mfisher-apollonas.com/index.html` — the browser's HAR capture only
  recorded an empty body for the `/` request (a HEAD request was logged, and
  the GET response body was blank in the archive), so this file is
  **rebuilt** from the `gallery.html` document shell + the real homepage
  Prismic JSON (`index.json`), pointed at the correct homepage JS/CSS
  bundles. It should hydrate correctly, but I didn't get to verify it
  pixel-for-pixel against the live homepage the way `gallery.html` is.

## ❌ Missing — not present in the HAR at all

- **`models/quary-room-v-2.glb`** (the 3D room model, ~18.7 MB) — the browser
  that generated this HAR truncated the response body for this file (it's
  logged with the correct size but zero captured bytes), which is common for
  very large binary responses in HAR exports. **You'll need to pull this one
  directly from the live site or your own asset storage** — it can't be
  recovered from this capture.
- Any pages beyond `/` and `/gallery` (this HAR only recorded those two
  navigations).

## Using this elsewhere

Drop the `mfisher-apollonas.com/` folder's contents at the root of your new
project (so `/fonts`, `/images`, `/_next`, etc. resolve the same way), add
the missing `.glb`, and serve it with any static file server — the JS/CSS
references are all relative to `/`, matching the original Next.js export
paths.
