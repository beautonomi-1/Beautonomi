#!/usr/bin/env node
/**
 * Migration hygiene CI check.
 *
 * Invariants:
 *   1. Canonical tree is supabase/migrations/.
 *   2. apps/web/supabase/migrations/ MUST NOT EXIST — the legacy tree was
 *      retired in April 2026. Any reappearance is a drift bug.
 *   3. Each numeric prefix in the canonical tree is unique, unless it is on the
 *      allowlist in scripts/migrations-allowed-duplicates.json.
 *   4. Known gaps in the numeric sequence are documented in
 *      scripts/migrations-allowed-gaps.json.
 *
 * Any violation exits 1 and prints a machine-readable report.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

const ROOT_TREE = path.join(repoRoot, "supabase", "migrations");
const LEGACY_TREE = path.join(repoRoot, "apps", "web", "supabase", "migrations");
const ALLOWED_DUPES_PATH = path.join(repoRoot, "scripts", "migrations-allowed-duplicates.json");
const ALLOWED_GAPS_PATH = path.join(repoRoot, "scripts", "migrations-allowed-gaps.json");

const errors = [];

function listMigrations(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

function loadJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

const allowedDupes = new Set(loadJson(ALLOWED_DUPES_PATH, []));
const allowedGaps = new Set(loadJson(ALLOWED_GAPS_PATH, []).map(Number));

const rootFiles = listMigrations(ROOT_TREE);
const legacyFiles = listMigrations(LEGACY_TREE);

// 1. Prefix uniqueness in canonical tree.
const byPrefix = new Map();
for (const file of rootFiles) {
  const m = /^(\d+)_/.exec(file);
  if (!m) {
    errors.push(`canonical: non-numeric prefix: ${file}`);
    continue;
  }
  const prefix = m[1];
  const bucket = byPrefix.get(prefix) ?? [];
  bucket.push(file);
  byPrefix.set(prefix, bucket);
}

for (const [prefix, files] of byPrefix) {
  if (files.length > 1 && !allowedDupes.has(prefix)) {
    errors.push(
      `canonical: duplicate prefix ${prefix}: ${files.join(", ")} (add to scripts/migrations-allowed-duplicates.json to silence)`,
    );
  }
}

// 2. Sequence gap check (only fail on unexpected gaps).
const prefixes = [...byPrefix.keys()].map(Number).sort((a, b) => a - b);
if (prefixes.length > 0) {
  for (let i = prefixes[0]; i <= prefixes[prefixes.length - 1]; i++) {
    if (!byPrefix.has(String(i).padStart(3, "0")) && !byPrefix.has(String(i)) && !allowedGaps.has(i)) {
      errors.push(`canonical: missing migration ${i} (add to scripts/migrations-allowed-gaps.json to silence)`);
    }
  }
}

// 3. Legacy tree must be gone entirely.
if (fs.existsSync(LEGACY_TREE)) {
  errors.push(
    `legacy: apps/web/supabase/migrations/ still exists (${legacyFiles.length} sql files). Delete it — write migrations in /supabase/migrations/ instead.`,
  );
}

if (errors.length > 0) {
  console.error("Migration hygiene FAILED:\n" + errors.map((e) => "  - " + e).join("\n"));
  process.exit(1);
}

console.log(
  `Migration hygiene OK — canonical=${rootFiles.length}, allowedDuplicates=${allowedDupes.size}, allowedGaps=${allowedGaps.size}`,
);
