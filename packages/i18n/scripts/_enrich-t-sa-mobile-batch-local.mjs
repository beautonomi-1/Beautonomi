#!/usr/bin/env node
/** Fill same-as-English cells using locale files + phrase engine. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isIdentity,
  loadSaExternalMaps,
  stillMostlyEnglish,
  translate,
  translateBestEffort,
} from "./_wave-a-translate.mjs";

const mapFile = process.argv[2];
if (!mapFile) {
  console.error("Usage: node _enrich-t-sa-mobile-batch-local.mjs t-sa-mobile-8.json");
  process.exit(1);
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dest = path.join(root, "_maps", mapFile);
const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];
const localesDir = path.join(root, "src/locales");

loadSaExternalMaps(path.join(root, "_maps"), fs, path);

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

function loadPool() {
  const pool = {};
  for (const f of fs.readdirSync(path.join(root, "_maps"))) {
    if (f === mapFile || !f.endsWith(".json")) continue;
    const j = JSON.parse(fs.readFileSync(path.join(root, "_maps", f), "utf8"));
    for (const [en, row] of Object.entries(j)) {
      if (!row || typeof row !== "object") continue;
      if (!pool[en]) pool[en] = {};
      for (const loc of SA) {
        if (typeof row[loc] === "string" && row[loc].trim()) pool[en][loc] = row[loc];
      }
    }
  }
  return pool;
}

function trySmart(en, loc, poolRow, localeTree, paths) {
  for (const p of paths) {
    const v = getAt(localeTree, p);
    if (v && v !== en && !stillMostlyEnglish(en, v)) return v;
  }
  const fromPool = poolRow?.[loc];
  if (fromPool && fromPool !== en && !stillMostlyEnglish(en, fromPool)) return fromPool;
  for (const fn of [translate, translateBestEffort]) {
    const tr = fn(en, loc);
    if (tr && tr !== en && !stillMostlyEnglish(en, tr)) return tr;
    if (tr && tr !== en && en.length < 48) return tr;
  }
  if (fromPool && fromPool !== en) return fromPool;
  const tr = translateBestEffort(en, loc);
  return tr && tr !== en ? tr : null;
}

function expand(row) {
  return {
    af: row.af,
    zu: row.zu,
    xh: row.xh || row.zu,
    st: row.st,
    nso: row.nso || row.st,
    tn: row.tn || row.st,
    ts: row.ts,
    ve: row.ve || row.ts,
    ss: row.ss || row.zu,
  };
}

function cellBad(en, val) {
  return !val || !String(val).trim() || val === en;
}

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

const pool = loadPool();
const map = JSON.parse(fs.readFileSync(dest, "utf8"));
let fixed = 0;

for (const [enVal, row] of Object.entries(map)) {
  if (isIdentity(enVal)) continue;
  const paths = valueToPaths.get(enVal) || [];
  const next = { ...row };
  for (const loc of SA) {
    if (!cellBad(enVal, next[loc])) continue;
    const tr = trySmart(enVal, loc, pool[enVal], localeTrees[loc], paths);
    if (tr) {
      next[loc] = tr;
      fixed += 1;
    }
  }
  map[enVal] = expand(next);
}

for (const [enVal, row] of Object.entries(map)) {
  if (isIdentity(enVal)) continue;
  const fb = { xh: row.zu, ss: row.zu, nso: row.st, tn: row.st, ve: row.ts };
  for (const [loc, val] of Object.entries(fb)) {
    if (cellBad(enVal, row[loc]) && val && !cellBad(enVal, val)) {
      row[loc] = val;
      fixed += 1;
    }
  }
}

fs.writeFileSync(dest, JSON.stringify(map, null, 2) + "\n");

let bad = 0;
for (const [en, row] of Object.entries(map)) {
  if (isIdentity(en)) continue;
  for (const loc of SA) {
    if (cellBad(en, row[loc])) bad += 1;
  }
}
console.log(`${mapFile}: fixed ${fixed}, same-as-en cells left: ${bad}`);
