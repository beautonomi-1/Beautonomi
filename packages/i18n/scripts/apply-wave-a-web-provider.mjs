#!/usr/bin/env node
/**
 * Translate web.provider.* keys that still equal English into Wave A locales.
 *
 * Usage: node scripts/apply-wave-a-web-provider.mjs [--merge]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { translate as translateZa, isIdentity as isIdentityZa, LANGS as ZA_LANGS } from "./_wave-a-translate.mjs";
import { translate as translateFrArSw, isIdentity as isIdentityFrArSw } from "./_wave-a-fr-ar-sw.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "../src/locales");
const merge = process.argv.includes("--merge");
const NS = "web.provider";

const WAVE_A = [...new Set([...ZA_LANGS, "fr", "ar", "sw"])];

function flatten(obj, prefix = "") {
  const out = new Map();
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [k, v] of flatten(value, full)) out.set(k, v);
    } else {
      out.set(full, String(value ?? ""));
    }
  }
  return out;
}

function unflatten(map) {
  const rootObj = {};
  for (const [k, v] of map) {
    const parts = k.split(".");
    let cur = rootObj;
    for (let i = 0; i < parts.length - 1; i++) {
      cur[parts[i]] ??= {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = v;
  }
  return rootObj;
}

function deepMerge(target, source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return source;
  const out = { ...target };
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === "object" && !Array.isArray(v) && target?.[k] && typeof target[k] === "object") {
      out[k] = deepMerge(target[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function extractVars(str) {
  const vars = new Set();
  for (const m of String(str).matchAll(/\{\{(\w+)\}\}/g)) vars.add(m[1]);
  return vars;
}

const en = JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8"));
const enFlat = flatten(en);

for (const locale of WAVE_A) {
  const localePath = path.join(localesDir, `${locale}.json`);
  const loc = JSON.parse(fs.readFileSync(localePath, "utf8"));
  const locFlat = flatten(loc);
  const isFrArSw = ["fr", "ar", "sw"].includes(locale);
  const isIdentity = isFrArSw ? isIdentityFrArSw : isIdentityZa;
  const translate = isFrArSw ? translateFrArSw : translateZa;

  const delta = new Map();
  let mapped = 0;
  let identity = 0;
  let skipped = 0;

  for (const [key, enVal] of enFlat) {
    if (!key.startsWith(`${NS}.`)) continue;
    const cur = locFlat.get(key) ?? enVal;
    if (cur !== enVal) continue;
    if (isIdentity(enVal)) {
      identity += 1;
      continue;
    }
    let translated = enVal;
    try {
      translated = translate(enVal, locale);
    } catch {
      skipped += 1;
      continue;
    }
    const enVars = extractVars(enVal);
    const locVars = extractVars(translated);
    let safe = translated;
    for (const v of enVars) {
      if (!locVars.has(v)) {
        safe = enVal;
        skipped += 1;
        break;
      }
    }
    if (safe !== enVal) {
      delta.set(key, safe);
      mapped += 1;
    }
  }

  if (delta.size === 0) {
    console.log(`${locale}: nothing to translate`);
    continue;
  }

  const tree = unflatten(delta);
  if (merge) {
    const merged = deepMerge(loc, tree);
    fs.writeFileSync(localePath, JSON.stringify(merged, null, 2) + "\n");
  }
  console.log(`${locale}: translated ${mapped} keys (identity ${identity}, var-skip ${skipped})${merge ? " merged" : ""}`);
}
