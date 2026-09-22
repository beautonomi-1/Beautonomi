#!/usr/bin/env node
/** Merge all _work/b*-manual*.json and calque-fix rows into t-sa-mobile-*.json maps. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const work = path.join(root, "_work");

/** @type {Record<string, Record<string, string>>} */
const manual = {};
for (const f of fs.readdirSync(work)) {
  if (/^b\d+-manual/.test(f) || f === "t-sa-mobile-6-calque-fix.json") {
    Object.assign(manual, JSON.parse(fs.readFileSync(path.join(work, f), "utf8")));
  }
}

let merged = 0;
for (const f of fs.readdirSync(path.join(root, "_maps"))) {
  if (!f.startsWith("t-sa-mobile-") || !f.endsWith(".json") || f.includes(".built.")) continue;
  const p = path.join(root, "_maps", f);
  const map = JSON.parse(fs.readFileSync(p, "utf8"));
  let n = 0;
  for (const [en, row] of Object.entries(manual)) {
    if (!map[en]) continue;
    map[en] = { ...map[en], ...row };
    n += 1;
    merged += 1;
  }
  if (n) fs.writeFileSync(p, JSON.stringify(map, null, 2) + "\n");
  if (n) console.log(`${f}: merged ${n} manual rows`);
}
console.log({ manualKeys: Object.keys(manual).length, mergedCells: merged });
