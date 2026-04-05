/**
 * Normalize global service category PNGs for the home nav:
 * crop to opaque bounding box, then 512×512 `contain` on transparent (matches migration 362 paths).
 *
 * Run: pnpm normalize:category-pngs   (from apps/web)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const imagesDir = path.join(__dirname, "..", "public", "images");

/** Same filenames as `362_global_service_categories_png_assets.sql` (PNG icons only). */
const FILES = [
  "makeup.png",
  "mascara.png",
  "massage.png",
  "nail-art.png",
  "wax.png",
  "facial-treatment.png",
  "afro-natural-hair.png",
  "dreadlocks.png",
  "braids.png",
  "curling-hair.png",
  "facial.png",
  "barbershop.png",
];

const ALPHA_CUTOFF = 24;
const EDGE_PAD = 10;
const OUT_SIZE = 512;

function opaqueBBox(data, width, height) {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a > ALPHA_CUTOFF) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return null;
  return { minX, minY, maxX, maxY };
}

async function normalizeFile(filename) {
  const inputPath = path.join(imagesDir, filename);
  if (!fs.existsSync(inputPath)) {
    console.warn("skip (missing):", filename);
    return;
  }

  const before = await sharp(inputPath).metadata();
  const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const box = opaqueBBox(data, info.width, info.height);
  if (!box) {
    console.warn("skip (no opaque pixels):", filename);
    return;
  }

  const left = Math.max(0, box.minX - EDGE_PAD);
  const top = Math.max(0, box.minY - EDGE_PAD);
  const right = Math.min(info.width - 1, box.maxX + EDGE_PAD);
  const bottom = Math.min(info.height - 1, box.maxY + EDGE_PAD);
  const width = right - left + 1;
  const height = bottom - top + 1;

  const tmpPath = inputPath + ".tmp.png";

  await sharp(inputPath)
    .extract({ left, top, width, height })
    .resize(OUT_SIZE, OUT_SIZE, {
      fit: "contain",
      position: "centre",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9, effort: 10 })
    .toFile(tmpPath);

  fs.renameSync(tmpPath, inputPath);

  const after = await sharp(inputPath).metadata();
  console.log(
    filename,
    `${before.width}x${before.height} → crop ${width}x${height} @(${left},${top}) → ${after.width}x${after.height}`
  );
}

for (const f of FILES) {
  await normalizeFile(f);
}
console.log("done");
