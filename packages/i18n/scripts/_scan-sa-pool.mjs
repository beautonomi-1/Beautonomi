#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stillMostlyEnglish } from "./_wave-a-translate.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const map15 = JSON.parse(fs.readFileSync(path.join(root, "_maps/t-sa-mobile-15.json"), "utf8"));
const need = new Set();
for (const [en, row] of Object.entries(map15)) {
  if (!row.zu || row.zu === en || stillMostlyEnglish(en, row.zu)) need.add(en);
}

/** @type {Map<string, string[]>} */
const pool = new Map();
const work = path.join(root, "_work");
for (const f of fs.readdirSync(work)) {
  const fp = path.join(work, f);
  if (!fs.statSync(fp).isFile()) continue;
  const text = fs.readFileSync(fp, "utf8");
  if (f.endsWith(".json") && f.includes("manual")) {
    try {
      const j = JSON.parse(text);
      for (const [en, row] of Object.entries(j)) {
        if (row.zu && row.zu !== en && !stillMostlyEnglish(en, row.zu)) {
          pool.set(en, [row.af, row.zu, row.xh, row.st, row.nso, row.tn, row.ts, row.ve, row.ss]);
        }
      }
    } catch {
      /* skip */
    }
  }
  if (f.includes("translation") && f.endsWith(".mjs")) {
    for (const m of text.matchAll(/\[\s*"((?:\\.|[^"\\])*)"\s*,/g)) {
      /* skip partial */
    }
    const rowRe =
      /\[\s*"((?:\\.|[^"\\])*)"\s*,\s*"((?:\\.|[^"\\])*)"\s*,\s*"((?:\\.|[^"\\])*)"\s*,\s*"((?:\\.|[^"\\])*)"\s*,\s*"((?:\\.|[^"\\])*)"\s*,\s*"((?:\\.|[^"\\])*)"\s*,\s*"((?:\\.|[^"\\])*)"\s*,\s*"((?:\\.|[^"\\])*)"\s*,\s*"((?:\\.|[^"\\])*)"\s*,\s*"((?:\\.|[^"\\])*)"\s*\]/g;
    for (const m of text.matchAll(rowRe)) {
      const parts = m.slice(1, 11).map((s) => JSON.parse(`"${s}"`));
      const en = parts[0];
      const zu = parts[2];
      if (zu && zu !== en && !stillMostlyEnglish(en, zu)) pool.set(en, parts.slice(1));
    }
  }
}

let hit = 0;
const missing = [];
for (const en of need) {
  if (pool.has(en)) hit += 1;
  else missing.push(en);
}
console.log(JSON.stringify({ need: need.size, poolSize: pool.size, hit, missingCount: missing.length }, null, 2));
fs.writeFileSync(path.join(root, "_work/b15-still-missing.json"), JSON.stringify(missing, null, 2) + "\n");
