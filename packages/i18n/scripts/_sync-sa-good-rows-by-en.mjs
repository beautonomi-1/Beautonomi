#!/usr/bin/env node
/** Propagate map rows where zu passes stillMostlyEnglish to all maps sharing the same EN key. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isIdentity, stillMostlyEnglish } from "./_wave-a-translate.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];

function zuOk(en, row) {
  const zu = row?.zu;
  return zu && zu !== en && !stillMostlyEnglish(en, zu);
}

function rowOk(en, row) {
  return zuOk(en, row) && SA.every((loc) => row[loc] && row[loc] !== en);
}

/** @type {Record<string, Record<string, string>>} */
const best = {};
for (const f of fs.readdirSync(path.join(root, "_maps"))) {
  if (!f.startsWith("t-sa-mobile-") || !f.endsWith(".json") || f.includes(".built.")) continue;
  const map = JSON.parse(fs.readFileSync(path.join(root, "_maps", f), "utf8"));
  for (const [en, row] of Object.entries(map)) {
    if (!rowOk(en, row)) continue;
    if (!best[en]) best[en] = row;
  }
}

for (const f of fs.readdirSync(path.join(root, "_work"))) {
  if (!/^b\d+-manual/.test(f) && f !== "t-sa-mobile-6-calque-fix.json") continue;
  const manual = JSON.parse(fs.readFileSync(path.join(root, "_work", f), "utf8"));
  for (const [en, row] of Object.entries(manual)) {
    if (rowOk(en, row)) best[en] = row;
  }
}

let patched = 0;
for (const f of fs.readdirSync(path.join(root, "_maps"))) {
  if (!f.startsWith("t-sa-mobile-") || !f.endsWith(".json") || f.includes(".built.")) continue;
  const p = path.join(root, "_maps", f);
  const map = JSON.parse(fs.readFileSync(p, "utf8"));
  let n = 0;
  for (const [en, row] of Object.entries(map)) {
    if (isIdentity(en) || zuOk(en, row)) continue;
    const src = best[en];
    if (!src) continue;
    map[en] = { ...src };
    n += 1;
    patched += 1;
  }
  if (n) fs.writeFileSync(p, JSON.stringify(map, null, 2) + "\n");
  if (n) console.log(`${f}: synced ${n} rows from good pool`);
}
console.log({ bestPool: Object.keys(best).length, patched });
