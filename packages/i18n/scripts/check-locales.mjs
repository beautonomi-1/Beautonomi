#!/usr/bin/env node
/**
 * Validates bundled locale JSON files against en.json.
 *
 * Non-overlay locales may be partial (Wave B core-only locales contain only
 * `common`, `auth`, `authGate`, and `web.seo`, falling back to English for
 * everything else). For each non-overlay locale we validate that:
 *   - the file is valid JSON,
 *   - no `_plural` (legacy plural) keys exist,
 *   - every key that DOES exist also exists in en.json (no orphan keys),
 *   - interpolation `{{var}}` placeholders for existing keys match en.json.
 * We do NOT require every en.json key to exist in every locale.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "../src/locales");
const enPath = path.join(localesDir, "en.json");

function flatten(obj, prefix = "") {
  const out = new Map();
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [k, v] of flatten(value, full)) out.set(k, v);
    } else {
      out.set(full, String(value ?? ""));
    }
  }
  return out;
}

function extractVars(str) {
  const vars = new Set();
  for (const m of str.matchAll(/\{\{(\w+)\}\}/g)) vars.add(m[1]);
  return vars;
}

/** Arabic (and future CLDR-rich locales) may define _zero/_two/_few/_many when en only has _one/_other. */
function isAllowedExtraPluralKey(key, enFlat) {
  const m = key.match(/^(.*)_(zero|two|few|many)$/);
  if (!m) return false;
  const base = m[1];
  return enFlat.has(`${base}_one`) || enFlat.has(`${base}_other`);
}

const en = JSON.parse(fs.readFileSync(enPath, "utf8"));
const enFlat = flatten(en);
const enKeys = [...enFlat.keys()].sort();

const overlayLocales = new Set(["en-GB", "en-US", "en-AU", "pt-BR", "es-MX"]);
const files = fs.readdirSync(localesDir).filter((f) => f.endsWith(".json") && f !== "en.json");

let failed = false;

for (const file of files) {
  const code = file.replace(/\.json$/, "");
  const raw = JSON.parse(fs.readFileSync(path.join(localesDir, file), "utf8"));
  const flat = flatten(raw);
  const keys = [...flat.keys()].sort();

  if (overlayLocales.has(code)) {
    for (const k of keys) {
      if (!enFlat.has(k)) continue;
      const enVars = extractVars(enFlat.get(k));
      const locVars = extractVars(flat.get(k) ?? "");
      for (const v of enVars) {
        if (!locVars.has(v)) {
          console.error(`[${code}] key ${k} missing interpolation {{${v}}}`);
          failed = true;
        }
      }
    }
    continue;
  }

  // Partial locales (Wave B) intentionally contain only core sections and fall back to
  // English via FALLBACK_LNG_MAP for the rest. Validate only that:
  //   (a) the file is valid JSON (parsed above),
  //   (b) no `_plural` keys exist,
  //   (c) any keys that DO exist must also exist in en.json (no orphan keys),
  //   (d) interpolation vars for existing keys match en.json.
  for (const k of keys) {
    if (!enFlat.has(k) && !isAllowedExtraPluralKey(k, enFlat)) {
      console.error(`[${code}] extra key: ${k}`);
      failed = true;
    }
  }

  for (const k of keys) {
    if (!enFlat.has(k)) continue;
    const enVars = extractVars(enFlat.get(k));
    const locVars = extractVars(flat.get(k) ?? "");
    for (const v of enVars) {
      if (!locVars.has(v)) {
        console.error(`[${code}] key ${k} missing interpolation {{${v}}}`);
        failed = true;
      }
    }
    if (k.endsWith("_plural")) {
      console.error(`[${code}] forbidden legacy plural key: ${k} (use _one/_other)`);
      failed = true;
    }
  }
}

for (const k of enKeys) {
  if (k.endsWith("_plural")) {
    console.error(`[en] forbidden legacy plural key: ${k} (use _one/_other)`);
    failed = true;
  }
}

if (failed) {
  console.error("i18n:check failed");
  process.exit(1);
}
console.log(`i18n:check passed (${files.length} locale files vs en.json)`);
