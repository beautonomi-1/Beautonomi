#!/usr/bin/env node
/**
 * Rewrite t-sa-mobile-15 rows that fail stillMostlyEnglish using
 * manual exact rows + pattern rules (no src/locales edits).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyB15PartA } from "../_work/b15-translations-a.mjs";
import { isIdentity, stillMostlyEnglish } from "./_wave-a-translate.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];
const mapPath = path.join(root, "_maps/t-sa-mobile-15.json");

/** @type {Record<string, Record<string, string>>} */
const MANUAL = {};
function r(en, af, zu, xh, st, nso, tn, ts, ve, ss) {
  MANUAL[en] = { af, zu, xh, st, nso, tn, ts, ve, ss };
}
applyB15PartA(r);

// Load optional bulk overrides
const bulkPath = path.join(root, "_work/b15-manual-bulk.json");
if (fs.existsSync(bulkPath)) {
  Object.assign(MANUAL, JSON.parse(fs.readFileSync(bulkPath, "utf8")));
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

function bad(en, val) {
  if (isIdentity(en)) return false;
  return !val || val === en || stillMostlyEnglish(en, val);
}

const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
let fixed = 0;
for (const [en, row] of Object.entries(map)) {
  if (isIdentity(en)) continue;
  const man = MANUAL[en];
  if (!man) continue;
  if (!bad(en, row.zu)) continue;
  map[en] = expand({ ...row, ...man });
  fixed += 1;
}
fs.writeFileSync(mapPath, JSON.stringify(map, null, 2) + "\n");

let zuBad = 0;
for (const [en, row] of Object.entries(map)) {
  if (isIdentity(en)) continue;
  if (bad(en, row.zu)) zuBad += 1;
}
console.log({ fixed, zuBad, manualKeys: Object.keys(MANUAL).length });
