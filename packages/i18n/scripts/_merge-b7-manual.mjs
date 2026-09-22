#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dest = path.join(root, "_maps/t-sa-mobile-7.json");
const manualPath = path.join(root, "_work/b7-manual.json");
const map = JSON.parse(fs.readFileSync(dest, "utf8"));
if (fs.existsSync(manualPath)) {
  const manual = JSON.parse(fs.readFileSync(manualPath, "utf8"));
  for (const [en, row] of Object.entries(manual)) {
    map[en] = { ...(map[en] || {}), ...row };
  }
}
fs.writeFileSync(dest, JSON.stringify(map, null, 2) + "\n");
console.log(`Merged manual → ${Object.keys(map).length} keys`);
