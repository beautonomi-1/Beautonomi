#!/usr/bin/env node
/**
 * Bundle size budget checker.
 *
 * Runs after `next build` and reads .next/build-manifest.json to compute
 * the total JS shipped to the client. Compares against the budget defined
 * in bundle-budget.json and exits non-zero if the budget is exceeded.
 *
 * Usage:
 *   node scripts/check-bundle-size.mjs              # check against budget
 *   node scripts/check-bundle-size.mjs --update      # update budget baseline
 *
 * Environment:
 *   BUNDLE_BUDGET_MAX_GROWTH_PCT  — max allowed growth % (default: 5)
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";

const ROOT = resolve(import.meta.dirname, "..");
const NEXT_DIR = join(ROOT, ".next");
const BUDGET_FILE = join(ROOT, "bundle-budget.json");
const MAX_GROWTH_PCT = Number(process.env.BUNDLE_BUDGET_MAX_GROWTH_PCT || 5);

function getChunkSizes() {
  const chunksDir = join(NEXT_DIR, "static", "chunks");
  let totalBytes = 0;
  const files = [];

  function walk(dir) {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (entry.endsWith(".js")) {
        totalBytes += stat.size;
        files.push({ file: fullPath.replace(NEXT_DIR, ".next"), size: stat.size });
      }
    }
  }

  walk(chunksDir);
  return { totalBytes, fileCount: files.length, largest: files.sort((a, b) => b.size - a.size).slice(0, 10) };
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function loadBudget() {
  try {
    return JSON.parse(readFileSync(BUDGET_FILE, "utf-8"));
  } catch {
    return null;
  }
}

function saveBudget(data) {
  writeFileSync(BUDGET_FILE, JSON.stringify(data, null, 2) + "\n");
}

const isUpdate = process.argv.includes("--update");

const current = getChunkSizes();

console.log("\n📦 Bundle Size Report");
console.log("─".repeat(50));
console.log(`  Total JS chunks:  ${current.fileCount} files`);
console.log(`  Total size:       ${formatBytes(current.totalBytes)}`);
console.log(`\n  Top 10 largest chunks:`);
for (const f of current.largest) {
  console.log(`    ${formatBytes(f.size).padStart(10)}  ${f.file}`);
}

if (isUpdate) {
  saveBudget({
    baselineBytes: current.totalBytes,
    baselineFormatted: formatBytes(current.totalBytes),
    maxGrowthPercent: MAX_GROWTH_PCT,
    updatedAt: new Date().toISOString(),
  });
  console.log(`\n✅ Budget baseline updated: ${formatBytes(current.totalBytes)}`);
  process.exit(0);
}

const budget = loadBudget();
if (!budget) {
  console.log("\n⚠️  No bundle-budget.json found. Run with --update to create a baseline.");
  console.log("   Skipping budget check.\n");
  process.exit(0);
}

const baseline = budget.baselineBytes;
const maxAllowed = Math.ceil(baseline * (1 + MAX_GROWTH_PCT / 100));
const growthPct = ((current.totalBytes - baseline) / baseline * 100).toFixed(2);
const withinBudget = current.totalBytes <= maxAllowed;

console.log(`\n  Baseline:         ${formatBytes(baseline)}`);
console.log(`  Max allowed (+${MAX_GROWTH_PCT}%): ${formatBytes(maxAllowed)}`);
console.log(`  Current:          ${formatBytes(current.totalBytes)} (${growthPct > 0 ? "+" : ""}${growthPct}%)`);

if (withinBudget) {
  console.log(`\n✅ Bundle is within budget.\n`);
  process.exit(0);
} else {
  console.log(`\n❌ Bundle exceeds budget by ${formatBytes(current.totalBytes - maxAllowed)}!`);
  console.log(`   Either optimise the bundle or update the baseline:\n`);
  console.log(`     node scripts/check-bundle-size.mjs --update\n`);
  process.exit(1);
}
