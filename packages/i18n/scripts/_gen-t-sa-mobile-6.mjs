#!/usr/bin/env node
/**
 * Generate _maps/t-sa-mobile-6.json — first 350 strings from mobile-sa-missing-en.json.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isIdentity, stillMostlyEnglish } from "./_wave-a-translate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const SA = [
  ["af", "af"],
  ["zu", "zu-ZA"],
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
  "WiseCashier",
  "Web POS",
  "Explore",
  "App Store",
  "Google Play",
  "Learning Centre",
  "CIPC",
  "JSON",
  "YYYY-MM-DD",
  "VAT",
  "SMS",
  "PIN",
  "PDF",
  "KYC",
  "ETA",
  "CPC",
  "QR",
  "Face ID",
  "http://",
  "https://",
  "Partner End User License Agreement",
  "Growth and Scale",
  "112",
  "8MB",
  "5MB",
  "5 MB",
  "Payflex",
  "JPEG",
  "PNG",
  "WebP",
  "GIF",
  "JPG",
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

async function mmTranslate(text, tl) {
  const langpair = tl.includes("-") ? `en|${tl}` : `en|${tl}`;
  const url =
    "https://api.mymemory.translated.net/get?q=" +
    encodeURIComponent(text) +
    "&langpair=" +
    encodeURIComponent(langpair);
  for (let i = 0; i < 8; i++) {
    const res = await fetch(url);
    const data = await res.json();
    if (data.responseStatus === 429 || data.quotaFinished) {
      await sleep(12000 * (i + 1));
      continue;
    }
    if (data.responseStatus === 200 && data.responseData?.translatedText) {
      return data.responseData.translatedText;
    }
    await sleep(2500);
  }
  throw new Error(`MyMemory failed ${tl}`);
}

async function translateLine(en, tl) {
  const { out, locks } = lockTokens(en);
  const tr = unlock(await mmTranslate(out, tl), locks);
  return tr;
}

const FB = {
  nso: "st",
  tn: "st",
  ve: "ts",
  ss: "zu",
  xh: "zu",
};

async function translateForLocale(en, loc, tl) {
  try {
    const tr = await translateLine(en, tl);
    if (tr && tr !== en && !stillMostlyEnglish(en, tr)) return tr;
  } catch {
    /* fallback below */
  }
  const fb = FB[loc];
  if (fb) {
    try {
      const tr = await translateLine(en, fb);
      if (tr && tr !== en && !stillMostlyEnglish(en, tr)) return tr;
      if (tr && tr !== en) return tr;
    } catch {
      /* continue */
    }
  }
  try {
    return await translateLine(en, "af");
  } catch {
    return en;
  }
}

const list = JSON.parse(
  fs.readFileSync(path.join(root, "_work/mobile-sa-missing-en.json"), "utf8"),
).slice(0, 350);

const dest = path.join(root, "_maps/t-sa-mobile-6.json");
const map = fs.existsSync(dest) ? JSON.parse(fs.readFileSync(dest, "utf8")) : {};

let idx = 0;
for (const enVal of list) {
  idx += 1;
  if (isIdentity(enVal)) continue;
  const existing = map[enVal];
  if (
    existing &&
    SA.every(([loc]) => typeof existing[loc] === "string" && existing[loc].trim() && existing[loc] !== enVal)
  ) {
    continue;
  }
  const row = existing ? { ...existing } : {};
  for (const [loc, tl] of SA) {
    if (
      typeof row[loc] === "string" &&
      row[loc].trim() &&
      row[loc] !== enVal &&
      !stillMostlyEnglish(enVal, row[loc])
    ) {
      continue;
    }
    row[loc] = await translateForLocale(enVal, loc, tl);
    await sleep(300);
  }
  map[enVal] = row;
  if (idx % 5 === 0) {
    fs.writeFileSync(dest, JSON.stringify(map, null, 2) + "\n");
    console.error(`Checkpoint ${idx}/350 keys=${Object.keys(map).length}`);
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
    if (!row[loc] || row[loc] === en || stillMostlyEnglish(en, row[loc])) bad += 1;
  }
}
console.log(`Wrote ${Object.keys(map).length} keys → ${dest} (calque/locale issues: ${bad})`);
