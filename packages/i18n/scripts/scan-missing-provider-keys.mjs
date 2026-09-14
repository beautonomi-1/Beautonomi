#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(__dirname, "../../..");
const en = JSON.parse(fs.readFileSync(path.join(__dirname, "../src/locales/en.json"), "utf8"));

function flat(obj, prefix = "", out = new Map()) {
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) flat(value, full, out);
    else out.set(full, String(value ?? ""));
  }
  return out;
}

const enFlat = flat(en);
const roots = [
  path.join(repo, "apps/web/src/app/provider"),
  path.join(repo, "apps/web/src/components/provider"),
  path.join(repo, "apps/web/src/components/provider-portal"),
];
const re = /t\(\s*["'`](web\.provider[^"'`$]+)["'`]/g;
const missing = new Map();

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(fp);
    else if (/\.(tsx|ts)$/.test(ent.name)) {
      const src = fs.readFileSync(fp, "utf8");
      let m;
      while ((m = re.exec(src))) {
        const key = m[1];
        if (!enFlat.has(key)) {
          const hasPlural = enFlat.has(`${key}_one`) || enFlat.has(`${key}_other`);
          if (!hasPlural) missing.set(key, (missing.get(key) ?? 0) + 1);
        }
      }
    }
  }
}

for (const root of roots) walk(root);

const sorted = [...missing.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
console.log(`missing keys: ${sorted.length}`);
for (const [k, c] of sorted.slice(0, 80)) console.log(`${c}\t${k}`);
process.exitCode = sorted.length > 0 ? 1 : 0;
