#!/usr/bin/env node
/**
 * Run an assertion-only Maestro flow (F-09). Uses the vendored Maestro CLI
 * from tooling/screenshots/.tools when present (`pnpm screenshots:setup`).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const flowArg = process.argv[2] || "provider.login-assert.yaml";
const flowPath = path.isAbsolute(flowArg) ? flowArg : path.join(__dirname, flowArg);

if (!fs.existsSync(flowPath)) {
  console.error("[e2e:maestro] flow not found:", flowPath);
  process.exit(1);
}

const name = process.platform === "win32" ? "maestro.bat" : "maestro";
const bundled = path.join(
  REPO_ROOT,
  "tooling",
  "screenshots",
  ".tools",
  "maestro",
  "maestro",
  "bin",
  name,
);
const bin = fs.existsSync(bundled) ? bundled : "maestro";
const result = spawnSync(bin, ["test", flowPath], {
  encoding: "utf8",
  stdio: "inherit",
  shell: process.platform === "win32",
  cwd: REPO_ROOT,
});
process.exit(result.status ?? 1);
