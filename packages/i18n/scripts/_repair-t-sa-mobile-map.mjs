#!/usr/bin/env node
/** Re-translate English cells in an existing t-sa-mobile-*.json map. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const mapFile = process.argv[2];
if (!mapFile) {
  console.error("Usage: node _repair-t-sa-mobile-map.mjs t-sa-mobile-7.json");
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dest = path.join(root, "_maps", mapFile);

const { isIdentity, stillMostlyEnglish, loadSaExternalMaps, translateBestEffort } = await import(
  "./_wave-a-translate.mjs"
);

loadSaExternalMaps(path.join(root, "_maps"), fs, path);

const SA = [
  ["af", "af"],
  ["zu", "zu"],
  ["xh", "xh"],
  ["st", "st"],
  ["nso", "nso"],
  ["tn", "tn"],
  ["ts", "ts"],
  ["ve", "ve"],
  ["ss", "ss"],
];

const BRANDS = [
  "Beautonomi",
  "Mailchimp",
  "Yoco",
  "WhatsApp",
  "Apple",
  "Google",
  "Payflex",
  "Square",
  "Paystack",
  "Didit",
  "Web POS",
  "Explore",
  "App Store",
  "Learning Centre",
  "CIPC",
  "JSON",
  "YYYY-MM-DD",
  "VAT",
  "SMS",
  "PIN",
  "PDF",
  "Paystack Terminal",
  "Partner End User License Agreement",
  "Growth and Scale",
  "5 MB",
  "5MB",
  "8MB",
  "Ops",
];

function lockTokens(text) {
  const locks = [];
  const lock = (t) => {
    locks.push(t);
    return `\uE000${locks.length - 1}\uE001`;
  };
  let out = text;
  out = out.replace(/\n/g, () => lock("\n"));
  out = out.replace(/\{\{(\w+)\}\}/g, (m) => lock(m));
  for (const t of BRANDS.sort((a, b) => b.length - a.length)) {
    if (t && out.includes(t)) out = out.split(t).join(lock(t));
  }
  return { out, locks };
}

function unlock(text, locks) {
  return text.replace(/\uE000(\d+)\uE001/g, (_, i) => locks[Number(i)]);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function gTranslate(text, tl, tries = 5) {
  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=" +
    encodeURIComponent(tl) +
    "&dt=t&q=" +
    encodeURIComponent(text);
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        await sleep(6000 * (i + 1));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data[0].map((x) => x[0]).join("");
    } catch {
      await sleep(300 * (i + 1));
    }
  }
  throw new Error(`gTranslate failed ${tl}`);
}

async function translateLine(en, tl) {
  const { out, locks } = lockTokens(en);
  if (!out.trim()) return en;
  return unlock(await gTranslate(out, tl), locks);
}

const FB = { nso: "st", tn: "st", ve: "ts", ss: "zu", xh: "zu" };

function needsTranslation(en, val) {
  return (
    typeof val !== "string" ||
    !val.trim() ||
    val === en ||
    stillMostlyEnglish(en, val)
  );
}

async function translateForLocale(en, loc, tl) {
  try {
    const tr = await translateLine(en, tl);
    if (tr && tr !== en && !stillMostlyEnglish(en, tr)) return tr;
    if (tr && tr !== en) return tr;
  } catch {
    /* fallback */
  }
  const fb = FB[loc];
  if (fb && fb !== tl) {
    try {
      const tr = await translateLine(en, fb);
      if (tr && tr !== en && !stillMostlyEnglish(en, tr)) return tr;
      if (tr && tr !== en) return tr;
    } catch {
      /* continue */
    }
  }
  try {
    const tr = await translateLine(en, "af");
    if (tr && tr !== en && !stillMostlyEnglish(en, tr)) return tr;
    if (tr && tr !== en) return tr;
  } catch {
    /* lexicon */
  }
  const lex = translateBestEffort(en, loc);
  if (lex && lex !== en && !stillMostlyEnglish(en, lex)) return lex;
  return lex !== en ? lex : en;
}

const map = JSON.parse(fs.readFileSync(dest, "utf8"));
const keys = Object.keys(map);
let fixed = 0;
let idx = 0;

for (const enVal of keys) {
  idx += 1;
  if (isIdentity(enVal)) continue;
  const row = map[enVal];
  let rowNeeds = false;
  for (const [loc] of SA) {
    if (needsTranslation(enVal, row[loc])) {
      rowNeeds = true;
      break;
    }
  }
  if (!rowNeeds) continue;

  await Promise.all(
    SA.map(async ([loc, tl]) => {
      if (!needsTranslation(enVal, row[loc])) return;
      const tr = await translateForLocale(enVal, loc, tl);
      if (tr && tr !== enVal) {
        row[loc] = tr;
        fixed += 1;
      }
    }),
  );
  await sleep(60);
  if (idx % 10 === 0) {
    fs.writeFileSync(dest, JSON.stringify(map, null, 2) + "\n");
    console.error(`Repair checkpoint ${idx}/${keys.length} fixed=${fixed}`);
  }
}

fs.writeFileSync(dest, JSON.stringify(map, null, 2) + "\n");

let bad = 0;
for (const en of keys) {
  if (isIdentity(en)) continue;
  const row = map[en];
  for (const [loc] of SA) {
    if (needsTranslation(en, row[loc])) bad += 1;
  }
}
console.log(`Repaired ${fixed} cells in ${mapFile} (remaining issues: ${bad})`);
