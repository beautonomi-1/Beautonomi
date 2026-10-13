#!/usr/bin/env node
/**
 * Build phrase maps for current mobile leftover keys (offline wave-A / fr-ar).
 * Writes/merges into _maps/t-sa-mobile-ci-leftover.json and t-mobile-fr-ar.json
 */
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const localesDir = path.join(root, "src/locales");
const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];
const FRAR = ["fr", "ar"];
const TARGET = [...SA, ...FRAR];

/** Cognates / wave-A misses — hand-tuned per locale where needed. */
const MANUAL = {
  "Shipping weight (g)": {
    af: "Versending gewig (g)",
    zu: "Ubukhulu besisindo bokuthumela (g)",
    fr: "Poids d'expédition (g)",
    ar: "وزن الشحن (g)",
  },
  "Switch machine": {
    af: "Wissel kaartmasjien",
    zu: "Shintsha imishini yekhadi",
    fr: "Changer de terminal",
    ar: "تبديل الجهاز",
  },
  Courier: { af: "Koerier", zu: "Umthumeli", fr: "Transporteur", ar: "شركة الشحن" },
  "Original audio": {
    af: "Oorspronklike klank",
    zu: "Umsindo wokuqala",
    fr: "Audio d'origine",
    ar: "الصوت الأصلي",
  },
  "Book courier": {
    af: "Bespreek koerier",
    zu: "Bhukha umthumeli",
    fr: "Réserver un coursier",
    ar: "حجز شركة الشحن",
  },
  "Print label": {
    af: "Druk etiket",
    zu: "Phrinta ilebula",
    fr: "Imprimer l'étiquette",
    ar: "طباعة الملصق",
  },
  "Collect on {{name}} ({{provider}})": {
    af: "Invorder op {{name}} ({{provider}})",
    zu: "Qoqa ku-{{name}} ({{provider}})",
    fr: "Encaisser sur {{name}} ({{provider}})",
    ar: "تحصيل على {{name}} ({{provider}})",
  },
};

function flatten(obj, prefix = "", out = new Map()) {
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) flatten(value, full, out);
    else out.set(full, String(value ?? ""));
  }
  return out;
}

function isLeftover(enVal, locVal) {
  if (typeof enVal !== "string" || typeof locVal !== "string") return false;
  if (isIdentity(enVal)) return false;
  if (locVal === enVal) return true;
  return stillMostlyEnglish(enVal, locVal);
}

function propose(en, locale) {
  const manual = MANUAL[en]?.[locale];
  if (manual && manual !== en) return manual;
  if (FRAR.includes(locale)) {
    const tr = translateFrAr(en, locale);
    if (tr && tr !== en && !stillMostlyEnglish(en, tr)) return tr;
  } else {
    for (const fn of [translateWaveA, translateBestEffort]) {
      const tr = fn(en, locale);
      if (tr && tr !== en && !stillMostlyEnglish(en, tr)) return tr;
    }
  }
  return null;
}

const locales = TARGET;
const keys = new Set();
for (const l of locales) {
  const r = spawnSync(process.execPath, ["scripts/leftover-tr-mobile-apps.mjs", "--list=" + l], {
    encoding: "utf8",
    cwd: root,
  });
  for (const line of (r.stdout || "").split("\n")) {
    if (/^(provider|customer)\./.test(line.trim())) keys.add(line.trim());
  }
}

const enFlat = flatten(JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8")));
const phrases = new Map();

for (const key of keys) {
  const enVal = enFlat.get(key);
  if (!enVal) continue;
  if (!phrases.has(enVal)) phrases.set(enVal, new Set());
  for (const locale of locales) {
    const locFlat = flatten(JSON.parse(fs.readFileSync(path.join(localesDir, `${locale}.json`), "utf8")));
    if (isLeftover(enVal, locFlat.get(key))) phrases.get(enVal).add(locale);
  }
}

const saMapPath = path.join(root, "_maps/t-sa-mobile-ci-leftover.json");
const frMapPath = path.join(root, "_maps/t-mobile-fr-ar.json");
const saMap = JSON.parse(fs.readFileSync(saMapPath, "utf8"));
const frMap = fs.existsSync(frMapPath) ? JSON.parse(fs.readFileSync(frMapPath, "utf8")) : {};

let added = 0;
for (const [enVal, needLocales] of phrases) {
  if (needLocales.size === 0) continue;
  const saRow = { ...(saMap[enVal] ?? {}) };
  const frRow = { ...(frMap[enVal] ?? {}) };
  for (const locale of needLocales) {
    const tr = propose(enVal, locale);
    if (!tr || tr === enVal) continue;
    if (SA.includes(locale)) saRow[locale] = tr;
    else frRow[locale] = tr;
    added++;
  }
  if (Object.keys(saRow).length) saMap[enVal] = { ...(saMap[enVal] ?? {}), ...saRow };
  if (Object.keys(frRow).length) frMap[enVal] = { ...(frMap[enVal] ?? {}), ...frRow };
}

fs.writeFileSync(saMapPath, JSON.stringify(saMap, null, 2) + "\n");
fs.writeFileSync(frMapPath, JSON.stringify(frMap, null, 2) + "\n");
console.log(`phrases=${phrases.size} locale-cells=${added}`);

spawnSync(process.execPath, ["scripts/apply-sa-mobile-maps-direct.mjs"], { cwd: root, stdio: "inherit" });
spawnSync(process.execPath, ["scripts/apply-fr-ar-mobile-maps-direct.mjs"], { cwd: root, stdio: "inherit" });
spawnSync(process.execPath, ["scripts/leftover-tr-mobile-apps.mjs", "--apply"], { cwd: root, stdio: "inherit" });
