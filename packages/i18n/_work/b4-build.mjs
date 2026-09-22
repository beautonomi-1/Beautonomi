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

const { applyBatch4 } = await import("./b4-translations.mjs");
applyBatch4(r);

const arr = JSON.parse(
  fs.readFileSync(path.join(__dirname, "mobile-sa-unique-en.json"), "utf8"),
).slice(1200, 1610);

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

const dest = path.join(__dirname, "../_maps/t-sa-mobile-4.json");
fs.writeFileSync(dest, JSON.stringify(map, null, 2) + "\n");
console.log(`Keys: ${Object.keys(map).length} → ${dest}`);
const expected = arr.filter((s) => !isIdentity(s)).length;
if (Object.keys(map).length !== expected) {
  process.exitCode = 1;
}
