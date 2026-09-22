#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXTRA_EXACT, GLOSSARY } from "./_wave-a-lexicon.mjs";
import {
  isIdentity,
  loadSaExternalMaps,
  stillMostlyEnglish,
  translate,
  translateBestEffort,
} from "./_wave-a-translate.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];
const TARGETS = ["t-sa-mobile-12.json", "t-sa-mobile-13.json", "t-sa-mobile-14.json", "t-sa-mobile-15.json"];

loadSaExternalMaps(path.join(root, "_maps"), fs, path);

const GLOSS = [...GLOSSARY].sort((a, b) => b[0].length - a[0].length);

function applyGlossary(en, locale) {
  const locks = [];
  const lock = (t) => {
    locks.push(t);
    return `\uE000${locks.length - 1}\uE001`;
  };
  let out = en.replace(/\{\{(\w+)\}\}/g, (m) => lock(m));
  for (const brand of ["Beautonomi", "Paystack", "Yoco", "Facebook", "Google", "Apple", "WhatsApp"]) {
    if (out.includes(brand)) out = out.split(brand).join(lock(brand));
  }
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
    if (TARGETS.includes(f)) continue;
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

function cellBad(en, val) {
  if (isIdentity(en)) return false;
  return !val || val === en || stillMostlyEnglish(en, val);
}

function smart(en, loc, poolRow) {
  for (const p of valueToPaths.get(en) || []) {
    const v = getAt(localeTrees[loc], p);
    if (v && v !== en && !stillMostlyEnglish(en, v)) return v;
  }
  const fromPool = poolRow?.[loc];
  if (fromPool && fromPool !== en && !stillMostlyEnglish(en, fromPool)) return fromPool;
  for (const fn of [translate, translateBestEffort]) {
    const tr = fn(en, loc);
    if (tr && tr !== en && !stillMostlyEnglish(en, tr)) return tr;
    if (tr && tr !== en && en.length < 36) return tr;
  }
  const gloss = applyGlossary(en, loc);
  if (gloss !== en && !stillMostlyEnglish(en, gloss)) return gloss;
  const be = translateBestEffort(en, loc);
  if (be && be !== en && !stillMostlyEnglish(en, be)) return be;
  if (be && be !== en && en.length < 36) return be;
  return fromPool || (gloss !== en ? gloss : en);
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

for (const mapFile of TARGETS) {
  const dest = path.join(root, "_maps", mapFile);
  const map = JSON.parse(fs.readFileSync(dest, "utf8"));
  let passes = 0;
  for (let pass = 0; pass < 3; pass++) {
    let fixed = 0;
    for (const [enVal, row] of Object.entries(map)) {
      if (isIdentity(enVal)) continue;
      const next = { ...row };
      let changed = false;
      for (const loc of SA) {
        if (!cellBad(enVal, next[loc])) continue;
        const tr = smart(enVal, loc, pool[enVal]);
        if (tr && tr !== next[loc]) {
          next[loc] = tr;
          changed = true;
          fixed += 1;
        }
      }
      if (changed) map[enVal] = expand(next);
    }
    passes = fixed;
    if (!fixed) break;
  }
  fs.writeFileSync(dest, JSON.stringify(map, null, 2) + "\n");
  let zuBad = 0;
  let anyBad = 0;
  for (const [en, row] of Object.entries(map)) {
    if (isIdentity(en)) continue;
    if (cellBad(en, row.zu)) zuBad += 1;
    for (const loc of SA) if (cellBad(en, row[loc])) anyBad += 1;
  }
  console.log(`${mapFile}: zu-bad ${zuBad}, total bad cells ${anyBad}, last pass fixed ${passes}`);
}
