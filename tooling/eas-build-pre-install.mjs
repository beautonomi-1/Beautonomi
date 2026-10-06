#!/usr/bin/env node
/**
 * EAS pre-install (monorepo): prune stale expo peer copies from the uploaded workspace
 * before `pnpm install` (helps when the tarball includes node_modules from a dev machine).
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const appRoot = process.cwd();
const monorepoRoot = join(appRoot, "..", "..");
const pruneScript = join(monorepoRoot, "tooling", "pnpm", "prune-workspace-expo-peer-node-modules.mjs");

if (!existsSync(pruneScript)) {
  console.warn("[eas-pre-install] prune script not found — skipping");
  process.exit(0);
}

execSync(`node "${pruneScript}"`, { cwd: monorepoRoot, stdio: "inherit" });
