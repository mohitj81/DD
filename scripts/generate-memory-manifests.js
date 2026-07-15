#!/usr/bin/env node
/**
 * generate-memory-manifests.js
 * ---------------------------------------------------------------------------
 * Run this whenever you add/remove/reorder images in a memories/<orbId>/
 * folder. It writes a manifest.json listing the images in sorted order, so
 * MemoryViewer loads them instantly instead of probing filenames over the
 * network (probing still works as a fallback if you skip this step).
 *
 * Usage:
 *   node scripts/generate-memory-manifests.js
 *   node scripts/generate-memory-manifests.js --dir=memories
 */
const fs = require("fs");
const path = require("path");

const IMAGE_EXT = /\.(jpe?g|png|webp|avif)$/i;

function arg(name, fallback) {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.split("=")[1] : fallback;
}

const rootDir = path.resolve(process.cwd(), arg("dir", "memories"));

if (!fs.existsSync(rootDir)) {
  console.error(`Directory not found: ${rootDir}`);
  process.exit(1);
}

const orbDirs = fs
  .readdirSync(rootDir, { withFileTypes: true })
  .filter((d) => d.isDirectory());

let total = 0;
for (const dirent of orbDirs) {
  const orbPath = path.join(rootDir, dirent.name);
  const images = fs
    .readdirSync(orbPath)
    .filter((f) => IMAGE_EXT.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const manifestPath = path.join(orbPath, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify({ images }, null, 2) + "\n");
  console.log(`✓ ${dirent.name}: ${images.length} images -> manifest.json`);
  total += images.length;
}

console.log(`\nDone. ${orbDirs.length} orb folder(s), ${total} image(s) total.`);