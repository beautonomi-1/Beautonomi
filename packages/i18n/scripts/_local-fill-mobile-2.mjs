#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXTRA_EXACT, GLOSSARY } from "./_wave-a-lexicon.mjs";
import { isIdentity, loadSaExternalMaps, translateBestEffort } from "./_wave-a-translate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];

loadSaExternalMaps(path.join(root, "_maps"), fs, path);

const m1 = JSON.parse(fs.readFileSync(path.join(root, "_maps/t-sa-mobile-1.json"), "utf8"));
const PHRASE = new Map(Object.entries(m1));
for (const [en, row] of EXTRA_EXACT) PHRASE.set(en, row);
for (const [p, row] of GLOSSARY) PHRASE.set(p, row);

const GLOSS = [...GLOSSARY].sort((a, b) => b[0].length - a[0].length);

function gloss(en, locale) {
  const locks = [];
  const lock = (t) => {
    locks.push(t);
    return `\uE000${locks.length - 1}\uE001`;
  };
  let out = en.replace(/\{\{(\w+)\}\}/g, (m) => lock(m));
  for (const [phrase, row] of GLOSS) {
    const dest = row[locale];
    if (dest && out.includes(phrase)) out = out.split(phrase).join(lock(dest));
  }
  return out.replace(/\uE000(\d+)\uE001/g, (_, i) => locks[Number(i)]);
}

function tr(en, locale) {
  if (PHRASE.has(en)) return PHRASE.get(en)[locale] || en;
  let out = gloss(en, locale);
  if (out !== en) return out;
  out = translateBestEffort(en, locale);
  if (out !== en) return out;
  // token walk
  out = en.replace(/[A-Za-z]+/g, (w) => {
    const low = w.toLowerCase();
    for (const [k, row] of PHRASE) {
      if (k.toLowerCase() === low && row[locale] && row[locale] !== k) return row[locale];
    }
    const be = translateBestEffort(w, locale);
    return be !== w ? be : w;
  });
  return out;
}

const dest = path.join(root, "_maps/t-sa-mobile-2.json");
const map = JSON.parse(fs.readFileSync(dest, "utf8"));

for (const [en, row] of Object.entries(map)) {
  if (isIdentity(en)) continue;
  for (const loc of SA) {
    if (row[loc] === en) row[loc] = tr(en, loc);
  }
}

fs.writeFileSync(dest, JSON.stringify(map, null, 2) + "\n");
let allEn = 0;
for (const [en, row] of Object.entries(map)) {
  if (SA.every((l) => row[l] === en)) allEn++;
}
console.log(`Keys ${Object.keys(map).length}, all-English ${allEn}`);
