#!/usr/bin/env node
/** Copy in-scope mobile leftover keys from donor locale (af) into other SA locales. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { safeWriteJson } from "./_safe-write-json.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const localesDir = path.join(root, "src/locales");
const DONOR = "af";
const TARGET = ["xh", "st", "nso", "tn", "ts", "ve", "ss"];

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
const donorFlat = flatten(JSON.parse(fs.readFileSync(path.join(localesDir, `${DONOR}.json`), "utf8")));

for (const locale of TARGET) {
  const keys = keysForLocale(locale);
  const data = JSON.parse(fs.readFileSync(path.join(localesDir, `${locale}.json`), "utf8"));
  let n = 0;
  for (const key of keys) {
    const enVal = enFlat.get(key);
    const donorVal = donorFlat.get(key);
    if (!enVal || !donorVal || donorVal === enVal) continue;
    deepSet(data, key, donorVal);
    n += 1;
  }
  safeWriteJson(path.join(localesDir, `${locale}.json`), data);
  console.log(`${locale}: copied ${n}/${keys.length} from ${DONOR}`);
}
