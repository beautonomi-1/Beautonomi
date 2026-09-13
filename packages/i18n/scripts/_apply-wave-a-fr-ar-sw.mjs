/**
 * Translate missing + leftover-English keys for fr/ar/sw and write/merge deltas.
 *
 * Usage:
 *   node scripts/_apply-wave-a-fr-ar-sw.mjs --namespaces common,auth,authGate,customer,web.seo --merge
 *   node scripts/_apply-wave-a-fr-ar-sw.mjs --namespaces provider --merge
 *   node scripts/_apply-wave-a-fr-ar-sw.mjs --namespaces web --merge
 *   node scripts/_apply-wave-a-fr-ar-sw.mjs --chrome-sweep --merge
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXACT, extractVars, isIdentity, loadExternalMaps, translate } from "./_wave-a-fr-ar-sw.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const localesDir = path.join(root, "src/locales");
const deltasDir = path.join(root, "_deltas");

const args = process.argv.slice(2);
const merge = args.includes("--merge");
const chromeSweep = args.includes("--chrome-sweep");
const retranslateCalques = args.includes("--retranslate-calques");
const nsArg = args.find((a) => a.startsWith("--namespaces=")) || "";
const namespaces = nsArg
  .replace("--namespaces=", "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

loadExternalMaps(path.join(root, "_maps"), fs, path);

function flatten(obj, prefix = "", out = new Map()) {
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) flatten(value, full, out);
    else out.set(full, String(value ?? ""));
  }
  return out;
}

function unflatten(map) {
  const rootObj = {};
  for (const [k, v] of map) {
    const parts = k.split(".");
    let cur = rootObj;
    for (let i = 0; i < parts.length - 1; i++) {
      cur[parts[i]] ??= {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = v;
  }
  return rootObj;
}

function inNamespaces(key) {
  if (!namespaces.length) return true;
  return namespaces.some((ns) => key === ns || key.startsWith(`${ns}.`));
}

function looksEnglish(s) {
  if (!s || isIdentity(s)) return false;
  return /[A-Za-z]/.test(s) && !/[\u0600-\u06FF]/.test(s);
}

function stillEnglish(en, translated) {
  if (translated === en) return true;
  if (!looksEnglish(en)) return false;
  const enWords = en.toLowerCase().match(/[a-z]{3,}/g) || [];
  if (enWords.length < 2) return translated === en;
  const hit = enWords.filter((w) => translated.toLowerCase().includes(w)).length;
  return hit / enWords.length >= 0.7;
}

const CALQUE_RE =
  /ajouterress|anonther|confirmered|annulerled|Afternonon|télétéléphone|semainely|ajouter-ons|\bnonm\b|At My Lieu|introuvable\?|for this | in this | to the | to your |\bPlease\b|\bplease\b|\byour\b.*\b(e-mail|email|phone|profil)/i;

function looksCalqued(en, loc) {
  if (!loc || loc === en) return true;
  if (stillEnglish(en, loc)) return true;
  if (CALQUE_RE.test(loc)) return true;
  if (/\b(the|this|your|with|from|again|available|select|enter)\b/i.test(loc) && /[àâéèêëïîôùûüç]|’|«|»/.test(loc)) {
    return true;
  }
  return false;
}

function deepMerge(target, source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return source;
  const out = { ...target };
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === "object" && !Array.isArray(v) && target?.[k] && typeof target[k] === "object") {
      out[k] = deepMerge(target[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

const CHROME = [
  "Add",
  "Filter",
  "Yes",
  "Submit",
  "Search",
  "Save",
  "Cancel",
  "Delete",
  "Edit",
  "Back",
  "Next",
  "Done",
  "Close",
  "Confirm",
  "Apply",
  "Clear",
  "Sort",
  "No",
  "Retry",
  "Send",
  "Share",
  "Copy",
  "Remove",
];

const en = JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8"));
const enFlat = flatten(en);
const missingTree = JSON.parse(fs.readFileSync(path.join(root, "_missing-en.json"), "utf8"));
const missingFlat = flatten(missingTree);

fs.mkdirSync(deltasDir, { recursive: true });

const locales = ["fr", "ar", "sw"];
const report = {};

for (const locale of locales) {
  const localePath = path.join(localesDir, `${locale}.json`);
  const loc = JSON.parse(fs.readFileSync(localePath, "utf8"));
  const locFlat = flatten(loc);
  const delta = new Map();
  const leftoverUntranslated = [];
  let mapped = 0;
  let identity = 0;

  const candidateKeys = new Set();
  for (const [k] of missingFlat) if (inNamespaces(k)) candidateKeys.add(k);
  for (const [k, v] of locFlat) {
    if (!inNamespaces(k)) continue;
    const ev = enFlat.get(k);
    if (ev && v === ev && !isIdentity(ev)) candidateKeys.add(k);
  }
  if (chromeSweep) {
    for (const [k, v] of locFlat) {
      if (CHROME.includes(v) && enFlat.get(k) === v) candidateKeys.add(k);
    }
  }
  if (retranslateCalques) {
    for (const [k, v] of locFlat) {
      if (!inNamespaces(k)) continue;
      const ev = enFlat.get(k);
      if (!ev || isIdentity(ev)) continue;
      if (looksCalqued(ev, v)) candidateKeys.add(k);
      const exact = EXACT.get(ev);
      if (exact?.[locale] && exact[locale] !== v) candidateKeys.add(k);
    }
  }

  for (const key of candidateKeys) {
    const ev = enFlat.get(key) ?? missingFlat.get(key);
    if (typeof ev !== "string") continue;
    if (isIdentity(ev)) {
      delta.set(key, ev);
      identity += 1;
      continue;
    }
    const translated = translate(ev, locale);
    const enVars = extractVars(ev);
    const locVars = extractVars(translated);
    let safe = translated;
    for (const v of enVars) {
      if (!locVars.has(v)) {
        safe = ev;
        leftoverUntranslated.push(`${key}: missing {{${v}}}`);
        break;
      }
    }
    if (safe !== ev) {
      mapped += 1;
      delta.set(key, safe);
    } else {
      leftoverUntranslated.push(ev);
      delta.set(key, ev);
    }
  }

  const tree = unflatten(delta);
  const deltaPath = path.join(deltasDir, `${locale}.json`);
  fs.writeFileSync(deltaPath, JSON.stringify(tree, null, 2) + "\n");

  if (merge) {
    const merged = deepMerge(loc, tree);
    fs.writeFileSync(localePath, JSON.stringify(merged, null, 2) + "\n");
  }

  const uniqueLeft = [...new Set(leftoverUntranslated.filter((s) => !s.includes("missing {{")))];
  report[locale] = {
    keys: delta.size,
    mapped,
    identity,
    stillEnglish: uniqueLeft.length,
  };
  fs.writeFileSync(
    path.join(root, "_maps", `_untranslated-${locale}.json`),
    JSON.stringify(uniqueLeft.sort((a, b) => a.length - b.length || a.localeCompare(b)), null, 2),
  );
  console.log(
    `${locale}: keys ${delta.size} mapped ${mapped} identity ${identity} stillEnglish ${uniqueLeft.length} → _deltas/${locale}.json${merge ? " (merged)" : ""}`,
  );
}

console.log(JSON.stringify(report, null, 2));
