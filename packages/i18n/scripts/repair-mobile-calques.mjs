#!/usr/bin/env node
/**
 * Reset mixed English calques (stillMostlyEnglish) back to English before exact-map apply.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isIdentity, stillMostlyEnglish } from "./_wave-a-translate.mjs";
import { safeWriteJson } from "./_safe-write-json.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "../src/locales");
const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];
const FRAR = ["fr", "ar"];
const TARGET = [...SA, ...FRAR];

const PREFIXES = [
  "common",
  "auth",
  "authGate",
  "checkout",
  "booking",
  "payments",
  "validation",
  "errors",
  "time",
  "bookingLifecycle",
  "customer.mobile",
  "provider.mobile",
  "web.global.cityWaitlist",
  "web.global.marketAvailability",
  "customer",
  "provider",
];

function flatten(obj, prefix = "", out = new Map()) {
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) flatten(value, full, out);
    else out.set(full, String(value ?? ""));
  }
  return out;
}

function inScope(key) {
  if (PREFIXES.some((p) => key === p || key.startsWith(`${p}.`))) {
    if (key.startsWith("customer.mobile.") || key.startsWith("provider.mobile.")) return true;
    if (key.startsWith("customer.") && !key.startsWith("customer.mobile.")) return PREFIXES.includes("customer");
    if (key.startsWith("provider.") && !key.startsWith("provider.mobile.")) return PREFIXES.includes("provider");
    return !key.startsWith("customer.") && !key.startsWith("provider.");
  }
  return false;
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

function loadSaMaps() {
  const maps = {};
  const mapsDir = path.join(__dirname, "../_maps");
  const files = fs
    .readdirSync(mapsDir)
    .filter((f) => f.startsWith("t-sa-mobile-") && f.endsWith(".json") && !f.includes(".built."))
    .sort((a, b) => {
      const ar = a.includes("refined") ? 1 : 0;
      const br = b.includes("refined") ? 1 : 0;
      if (ar !== br) return ar - br;
      return a.localeCompare(b);
    });
  for (const f of files) {
    Object.assign(maps, JSON.parse(fs.readFileSync(path.join(mapsDir, f), "utf8")));
  }
  return maps;
}

function loadFrArMaps() {
  const p = path.join(__dirname, "../_maps/t-mobile-fr-ar.json");
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const saMaps = loadSaMaps();
const frArMaps = loadFrArMaps();
const en = JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8"));
const enFlat = flatten(en);

for (const locale of TARGET) {
  const localePath = path.join(localesDir, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(localePath, "utf8"));
  const locFlat = flatten(data);
  let reset = 0;

  for (const [key, enVal] of enFlat) {
    if (!inScope(key)) continue;
    const locVal = locFlat.get(key);
    if (typeof locVal !== "string" || isIdentity(enVal)) continue;
    if (locVal === enVal) continue;
    if (!stillMostlyEnglish(enVal, locVal)) continue;
    const mapTr =
      SA.includes(locale) ? saMaps[enVal]?.[locale] : frArMaps[enVal]?.[locale];
    if (mapTr && locVal === mapTr) continue;
    deepSet(data, key, enVal);
    reset += 1;
  }

  safeWriteJson(localePath, data);
  console.log(`${locale}: reset ${reset} calques → English`);
}
