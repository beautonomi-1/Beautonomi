#!/usr/bin/env node
/**
 * Generate _maps/t-sa-mobile-{N}.json from mobile-sa-missing-en.json slice.
 * Usage: node _gen-t-sa-mobile-batch.mjs <N> <start> <end>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isIdentity,
  loadSaExternalMaps,
  stillMostlyEnglish,
  translateBestEffort,
} from "./_wave-a-translate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const batchNum = process.argv[2];
const start = Number(process.argv[3] ?? 0);
const end = Number(process.argv[4] ?? 350);
if (!batchNum) {
  console.error("Usage: node _gen-t-sa-mobile-batch.mjs <N> <start> <end>");
  process.exit(1);
}

const destName = `t-sa-mobile-${batchNum}.json`;
const dest = path.join(root, "_maps", destName);

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

function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    sleep(ms).then(() => {
      throw new Error("timeout");
    }),
  ]).catch(() => fallback);
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
  const tryLine = (lang) => withTimeout(translateLine(en, lang), 25000, en);
  try {
    const tr = await tryLine(tl);
    if (tr && tr !== en && !stillMostlyEnglish(en, tr)) return tr;
    if (tr && tr !== en) return tr;
  } catch {
    /* fallback */
  }
  const fb = FB[loc];
  if (fb && fb !== tl) {
    try {
      const tr = await tryLine(fb);
      if (tr && tr !== en && !stillMostlyEnglish(en, tr)) return tr;
      if (tr && tr !== en) return tr;
    } catch {
      /* continue */
    }
  }
  try {
    const tr = await tryLine("af");
    if (tr && tr !== en && !stillMostlyEnglish(en, tr)) return tr;
    if (tr && tr !== en) return tr;
  } catch {
    /* lexicon */
  }
  const lex = translateBestEffort(en, loc);
  if (lex && lex !== en && !stillMostlyEnglish(en, lex)) return lex;
  return lex !== en ? lex : en;
}

loadSaExternalMaps(path.join(root, "_maps"), fs, path);

function loadMergedMaps() {
  const maps = {};
  for (const f of fs.readdirSync(path.join(root, "_maps"))) {
    if (f === destName) continue;
    if (f.startsWith("t-sa-mobile-") && f.endsWith(".json") && !f.includes(".built.")) {
      Object.assign(maps, JSON.parse(fs.readFileSync(path.join(root, "_maps", f), "utf8")));
    }
  }
  return maps;
}

const missing = JSON.parse(
  fs.readFileSync(path.join(root, "_work/mobile-sa-missing-en.json"), "utf8"),
);
const covered = loadMergedMaps();
const list = missing.slice(start, end);

const map = fs.existsSync(dest) ? JSON.parse(fs.readFileSync(dest, "utf8")) : {};

let idx = 0;
for (const enVal of list) {
  idx += 1;
  if (isIdentity(enVal)) continue;
  const fromMaps = covered[enVal];
  const existing = map[enVal];
  const row = { ...(fromMaps || {}), ...(existing || {}) };
  let needs = false;
  for (const [loc] of SA) {
    if (!needsTranslation(enVal, row[loc])) continue;
    needs = true;
    break;
  }
  if (!needs) {
    map[enVal] = row;
    continue;
  }
  await Promise.all(
    SA.map(async ([loc, tl]) => {
      if (!needsTranslation(enVal, row[loc])) return;
      row[loc] = await translateForLocale(enVal, loc, tl);
    }),
  );
  map[enVal] = row;
  await sleep(80);
  if (idx % 10 === 0) {
    fs.writeFileSync(dest, JSON.stringify(map, null, 2) + "\n");
    console.error(`Checkpoint ${idx}/${list.length} keys=${Object.keys(map).length}`);
  }
}

fs.writeFileSync(dest, JSON.stringify(map, null, 2) + "\n");

let bad = 0;
for (const en of list) {
  if (isIdentity(en)) continue;
  const row = map[en];
  if (!row) {
    bad += 1;
    continue;
  }
  for (const [loc] of SA) {
    if (needsTranslation(en, row[loc])) bad += 1;
  }
}
console.log(`Wrote ${Object.keys(map).length} keys → ${dest} (locale issues: ${bad})`);
