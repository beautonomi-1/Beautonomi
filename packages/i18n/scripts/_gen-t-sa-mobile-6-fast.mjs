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
  "Mailchimp",
  "Google",
  "Apple",
  "Web POS",
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

async function gtxTranslate(text, tl) {
  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=" +
    encodeURIComponent(tl) +
    "&dt=t&q=" +
    encodeURIComponent(text);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data[0].map((x) => x[0]).join("");
}

async function translateLine(en, tl) {
  const { out, locks } = lockTokens(en);
  const tr = unlock(await gtxTranslate(out, tl), locks);
  return tr;
}

const FB = { nso: "st", tn: "st", ve: "ts", ss: "zu", xh: "zu" };

async function translateForLocale(en, loc, tl) {
  for (const tryTl of [tl, FB[loc], "af"].filter(Boolean)) {
    try {
      const tr = await translateLine(en, tryTl);
      if (tr && tr !== en && !stillMostlyEnglish(en, tr)) return tr;
      if (tr && tr !== en && en.length < 40) return tr;
    } catch {
      /* next */
    }
  }
  return en;
}

const list = JSON.parse(
  fs.readFileSync(path.join(root, "_work/mobile-sa-missing-en.json"), "utf8"),
).slice(0, 350);

const dest = path.join(root, "_maps/t-sa-mobile-6.json");
const map = fs.existsSync(dest) ? JSON.parse(fs.readFileSync(dest, "utf8")) : {};

for (let idx = 0; idx < list.length; idx++) {
  const enVal = list[idx];
  if (isIdentity(enVal)) continue;
  const existing = map[enVal];
  if (
    existing &&
    SA.every(([loc]) => typeof existing[loc] === "string" && existing[loc].trim() && existing[loc] !== enVal)
  ) {
    continue;
  }
  const row = existing ? { ...existing } : {};
  await Promise.all(
    SA.map(async ([loc, tl]) => {
      if (
        typeof row[loc] === "string" &&
        row[loc].trim() &&
        row[loc] !== enVal &&
        !stillMostlyEnglish(enVal, row[loc])
      ) {
        return;
      }
      row[loc] = await translateForLocale(enVal, loc, tl);
    }),
  );
  map[enVal] = row;
  if ((idx + 1) % 10 === 0) {
    fs.writeFileSync(dest, JSON.stringify(map, null, 2) + "\n");
    console.error(`Checkpoint ${idx + 1}/350 keys=${Object.keys(map).length}`);
  }
  await new Promise((r) => setTimeout(r, 120));
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
