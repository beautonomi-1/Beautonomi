/**
 * Translate `_missing-en.json` with the Wave A engine and write locale deltas.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractVars, isIdentity, loadExternalMaps, translate } from "./_wave-a-fr-ar-sw.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
loadExternalMaps(path.join(root, "_maps"), fs, path);

const missing = JSON.parse(fs.readFileSync(path.join(root, "_missing-en.json"), "utf8"));

function translateTree(node, locale, stats, pathKey = "") {
  if (typeof node === "string") {
    stats.total += 1;
    if (isIdentity(node)) {
      stats.identity += 1;
      return node;
    }
    const hit = translate(node, locale);
    const enVars = extractVars(node);
    const locVars = extractVars(hit);
    for (const v of enVars) {
      if (!locVars.has(v)) {
        stats.varErrors += 1;
        return node;
      }
    }
    if (hit !== node) stats.mapped += 1;
    else stats.still += 1;
    return hit;
  }
  if (node && typeof node === "object" && !Array.isArray(node)) {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      out[k] = translateTree(v, locale, stats, pathKey ? `${pathKey}.${k}` : k);
    }
    return out;
  }
  return node;
}

fs.mkdirSync(path.join(root, "_deltas"), { recursive: true });
const report = {};
for (const locale of ["fr", "ar", "sw"]) {
  const stats = { total: 0, mapped: 0, identity: 0, still: 0, varErrors: 0 };
  const tree = translateTree(missing, locale, stats);
  fs.writeFileSync(path.join(root, "_deltas", `${locale}.json`), JSON.stringify(tree, null, 2) + "\n");
  report[locale] = stats;
  console.log(`${locale}: total ${stats.total} mapped ${stats.mapped} identity ${stats.identity} still ${stats.still} vars ${stats.varErrors}`);
}
console.log(JSON.stringify(report));
