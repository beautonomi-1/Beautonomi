#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const maps = {};
for (const f of fs.readdirSync(path.join(root, "_maps"))) {
  if (f.startsWith("t-sa-mobile-") && f.endsWith(".json") && !f.includes(".built.")) {
    Object.assign(maps, JSON.parse(fs.readFileSync(path.join(root, "_maps", f), "utf8")));
  }
}
const list = JSON.parse(fs.readFileSync(path.join(root, "_work/mobile-leftover-en-now.json"), "utf8"));
const missing = list.filter((s) => !maps[s]);
const out = path.join(root, "_work/mobile-sa-missing-en.json");
fs.writeFileSync(out, JSON.stringify(missing, null, 2) + "\n");
console.log(`Missing from SA maps: ${missing.length} → ${out}`);
