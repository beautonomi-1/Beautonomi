#!/usr/bin/env node
/**
 * Finalize t-sa-mobile-2.json: merge machine rows + glossary/pattern + m1 lexicon.
 */
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
const built = JSON.parse(fs.readFileSync(path.join(root, "_maps/t-sa-mobile-2.built.json"), "utf8"));
const partial = fs.existsSync(path.join(root, "_maps/t-sa-mobile-2.json"))
  ? JSON.parse(fs.readFileSync(path.join(root, "_maps/t-sa-mobile-2.json"), "utf8"))
  : {};

const PHRASE = new Map();
for (const [en, row] of Object.entries(m1)) PHRASE.set(en, row);
for (const [en, row] of EXTRA_EXACT) PHRASE.set(en, row);
for (const [phrase, row] of GLOSSARY) {
  if (phrase.length <= 48 && !PHRASE.has(phrase)) PHRASE.set(phrase, row);
}

const WORD = new Map();
for (const [en, row] of PHRASE) {
  if (/^[A-Za-z][a-zA-Z0-9 /-]{0,24}$/.test(en)) WORD.set(en.toLowerCase(), row);
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

function translateToken(token, locale) {
  if (!token || /^\s+$/.test(token)) return token;
  const low = token.toLowerCase();
  const hit = WORD.get(low);
  if (hit?.[locale]) return hit[locale];
  const be = translateBestEffort(token, locale);
  return be !== token ? be : token;
}

function smart(en, locale) {
  if (PHRASE.has(en)) return PHRASE.get(en)[locale] || en;
  const gloss = applyGlossary(en, locale);
  if (gloss !== en) return gloss;
  const be = translateBestEffort(en, locale);
  if (be !== en) return be;
  // Title-case word swap
  const parts = en.split(/(\s+|[^\w\s]+|\{\{\w+\}\})/);
  const out = parts
    .map((p) => {
      if (!p || /^\s+$/.test(p) || /^\{\{\w+\}\}$/.test(p) || /^[^\w\s]+$/.test(p)) return p;
      return translateToken(p, locale);
    })
    .join("");
  return out !== en ? out : en;
}

function goodRow(en, row) {
  if (!row) return false;
  return SA.filter((l) => typeof row[l] === "string" && row[l] !== en).length >= 5;
}

const arr = JSON.parse(
  fs.readFileSync(path.join(root, "_work/mobile-sa-unique-en.json"), "utf8"),
).slice(400, 800);

const out = {};
for (const enVal of arr) {
  if (isIdentity(enVal)) continue;
  const row = {};
  const pref = goodRow(enVal, partial[enVal])
    ? partial[enVal]
    : goodRow(enVal, built[enVal])
      ? built[enVal]
      : null;
  for (const loc of SA) {
    const pv = pref?.[loc];
    if (typeof pv === "string" && pv !== enVal) row[loc] = pv;
    else {
      const s = smart(enVal, loc);
      row[loc] = s;
    }
  }
  out[enVal] = row;
}

const dest = path.join(root, "_maps/t-sa-mobile-2.json");
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");

let allEn = 0;
for (const [en, row] of Object.entries(out)) {
  if (SA.every((l) => row[l] === en)) allEn++;
}
console.log(`Wrote ${Object.keys(out).length} keys; all-English rows: ${allEn}`);
