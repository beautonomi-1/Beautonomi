#!/usr/bin/env node
/**
 * When zu fails stillMostlyEnglish, rewrite the full row for all 9 SA locales (local engine).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXTRA_EXACT, GLOSSARY } from "./_wave-a-lexicon.mjs";
import {
  isIdentity,
  stillMostlyEnglish,
  translate,
  translateBestEffort,
} from "./_wave-a-translate.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];

const GLOSS = [...GLOSSARY].sort((a, b) => b[0].length - a[0].length);

function applyGlossary(en, locale) {
  const locks = [];
  const lock = (t) => {
    locks.push(t);
    return `\uE000${locks.length - 1}\uE001`;
  };
  let out = en.replace(/\{\{(\w+)\}\}/g, (m) => lock(m));
  for (const [phrase, row] of GLOSS) {
    const dest = row[locale];
    if (!dest || !phrase) continue;
    if (out.includes(phrase)) out = out.split(phrase).join(lock(dest));
  }
  return out.replace(/\uE000(\d+)\uE001/g, (_, i) => locks[Number(i)]);
}

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

const enTree = JSON.parse(fs.readFileSync(path.join(root, "src/locales/en.json"), "utf8"));
const enFlat = flatten(enTree);
const valueToPaths = new Map();
for (const [p, v] of enFlat) {
  if (!valueToPaths.has(v)) valueToPaths.set(v, []);
  valueToPaths.get(v).push(p);
}

const localeTrees = {};
for (const loc of SA) {
  localeTrees[loc] = JSON.parse(
    fs.readFileSync(path.join(root, "src/locales", `${loc}.json`), "utf8"),
  );
}

function loadGoodPool() {
  const pool = {};
  for (const f of fs.readdirSync(path.join(root, "_maps"))) {
    if (!f.startsWith("t-sa-mobile-") || !f.endsWith(".json") || f.includes(".built.")) continue;
    const j = JSON.parse(fs.readFileSync(path.join(root, "_maps", f), "utf8"));
    for (const [en, row] of Object.entries(j)) {
      if (!row || typeof row !== "object") continue;
      if (!pool[en]) pool[en] = {};
      for (const loc of SA) {
        const v = row[loc];
        if (typeof v === "string" && v.trim() && v !== en && !stillMostlyEnglish(en, v)) {
          pool[en][loc] = v;
        }
      }
    }
  }
  for (const [en, row] of EXTRA_EXACT) {
    if (!pool[en]) pool[en] = {};
    for (const loc of SA) {
      const v = row[loc];
      if (typeof v === "string" && v.trim() && v !== en && !stillMostlyEnglish(en, v)) {
        pool[en][loc] = v;
      }
    }
  }
  return pool;
}

function smart(en, loc, poolRow) {
  for (const p of valueToPaths.get(en) || []) {
    const v = getAt(localeTrees[loc], p);
    if (v && v !== en && !stillMostlyEnglish(en, v)) return v;
  }
  const fromPool = poolRow?.[loc];
  if (fromPool) return fromPool;
  for (const fn of [translate, translateBestEffort]) {
    const tr = fn(en, loc);
    if (tr && tr !== en && !stillMostlyEnglish(en, tr)) return tr;
  }
  const gloss = applyGlossary(en, loc);
  if (gloss !== en && !stillMostlyEnglish(en, gloss)) return gloss;
  const be = translateBestEffort(en, loc);
  if (be && be !== en) return be;
  return fromPool || gloss !== en ? gloss : en;
}

function zuRowBad(en, row) {
  const zu = row.zu;
  return !zu || zu === en || stillMostlyEnglish(en, zu);
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

const pool = loadGoodPool();
const mapFiles = fs
  .readdirSync(path.join(root, "_maps"))
  .filter(
    (f) =>
      f.startsWith("t-sa-mobile-") &&
      f.endsWith(".json") &&
      !f.includes(".built.") &&
      f !== "t-sa-mobile-refined.json" &&
      f !== "t-sa-mobile-auto.json",
  )
  .sort();

let totalRows = 0;
let totalFixed = 0;

for (const mapFile of mapFiles) {
  const dest = path.join(root, "_maps", mapFile);
  const map = JSON.parse(fs.readFileSync(dest, "utf8"));
  let fileRows = 0;
  let fileFixed = 0;

  for (const [enVal, row] of Object.entries(map)) {
    if (isIdentity(enVal)) continue;
    if (!zuRowBad(enVal, row)) continue;
    fileRows += 1;
    const next = {};
    for (const loc of SA) {
      const tr = smart(enVal, loc, pool[enVal]);
      next[loc] = tr;
      if (tr && tr !== enVal && !stillMostlyEnglish(enVal, tr)) fileFixed += 1;
    }
    map[enVal] = expand(next);
  }

  fs.writeFileSync(dest, JSON.stringify(map, null, 2) + "\n");
  let badZu = 0;
  for (const [en, row] of Object.entries(map)) {
    if (isIdentity(en)) continue;
    if (zuRowBad(en, row)) badZu += 1;
  }
  totalRows += fileRows;
  totalFixed += fileFixed;
  console.log(`${mapFile}: rewrote ${fileRows} rows, zu-bad left: ${badZu}`);
}

console.log({ totalRows, totalFixed, mapFiles: mapFiles.length });
