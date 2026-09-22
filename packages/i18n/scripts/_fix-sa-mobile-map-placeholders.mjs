#!/usr/bin/env node
/** Align {{var}} names in t-sa-mobile-* maps with English source keys. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const mapsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../_maps");
const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];

function extractVars(str) {
  return [...String(str).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[0]);
}

function varsOk(en, out) {
  const need = new Set(extractVars(en).map((v) => v.slice(2, -2)));
  for (const v of extractVars(out).map((x) => x.slice(2, -2))) {
    if (!need.has(v)) return false;
  }
  for (const v of need) {
    if (!out.includes(`{{${v}}}`)) return false;
  }
  return true;
}

function fixVars(en, tr) {
  const enTok = extractVars(en);
  const trTok = extractVars(tr);
  if (enTok.length === 0) return tr;
  if (enTok.length !== trTok.length) return tr;
  let out = tr;
  for (let i = 0; i < enTok.length; i++) {
    if (trTok[i] !== enTok[i]) out = out.replace(trTok[i], enTok[i]);
  }
  return out;
}

let files = 0;
let cells = 0;

for (const f of fs.readdirSync(mapsDir)) {
  if (!f.startsWith("t-sa-mobile-") || !f.endsWith(".json") || f.includes(".built.")) continue;
  const p = path.join(mapsDir, f);
  const map = JSON.parse(fs.readFileSync(p, "utf8"));
  let touched = false;
  for (const [en, row] of Object.entries(map)) {
    if (!row || typeof row !== "object") continue;
    for (const loc of SA) {
      const tr = row[loc];
      if (typeof tr !== "string" || varsOk(en, tr)) continue;
      const fixed = fixVars(en, tr);
      if (fixed !== tr && varsOk(en, fixed)) {
        row[loc] = fixed;
        cells += 1;
        touched = true;
      }
    }
  }
  if (touched) {
    fs.writeFileSync(p, JSON.stringify(map, null, 2) + "\n");
    files += 1;
  }
}

console.log({ files, cells });
