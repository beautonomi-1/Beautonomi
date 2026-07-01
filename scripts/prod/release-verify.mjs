#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const runLoad = process.argv.includes("--with-load");

const baseSteps = [
  ["pnpm", ["run", "typecheck"]],
  ["pnpm", ["run", "lint"]],
  ["pnpm", ["run", "test"]],
  ["node", ["apps/web/scripts/check-security-env.mjs"]],
  ["node", ["scripts/prod/readiness-check.mjs"]],
  ["node", ["scripts/prod/verify-observability-gates.mjs"]],
];

const loadSteps = [
  ["pnpm", ["run", "load:auth-burst"]],
  ["pnpm", ["run", "load:provider-calendar"]],
  ["pnpm", ["run", "load:booking-flow"]],
  ["pnpm", ["run", "load:webhook-storm"]],
  ["pnpm", ["run", "load:soak-mixed"]],
];

const steps = runLoad ? [...baseSteps, ...loadSteps] : baseSteps;

console.log("== Release Verification ==");
console.log(`Mode: ${runLoad ? "full (with load suite)" : "quick (no load suite)"}`);
console.log("");

for (const [cmd, args] of steps) {
  const display = `${cmd} ${args.join(" ")}`;
  console.log(`> ${display}`);
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) {
    console.error(`FAILED: ${display}`);
    process.exit(result.status ?? 1);
  }
}

console.log("");
console.log("Release verification passed.");
