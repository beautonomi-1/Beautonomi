#!/usr/bin/env node
/**
 * Revert accidental ": unknown" (and related) back to ": any" after eslint --fix
 * with fixToUnknown applied. Run from apps/web: node scripts/revert-unknown-to-any.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(__dirname, "..", "src");

function walk(dir, exts, cb) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== ".next") walk(full, exts, cb);
    } else if (exts.some((ext) => e.name.endsWith(ext))) {
      cb(full);
    }
  }
}

let files = 0;
let replacements = 0;
walk(srcDir, [".ts", ".tsx"], (filePath) => {
  let content = fs.readFileSync(filePath, "utf8");
  const orig = content;
  // Revert type annotation and assertions unknown -> any (eslint fixToUnknown + as unknown)
  content = content.replace(/: unknown\b/g, ": any");
  content = content.replace(/:unknown\b/g, ": any");
  content = content.replace(/\bas unknown\b/g, "as any");
  content = content.replace(/<unknown\b/g, "<any");
  content = content.replace(/, unknown\b/g, ", any");
  content = content.replace(/\(unknown\)/g, "(any)");
  if (content !== orig) {
    fs.writeFileSync(filePath, content);
    files++;
    const count =
      (orig.match(/: unknown\b/g) || []).length +
      (orig.match(/\bas unknown\b/g) || []).length +
      (orig.match(/<unknown\b/g) || []).length;
    replacements += count;
  }
});
console.log(`Reverted unknown -> any in ${files} files (${replacements} replacements).`);
