#!/usr/bin/env node
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
const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];

loadSaExternalMaps(path.join(root, "_maps"), fs, path);

function loadPool() {
  const pool = {};
  for (const f of fs.readdirSync(path.join(root, "_maps"))) {
    if (!/^t-sa-mobile-\d+\.json$/.test(f)) continue;
    if (f === "t-sa-mobile-17.json") continue;
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
    if (loc === "zu" && tr && tr !== en) return tr;
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

function buildMap(list, pool) {
  const map = {};
  for (const enVal of list) {
    const row = {};
    for (const loc of SA) {
      row[loc] = isIdentity(enVal) ? enVal : smart(enVal, loc, pool[enVal]);
    }
    map[enVal] = expand(row);
  }
  return map;
}

const list = JSON.parse(
  fs.readFileSync(path.join(root, "_work/mobile-sa-missing-en.json"), "utf8"),
);
const pool = loadPool();
const map = buildMap(list, pool);
const dest = path.join(root, "_maps", "t-sa-mobile-17.json");
fs.writeFileSync(dest, JSON.stringify(map, null, 2) + "\n");
console.log(`t-sa-mobile-17.json: ${Object.keys(map).length} keys`);
