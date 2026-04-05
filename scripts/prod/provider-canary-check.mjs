#!/usr/bin/env node

import { spawnSync } from "node:child_process";

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

const sloInputPath = readArg("--input");

const steps = [
  ["node", ["scripts/prod/audit-provider-route-metrics.mjs"]],
  ["node", ["scripts/prod/provider-compat-scan.mjs"]],
  ["node", ["scripts/prod/verify-observability-gates.mjs"]],
];

if (sloInputPath) {
  steps.push(["node", ["scripts/prod/evaluate-rollout-gates.mjs", "--input", sloInputPath]]);
}

console.log("== Provider Canary Gate Check ==");
console.log(`SLO input: ${sloInputPath ? sloInputPath : "not provided (compat + observability only)"}`);
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
if (sloInputPath) {
  console.log("Provider canary gates passed. decision=advance");
} else {
  console.log("Provider canary prechecks passed. Provide --input <slo-summary.json> for rollout decision.");
}
