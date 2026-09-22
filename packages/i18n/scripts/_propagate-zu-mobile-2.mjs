#!/usr/bin/env node
/** For rows still all-English, set zu via slow Google; propagate to other SA langs. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function gTranslate(text, tl) {
  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=" +
    tl +
    "&dt=t&q=" +
    encodeURIComponent(text);
  for (let i = 0; i < 8; i++) {
    const res = await fetch(url);
    if (res.status === 429) {
      await sleep(15000 * (i + 1));
      continue;
    }
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    return data[0].map((x) => x[0]).join("");
  }
  throw new Error("429");
}

const dest = path.join(root, "_maps/t-sa-mobile-2.json");
const map = JSON.parse(fs.readFileSync(dest, "utf8"));

for (const [en, row] of Object.entries(map)) {
  if (!SA.every((l) => row[l] === en)) continue;
  try {
    row.af = await gTranslate(en, "af");
    await sleep(8000);
    row.zu = await gTranslate(en, "zu");
    await sleep(8000);
    row.xh = await gTranslate(en, "xh");
    await sleep(8000);
    row.st = await gTranslate(en, "st");
    row.nso = row.st;
    row.tn = row.st;
    row.ss = row.zu;
    row.ts = row.xh;
    row.ve = row.xh;
  } catch {
    continue;
  }
  fs.writeFileSync(dest, JSON.stringify(map, null, 2) + "\n");
  console.error("OK", en);
}

let allEn = 0;
for (const [en, row] of Object.entries(map)) {
  if (SA.every((l) => row[l] === en)) allEn++;
}
console.log("all-English", allEn);
