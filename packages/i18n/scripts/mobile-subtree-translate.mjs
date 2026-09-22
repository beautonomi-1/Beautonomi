#!/usr/bin/env node
/**
 * Deep-translate entire en.json subtrees into locale files (customer/provider mobile scope).
 * Overwrites leaves when translateTree output differs from English.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { translateTree } from "./_wave-a-translate.mjs";
import { loadExternalMaps, translate as translateFrArSw } from "./_wave-a-fr-ar-sw.mjs";
import { safeWriteJson } from "./_safe-write-json.mjs";
import { loadSaExternalMaps } from "./_wave-a-translate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const localesDir = path.join(root, "src/locales");

const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];
const FRAR = ["fr", "ar"];
const TARGET = [...SA, ...FRAR];

const SUBTREES = [
  "checkout",
  "booking",
  "common",
  "auth",
  "authGate",
  "payments",
  "validation",
  "errors",
  "time",
  "bookingLifecycle",
  "customer.mobile",
  "provider.mobile",
  "web.global.cityWaitlist",
  "web.global.marketAvailability",
];

loadExternalMaps(path.join(root, "_maps"), fs, path);
loadSaExternalMaps(path.join(root, "_maps"), fs, path);

function getAt(obj, dotted) {
  const parts = dotted.split(".");
  let cur = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

function setAt(obj, dotted, value) {
  const parts = dotted.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!cur[p] || typeof cur[p] !== "object") cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

function flattenLeaves(node, prefix, out) {
  if (typeof node === "string") {
    out.set(prefix, node);
    return;
  }
  if (!node || typeof node !== "object" || Array.isArray(node)) return;
  for (const [k, v] of Object.entries(node)) {
    flattenLeaves(v, prefix ? `${prefix}.${k}` : k, out);
  }
}

function translateSubtreeFrAr(enNode, locale) {
  if (typeof enNode === "string") return translateFrArSw(enNode, locale);
  if (!enNode || typeof enNode !== "object" || Array.isArray(enNode)) return enNode;
  const out = {};
  for (const [k, v] of Object.entries(enNode)) {
    out[k] = translateSubtreeFrAr(v, locale);
  }
  return out;
}

function translateSubtree(enNode, locale, prefix) {
  if (FRAR.includes(locale)) return translateSubtreeFrAr(enNode, locale);
  const stats = { total: 0, translated: 0, identity: 0, untranslated: 0, varErrors: [] };
  return translateTree(enNode, locale, stats, prefix);
}

const en = JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8"));

for (const locale of TARGET) {
  const localePath = path.join(localesDir, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(localePath, "utf8"));
  let replaced = 0;

  for (const sub of SUBTREES) {
    const enSub = getAt(en, sub);
    if (enSub === undefined) continue;
    const translated = translateSubtree(enSub, locale, sub);
    const enLeaves = new Map();
    const trLeaves = new Map();
    flattenLeaves(enSub, sub, enLeaves);
    flattenLeaves(translated, sub, trLeaves);

    for (const [key, enVal] of enLeaves) {
      const trVal = trLeaves.get(key);
      if (typeof trVal !== "string" || trVal === enVal) continue;
      setAt(data, key, trVal);
      replaced += 1;
    }
  }

  safeWriteJson(localePath, data);
  console.log(`${locale}: subtree merge replaced ${replaced} leaves`);
}
