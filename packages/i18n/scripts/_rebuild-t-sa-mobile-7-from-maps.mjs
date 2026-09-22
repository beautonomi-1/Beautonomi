#!/usr/bin/env node
/** Rebuild t-sa-mobile-7.json (leftover indices 350–699) from other t-sa-mobile maps. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dest = path.join(root, "_maps/t-sa-mobile-7.json");
const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];

const pool = {};
for (const f of fs.readdirSync(path.join(root, "_maps"))) {
  if (f === "t-sa-mobile-7.json") continue;
  if (f.startsWith("t-sa-mobile-") && f.endsWith(".json") && !f.includes(".built.")) {
    Object.assign(pool, JSON.parse(fs.readFileSync(path.join(root, "_maps", f), "utf8")));
  }
}

const leftover = JSON.parse(
  fs.readFileSync(path.join(root, "_work/mobile-leftover-en-now.json"), "utf8"),
);
const list = leftover.slice(350, 700);

const out = {};
let hit = 0;
for (const en of list) {
  if (pool[en]) {
    out[en] = pool[en];
    hit += 1;
  } else {
    const row = {};
    for (const loc of SA) row[loc] = en;
    out[en] = row;
  }
}

fs.writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
console.log(`Wrote ${Object.keys(out).length} keys (${hit} from other maps) → ${dest}`);
