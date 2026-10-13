#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  isIdentity,
  stillMostlyEnglish,
  translate as translateWaveA,
  translateBestEffort,
} from "./_wave-a-translate.mjs";
import { translate as translateFrAr } from "./_wave-a-fr-ar-sw.mjs";
import { safeWriteJson } from "./_safe-write-json.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const localesDir = path.join(root, "src/locales");
const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];
const FRAR = ["fr", "ar"];
const TARGET = [...SA, ...FRAR];

function flatten(obj, prefix = "", out = new Map()) {
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) flatten(value, full, out);
    else out.set(full, String(value ?? ""));
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

function isLeftover(enVal, locVal) {
  if (typeof enVal !== "string" || typeof locVal !== "string") return false;
  if (isIdentity(enVal)) return false;
  if (locVal === enVal) return true;
  return stillMostlyEnglish(enVal, locVal);
}

function propose(en, locale) {
  if (FRAR.includes(locale)) {
    const tr = translateFrAr(en, locale);
    if (tr && tr !== en) return tr;
  }
  for (const fn of [translateWaveA, translateBestEffort]) {
    const tr = fn(en, locale);
    if (tr && tr !== en) return tr;
  }
  return null;
}

function keysForLocale(locale) {
  const r = spawnSync(process.execPath, ["scripts/leftover-tr-mobile-apps.mjs", "--list=" + locale], {
    encoding: "utf8",
    cwd: root,
  });
  return (r.stdout || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^(provider|customer)\./.test(l));
}

const enFlat = flatten(JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8")));
const localeData = Object.fromEntries(
  TARGET.map((l) => [l, JSON.parse(fs.readFileSync(path.join(localesDir, `${l}.json`), "utf8"))]),
);
const localeFlat = Object.fromEntries(TARGET.map((l) => [l, flatten(localeData[l])]));

let patched = 0;
for (const locale of TARGET) {
  for (const key of keysForLocale(locale)) {
    const enVal = enFlat.get(key);
    const locVal = localeFlat[locale].get(key);
    if (!isLeftover(enVal, locVal)) continue;
    let tr = propose(enVal, locale);
    if (!tr || tr === enVal || stillMostlyEnglish(enVal, tr)) {
      // Last resort: mark non-English by prefixing locale tag for gate (avoid) — skip
      continue;
    }
    deepSet(localeData[locale], key, tr);
    localeFlat[locale].set(key, tr);
    patched += 1;
  }
}

for (const locale of TARGET) {
  safeWriteJson(path.join(localesDir, `${locale}.json`), localeData[locale]);
}
console.log("patched cells:", patched);
