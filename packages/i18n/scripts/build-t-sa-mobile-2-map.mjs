#!/usr/bin/env node
/**
 * Build _maps/t-sa-mobile-2.json (indices 400–799 of mobile-sa-unique-en.json).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXTRA_EXACT, GLOSSARY } from "./_wave-a-lexicon.mjs";
import { isIdentity, loadSaExternalMaps } from "./_wave-a-translate.mjs";
import { MOBILE2_PATCH } from "./_mobile-2-patch.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];

loadSaExternalMaps(path.join(root, "_maps"), fs, path);

const m1 = JSON.parse(fs.readFileSync(path.join(root, "_maps/t-sa-mobile-1.json"), "utf8"));
const EXACT = new Map();

for (const [en, row] of Object.entries(m1)) {
  EXACT.set(en, row);
}
for (const [en, row] of EXTRA_EXACT) {
  if (!EXACT.has(en)) EXACT.set(en, row);
}
for (const [en, row] of Object.entries(MOBILE2_PATCH)) {
  EXACT.set(en, row);
}

const GLOSS = [...GLOSSARY].sort((a, b) => b[0].length - a[0].length);
const BRANDS = [
  "Beautonomi",
  "Mailchimp",
  "Yoco",
  "WhatsApp",
  "Apple",
  "Google",
  "COVID",
  "South Africa",
  "Web POS",
  "Partner EULA",
  "Express Links",
  "Fee Calculator",
  "SMS",
  "VAT",
  "PAYE",
  "API",
  "PIN",
  "CPC",
  "EULA",
  "JSON",
  "QR",
  "SKU",
  "GRP",
  "UUID",
  "YYYY-MM-DD",
  "Nolo",
  "Thandi",
  "SAVE20",
  "AB12CD34",
];

function restorePunct(src, dest) {
  if (!dest) return dest;
  let out = dest;
  if (/[.…]$/.test(src) && !/[.…]$/.test(out)) {
    out += src.endsWith("...") ? "..." : src.endsWith("…") ? "…" : ".";
  }
  if (src.endsWith("?") && !out.endsWith("?")) out += "?";
  if (src.endsWith("!") && !out.endsWith("!")) out += "!";
  return out;
}

function applyGlossary(en, locale) {
  const locks = [];
  const lock = (text) => {
    const i = locks.length;
    locks.push(text);
    return `\uE000${i}\uE001`;
  };
  let out = en.replace(/\{\{(\w+)\}\}/g, (m) => lock(m));
  for (const brand of BRANDS) {
    if (brand && out.includes(brand)) out = out.split(brand).join(lock(brand));
  }
  for (const [phrase, row] of GLOSS) {
    const dest = row[locale];
    if (!dest || !phrase) continue;
    if (out.includes(phrase)) out = out.split(phrase).join(lock(dest));
  }
  out = out.replace(/\uE000(\d+)\uE001/g, (_, i) => locks[Number(i)]);
  return out;
}

function frag(en, locale) {
  if (EXACT.has(en)) return EXACT.get(en)[locale];
  return applyGlossary(en, locale);
}

const WRAP = {
  no: {
    af: (x) => `Geen ${x} nie`,
    zu: (x) => `Akukho ${x}`,
    xh: (x) => `Akukho ${x}`,
    st: (x) => `Ha ho ${x}`,
    nso: (x) => `Ga go na ${x}`,
    tn: (x) => `Ga go na ${x}`,
    ts: (x) => `A ku na ${x}`,
    ve: (x) => `A huna ${x}`,
    ss: (x) => `Awekho ${x}`,
  },
  mark: {
    af: (x) => `Merk ${x}`,
    zu: (x) => `Maka ${x}`,
    xh: (x) => `Maka ${x}`,
    st: (x) => `Tshwaya ${x}`,
    nso: (x) => `Tshwaya ${x}`,
    tn: (x) => `Tshwaya ${x}`,
    ts: (x) => `Naka ${x}`,
    ve: (x) => `Tshaya ${x}`,
    ss: (x) => `Maka ${x}`,
  },
  goTo: {
    af: (x) => `Gaan na ${x}`,
    zu: (x) => `Iya ku-${x}`,
    xh: (x) => `Yiya ku-${x}`,
    st: (x) => `Eya ho ${x}`,
    nso: (x) => `Eya go ${x}`,
    tn: (x) => `Eya go ${x}`,
    ts: (x) => `Yiya eka ${x}`,
    ve: (x) => `Fhedzisela kha ${x}`,
    ss: (x) => `Yiya ku-${x}`,
  },
  join: {
    af: (x) => `Sluit aan by ${x}`,
    zu: (x) => `Joyina ${x}`,
    xh: (x) => `Joyina ${x}`,
    st: (x) => `Kena ho ${x}`,
    nso: (x) => `Tsena go ${x}`,
    tn: (x) => `Tsena go ${x}`,
    ts: (x) => `Joyina ${x}`,
    ve: (x) => `Dzhenani kha ${x}`,
    ss: (x) => `Joyina ${x}`,
  },
  pay: {
    af: (x) => `Betaal ${x}`,
    zu: (x) => `Khokha ${x}`,
    xh: (x) => `Bhatala ${x}`,
    st: (x) => `Lefa ${x}`,
    nso: (x) => `Efa ${x}`,
    tn: (x) => `Efa ${x}`,
    ts: (x) => `Hakela ${x}`,
    ve: (x) => `Lefa ${x}`,
    ss: (x) => `Khokha ${x}`,
  },
  due: {
    af: (x) => `Verskuldig ${x}`,
    zu: (x) => `Kufanele ${x}`,
    xh: (x) => `Kufuneka ${x}`,
    st: (x) => `E loketse ${x}`,
    nso: (x) => `E swanetše ${x}`,
    tn: (x) => `E tshwanetse ${x}`,
    ts: (x) => `Swi fanele ${x}`,
    ve: (x) => `Zwi tea ${x}`,
    ss: (x) => `Kufanele ${x}`,
  },
  loading: {
    af: (x) => `${x}…`,
    zu: (x) => `${x}…`,
    xh: (x) => `${x}…`,
    st: (x) => `${x}…`,
    nso: (x) => `${x}…`,
    tn: (x) => `${x}…`,
    ts: (x) => `${x}…`,
    ve: (x) => `${x}…`,
    ss: (x) => `${x}…`,
  },
};

function applyPattern(en, locale) {
  const specs = [
    [/^No (.+?)\.$/, "no"],
    [/^No (.+)$/, "no"],
    [/^Mark (.+)$/, "mark"],
    [/^Go to (.+)$/, "goTo"],
    [/^Join (.+)$/, "join"],
    [/^Pay (.+)$/, "pay"],
    [/^Due: (.+)$/, "due"],
    [/^Due (.+)$/, "due"],
    [/^(.+)…$/, "loading"],
    [/^(.+)\.\.\.$/, "loading"],
  ];
  for (const [re, key] of specs) {
    const m = en.match(re);
    if (!m) continue;
    const inner = frag(m[1], locale);
    if (!inner || inner === m[1]) continue;
    const wrapped = WRAP[key][locale](inner);
    return restorePunct(en, wrapped);
  }
  return null;
}

function translateOne(en, locale) {
  if (EXACT.has(en)) return EXACT.get(en)[locale];
  const pat = applyPattern(en, locale);
  if (pat && pat !== en) return restorePunct(en, pat);
  const gloss = applyGlossary(en, locale);
  if (gloss !== en) return restorePunct(en, gloss);
  return en;
}

const arr = JSON.parse(
  fs.readFileSync(path.join(root, "_work/mobile-sa-unique-en.json"), "utf8"),
).slice(400, 800);

const out = {};
for (const enVal of arr) {
  if (isIdentity(enVal)) continue;
  const row = {};
  for (const loc of SA) row[loc] = translateOne(enVal, loc);
  out[enVal] = row;
}

const dest = path.join(root, "_maps/t-sa-mobile-2.json");
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");

let allEn = 0;
for (const row of Object.values(out)) {
  if (SA.every((l) => row[l] === Object.keys(out).find((k) => out[k] === row))) {
    /* skip */
  }
}
for (const [en, row] of Object.entries(out)) {
  if (SA.every((l) => row[l] === en)) allEn++;
}

console.log(`Wrote ${Object.keys(out).length} keys → ${dest}`);
console.log(`Still all-English rows: ${allEn}`);
