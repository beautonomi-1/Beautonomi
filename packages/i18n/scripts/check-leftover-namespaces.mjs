#!/usr/bin/env node
/**
 * Exits 1 if en.json contains web.provider paths matching leftover bucket names.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const enPath = path.join(__dirname, "../src/locales/en.json");

const BUCKET_RE = /leftoverCopy|\.leftover[0-9]?\./;
const BUCKET_KEY_RE = /\.leftover"$/;

function walk(obj, prefix, hits) {
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (BUCKET_RE.test(full) || full.endsWith(".leftover")) {
      hits.push(full);
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      walk(value, full, hits);
    }
  }
}

const raw = fs.readFileSync(enPath, "utf8");
const en = JSON.parse(raw);
const provider = en?.web?.provider;
if (!provider) {
  console.error("Missing web.provider in en.json");
  process.exit(1);
}

const hits = [];
walk(provider, "web.provider", hits);

const jsonHits = [];
if (BUCKET_KEY_RE.test(raw.replace(/\n/g, ""))) {
  // Catch ".leftover": object keys in web.provider subtree via JSON text
  for (const m of raw.matchAll(/"web\.provider[^"]*\.leftover"\s*:/g)) {
    jsonHits.push(m[0].replace(/\s*:$/, ""));
  }
}

const all = [...new Set([...hits, ...jsonHits])].sort();
if (all.length > 0) {
  console.error("Forbidden leftover namespaces under web.provider:");
  for (const h of all) console.error(`  ${h}`);
  process.exit(1);
}

console.log("OK: no leftover namespaces under web.provider");
