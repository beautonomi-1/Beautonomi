#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stillMostlyEnglish } from "./_wave-a-translate.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const missing = JSON.parse(fs.readFileSync(path.join(root, "_work/b15-still-missing.json"), "utf8"));
const maps = fs.readdirSync(path.join(root, "_maps")).filter((f) => f.startsWith("t-chunk"));
/** @type {Map<string, Record<string, string>>} */
const pool = new Map();
for (const f of maps) {
  const j = JSON.parse(fs.readFileSync(path.join(root, "_maps", f), "utf8"));
  for (const [en, row] of Object.entries(j)) {
    if (!pool.has(en)) pool.set(en, row);
  }
}
let sw = 0;
let fr = 0;
for (const en of missing) {
  const row = pool.get(en);
  if (row?.sw) sw += 1;
  if (row?.fr && row.fr !== en) fr += 1;
}
console.log({ missing: missing.length, sw, fr, pool: pool.size });
