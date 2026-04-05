/**
 * Replaces `?? "ZAR"` / `?? 'ZAR'` with `?? LAST_RESORT_CURRENCY` under apps/web/src
 * and inserts `import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";`
 *
 * Run from repo root: node tooling/scripts/codemod-last-resort-currency.mjs
 * Then run: node tooling/scripts/repair-last-resort-imports.mjs
 * (first pass can break multi-line `import {` blocks; repair fixes them.)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../../apps/web/src");

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === ".next") continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(ent.name)) out.push(p);
  }
  return out;
}

const IMPORT_LINE =
  'import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";';

function ensureImport(content) {
  if (content.includes(IMPORT_LINE)) return content;
  const lines = content.split("\n");
  let lastImportIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("import ") || line.startsWith("import\t")) lastImportIdx = i;
    else if (line !== "" && lastImportIdx >= 0 && !line.startsWith("//")) break;
  }
  if (lastImportIdx < 0) {
    return IMPORT_LINE + "\n\n" + content;
  }
  lines.splice(lastImportIdx + 1, 0, IMPORT_LINE);
  return lines.join("\n");
}

function processFile(filePath) {
  let s = fs.readFileSync(filePath, "utf8");
  if (filePath.endsWith("last-resort-currency.ts")) return false;

  const orig = s;
  s = s.replaceAll('?? "ZAR"', "?? LAST_RESORT_CURRENCY");
  s = s.replaceAll("?? 'ZAR'", "?? LAST_RESORT_CURRENCY");

  if (s === orig) return false;

  if (!s.includes("LAST_RESORT_CURRENCY")) return false;

  if (!s.includes('@/lib/regions/last-resort-currency')) {
    s = ensureImport(s);
  }

  fs.writeFileSync(filePath, s);
  return true;
}

const files = walk(root);
let n = 0;
for (const f of files) {
  if (processFile(f)) {
    n++;
    console.log(path.relative(path.join(__dirname, "../.."), f));
  }
}
console.log(`Updated ${n} files.`);
