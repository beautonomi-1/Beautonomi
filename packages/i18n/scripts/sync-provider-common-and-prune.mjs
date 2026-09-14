#!/usr/bin/env node
/**
 * 1. Hoist web.provider.onboarding.common → web.provider.common (en + all locales)
 * 2. Prune locale keys not present in en.json (fixes leftoverCopy orphans)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "../src/locales");
const OVERLAYS = new Set(["en-GB", "en-US", "en-AU", "pt-BR", "es-MX"]);

function flatten(obj, prefix = "") {
  const out = new Map();
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [k, v] of flatten(value, full)) out.set(k, v);
    } else {
      out.set(full, value);
    }
  }
  return out;
}

function unflatten(flat) {
  const root = {};
  for (const [pathKey, value] of flat) {
    const parts = pathKey.split(".");
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (!cur[p] || typeof cur[p] !== "object") cur[p] = {};
      cur = cur[p];
    }
    cur[parts[parts.length - 1]] = value;
  }
  return root;
}

function hoistCommon(tree) {
  const provider = tree?.web?.provider;
  if (!provider) return false;
  const onboardingCommon = provider.onboarding?.common;
  if (!onboardingCommon) return false;
  if (!provider.common) {
    provider.common = onboardingCommon;
  } else {
    provider.common = { ...onboardingCommon, ...provider.common };
  }
  delete provider.onboarding.common;
  return true;
}

const enPath = path.join(localesDir, "en.json");
const en = JSON.parse(fs.readFileSync(enPath, "utf8"));
if (hoistCommon(en)) {
  fs.writeFileSync(enPath, JSON.stringify(en, null, 2) + "\n");
  console.log("hoisted web.provider.common in en.json");
}

const enFlat = flatten(en);

for (const file of fs.readdirSync(localesDir).filter((f) => f.endsWith(".json"))) {
  const code = file.replace(/\.json$/, "");
  if (code === "en" || OVERLAYS.has(code)) continue;
  const filePath = path.join(localesDir, file);
  const loc = JSON.parse(fs.readFileSync(filePath, "utf8"));
  hoistCommon(loc);

  const locFlat = flatten(loc);
  const pruned = new Map();
  let removed = 0;
  for (const [k, v] of enFlat) {
    pruned.set(k, locFlat.has(k) ? locFlat.get(k) : v);
  }
  for (const k of locFlat.keys()) {
    if (!enFlat.has(k)) removed += 1;
  }

  fs.writeFileSync(filePath, JSON.stringify(unflatten(pruned), null, 2) + "\n");
  console.log(`${code}: pruned ${removed} orphan keys`);
}
