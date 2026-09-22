#!/usr/bin/env node
/**
 * One-off: machine-assist SA translations for mobile batch 2.
 * Preserves {{vars}}, brands, and technical tokens.
 */
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
];

const TECH = [
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
];

function lockTokens(text) {
  const locks = [];
  const lock = (t) => {
    locks.push(t);
    return `\uE000${locks.length - 1}\uE001`;
  };
  let out = text;
  out = out.replace(/\{\{(\w+)\}\}/g, (m) => lock(m));
  for (const t of [...BRANDS, ...TECH]) {
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

async function gTranslate(text, tl, tries = 4) {
  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=" +
    encodeURIComponent(tl) +
    "&dt=t&q=" +
    encodeURIComponent(text);
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        await sleep(8000 * (i + 1));
        throw new Error("HTTP 429");
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data[0].map((x) => x[0]).join("");
    } catch (e) {
      await sleep(250 * (i + 1));
      if (i === tries - 1) throw e;
    }
  }
  return text;
}

async function translateLine(en, tl) {
  const { out, locks } = lockTokens(en);
  if (!out.trim()) return en;
  let tr = await gTranslate(out, tl);
  tr = unlock(tr, locks);
  return tr;
}

async function translateRow(enVal) {
  const row = {};
  await Promise.all(
    SA.map(async ([loc, tl]) => {
      try {
        row[loc] = await translateLine(enVal, tl);
      } catch {
        const fb = tl === "tn" || tl === "nso" ? "st" : tl === "ve" ? "ts" : "zu";
        row[loc] = await translateLine(enVal, fb);
      }
    }),
  );
  return row;
}

const arr = JSON.parse(
  fs.readFileSync(path.join(root, "_work/mobile-sa-unique-en.json"), "utf8"),
).slice(400, 800);

const dest = path.join(root, "_maps/t-sa-mobile-2.json");
const map = fs.existsSync(dest) ? JSON.parse(fs.readFileSync(dest, "utf8")) : {};
const todo = arr.filter((enVal) => {
  if (isIdentity(enVal)) return false;
  const row = map[enVal];
  if (!row) return true;
  return !SA.every(([loc]) => typeof row[loc] === "string" && row[loc] !== enVal);
});

const BATCH = 2;
for (let i = 0; i < todo.length; i += BATCH) {
  const batch = todo.slice(i, i + BATCH);
  const rows = await Promise.all(batch.map((enVal) => translateRow(enVal)));
  for (let j = 0; j < batch.length; j++) map[batch[j]] = rows[j];
  fs.writeFileSync(dest, JSON.stringify(map, null, 2) + "\n");
  console.error(`Progress ${Math.min(i + BATCH, todo.length)}/${todo.length} (total ${Object.keys(map).length})`);
  await sleep(1200);
}

console.log(`Wrote ${Object.keys(map).length} keys → ${dest}`);
