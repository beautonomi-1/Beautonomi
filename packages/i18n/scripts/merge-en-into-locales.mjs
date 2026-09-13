#!/usr/bin/env node
/** Copy en.json leaf keys into all full locale files (parity for CI). Overlays skipped. */
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

const en = JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8"));
const enFlat = flatten(en);

for (const file of fs.readdirSync(localesDir).filter((f) => f.endsWith(".json"))) {
  const code = file.replace(/\.json$/, "");
  if (code === "en" || OVERLAYS.has(code)) continue;
  const targetPath = path.join(localesDir, file);
  const target = JSON.parse(fs.readFileSync(targetPath, "utf8"));
  const targetFlat = flatten(target);
  for (const [k, v] of enFlat) {
    if (!targetFlat.has(k)) targetFlat.set(k, v);
  }
  fs.writeFileSync(targetPath, JSON.stringify(unflatten(targetFlat), null, 2) + "\n");
  console.log("merged", code);
}
