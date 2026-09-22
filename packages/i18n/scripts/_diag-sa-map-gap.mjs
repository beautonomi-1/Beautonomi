import fs from "node:fs";
import { isIdentity, stillMostlyEnglish } from "./_wave-a-translate.mjs";

const maps = {};
for (const f of fs.readdirSync("_maps")) {
  if (f.startsWith("t-sa-mobile-") && f.endsWith(".json") && !f.includes(".built.")) {
    Object.assign(maps, JSON.parse(fs.readFileSync(`_maps/${f}`, "utf8")));
  }
}
const en = JSON.parse(fs.readFileSync("src/locales/en.json", "utf8"));
const zu = JSON.parse(fs.readFileSync("src/locales/zu.json", "utf8"));

function flat(o, p = "", m = new Map()) {
  for (const [k, v] of Object.entries(o || {})) {
    const f = p ? `${p}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flat(v, f, m);
    else if (typeof v === "string") m.set(f, v);
  }
  return m;
}

const ef = flat(en);
const zf = flat(zu);
const prefs = [
  "common",
  "auth",
  "authGate",
  "checkout",
  "booking",
  "payments",
  "validation",
  "errors",
  "time",
  "bookingLifecycle",
  "customer.mobile",
  "provider.mobile",
];

let noMap = 0;
let badDet = 0;
let good = 0;

for (const [k, v] of ef) {
  if (!prefs.some((p) => k === p || k.startsWith(`${p}.`))) continue;
  if (zf.get(k) !== v || isIdentity(v)) continue;
  const row = maps[v];
  if (!row) {
    noMap += 1;
    continue;
  }
  const tr = row.zu;
  if (!tr || tr === v) {
    noMap += 1;
    continue;
  }
  if (stillMostlyEnglish(v, tr)) badDet += 1;
  else good += 1;
}

console.log(JSON.stringify({ noMap, badDet, good, mapKeys: Object.keys(maps).length }, null, 2));
