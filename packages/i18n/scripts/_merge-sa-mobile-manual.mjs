#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const mapFile = process.argv[2];
const manualFile = process.argv[3];
if (!mapFile || !manualFile) {
  console.error("Usage: node _merge-sa-mobile-manual.mjs t-sa-mobile-8.json b8-manual.json");
  process.exit(1);
}
const dest = path.join(root, "_maps", mapFile);
const manualPath = path.join(root, "_work", manualFile);
const map = JSON.parse(fs.readFileSync(dest, "utf8"));
const manual = JSON.parse(fs.readFileSync(manualPath, "utf8"));
for (const [en, row] of Object.entries(manual)) {
  map[en] = { ...(map[en] || {}), ...row };
}
fs.writeFileSync(dest, JSON.stringify(map, null, 2) + "\n");
console.log(`Merged ${Object.keys(manual).length} manual rows → ${dest} (${Object.keys(map).length} keys total)`);
