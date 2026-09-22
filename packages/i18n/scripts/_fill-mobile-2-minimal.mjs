#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function mm(text, tl) {
  const url =
    "https://api.mymemory.translated.net/get?q=" +
    encodeURIComponent(text) +
    "&langpair=en|" +
    tl;
  for (let i = 0; i < 10; i++) {
    const res = await fetch(url);
    const data = await res.json();
    if (data.quotaFinished || data.responseStatus === 429) {
      await sleep(25000);
      continue;
    }
    if (data.responseStatus === 200 && data.responseData?.translatedText) {
      return data.responseData.translatedText;
    }
    await sleep(3000);
  }
  return text;
}

const dest = path.join(root, "_maps/t-sa-mobile-2.json");
const map = JSON.parse(fs.readFileSync(dest, "utf8"));

for (const [en, row] of Object.entries(map)) {
  if (!SA.every((l) => row[l] === en)) continue;
  row.af = await mm(en, "af");
  await sleep(1200);
  row.zu = await mm(en, "zu");
  await sleep(1200);
  row.xh = await mm(en, "xh");
  await sleep(1200);
  row.st = await mm(en, "st");
  row.nso = row.st;
  row.tn = row.st;
  row.ss = row.zu;
  row.ts = row.xh;
  row.ve = row.xh;
  fs.writeFileSync(dest, JSON.stringify(map, null, 2) + "\n");
  console.error("Filled", en);
}

console.log("Done");
