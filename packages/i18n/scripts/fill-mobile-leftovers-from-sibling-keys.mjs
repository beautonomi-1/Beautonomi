#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { stillMostlyEnglish } from "./_wave-a-translate.mjs";
import { safeWriteJson } from "./_safe-write-json.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const localesDir = path.join(root, "src/locales");
const TARGET = ["fr", "ar"];

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

function pickSibling(enVal, key, locFlat, enByValue) {
  const siblings = enByValue.get(enVal) || [];
  for (const sk of siblings) {
    if (sk === key) continue;
    const sv = locFlat.get(sk);
    if (!sv || sv === enVal) continue;
    if (stillMostlyEnglish(enVal, sv)) continue;
    return sv;
  }
  return null;
}

const enFlat = flatten(JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8")));
const enByValue = new Map();
for (const [k, v] of enFlat) {
  if (!enByValue.has(v)) enByValue.set(v, []);
  enByValue.get(v).push(k);
}

for (const locale of TARGET) {
  const locPath = path.join(localesDir, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(locPath, "utf8"));
  let locFlat = flatten(data);
  const keys = keysForLocale(locale);
  let filled = 0;
  for (const key of keys) {
    const enVal = enFlat.get(key);
    const cur = locFlat.get(key);
    if (!enVal || !cur) continue;
    if (cur !== enVal && !stillMostlyEnglish(enVal, cur)) continue;
    const pick = pickSibling(enVal, key, locFlat, enByValue);
    if (!pick) continue;
    deepSet(data, key, pick);
    locFlat.set(key, pick);
    filled += 1;
  }
  safeWriteJson(locPath, data);
  console.log(`${locale}: filled ${filled} from sibling keys`);
}
