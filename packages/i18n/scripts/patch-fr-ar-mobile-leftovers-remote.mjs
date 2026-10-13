#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { myMemoryTranslate, lockTokens, unlock } from "./_mymemory-translate.mjs";
import { stillMostlyEnglish } from "./_wave-a-translate.mjs";
import { safeWriteJson } from "./_safe-write-json.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const localesDir = path.join(root, "src/locales");
const TARGET = ["fr", "ar"];
const CONCURRENCY = 6;

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

const enFlat = flatten(JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8")));
const phraseCache = new Map();

async function translateEn(enVal, locale) {
  const ck = `${locale}\0${enVal}`;
  if (phraseCache.has(ck)) return phraseCache.get(ck);
  const { out, locks } = lockTokens(enVal);
  const tr = await myMemoryTranslate(out, locale);
  const unlocked = tr ? unlock(tr, locks) : null;
  phraseCache.set(ck, unlocked);
  return unlocked;
}

async function poolMap(items, fn, limit) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

for (const locale of TARGET) {
  const keys = keysForLocale(locale);
  const uniqueEn = [...new Set(keys.map((k) => enFlat.get(k)).filter(Boolean))];
  console.log(`${locale}: ${keys.length} keys, ${uniqueEn.length} unique phrases — translating…`);

  await poolMap(
    uniqueEn,
    async (enVal, i) => {
      if (i % 10 === 0) process.stdout.write(`${locale} phrases ${i}/${uniqueEn.length}\n`);
      await translateEn(enVal, locale);
    },
    CONCURRENCY,
  );

  const data = JSON.parse(fs.readFileSync(path.join(localesDir, `${locale}.json`), "utf8"));
  let updated = 0;
  let skipped = 0;
  for (const key of keys) {
    const enVal = enFlat.get(key);
    if (!enVal) continue;
    const tr = phraseCache.get(`${locale}\0${enVal}`);
    if (!tr || tr === enVal || stillMostlyEnglish(enVal, tr)) {
      skipped += 1;
      continue;
    }
    deepSet(data, key, tr);
    updated += 1;
  }
  safeWriteJson(path.join(localesDir, `${locale}.json`), data);
  console.log(`${locale}: updated ${updated}, skipped ${skipped}`);
}
