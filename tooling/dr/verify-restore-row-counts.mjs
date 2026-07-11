#!/usr/bin/env node
/**
 * Optional post-restore row-count verification for Supabase PITR drills.
 *
 * Runs tooling/dr/verify-restore-row-counts.sql via psql and optionally compares
 * output to a baseline JSON snapshot.
 *
 * Usage:
 *   SUPABASE_DB_URL="postgresql://..." node tooling/dr/verify-restore-row-counts.mjs
 *   SUPABASE_DB_URL="postgresql://..." BASELINE_JSON=tooling/dr/baseline-row-counts.json node tooling/dr/verify-restore-row-counts.mjs
 *
 * Requires `psql` on PATH (PostgreSQL client).
 * See docs/BACKUP_AND_DR_RUNBOOK.md §1 Verification Steps.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const MIN_RATIO = Number(process.env.MIN_COUNT_RATIO ?? "0.9");
const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
const scriptDir = dirname(fileURLToPath(import.meta.url));
const sqlPath = resolve(scriptDir, "verify-restore-row-counts.sql");

if (!dbUrl) {
  console.error("Set SUPABASE_DB_URL (or DATABASE_URL) to the restored project connection string.");
  process.exit(1);
}

function loadBaseline() {
  const path = process.env.BASELINE_JSON;
  if (!path) return null;
  try {
    const raw = readFileSync(resolve(path), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (err) {
    console.error(`Failed to read baseline JSON (${path}):`, err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

function runCounts() {
  const result = spawnSync("psql", [dbUrl, "-X", "-q", "-t", "-A", "-F", ",", "-f", sqlPath], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout || "psql failed");
    process.exit(result.status ?? 1);
  }
  const rows = {};
  for (const line of (result.stdout || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [table, count] = trimmed.split(",");
    if (table && count != null) rows[table] = Number(count);
  }
  return rows;
}

function main() {
  const baseline = loadBaseline();
  const counts = runCounts();
  let failed = false;

  console.log("Post-restore row-count verification");
  console.log("-----------------------------------");

  for (const [table, count] of Object.entries(counts)) {
    const expected = baseline?.[table];
    const ratio = typeof expected === "number" && expected > 0 ? count / expected : null;
    const ok = ratio == null || ratio >= MIN_RATIO;
    if (!ok) failed = true;
    const baselineNote =
      expected == null ? "" : ` (baseline ${expected}, ratio ${ratio?.toFixed(3) ?? "n/a"})`;
    console.log(`${ok ? "OK" : "FAIL"}  ${table}: ${count}${baselineNote}`);
  }

  if (failed) {
    console.error(`\nOne or more tables fell below ${MIN_RATIO * 100}% of baseline. Investigate before cutover.`);
    process.exit(1);
  }

  console.log("\nAll checked tables passed row-count verification.");
}

main();
