#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isIdentity } from "../scripts/_wave-a-translate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];

/** @type {Record<string, Record<string, string>>} */
const T = {};

function r(en, af, zu, xh, st, nso, tn, ts, ve, ss) {
  T[en] = { af, zu, xh, st, nso, tn, ts, ve, ss };
}

// Batch 3 translations (indices 800–1199) — loaded from companion module
const { applyBatch3 } = await import("./b3-translations.mjs");
applyBatch3(r);

const arr = JSON.parse(
  fs.readFileSync(path.join(__dirname, "mobile-sa-unique-en.json"), "utf8"),
).slice(800, 1200);

const map = {};
for (const en of arr) {
  if (isIdentity(en)) continue;
  if (!T[en]) {
    console.error("Missing translation:", JSON.stringify(en));
    process.exitCode = 1;
    continue;
  }
  map[en] = T[en];
}

const dest = path.join(__dirname, "../_maps/t-sa-mobile-3.json");
fs.writeFileSync(dest, JSON.stringify(map, null, 2) + "\n");
console.log(`Keys: ${Object.keys(map).length} → ${dest}`);
if (Object.keys(map).length !== arr.filter((s) => !isIdentity(s)).length) {
  process.exitCode = 1;
}
