#!/usr/bin/env node
/**
 * EAS installCommand (monorepo): pnpm install at repo root, then prune duplicate expo peer paths
 * so expo-doctor passes (doctor runs immediately after install on EAS).
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const cwd = process.cwd();
const monorepoRoot = existsSync(join(cwd, "pnpm-lock.yaml"))
  ? cwd
  : join(cwd, "..", "..");

if (!existsSync(join(monorepoRoot, "pnpm-lock.yaml"))) {
  console.error("[eas-monorepo-install] pnpm-lock.yaml not found — falling back to pnpm install in cwd");
  execSync("pnpm install", { cwd, stdio: "inherit", env: process.env });
  process.exit(0);
}

execSync("pnpm install", { cwd: monorepoRoot, stdio: "inherit", env: process.env });

const pruneScript = join(monorepoRoot, "tooling", "pnpm", "prune-workspace-expo-peer-node-modules.mjs");
if (existsSync(pruneScript)) {
  execSync(`node "${pruneScript}"`, { cwd: monorepoRoot, stdio: "inherit", env: process.env });
}
