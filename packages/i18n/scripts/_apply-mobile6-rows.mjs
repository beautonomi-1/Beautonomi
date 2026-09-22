#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];

const dest = path.join(root, "_maps/t-sa-mobile-6.json");
const map = JSON.parse(fs.readFileSync(dest, "utf8"));

const parts = fs
  .readdirSync(path.join(__dirname))
  .filter((f) => f.startsWith("_mobile6-rows-") && f.endsWith(".mjs"))
  .sort();

for (const f of parts) {
  const mod = await import(pathToFileURL(path.join(__dirname, f)).href);
  for (const row of mod.default) {
    const [en, ...trs] = row;
    if (trs.length !== 9) throw new Error(`Bad row for ${en.slice(0, 40)}`);
    const entry = {};
    SA.forEach((loc, i) => {
      entry[loc] = trs[i];
    });
    map[en] = entry;
  }
}

fs.writeFileSync(dest, JSON.stringify(map, null, 2) + "\n");
console.log(`Applied ${parts.length} row file(s). Keys: ${Object.keys(map).length}`);
