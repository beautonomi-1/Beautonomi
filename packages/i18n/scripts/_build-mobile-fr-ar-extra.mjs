#!/usr/bin/env node
/**
 * Build _work/mobile-fr-ar-extra.json overrides for strings still equal to EN.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractVars, isIdentity } from "./_wave-a-fr-ar-sw.mjs";
import { heuristicMobile } from "./_mobile-fr-ar-heuristic.mjs";
import { AR_SINGLE, FR_SINGLE } from "./_mobile-fr-ar-single.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const map = JSON.parse(fs.readFileSync(path.join(root, "_maps/t-mobile-fr-ar.json"), "utf8"));

function varsOk(en, out) {
  const need = extractVars(en);
  const got = extractVars(out);
  for (const v of need) {
    if (!got.has(v)) return false;
  }
  return true;
}

function structuralFr(en) {
  let fr = en;
  fr = fr.replace(/([^:\s]):(?!\s)/g, "$1 :");
  fr = fr.replace(/\?/g, " ?");
  fr = fr.replace(/!(\s|$)/g, " !$1");
  if (fr !== en) return fr;
  return null;
}

function structuralAr(en) {
  if (/^[{{}\w\s%.:,×+\-/→—·@&*()$~]+$/u.test(en) && !/[A-Za-z]{4,}/.test(en.replace(/\{\{\w+\}\}/g, ""))) {
    return en;
  }
  return null;
}

function phraseFrAr(en) {
  const fr = heuristicMobile(en, "fr");
  const ar = heuristicMobile(en, "ar");
  if ((fr !== en || ar !== en) && varsOk(en, fr) && varsOk(en, ar)) {
    return { fr, ar };
  }
  return null;
}

const extra = {};
for (const [en, row] of Object.entries(map)) {
  if (isIdentity(en)) continue;
  let fr = row.fr;
  let ar = row.ar;
  if (fr === en) fr = FR_SINGLE.get(en) ?? structuralFr(en) ?? phraseFrAr(en)?.fr ?? fr;
  if (ar === en) ar = AR_SINGLE.get(en) ?? structuralAr(en) ?? phraseFrAr(en)?.ar ?? ar;
  if ((fr !== en || ar !== en) && varsOk(en, fr) && varsOk(en, ar)) {
    extra[en] = { fr, ar };
  }
}

const dest = path.join(root, "_work/mobile-fr-ar-extra.json");
fs.writeFileSync(dest, `${JSON.stringify(extra, null, 2)}\n`);
console.log({ extraKeys: Object.keys(extra).length, dest });
