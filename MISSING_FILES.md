# Status: COMPLETE

All 141 files referenced in baluchon-3yxmgdh.manifest.json are present in this folder,
along with the Draco/Basis decoder runtime files.

## How to run locally
1. Serve this folder with any local web server (VS Code Live Server, `python3 -m http.server`, etc.)
   — opening index.html directly via file:// will NOT work, since the app uses ES module imports
   and fetch() calls that browsers block under file:// for security reasons.
2. Open the served URL in your browser.
3. Open DevTools → Network tab and confirm no 404s appear as the experience loads.

## Folder structure
- index.html, experience.js, experience.css, app.3e078bab.css
- app.0ebd139a.js (main bundle)
- vendors/vendors.a233fc08.js (engine bundle)
- vendors/draco/ (decoder)
- vendors/basis/ (transcoder)
- baluchon-3yxmgdh.manifest.json
- locales/en_int.json
- fonts/ (4 woff2 files)
- b/ (187 texture/model/audio/data files)
