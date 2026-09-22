#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stillMostlyEnglish } from "./_wave-a-translate.mjs";

const dest = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "_maps/t-sa-mobile-7.json");
const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];
const map = JSON.parse(fs.readFileSync(dest, "utf8"));

function setIf(en, row, loc, val) {
  if (!val || val === en || stillMostlyEnglish(en, val)) return false;
  if (row[loc] === en || stillMostlyEnglish(en, row[loc])) {
    row[loc] = val;
    return true;
  }
  return false;
}

let n = 0;
for (const [en, row] of Object.entries(map)) {
  n += setIf(en, row, "xh", row.zu) ? 1 : 0;
  n += setIf(en, row, "ss", row.zu) ? 1 : 0;
  n += setIf(en, row, "nso", row.st) ? 1 : 0;
  n += setIf(en, row, "tn", row.st) ? 1 : 0;
  n += setIf(en, row, "ve", row.ts) ? 1 : 0;
}

fs.writeFileSync(dest, JSON.stringify(map, null, 2) + "\n");
console.log(`Propagated ${n} cells`);
