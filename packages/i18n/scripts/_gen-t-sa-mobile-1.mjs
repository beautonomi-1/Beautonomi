#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isIdentity, loadSaExternalMaps, translate } from "./_wave-a-translate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];

loadSaExternalMaps(path.join(root, "_maps"), fs, path);

const arr = JSON.parse(
  fs.readFileSync(path.join(root, "_work/mobile-sa-unique-en.json"), "utf8"),
).slice(0, 400);

const map = {};
for (const enVal of arr) {
  if (isIdentity(enVal)) continue;
  const row = {};
  for (const loc of SA) {
    row[loc] = translate(enVal, loc);
  }
  map[enVal] = row;
}

const dest = path.join(root, "_maps/t-sa-mobile-1-draft.json");
fs.writeFileSync(dest, JSON.stringify(map, null, 2) + "\n");
console.log(`Keys: ${Object.keys(map).length}`);

let partial = 0;
for (const [en, row] of Object.entries(map)) {
  if (SA.some((l) => row[l] === en)) partial++;
}
console.log(`Keys with at least one lang still EN: ${partial}`);
