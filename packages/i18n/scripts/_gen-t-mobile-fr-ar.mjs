#!/usr/bin/env node
/**
 * Generate _maps/t-mobile-fr-ar.json from mobile-sa-unique-en.json.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractVars, isIdentity, loadExternalMaps, translate } from "./_wave-a-fr-ar-sw.mjs";
import { translateMobile } from "./_mobile-fr-ar-translate.mjs";
import { heuristicMobile } from "./_mobile-fr-ar-heuristic.mjs";
import { AR_SINGLE, FR_SINGLE } from "./_mobile-fr-ar-single.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const extraPath = path.join(root, "_work/mobile-fr-ar-extra.json");
/** @type {Record<string, { fr: string, ar: string }>} */
const EXTRA = fs.existsSync(extraPath)
  ? JSON.parse(fs.readFileSync(extraPath, "utf8"))
  : {};

loadExternalMaps(path.join(root, "_maps"), fs, path);

const arr = JSON.parse(
  fs.readFileSync(path.join(root, "_work/mobile-sa-unique-en.json"), "utf8"),
);

function varsOk(en, out) {
  const need = extractVars(en);
  const got = extractVars(out);
  for (const v of need) {
    if (!got.has(v)) return false;
  }
  return true;
}

function pick(en, locale) {
  const ex = EXTRA[en];
  if (ex?.[locale] && ex[locale] !== en && varsOk(en, ex[locale])) return ex[locale];
  const mobile = translateMobile(en, locale);
  if (mobile !== en && varsOk(en, mobile)) return mobile;
  const wave = translate(en, locale);
  if (wave !== en && varsOk(en, wave)) return wave;
  const heur = heuristicMobile(en, locale);
  if (heur !== en && varsOk(en, heur)) return heur;
  const single = locale === "fr" ? FR_SINGLE.get(en) : AR_SINGLE.get(en);
  if (single && single !== en && varsOk(en, single)) return single;
  return mobile !== en ? mobile : wave !== en ? wave : single ?? heur;
}

const map = {};
let skippedIdentity = 0;
let stillEn = 0;

for (const en of arr) {
  if (isIdentity(en)) {
    skippedIdentity += 1;
    continue;
  }
  const fr = pick(en, "fr");
  const ar = pick(en, "ar");
  map[en] = { fr, ar };
  if (fr === en || ar === en) stillEn += 1;
}

const dest = path.join(root, "_maps/t-mobile-fr-ar.json");
fs.writeFileSync(dest, `${JSON.stringify(map, null, 2)}\n`);

console.log({
  source: arr.length,
  skippedIdentity,
  entries: Object.keys(map).length,
  stillPartialEnglish: stillEn,
  dest,
});
