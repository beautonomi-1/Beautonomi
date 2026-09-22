#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isIdentity } from "./_wave-a-translate.mjs";

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
  "Formaldehyde",
  "National ID",
  "SMS & WhatsApp",
  "PAYE / Tax",
  "VAT / Tax ID",
  "VAT Collected",
  "VAT Registered",
  "Conv. Rate",
  "Median LTV",
  "CPC budget",
  "AI studio",
  "PIN Clock",
  "Avg Perms",
  "April 1, 2024",
  "whsec_...",
  "xxxxx-us1",
  "pk_live_...",
  "sk_live_...",
  "SG.xxxxx...",
  "4XXXXXXXXX",
  "YYYY-MM-DD",
  "uuid, uuid, …",
  "is_active true",
  "Pasted QR JSON",
  "https://…",
  "https://...",
  "your-salon",
];

function lockTokens(text) {
  const locks = [];
  const lock = (t) => {
    locks.push(t);
    return `\uE000${locks.length - 1}\uE001`;
  };
  let out = text;
  out = out.replace(/\{\{(\w+)\}\}/g, (m) => lock(m));
  for (const t of BRANDS) {
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
  const url =
    "https://api.mymemory.translated.net/get?q=" +
    encodeURIComponent(text) +
    "&langpair=en|" +
    encodeURIComponent(tl);
  for (let i = 0; i < 6; i++) {
    const res = await fetch(url);
    const data = await res.json();
    if (data.responseStatus === 429 || data.quotaFinished) {
      await sleep(15000 * (i + 1));
      continue;
    }
    if (data.responseStatus === 200 && data.responseData?.translatedText) {
      return data.responseData.translatedText;
    }
    await sleep(3000);
  }
  throw new Error(`MyMemory failed ${tl}`);
}

async function translateLine(en, tl) {
  const { out, locks } = lockTokens(en);
  const tr = unlock(await mmTranslate(out, tl), locks);
  return tr;
}

const arr = JSON.parse(
  fs.readFileSync(path.join(root, "_work/mobile-sa-unique-en.json"), "utf8"),
).slice(400, 800);

const dest = path.join(root, "_maps/t-sa-mobile-2.json");
const map = fs.existsSync(dest) ? JSON.parse(fs.readFileSync(dest, "utf8")) : {};

for (const enVal of arr) {
  if (isIdentity(enVal)) continue;
  const existing = map[enVal];
  if (existing && SA.every(([loc]) => typeof existing[loc] === "string" && existing[loc].trim())) {
    continue;
  }
  const row = existing ? { ...existing } : {};
  for (const [loc, tl] of SA) {
    if (typeof row[loc] === "string" && row[loc].trim() && row[loc] !== enVal) continue;
    try {
      row[loc] = await translateLine(enVal, tl);
    } catch {
      const fb = tl === "tn" || tl === "nso" ? "st" : tl === "ve" ? "ts" : "zu";
      try {
        row[loc] = await translateLine(enVal, fb);
      } catch {
        row[loc] = row.zu || row.af || enVal;
      }
    }
    await sleep(600);
  }
  map[enVal] = row;
  if (Object.keys(map).length % 5 === 0) {
    fs.writeFileSync(dest, JSON.stringify(map, null, 2) + "\n");
    console.error(`Checkpoint ${Object.keys(map).length}/400`);
  }
}

fs.writeFileSync(dest, JSON.stringify(map, null, 2) + "\n");
console.log(`Wrote ${Object.keys(map).length} keys`);
