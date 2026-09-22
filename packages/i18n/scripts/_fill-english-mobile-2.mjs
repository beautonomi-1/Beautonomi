#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function mm(text, tl) {
  const url =
    "https://api.mymemory.translated.net/get?q=" +
    encodeURIComponent(text) +
    "&langpair=en|" +
    tl;
  for (let i = 0; i < 8; i++) {
    const res = await fetch(url);
    const data = await res.json();
    if (data.quotaFinished || data.responseStatus === 429) {
      await sleep(20000 * (i + 1));
      continue;
    }
    if (data.responseStatus === 200 && data.responseData?.translatedText) {
      return data.responseData.translatedText;
    }
    await sleep(5000);
  }
  return text;
}

const dest = path.join(root, "_maps/t-sa-mobile-2.json");
const map = JSON.parse(fs.readFileSync(dest, "utf8"));
const langs = SA.map(([l]) => l);

for (const [en, row] of Object.entries(map)) {
  if (!langs.every((l) => row[l] === en)) continue;
  for (const [loc, tl] of SA) {
    row[loc] = await mm(en, tl);
    await sleep(800);
  }
  fs.writeFileSync(dest, JSON.stringify(map, null, 2) + "\n");
  console.error("Filled:", en);
}

console.log("Done");
