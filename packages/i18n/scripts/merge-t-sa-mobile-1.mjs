#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isIdentity } from "./_wave-a-translate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];

const arr = JSON.parse(
  fs.readFileSync(path.join(root, "_work/mobile-sa-unique-en.json"), "utf8"),
).slice(0, 400);

const chunksDir = path.join(root, "_work/mobile-1-chunks");
const merged = {};

for (const file of fs.readdirSync(chunksDir).filter((f) => f.endsWith(".json")).sort()) {
  const part = JSON.parse(fs.readFileSync(path.join(chunksDir, file), "utf8"));
  Object.assign(merged, part);
}

const out = {};
let written = 0;
for (const enVal of arr) {
  if (isIdentity(enVal)) continue;
  const row = merged[enVal];
  if (!row) {
    console.error("Missing translation for:", JSON.stringify(enVal));
    process.exit(1);
  }
  for (const loc of SA) {
    if (typeof row[loc] !== "string") {
      console.error("Missing lang", loc, "for", JSON.stringify(enVal));
      process.exit(1);
    }
  }
  out[enVal] = row;
  written++;
}

const dest = path.join(root, "_maps/t-sa-mobile-1.json");
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
console.log(`Wrote ${written} keys → ${dest}`);
