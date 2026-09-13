import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "../src/locales");

function flatten(obj, prefix = "", out = new Map()) {
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      flatten(value, full, out);
    } else {
      out.set(full, String(value ?? ""));
    }
  }
  return out;
}

function unflatten(map) {
  const root = {};
  for (const [k, v] of map) {
    const parts = k.split(".");
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      cur[parts[i]] ??= {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = v;
  }
  return root;
}

const en = JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8"));
const fr = JSON.parse(fs.readFileSync(path.join(localesDir, "fr.json"), "utf8"));
const enFlat = flatten(en);
const frFlat = flatten(fr);
const missing = new Map();
for (const [k, v] of enFlat) {
  if (!frFlat.has(k)) missing.set(k, v);
}
const out = unflatten(missing);
const outPath = path.join(__dirname, "../_missing-en.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log("missing keys", missing.size);
console.log("wrote", outPath);
