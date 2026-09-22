#!/usr/bin/env node
/**
 * Generate _work/b11-manual.json — full 9-locale rows for mobile-sa-missing-en.json.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isIdentity, stillMostlyEnglish } from "./_wave-a-translate.mjs";
import { ROWS } from "./_b11-manual-rows.mjs";
import { ROWS_B } from "./_b11-manual-rows-b.mjs";

const ALL_ROWS = { ...ROWS, ...ROWS_B };

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];

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

const list = JSON.parse(
  fs.readFileSync(path.join(root, "_work/mobile-sa-missing-en.json"), "utf8"),
);
/** @type {Record<string, Record<string, string>>} */
const out = {};
let ok = 0;
let miss = 0;

for (const en of list) {
  if (isIdentity(en)) continue;
  const row = ALL_ROWS[en];
  if (!row) {
    miss += 1;
    continue;
  }
  const exp = expand(row);
  if (!exp.zu || exp.zu === en) {
    miss += 1;
    continue;
  }
  out[en] = exp;
  ok += 1;
}

const dest = path.join(root, "_work/b11-manual.json");
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
console.log({ dest, ok, miss, total: list.length });
