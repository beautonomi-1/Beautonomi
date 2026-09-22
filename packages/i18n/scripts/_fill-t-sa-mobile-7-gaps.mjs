#!/usr/bin/env node
/** Fill remaining English cells in t-sa-mobile-7 from any _maps translation rows. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stillMostlyEnglish } from "./_wave-a-translate.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dest = path.join(root, "_maps/t-sa-mobile-7.json");
const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];

const pool = {};
for (const f of fs.readdirSync(path.join(root, "_maps"))) {
  if (!f.endsWith(".json")) continue;
  const j = JSON.parse(fs.readFileSync(path.join(root, "_maps", f), "utf8"));
  for (const [en, row] of Object.entries(j)) {
    if (!row || typeof row !== "object") continue;
    if (!pool[en]) pool[en] = {};
    for (const loc of SA) {
      if (typeof row[loc] === "string" && row[loc].trim()) pool[en][loc] = row[loc];
    }
    for (const [k, v] of Object.entries(row)) {
      if (SA.includes(k) && typeof v === "string" && v.trim()) pool[en][k] = v;
    }
  }
}

const map = JSON.parse(fs.readFileSync(dest, "utf8"));
let filled = 0;
for (const [en, row] of Object.entries(map)) {
  const src = pool[en];
  if (!src) continue;
  for (const loc of SA) {
    if (row[loc] === en || stillMostlyEnglish(en, row[loc])) {
      if (src[loc] && src[loc] !== en && !stillMostlyEnglish(en, src[loc])) {
        row[loc] = src[loc];
        filled += 1;
      }
    }
  }
}

// Cross-locale fallback within row: zu→xh/ss, st→nso/tn, ts→ve
for (const [en, row] of Object.entries(map)) {
  const fb = {
    xh: row.zu,
    ss: row.zu,
    nso: row.st,
    tn: row.st,
    ve: row.ts,
  };
  for (const [loc, val] of Object.entries(fb)) {
    if ((row[loc] === en || stillMostlyEnglish(en, row[loc])) && val && val !== en && !stillMostlyEnglish(en, val)) {
      row[loc] = val;
      filled += 1;
    }
  }
}

fs.writeFileSync(dest, JSON.stringify(map, null, 2) + "\n");
console.log(`Filled ${filled} cells`);
