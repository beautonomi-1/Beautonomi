#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isIdentity } from "./_wave-a-translate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];

const arr = JSON.parse(
  fs.readFileSync(path.join(root, "_work/mobile-sa-unique-en.json"), "utf8"),
).slice(400, 800);

const googlePath = path.join(root, "_maps/t-sa-mobile-2.json");
const google = fs.existsSync(googlePath) ? JSON.parse(fs.readFileSync(googlePath, "utf8")) : {};

const built = JSON.parse(
  fs.readFileSync(path.join(root, "_maps/t-sa-mobile-2.built.json"), "utf8"),
);

const out = {};
let written = 0;
for (const enVal of arr) {
  if (isIdentity(enVal)) continue;
  const g = google[enVal];
  const b = built[enVal];
  const row = {};
  for (const loc of SA) {
    const gv = g?.[loc];
    const bv = b?.[loc];
    if (typeof gv === "string" && gv !== enVal) row[loc] = gv;
    else if (typeof bv === "string") row[loc] = bv;
    else if (typeof gv === "string") row[loc] = gv;
    else row[loc] = enVal;
  }
  out[enVal] = row;
  written++;
}

const dest = path.join(root, "_maps/t-sa-mobile-2.json");
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
console.log(`Wrote ${written} keys → ${dest}`);
