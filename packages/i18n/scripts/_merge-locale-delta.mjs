/**
 * Deep-merge a translated delta into a locale file.
 * Usage: node scripts/_merge-locale-delta.mjs fr packages/i18n/_deltas/fr.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "../src/locales");

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

const [locale, deltaPath] = process.argv.slice(2);
if (!locale || !deltaPath) {
  console.error("Usage: node _merge-locale-delta.mjs <locale> <delta.json>");
  process.exit(1);
}

const localePath = path.join(localesDir, `${locale}.json`);
const base = JSON.parse(fs.readFileSync(localePath, "utf8"));
const delta = JSON.parse(fs.readFileSync(path.resolve(deltaPath), "utf8"));
const merged = deepMerge(base, delta);
fs.writeFileSync(localePath, JSON.stringify(merged, null, 2) + "\n");
console.log(`merged ${deltaPath} → ${locale}.json`);
