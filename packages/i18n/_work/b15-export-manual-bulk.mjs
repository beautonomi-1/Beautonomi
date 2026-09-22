#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stillMostlyEnglish } from "../scripts/_wave-a-translate.mjs";
import { applyB15PartB } from "./b15-translations-b.mjs";
import { applyB15PartC } from "./b15-translations-c.mjs";
import { applyB15PartD } from "./b15-translations-d.mjs";
import { applyB15PartE } from "./b15-translations-e.mjs";
import { applyB15PartF } from "./b15-translations-f.mjs";
import { applyB15PartG } from "./b15-translations-g.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];

/** @type {Record<string, Record<string, string>>} */
const T = {};
function r(en, af, zu, xh, st, nso, tn, ts, ve, ss) {
  T[en] = { af, zu, xh, st, nso, tn, ts, ve, ss };
}
/** Compact: en, af, zu, st, ts — mirrors xh=zu, nso=tn=st, ve=ts, ss=zu */
function r5(en, af, zu, st, ts, ss = zu) {
  r(en, af, zu, zu, st, st, st, ts, ts, ss);
}
applyB15PartB(r);
applyB15PartC(r5);
applyB15PartD(r5);
applyB15PartE(r5);
applyB15PartF(r5);
applyB15PartG(r5);

const list = JSON.parse(
  fs.readFileSync(path.join(__dirname, "b15-still-missing.json"), "utf8"),
).slice(10);

const out = {};
let miss = 0;
let badZu = 0;
for (const en of list) {
  const row = T[en];
  if (!row) {
    console.error("Missing:", JSON.stringify(en));
    miss += 1;
    continue;
  }
  out[en] = row;
  const zu = row.zu;
  if (!zu || zu === en || stillMostlyEnglish(en, zu)) badZu += 1;
}

fs.writeFileSync(
  path.join(__dirname, "b15-manual-bulk.json"),
  JSON.stringify(out, null, 2) + "\n",
);
console.log({ keys: Object.keys(out).length, miss, badZu, expected: list.length });
