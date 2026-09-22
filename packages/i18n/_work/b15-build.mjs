#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isIdentity, stillMostlyEnglish } from "../scripts/_wave-a-translate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];

/** @type {Record<string, Record<string, string>>} */
const T = {};

export function r(en, af, zu, xh, st, nso, tn, ts, ve, ss) {
  T[en] = { af, zu, xh, st, nso, tn, ts, ve, ss };
}

const { applyB15 } = await import("./b15-translations.mjs");
applyB15(r);

const list = JSON.parse(
  fs.readFileSync(path.join(__dirname, "b15-still-missing.json"), "utf8"),
);

const manual = {};
let miss = 0;
let badZu = 0;
for (const en of list) {
  if (!T[en]) {
    console.error("Missing:", JSON.stringify(en));
    miss += 1;
    continue;
  }
  manual[en] = T[en];
  const zu = T[en].zu;
  if (!zu || zu === en || stillMostlyEnglish(en, zu)) badZu += 1;
}

const manualPath = path.join(__dirname, "b15-manual.json");
fs.writeFileSync(manualPath, JSON.stringify(manual, null, 2) + "\n");

const mapPath = path.join(__dirname, "../_maps/t-sa-mobile-15.json");
const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
for (const [en, row] of Object.entries(manual)) {
  if (map[en]) map[en] = { ...map[en], ...row };
}
fs.writeFileSync(mapPath, JSON.stringify(map, null, 2) + "\n");

console.log({ manualKeys: Object.keys(manual).length, miss, badZu, list: list.length });
