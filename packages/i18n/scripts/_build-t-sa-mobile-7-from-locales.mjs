#!/usr/bin/env node
/**
 * Build t-sa-mobile-7.json from existing locale paths (English value → SA locales).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isIdentity, stillMostlyEnglish } from "./_wave-a-translate.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const localesDir = path.join(root, "src/locales");
const dest = path.join(root, "_maps/t-sa-mobile-7.json");
const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];

function flatten(obj, prefix = "", out = new Map()) {
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) flatten(value, full, out);
    else out.set(full, String(value ?? ""));
  }
  return out;
}

function getAt(obj, dotted) {
  let cur = obj;
  for (const p of dotted.split(".")) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return typeof cur === "string" ? cur : undefined;
}

const leftover = JSON.parse(
  fs.readFileSync(path.join(root, "_work/mobile-leftover-en-now.json"), "utf8"),
);
const list = leftover.slice(350, 700);

const en = JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8"));
const enFlat = flatten(en);
const valueToPaths = new Map();
for (const [p, v] of enFlat) {
  if (!valueToPaths.has(v)) valueToPaths.set(v, []);
  valueToPaths.get(v).push(p);
}

const localeTrees = {};
for (const loc of SA) {
  localeTrees[loc] = JSON.parse(fs.readFileSync(path.join(localesDir, `${loc}.json`), "utf8"));
}

const prev = fs.existsSync(dest) ? JSON.parse(fs.readFileSync(dest, "utf8")) : {};
const manualPath = path.join(root, "_work/b7-manual.json");
const manual = fs.existsSync(manualPath) ? JSON.parse(fs.readFileSync(manualPath, "utf8")) : {};

const out = {};
for (const enVal of list) {
  if (isIdentity(enVal)) continue;
  const row = { ...(prev[enVal] || {}), ...(manual[enVal] || {}) };
  const paths = valueToPaths.get(enVal) || [];
  for (const loc of SA) {
    if (row[loc] && row[loc] !== enVal && !stillMostlyEnglish(enVal, row[loc])) continue;
    for (const p of paths) {
      const v = getAt(localeTrees[loc], p);
      if (v && v !== enVal && !stillMostlyEnglish(enVal, v)) {
        row[loc] = v;
        break;
      }
    }
    if (!row[loc]) row[loc] = enVal;
  }
  out[enVal] = row;
}

fs.writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
console.log(`Wrote ${Object.keys(out).length} keys → ${dest}`);
