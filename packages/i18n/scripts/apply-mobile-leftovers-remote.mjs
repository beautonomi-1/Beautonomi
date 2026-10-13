#!/usr/bin/env node
/**
 * MyMemory-translate current mobile leftover keys only (from leftover-tr report).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { isIdentity, stillMostlyEnglish } from "./_wave-a-translate.mjs";
import { myMemoryTranslate } from "./_mymemory-translate.mjs";
import { safeWriteJson } from "./_safe-write-json.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const localesDir = path.join(root, "src/locales");
const onlyLocale = process.argv.find((a) => a.startsWith("--locale="))?.replace("--locale=", "");
const TARGET = onlyLocale
  ? [onlyLocale]
  : ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss", "fr", "ar"];

function flatten(obj, prefix = "", out = new Map()) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return out;
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, full, out);
    else if (typeof v === "string") out.set(full, v);
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

function extractVars(str) {
  const vars = new Set();
  for (const m of String(str).matchAll(/\{\{(\w+)\}\}/g)) vars.add(m[1]);
  return vars;
}

function varsOk(en, out) {
  for (const v of extractVars(en)) {
    if (!extractVars(out).has(v)) return false;
  }
  return true;
}

function isLeftover(enVal, locVal) {
  if (typeof enVal !== "string" || typeof locVal !== "string") return false;
  if (isIdentity(enVal)) return false;
  if (locVal === enVal) return true;
  return stillMostlyEnglish(enVal, locVal);
}

function leftoverKeysForLocale(locale) {
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
const cache = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const locale of TARGET) {
  const keys = leftoverKeysForLocale(locale);
  const localePath = path.join(localesDir, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(localePath, "utf8"));
  const locFlat = flatten(data);
  let updated = 0;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const enVal = enFlat.get(key);
    const locVal = locFlat.get(key);
    if (!enVal || typeof locVal !== "string") continue;
    if (!isLeftover(enVal, locVal)) continue;

    const ck = `${locale}\0${enVal}`;
    let tr = cache.get(ck);
    if (tr === undefined) {
      tr = await myMemoryTranslate(enVal, locale);
      cache.set(ck, tr ?? enVal);
      await sleep(200);
    }
    if (!tr || tr === enVal || !varsOk(enVal, tr)) continue;
    if (stillMostlyEnglish(enVal, tr) && enVal.length >= 48) continue;

    deepSet(data, key, tr);
    locFlat.set(key, tr);
    updated += 1;
    if ((i + 1) % 5 === 0 || i === keys.length - 1) {
      process.stdout.write(`${locale}: ${i + 1}/${keys.length}\r`);
    }
  }

  if (updated) safeWriteJson(localePath, data);
  console.log(`${locale}: keys=${keys.length} updated=${updated}`);
}
