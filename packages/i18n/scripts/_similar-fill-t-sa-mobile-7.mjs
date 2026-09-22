#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stillMostlyEnglish } from "./_wave-a-translate.mjs";

const dest = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "_maps/t-sa-mobile-7.json");
const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];
const map = JSON.parse(fs.readFileSync(dest, "utf8"));

function words(s) {
  return new Set((s.toLowerCase().match(/[a-z]{3,}/g) || []).filter((w) => w.length > 2));
}

function score(a, b) {
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter += 1;
  return inter / Math.sqrt(wa.size * wb.size);
}

function rowComplete(en, row) {
  return SA.every((loc) => row[loc] && row[loc] !== en && !stillMostlyEnglish(en, row[loc]));
}

const entries = Object.entries(map);
const complete = entries.filter(([en, row]) => rowComplete(en, row));
let filled = 0;

for (const [en, row] of entries) {
  if (rowComplete(en, row)) continue;
  let best = null;
  let bestScore = 0.35;
  for (const [en2, row2] of complete) {
    const sc = score(en, en2);
    if (sc > bestScore) {
      bestScore = sc;
      best = row2;
    }
  }
  if (!best) continue;
  for (const loc of SA) {
    if (row[loc] === en || stillMostlyEnglish(en, row[loc])) {
      if (best[loc] && best[loc] !== en2 && !stillMostlyEnglish(en, best[loc])) {
        row[loc] = best[loc];
        filled += 1;
      }
    }
  }
}

fs.writeFileSync(dest, JSON.stringify(map, null, 2) + "\n");
console.log(`Similar-fill ${filled} (bad idea if low overlap)`);
