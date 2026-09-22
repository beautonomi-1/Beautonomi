#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isIdentity } from "./_wave-a-translate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const localesDir = path.join(root, "src/locales");
const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];

function flatten(obj, prefix = "", out = new Map()) {
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) flatten(value, full, out);
    else out.set(full, String(value ?? ""));
  }
  return out;
}

const enFlat = flatten(JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8")));
const locFlats = {};
for (const loc of SA) {
  locFlats[loc] = flatten(JSON.parse(fs.readFileSync(path.join(localesDir, `${loc}.json`), "utf8")));
}

const enToLoc = new Map();
for (const [key, enVal] of enFlat) {
  if (!enToLoc.has(enVal)) enToLoc.set(enVal, {});
  const row = enToLoc.get(enVal);
  for (const loc of SA) {
    const v = locFlats[loc].get(key);
    if (v && v !== enVal) row[loc] = v;
  }
}

const arr = JSON.parse(
  fs.readFileSync(path.join(root, "_work/mobile-sa-unique-en.json"), "utf8"),
).slice(0, 400);

const map = {};
let full = 0;
let partial = 0;
let none = 0;
for (const enVal of arr) {
  if (isIdentity(enVal)) continue;
  const fromLoc = enToLoc.get(enVal) || {};
  if (Object.keys(fromLoc).length === 9) full++;
  else if (Object.keys(fromLoc).length) partial++;
  else none++;
  const row = {};
  for (const loc of SA) {
    row[loc] = fromLoc[loc] ?? enVal;
  }
  map[enVal] = row;
}

console.log({ keys: Object.keys(map).length, full, partial, none });
