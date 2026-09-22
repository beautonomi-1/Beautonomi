#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isIdentity, stillMostlyEnglish } from "./_wave-a-translate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

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
  "Paystack",
  "Paystack Terminal",
  "Paystack Terminals",
  "Paystack Virtual Terminal",
  "Yoco",
  "WhatsApp",
  "Instagram",
  "Didit",
  "WiseCashier",
  "Explore",
  "App Store",
  "Google Play",
  "Face ID",
  "Learning Centre",
  "CIPC",
  "KYC",
  "VAT",
  "SMS",
  "PIN",
  "PDF",
  "QR",
  "CPC",
  "ETA",
  "JSON",
  "JPEG",
  "PNG",
  "WebP",
  "GIF",
  "JPG",
  "http://",
  "https://",
  "5 MB",
  "5MB",
];

function lockTokens(text) {
  const locks = [];
  const lock = (t) => {
    locks.push(t);
    return `\uE000${locks.length - 1}\uE001`;
  };
  let out = text;
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

async function dictTranslate(text, tl) {
  const url =
    "https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=en&tl=" +
    encodeURIComponent(tl) +
    "&dt=t&q=" +
    encodeURIComponent(text);
  for (let i = 0; i < 6; i++) {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    if (res.status === 429) {
      await sleep(5000 * (i + 1));
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data[0].map((x) => x[0]).join("");
  }
  throw new Error("dict-chrome-ex failed");
}

async function translateLine(en, tl) {
  const { out, locks } = lockTokens(en);
  return unlock(await dictTranslate(out, tl), locks);
}

const FB = { nso: "st", tn: "st", ve: "ts", ss: "zu", xh: "zu" };

async function translateForLocale(en, loc, tl) {
  for (const tryTl of [tl, FB[loc], "af"].filter(Boolean)) {
    try {
      const tr = await translateLine(en, tryTl);
      if (tr && tr !== en) return tr;
    } catch {
      await sleep(1500);
    }
  }
  return null;
}

const list = JSON.parse(
  fs.readFileSync(path.join(root, "_work/mobile-sa-missing-en.json"), "utf8"),
).slice(0, 350);

const dest = path.join(root, "_maps/t-sa-mobile-6.json");
const map = JSON.parse(fs.readFileSync(dest, "utf8"));

let fixed = 0;
for (const enVal of list) {
  if (isIdentity(enVal)) continue;
  const row = map[enVal] || {};
  let changed = false;
  for (const [loc, tl] of SA) {
    const cur = row[loc];
    if (cur && cur !== enVal && !stillMostlyEnglish(enVal, cur)) continue;
    const tr = await translateForLocale(enVal, loc, tl);
    if (tr && tr !== enVal) {
      row[loc] = tr;
      fixed += 1;
      changed = true;
    }
    await sleep(280);
  }
  map[enVal] = row;
  if (changed) {
    fs.writeFileSync(dest, JSON.stringify(map, null, 2) + "\n");
    if (fixed % 45 === 0) console.error(`Fixed ${fixed} cells…`);
  }
}

fs.writeFileSync(dest, JSON.stringify(map, null, 2) + "\n");

let bad = 0;
for (const en of list) {
  if (isIdentity(en)) continue;
  const row = map[en];
  for (const [loc] of SA) {
    if (!row[loc] || row[loc] === en || stillMostlyEnglish(en, row[loc])) bad += 1;
  }
}
console.log(`Fixed ${fixed} cells. Remaining issues: ${bad}. Keys: ${Object.keys(map).length}`);
