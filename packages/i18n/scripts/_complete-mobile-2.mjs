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

async function gTranslate(text, tl) {
  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=" +
    encodeURIComponent(tl) +
    "&dt=t&q=" +
    encodeURIComponent(text);
  for (let i = 0; i < 12; i++) {
    const res = await fetch(url);
    if (res.status === 429) {
      await sleep(5000 + i * 3000);
      continue;
    }
    if (!res.ok) await sleep(2000);
    else {
      const data = await res.json();
      return data[0].map((x) => x[0]).join("");
    }
  }
  throw new Error(`failed ${tl}`);
}

async function translateLine(en, tl) {
  const { out, locks } = lockTokens(en);
  const tr = unlock(await gTranslate(out, tl), locks);
  return tr;
}

const arr = JSON.parse(
  fs.readFileSync(path.join(root, "_work/mobile-sa-unique-en.json"), "utf8"),
).slice(400, 800);

const dest = path.join(root, "_maps/t-sa-mobile-2.json");
const map = fs.existsSync(dest) ? JSON.parse(fs.readFileSync(dest, "utf8")) : {};

let done = 0;
for (const enVal of arr) {
  if (isIdentity(enVal)) continue;
  if (!map[enVal]) map[enVal] = {};
  for (const [loc, tl] of SA) {
    const cur = map[enVal][loc];
    if (typeof cur === "string" && cur !== enVal) continue;
    try {
      map[enVal][loc] = await translateLine(enVal, tl);
    } catch {
      const fb = tl === "tn" || tl === "nso" ? "st" : tl === "ve" ? "ts" : "zu";
      map[enVal][loc] = await translateLine(enVal, fb);
    }
    await sleep(2500);
    done++;
    if (done % 20 === 0) {
      fs.writeFileSync(dest, JSON.stringify(map, null, 2) + "\n");
      console.error(`Saved after ${done} cell updates…`);
    }
  }
}

fs.writeFileSync(dest, JSON.stringify(map, null, 2) + "\n");
console.log(`Done. Keys: ${Object.keys(map).length}`);
