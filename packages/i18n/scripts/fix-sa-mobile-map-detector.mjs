#!/usr/bin/env node
/**
 * Re-apply smart() translations for map rows that fail stillMostlyEnglish.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isIdentity, stillMostlyEnglish, translate } from "./_wave-a-translate.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];

for (const f of fs.readdirSync(path.join(root, "_maps"))) {
  if (!f.startsWith("t-sa-mobile-") || !f.endsWith(".json") || f.includes(".built.")) continue;
  const p = path.join(root, "_maps", f);
  const data = JSON.parse(fs.readFileSync(p, "utf8"));
  let fixed = 0;
  for (const [en, row] of Object.entries(data)) {
    if (isIdentity(en)) continue;
    for (const loc of SA) {
      const cur = row[loc];
      if (!cur || cur === en || !stillMostlyEnglish(en, cur)) continue;
      const tr = translate(en, loc);
      if (tr !== en && !stillMostlyEnglish(en, tr)) {
        row[loc] = tr;
        fixed += 1;
      }
    }
  }
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
  console.log(`${f}: fixed ${fixed} cells`);
}
