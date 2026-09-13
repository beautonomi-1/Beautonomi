#!/usr/bin/env node
/**
 * Adds leftover public-flow keys and translations for every supported locale.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import wave from "./leftover-tr-wave.mjs";
import extra from "./leftover-tr-extra.mjs";

const localesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/locales");
const WAVE_A = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss", "fr", "ar", "sw", "pt", "es"];
const EXTRA = ["de", "hi", "it", "nl", "tr", "id", "am", "rw"];
const ALIASES = { "pt-BR": "pt", "es-MX": "es" };

function deepMerge(target, source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return source;
  const out = { ...target };
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === "object" && !Array.isArray(v) && target?.[k] && typeof target[k] === "object") {
      out[k] = deepMerge(target[k], v);
    } else out[k] = v;
  }
  return out;
}

function deepSet(obj, dotted, value) {
  const parts = dotted.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!cur[p] || typeof cur[p] !== "object" || Array.isArray(cur[p])) cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

function writeLocale(code, data) {
  fs.writeFileSync(path.join(localesDir, `${code}.json`), JSON.stringify(data, null, 2) + "\n");
}

for (const [key, vals] of Object.entries(wave)) {
  if (!Array.isArray(vals) || vals.length !== 14) throw new Error(`wave ${key} has ${vals?.length}`);
}
const extraOk = {};
for (const [key, vals] of Object.entries(extra)) {
  if (Array.isArray(vals) && vals.length === 8) extraOk[key] = vals;
  else console.warn("skip extra", key, vals?.length);
}
const missingInExtra = Object.keys(wave).filter((k) => !extraOk[k]);
if (missingInExtra.length) console.warn("extra fallback EN:", missingInExtra.join(", "));

const EN_DELTA = JSON.parse(fs.readFileSync(new URL("./leftover-en-delta.json", import.meta.url)));

const enPath = path.join(localesDir, "en.json");
writeLocale("en", deepMerge(JSON.parse(fs.readFileSync(enPath, "utf8")), EN_DELTA));
console.log("updated en.json");

for (const code of ["en-US", "en-GB", "en-AU"]) {
  const p = path.join(localesDir, `${code}.json`);
  if (!fs.existsSync(p)) continue;
  writeLocale(code, deepMerge(JSON.parse(fs.readFileSync(p, "utf8")), EN_DELTA));
  console.log("updated", code);
}

for (const locale of WAVE_A) {
  const localePath = path.join(localesDir, `${locale}.json`);
  const data = deepMerge(JSON.parse(fs.readFileSync(localePath, "utf8")), EN_DELTA);
  for (const [key, vals] of Object.entries(wave)) deepSet(data, key, vals[WAVE_A.indexOf(locale)]);
  writeLocale(locale, data);
  console.log("updated", locale);
}

for (const locale of EXTRA) {
  const localePath = path.join(localesDir, `${locale}.json`);
  const data = deepMerge(JSON.parse(fs.readFileSync(localePath, "utf8")), EN_DELTA);
  for (const [key, vals] of Object.entries(extraOk)) deepSet(data, key, vals[EXTRA.indexOf(locale)]);
  writeLocale(locale, data);
  console.log("updated", locale);
}

for (const [alias, src] of Object.entries(ALIASES)) {
  const aliasPath = path.join(localesDir, `${alias}.json`);
  if (!fs.existsSync(aliasPath)) continue;
  const data = deepMerge(JSON.parse(fs.readFileSync(aliasPath, "utf8")), EN_DELTA);
  const srcIdx = WAVE_A.indexOf(src);
  for (const [key, vals] of Object.entries(wave)) deepSet(data, key, vals[srcIdx]);
  writeLocale(alias, data);
  console.log("updated", alias, "from", src);
}

console.log("done", Object.keys(wave).length, "translated keys");
