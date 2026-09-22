#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadSaExternalMaps, translate } from "./_wave-a-translate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];

loadSaExternalMaps(path.join(root, "_maps"), fs, path);

function flatten(obj, prefix = "", out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, full, out);
    else if (typeof v === "string") out.set(full, v);
  }
  return out;
}

const enFlat = flatten(JSON.parse(fs.readFileSync(path.join(root, "src/locales/en.json"), "utf8")));
const zuFlat = flatten(JSON.parse(fs.readFileSync(path.join(root, "src/locales/zu.json"), "utf8")));

const ens = new Set();
for (const l of SA) {
  const r = spawnSync(process.execPath, [path.join(__dirname, "leftover-tr-mobile-apps.mjs"), `--list=${l}`], {
    encoding: "utf8",
    cwd: root,
  });
  for (const line of (r.stdout || "").split("\n")) {
    if (line.startsWith("  en: ")) ens.add(line.slice(6));
  }
}

const draft = {};
for (const en of ens) {
  const row = {};
  for (const l of SA) {
    let tr = translate(en, l);
    if (!tr || tr === en) {
      for (const [key, val] of enFlat) {
        if (val !== en) continue;
        const z = zuFlat.get(key);
        if (z && z !== en) {
          tr = z;
          break;
        }
      }
    }
    row[l] = tr ?? en;
  }
  draft[en] = row;
}

const refinedPath = path.join(root, "_maps/t-sa-mobile-refined.json");
const refined = JSON.parse(fs.readFileSync(refinedPath, "utf8"));
Object.assign(refined, draft);
fs.writeFileSync(refinedPath, `${JSON.stringify(refined, null, 2)}\n`);
console.log(`merge-residual-refined: ${Object.keys(draft).length} rows from ${ens.size} English phrases`);
