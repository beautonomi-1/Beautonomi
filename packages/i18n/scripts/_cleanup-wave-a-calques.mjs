/**
 * Remove mixed-English calques that were merged from Wave A deltas.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LANGS, isIdentity, stillMostlyEnglish } from "./_wave-a-translate.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const missing = JSON.parse(fs.readFileSync(path.join(root, "_missing-en.json"), "utf8"));
const localesDir = path.join(root, "src/locales");

function prune(enNode, locNode, stats) {
  if (typeof enNode === "string") {
    if (locNode == null) return undefined;
    if (isIdentity(enNode)) return locNode;
    if (typeof locNode !== "string") return locNode;
    if (locNode === enNode || stillMostlyEnglish(enNode, locNode)) {
      stats.removed += 1;
      return undefined;
    }
    stats.kept += 1;
    return locNode;
  }
  if (enNode && typeof enNode === "object" && !Array.isArray(enNode)) {
    if (!locNode || typeof locNode !== "object") return locNode;
    const out = { ...locNode };
    for (const [k, v] of Object.entries(enNode)) {
      const child = prune(v, locNode[k], stats);
      if (child === undefined) delete out[k];
      else out[k] = child;
    }
    return out;
  }
  return locNode;
}

for (const locale of LANGS) {
  const file = path.join(localesDir, `${locale}.json`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const stats = { removed: 0, kept: 0 };
  const cleaned = prune(missing, json, stats);
  fs.writeFileSync(file, JSON.stringify(cleaned, null, 2) + "\n");
  console.log(`${locale}: kept ${stats.kept} removed-calque ${stats.removed}`);
}
