#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isIdentity, stillMostlyEnglish } from "./_wave-a-translate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];

const list = JSON.parse(
  fs.readFileSync(path.join(root, "_work/mobile-sa-missing-en.json"), "utf8"),
).slice(0, 350);

const dest = path.join(root, "_maps/t-sa-mobile-6.json");
const map = JSON.parse(fs.readFileSync(dest, "utf8"));

const parts = fs
  .readdirSync(path.join(root, "_maps"))
  .filter((f) => f.startsWith("t-sa-mobile-6-overrides") && f.endsWith(".json"))
  .sort();

for (const f of parts) {
  const chunk = JSON.parse(fs.readFileSync(path.join(root, "_maps", f), "utf8"));
  Object.assign(map, chunk);
}

fs.writeFileSync(dest, JSON.stringify(map, null, 2) + "\n");

let bad = 0;
for (const en of list) {
  if (isIdentity(en)) continue;
  const row = map[en];
  if (!row) {
    bad += 9;
    continue;
  }
  for (const loc of SA) {
    if (!row[loc] || row[loc] === en || stillMostlyEnglish(en, row[loc])) bad += 1;
  }
}
console.log(`Keys: ${Object.keys(map).length}, remaining issues: ${bad}`);
