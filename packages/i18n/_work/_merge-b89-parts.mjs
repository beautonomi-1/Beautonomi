#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)));
const locs = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];

function mergeParts(prefix, outName) {
  const merged = {};
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.startsWith(prefix) || !f.endsWith(".json")) continue;
    Object.assign(merged, JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
  }
  fs.writeFileSync(path.join(dir, outName), JSON.stringify(merged, null, 2) + "\n");
  return merged;
}

function validate(enListPath, manual) {
  const keys = JSON.parse(fs.readFileSync(path.join(dir, enListPath), "utf8"));
  const errors = [];
  for (const en of keys) {
    if (!manual[en]) errors.push(`missing key: ${en.slice(0, 60)}…`);
    else {
      for (const l of locs) {
        const v = manual[en][l];
        if (!v || v === en) errors.push(`${l} equals EN: ${en.slice(0, 50)}…`);
        else if (/^[A-Za-z0-9\s.,!?;:'"()\-→—…{{}}]+$/.test(v) && !/\{\{/.test(v)) {
          const words = v.split(/\s+/).filter(Boolean);
          const enWords = en.split(/\s+/).filter(Boolean);
          if (words.length > 3 && v === en) errors.push(`${l} fully EN`);
        }
      }
    }
  }
  return { keys: keys.length, manualKeys: Object.keys(manual).length, errors };
}

const b8 = mergeParts("b8-manual-part", "b8-manual.json");
const b9 = mergeParts("b9-manual-part", "b9-manual.json");
const r8 = validate("b8-bad-en.json", b8);
const r9 = validate("b9-bad-en.json", b9);
console.log("b8", r8);
console.log("b9", r9);
if (r8.errors.length || r9.errors.length) process.exit(1);
