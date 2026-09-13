/**
 * Apply Wave A translations onto `_missing-en.json` and write delta trees.
 * Usage: node scripts/_build-wave-a-deltas.mjs [locale ...]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LANGS, isIdentity, translateTree } from "./_wave-a-translate.mjs";

function pruneUntranslated(enNode, locNode) {
  if (typeof enNode === "string") {
    if (isIdentity(enNode)) return locNode;
    if (locNode === enNode) return undefined;
    return locNode;
  }
  if (enNode && typeof enNode === "object" && !Array.isArray(enNode)) {
    const out = {};
    for (const [k, v] of Object.entries(enNode)) {
      const child = pruneUntranslated(v, locNode?.[k]);
      if (child !== undefined) out[k] = child;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return locNode;
}

function countLeaves(node) {
  if (typeof node === "string") return 1;
  if (!node || typeof node !== "object") return 0;
  return Object.values(node).reduce((n, v) => n + countLeaves(v), 0);
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const missing = JSON.parse(fs.readFileSync(path.join(root, "_missing-en.json"), "utf8"));
const deltasDir = path.join(root, "_deltas");
fs.mkdirSync(deltasDir, { recursive: true });

const requested = process.argv.slice(2);
const locales = requested.length ? requested : LANGS;

for (const locale of locales) {
  if (!LANGS.includes(locale)) {
    console.error(`skip unknown locale ${locale}`);
    continue;
  }
  const stats = { total: 0, translated: 0, identity: 0, untranslated: 0, varErrors: [] };
  const tree = translateTree(missing, locale, stats);
  const pruned = pruneUntranslated(missing, tree) ?? {};
  const outPath = path.join(deltasDir, `${locale}.json`);
  fs.writeFileSync(outPath, JSON.stringify(pruned, null, 2) + "\n");
  console.log(
    `${locale}: merged ${countLeaves(pruned)} (translated ${stats.translated} identity ${stats.identity} leftover-en ${stats.untranslated}) vars ${stats.varErrors.length} → _deltas/${locale}.json`,
  );
  if (stats.varErrors.length) {
    console.error(stats.varErrors.slice(0, 25).join("\n"));
  }
}
