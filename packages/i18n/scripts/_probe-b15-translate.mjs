#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stillMostlyEnglish, translate } from "./_wave-a-translate.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const missing = JSON.parse(fs.readFileSync(path.join(root, "_work/b15-still-missing.json"), "utf8"));
const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];
let ok = 0;
const fail = [];
for (const en of missing) {
  const row = {};
  let good = true;
  for (const loc of SA) {
    const tr = translate(en, loc);
    row[loc] = tr;
    if (!tr || tr === en || stillMostlyEnglish(en, tr)) good = false;
  }
  if (good) ok += 1;
  else fail.push(en);
}
console.log({ total: missing.length, translateOk: ok, fail: fail.length });
fs.writeFileSync(path.join(root, "_work/b15-translate-fail.json"), JSON.stringify(fail, null, 2) + "\n");
