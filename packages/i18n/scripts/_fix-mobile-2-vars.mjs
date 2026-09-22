#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];

function fixVars(en, tr) {
  const enVars = en.match(/\{\{\w+\}\}/g) || [];
  if (!enVars.length) return tr;
  let i = 0;
  return tr.replace(/\{\{[^}]+\}\}/g, () => enVars[i++] ?? "");
}

const dest = path.join(root, "_maps/t-sa-mobile-2.json");
const map = JSON.parse(fs.readFileSync(dest, "utf8"));

const MANUAL = {
  "When (trigger)": {
    af: "Wanneer (sneller)",
    zu: "Nini (isibangiso)",
    xh: "Xa (isiphumo)",
    st: "Neng (sebaka sa ho qala)",
    nso: "Neng (sebaka sa go thoma)",
    tn: "Neng (sebaka sa go simolola)",
    ts: "Rini (xihlovo)",
    ve: "Ndi (tshivhalo)",
    ss: "Nini (sici)",
  },
  "GRP · {{ref}}": {
    af: "GRP · {{ref}}",
    zu: "GRP · {{ref}}",
    xh: "GRP · {{ref}}",
    st: "GRP · {{ref}}",
    nso: "GRP · {{ref}}",
    tn: "GRP · {{ref}}",
    ts: "GRP · {{ref}}",
    ve: "GRP · {{ref}}",
    ss: "GRP · {{ref}}",
  },
  "4XXXXXXXXX": {
    af: "4XXXXXXXXX",
    zu: "4XXXXXXXXX",
    xh: "4XXXXXXXXX",
    st: "4XXXXXXXXX",
    nso: "4XXXXXXXXX",
    tn: "4XXXXXXXXX",
    ts: "4XXXXXXXXX",
    ve: "4XXXXXXXXX",
    ss: "4XXXXXXXXX",
  },
  "https://...": {
    af: "https://...",
    zu: "https://...",
    xh: "https://...",
    st: "https://...",
    nso: "https://...",
    tn: "https://...",
    ts: "https://...",
    ve: "https://...",
    ss: "https://...",
  },
  "SG.xxxxx...": {
    af: "SG.xxxxx...",
    zu: "SG.xxxxx...",
    xh: "SG.xxxxx...",
    st: "SG.xxxxx...",
    nso: "SG.xxxxx...",
    tn: "SG.xxxxx...",
    ts: "SG.xxxxx...",
    ve: "SG.xxxxx...",
    ss: "SG.xxxxx...",
  },
};

for (const [en, row] of Object.entries(map)) {
  if (MANUAL[en]) {
    map[en] = MANUAL[en];
    continue;
  }
  for (const loc of SA) {
    if (typeof row[loc] === "string") row[loc] = fixVars(en, row[loc]).trim();
  }
}

fs.writeFileSync(dest, JSON.stringify(map, null, 2) + "\n");
console.log("Fixed vars and manual rows");
