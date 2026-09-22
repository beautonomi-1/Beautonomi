#!/usr/bin/env node
/**
 * Build t-sa-mobile batch using local phrase engine (no network).
 * Usage: node _gen-t-sa-mobile-batch-local.mjs <N> <start> <end>
 */
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const batchNum = process.argv[2];
const start = Number(process.argv[3] ?? 0);
const end = Number(process.argv[4] ?? 350);
if (!batchNum) {
  console.error("Usage: node _gen-t-sa-mobile-batch-local.mjs <N> <start> <end>");
  process.exit(1);
}

const destName = `t-sa-mobile-${batchNum}.json`;
const dest = path.join(root, "_maps", destName);
const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];

loadSaExternalMaps(path.join(root, "_maps"), fs, path);

function loadPool() {
  const pool = {};
  for (const f of fs.readdirSync(path.join(root, "_maps"))) {
    if (f === destName || !f.endsWith(".json")) continue;
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

function smart(en, loc, poolRow) {
  const fromPool = poolRow?.[loc];
  if (fromPool && fromPool !== en && !stillMostlyEnglish(en, fromPool)) return fromPool;
  for (const fn of [translate, translateBestEffort]) {
    const tr = fn(en, loc);
    if (tr && tr !== en && !stillMostlyEnglish(en, tr)) return tr;
    if (tr && tr !== en && en.length < 36) return tr;
  }
  if (fromPool && fromPool !== en) return fromPool;
  const tr = translateBestEffort(en, loc);
  return tr && tr !== en ? tr : fromPool || tr || en;
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

const missing = JSON.parse(
  fs.readFileSync(path.join(root, "_work/mobile-sa-missing-en.json"), "utf8"),
);
const list = missing.slice(start, end);
const pool = loadPool();
const map = {};

for (const enVal of list) {
  if (isIdentity(enVal)) continue;
  const row = {};
  for (const loc of SA) {
    row[loc] = smart(enVal, loc, pool[enVal]);
  }
  map[enVal] = expand(row);
}

fs.writeFileSync(dest, JSON.stringify(map, null, 2) + "\n");

let bad = 0;
let badKeys = 0;
for (const en of list) {
  if (isIdentity(en)) continue;
  const row = map[en];
  if (!row) continue;
  let keyBad = false;
  for (const loc of SA) {
    if (cellBad(en, row[loc])) {
      bad += 1;
      keyBad = true;
    }
  }
  if (keyBad) badKeys += 1;
}
console.log(`Wrote ${Object.keys(map).length} keys → ${dest}`);
console.log(`Identical-to-English cells: ${bad} (${badKeys} keys)`);
