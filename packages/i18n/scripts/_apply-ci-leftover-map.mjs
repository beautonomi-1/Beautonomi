#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeWriteJson } from "./_safe-write-json.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const map = JSON.parse(fs.readFileSync(path.join(root, "_maps/t-sa-mobile-ci-leftover.json"), "utf8"));
const localesDir = path.join(root, "src/locales");
const locales = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];

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

const en = flatten(JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8")));

for (const locale of locales) {
  const localePath = path.join(localesDir, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(localePath, "utf8"));
  const loc = flatten(data);
  let patched = 0;
  for (const [key, enVal] of en) {
    const locVal = loc.get(key);
    if (locVal !== enVal) continue;
    const row = map[enVal];
    const next = row?.[locale];
    if (!next || next === enVal) continue;
    deepSet(data, key, next);
    loc.set(key, next);
    patched += 1;
  }
  safeWriteJson(localePath, data);
  console.log(`${locale}: patched=${patched}`);
}
