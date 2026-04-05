/**
 * Removes incorrectly inserted LAST_RESORT_CURRENCY import from inside multi-line import blocks
 * and ensures a single top-level import exists when LAST_RESORT_CURRENCY is referenced.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../../apps/web/src");

const IMPORT_LINE =
  'import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";';

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === ".next") continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(ent.name)) {
      if (ent.name === "last-resort-currency.ts") continue;
      out.push(p);
    }
  }
  return out;
}

function fixFile(filePath) {
  let s = fs.readFileSync(filePath, "utf8");
  const orig = s;

  // Remove orphan import line that broke `import {` blocks
  const broken =
    /import \{\s*\r?\nimport \{ LAST_RESORT_CURRENCY \} from "@\/lib\/regions\/last-resort-currency";\s*\r?\n/g;
  s = s.replace(broken, "import {\n");

  if (s === orig && !s.includes("LAST_RESORT_CURRENCY")) return false;

  const uses = /\bLAST_RESORT_CURRENCY\b/.test(s);
  const hasImport = s.includes('@/lib/regions/last-resort-currency');
  if (uses && !hasImport) {
    const lines = s.split("\n");
    let insertAt = 0;
    if (lines[0]?.trim() === '"use client";') {
      insertAt = 1;
      while (insertAt < lines.length && lines[insertAt].trim() === "") insertAt++;
    }
    lines.splice(insertAt, 0, IMPORT_LINE, "");
    s = lines.join("\n");
  }

  if (s !== orig) {
    fs.writeFileSync(filePath, s);
    return true;
  }
  return false;
}

let n = 0;
for (const f of walk(root)) {
  if (fixFile(f)) {
    n++;
    console.log(path.relative(path.join(__dirname, "../.."), f));
  }
}
console.log(`Repaired ${n} files.`);
