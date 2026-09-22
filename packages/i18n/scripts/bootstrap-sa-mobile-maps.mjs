#!/usr/bin/env node
/**
 * Build/refine t-sa-mobile-*.json rows for leftover English strings (phrase + glossary).
 */
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];

loadSaExternalMaps(path.join(root, "_maps"), fs, path);

function loadMergedMaps() {
  const maps = {};
  for (const f of fs.readdirSync(path.join(root, "_maps"))) {
    if (f.startsWith("t-sa-mobile-") && f.endsWith(".json") && !f.includes(".built.")) {
      Object.assign(maps, JSON.parse(fs.readFileSync(path.join(root, "_maps", f), "utf8")));
    }
  }
  return maps;
}

const PHRASE = new Map();
for (const [en, row] of Object.entries(loadMergedMaps())) PHRASE.set(en, row);
for (const [en, row] of EXTRA_EXACT) PHRASE.set(en, row);
for (const [phrase, row] of GLOSSARY) {
  if (!PHRASE.has(phrase)) PHRASE.set(phrase, row);
}

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

function smart(en, locale) {
  const exact = PHRASE.get(en);
  if (exact?.[locale] && exact[locale] !== en && !stillMostlyEnglish(en, exact[locale])) {
    return exact[locale];
  }
  const strict = translate(en, locale);
  if (strict !== en && !stillMostlyEnglish(en, strict)) return strict;
  const gloss = applyGlossary(en, locale);
  if (gloss !== en && !stillMostlyEnglish(en, gloss)) return gloss;
  const be = translateBestEffort(en, locale);
  if (be !== en && !stillMostlyEnglish(en, be)) return be;
  return exact?.[locale] && exact[locale] !== en ? exact[locale] : en;
}

const listPath = path.join(root, "_work/mobile-leftover-en-now.json");
const strings = fs.existsSync(listPath)
  ? JSON.parse(fs.readFileSync(listPath, "utf8"))
  : JSON.parse(fs.readFileSync(path.join(root, "_work/mobile-sa-unique-en.json"), "utf8"));

const out = {};
let ok = 0;
let fail = 0;

for (const enVal of strings) {
  if (isIdentity(enVal)) continue;
  const row = {};
  for (const loc of SA) {
    row[loc] = smart(enVal, loc);
  }
  const any = SA.some((l) => row[l] !== enVal && !stillMostlyEnglish(enVal, row[l]));
  if (any) {
    out[enVal] = row;
    ok += 1;
  } else fail += 1;
}

const dest = path.join(root, "_maps/t-sa-mobile-refined.json");
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
console.log(`Wrote ${ok} refined rows (${fail} still English) → ${dest}`);
