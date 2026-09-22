#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dest = path.join(root, "_maps/t-sa-mobile-7.json");

function loadCovered(exclude) {
  const maps = {};
  for (const f of fs.readdirSync(path.join(root, "_maps"))) {
    if (f === exclude) continue;
    if (f.startsWith("t-sa-mobile-") && f.endsWith(".json") && !f.includes(".built.")) {
      Object.assign(maps, JSON.parse(fs.readFileSync(path.join(root, "_maps", f), "utf8")));
    }
  }
  return maps;
}

const missing = JSON.parse(
  fs.readFileSync(path.join(root, "_work/mobile-sa-missing-en.json"), "utf8"),
);
const list = missing.filter((s) => !loadCovered("t-sa-mobile-7.json")[s]).slice(0, 350);
const prev = JSON.parse(fs.readFileSync(dest, "utf8"));
const out = {};
for (const en of list) {
  if (prev[en]) out[en] = prev[en];
}
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
console.log(`Trimmed to ${Object.keys(out).length}/${list.length} keys`);
