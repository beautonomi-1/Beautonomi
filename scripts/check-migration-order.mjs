#!/usr/bin/env node
/**
 * F4-01 — CI check that supabase/migrations filenames stay monotonic.
 *
 * Supabase CLI applies files in lexicographic order. Numeric prefixes of
 * mixed width (3-digit `999_` vs 5-digit `10141_`) invert that order, so a
 * replay-from-scratch does not match production. This script:
 *
 *   1. Requires a leading numeric prefix on every `.sql` file.
 *   2. Rejects duplicate prefixes.
 *   3. Within each prefix-digit-width group, lexicographic order MUST match
 *      numeric order (so new 5-digit files stay ordered among themselves).
 *   4. Reports (does not fail on) the known mixed-width inversion between
 *      groups — fixing that needs a one-time rename, not a CI flake.
 *
 * Usage: node scripts/check-migration-order.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");

const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const errors = [];
const parsed = [];

for (const file of files) {
  const m = /^(\d+)_/.exec(file);
  if (!m) {
    errors.push(`non-numeric prefix: ${file}`);
    continue;
  }
  parsed.push({ file, prefix: m[1], n: Number(m[1]), width: m[1].length });
}

const allowedDupesPath = path.join(repoRoot, "scripts", "migrations-allowed-duplicates.json");
let allowedDupes = new Set();
try {
  allowedDupes = new Set(JSON.parse(fs.readFileSync(allowedDupesPath, "utf8")));
} catch {
  allowedDupes = new Set();
}

const byPrefix = new Map();
for (const row of parsed) {
  const bucket = byPrefix.get(row.prefix) ?? [];
  bucket.push(row.file);
  byPrefix.set(row.prefix, bucket);
}
for (const [prefix, names] of byPrefix) {
  if (names.length > 1 && !allowedDupes.has(prefix)) {
    errors.push(`duplicate prefix ${prefix}: ${names.join(", ")}`);
  }
}

const byWidth = new Map();
for (const row of parsed) {
  const bucket = byWidth.get(row.width) ?? [];
  bucket.push(row);
  byWidth.set(row.width, bucket);
}

for (const [width, group] of [...byWidth.entries()].sort((a, b) => a[0] - b[0])) {
  const lex = [...group].sort((a, b) => a.file.localeCompare(b.file));
  const numeric = [...group].sort((a, b) => a.n - b.n || a.file.localeCompare(b.file));
  for (let i = 0; i < lex.length; i++) {
    if (lex[i].file !== numeric[i].file) {
      errors.push(
        `${width}-digit group: lex order diverges from numeric at index ${i}: lex=${lex[i].file} numeric=${numeric[i].file}`,
      );
      break;
    }
  }
}

const lexAll = [...parsed].sort((a, b) => a.file.localeCompare(b.file));
const numericAll = [...parsed].sort((a, b) => a.n - b.n || a.file.localeCompare(b.file));
let mixedWidthInversions = 0;
for (let i = 0; i < lexAll.length; i++) {
  if (lexAll[i].file !== numericAll[i].file) mixedWidthInversions += 1;
}

if (errors.length > 0) {
  console.error("Migration order check FAILED:\n" + errors.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}

console.log(
  `Migration order OK — files=${parsed.length}, digit-width groups=${byWidth.size}, mixed-width inversions (historical, non-blocking)=${mixedWidthInversions}`,
);
