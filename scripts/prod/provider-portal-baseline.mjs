#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const steps = [
  ["node", ["scripts/prod/audit-provider-route-metrics.mjs"]],
  ["pnpm", ["--filter", "web", "typecheck"]],
];

console.log("== Provider Portal Baseline ==");
console.log("Captures baseline safety checks before performance rollout.\n");

for (const [cmd, args] of steps) {
  const display = `${cmd} ${args.join(" ")}`;
  console.log(`> ${display}`);
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) {
    console.error(`FAILED: ${display}`);
    process.exit(result.status ?? 1);
  }
}

console.log("\nBaseline prechecks passed.");
console.log("Next: capture route-level latency and browser matrix evidence in docs/PROVIDER_PORTAL_PERFORMANCE_BASELINE.md.");
