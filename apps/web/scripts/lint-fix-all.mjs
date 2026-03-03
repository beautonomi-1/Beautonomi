#!/usr/bin/env node
/**
 * Run all automated lint fixes then typecheck.
 * - eslint . --fix (fixes unused imports, prefer-const, no-var, etc.)
 *   Note: fixToUnknown for no-explicit-any is NOT enabled; it breaks typecheck.
 * - pnpm typecheck
 * Usage: node scripts/lint-fix-all.mjs
 * Or: pnpm run lint:fix-all (from apps/web)
 */
import { execSync, spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function run(cmd, opts = {}) {
  const [exe, ...args] = cmd.split(/\s+/);
  const result = spawnSync(exe, args, {
    cwd: root,
    shell: true,
    encoding: "utf-8",
    ...opts,
  });
  return result;
}

console.log("Running eslint . --fix...\n");
const lintResult = run("pnpm exec eslint . --fix", { maxBuffer: 20 * 1024 * 1024 });
if (lintResult.stdout) process.stdout.write(lintResult.stdout);
if (lintResult.stderr) process.stderr.write(lintResult.stderr);

console.log("\nRunning pnpm typecheck...\n");
const tcResult = run("pnpm typecheck");
if (tcResult.stdout) process.stdout.write(tcResult.stdout);
if (tcResult.stderr) process.stderr.write(tcResult.stderr);

const lintOk = lintResult.status === 0;
const typecheckOk = tcResult.status === 0;

if (lintOk && typecheckOk) {
  console.log("\nDone. Lint --fix and typecheck both passed.");
  process.exit(0);
}

if (!typecheckOk) {
  console.error("\nTypecheck failed. Fix type errors (e.g. after any->unknown) then run again.");
}
if (!lintOk) {
  console.error("\nLint reported issues (warnings or errors). Check output above.");
}
process.exit(typecheckOk ? 0 : 1);
