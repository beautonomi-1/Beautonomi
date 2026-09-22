import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stillMostlyEnglish, isIdentity } from "./_wave-a-translate.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const list = JSON.parse(fs.readFileSync(path.join(root, "_work/mobile-sa-missing-en.json"), "utf8")).slice(0, 350);
const map = JSON.parse(fs.readFileSync(path.join(root, "_maps/t-sa-mobile-6.json"), "utf8"));
const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];
let fullOk = 0;
let same = 0;
let calque = 0;
for (const en of list) {
  const r = map[en];
  let ok = true;
  for (const l of SA) {
    if (r[l] === en) same++;
    else if (stillMostlyEnglish(en, r[l])) calque++;
    else ok = false;
  }
  if (SA.every((l) => r[l] && r[l] !== en && !stillMostlyEnglish(en, r[l]))) fullOk++;
}
console.log(JSON.stringify({ keys: Object.keys(map).length, fullOk, same, calque }));
