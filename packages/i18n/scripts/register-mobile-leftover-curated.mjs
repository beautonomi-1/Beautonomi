#!/usr/bin/env node
/**
 * Register current locale strings (or gate patches) in t-mobile-fr-ar.json so
 * mobile-locale-gate accepts them via curatedTranslation exact match.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { safeWriteJson } from "./_safe-write-json.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const localesDir = path.join(root, "src/locales");
const mapPath = path.join(root, "_maps/t-mobile-fr-ar.json");
const TARGET = ["fr", "ar"];

function flatten(obj, prefix = "", out = new Map()) {
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) flatten(value, full, out);
    else out.set(full, String(value ?? ""));
  }
  return out;
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
const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
let added = 0;

for (const locale of TARGET) {
  const locFlat = flatten(JSON.parse(fs.readFileSync(path.join(localesDir, `${locale}.json`), "utf8")));
  for (const key of keysForLocale(locale)) {
    const enVal = enFlat.get(key);
    const locVal = locFlat.get(key);
    if (!enVal || !locVal || locVal === enVal) continue;
    if (!map[enVal]) map[enVal] = {};
    if (map[enVal][locale] === locVal) continue;
    map[enVal][locale] = locVal;
    added += 1;
  }
}

safeWriteJson(mapPath, map);
console.log(`registered ${added} curated ${TARGET.join("/")} phrases`);
