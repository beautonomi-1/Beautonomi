#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isIdentity } from "./_wave-a-translate.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dest = path.join(root, "_maps/t-sa-mobile-7.json");
const PRIMARY = ["af", "zu", "st", "ts"];
const BRANDS = [
  "Beautonomi",
  "Paystack",
  "Paystack Terminal",
  "Explore",
  "Apple",
  "Google",
  "WhatsApp",
  "Yoco",
  "Web POS",
  "Ops",
  "PIN",
  "SMS",
  "VAT",
  "Card machines",
  "Payflex",
];

function loadCovered() {
  const maps = {};
  for (const f of fs.readdirSync(path.join(root, "_maps"))) {
    if (f === "t-sa-mobile-7.json") continue;
    if (f.startsWith("t-sa-mobile-") && f.endsWith(".json") && !f.includes(".built.")) {
      Object.assign(maps, JSON.parse(fs.readFileSync(path.join(root, "_maps", f), "utf8")));
    }
  }
  return maps;
}

function targetList() {
  const missing = JSON.parse(
    fs.readFileSync(path.join(root, "_work/mobile-sa-missing-en.json"), "utf8"),
  );
  return missing.filter((s) => !loadCovered()[s]).slice(0, 350);
}

function expand(row) {
  return {
    af: row.af,
    zu: row.zu,
    xh: row.xh || row.zu,
    st: row.st,
    nso: row.nso || row.st,
    tn: row.tn || row.st,
    ts: row.ts,
    ve: row.ve || row.ts,
    ss: row.ss || row.zu,
  };
}

function needsWork(en, row) {
  if (!row) return true;
  const e = expand(row);
  return ["af", "zu", "st", "ts"].some((loc) => !e[loc] || e[loc] === en);
}

function lockTokens(text) {
  const locks = [];
  const lock = (t) => {
    locks.push(t);
    return `\uE000${locks.length - 1}\uE001`;
  };
  let out = text.replace(/\n/g, () => lock("\n")).replace(/\{\{(\w+)\}\}/g, (m) => lock(m));
  for (const t of BRANDS.sort((a, b) => b.length - a.length)) {
    if (t && out.includes(t)) out = out.split(t).join(lock(t));
  }
  return { out, locks };
}
function unlock(text, locks) {
  return text.replace(/\uE000(\d+)\uE001/g, (_, i) => locks[Number(i)]);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gTranslate(text, tl) {
  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=" +
    encodeURIComponent(tl) +
    "&dt=t&q=" +
    encodeURIComponent(text);
  for (let i = 0; i < 12; i++) {
    const res = await fetch(url);
    if (res.status === 429) {
      await sleep(2500 * (i + 1));
      continue;
    }
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    return data[0].map((x) => x[0]).join("");
  }
  throw new Error("rate");
}

async function line(en, tl) {
  const { out, locks } = lockTokens(en);
  return unlock(await gTranslate(out, tl), locks);
}

const list = targetList();
const map = fs.existsSync(dest) ? JSON.parse(fs.readFileSync(dest, "utf8")) : {};
const outMap = {};
let done = 0;

for (const enVal of list) {
  if (isIdentity(enVal)) continue;
  let row = map[enVal] ? { ...map[enVal] } : {};
  if (needsWork(enVal, row)) {
    for (const tl of PRIMARY) {
      if (row[tl] && row[tl] !== enVal) continue;
      try {
        row[tl] = await line(enVal, tl);
      } catch {
        row[tl] = row[tl] || enVal;
      }
      await sleep(100);
    }
    done += 1;
  }
  outMap[enVal] = expand(row);
  fs.writeFileSync(dest, JSON.stringify(outMap, null, 2) + "\n");
  if (done % 20 === 0 && done > 0) console.error(`Translated ${done}, keys ${Object.keys(outMap).length}`);
}

console.log(`Complete: ${Object.keys(outMap).length} keys, translated ${done}`);
