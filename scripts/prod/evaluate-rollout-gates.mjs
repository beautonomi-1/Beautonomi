#!/usr/bin/env node

import fs from "node:fs";

function readArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

const inputPath = readArg("--input");
if (!inputPath) {
  console.error("Missing --input <path-to-slo-summary.json>");
  process.exit(2);
}

const raw = fs.readFileSync(inputPath, "utf8");
const summary = JSON.parse(raw);

// Expected shape:
// {
//   "platform_5xx_rate": 0.001,
//   "tier1_5xx_rate": 0.002,
//   "booking_failure_rate": 0.005,
//   "webhook_failure_rate": 0.0005,
//   "db_connection_utilization": 0.62
// }
const gates = [
  { key: "platform_5xx_rate", max: 0.003, label: "Platform 5xx rate" },
  { key: "tier1_5xx_rate", max: 0.005, label: "Tier-1 5xx rate" },
  { key: "booking_failure_rate", max: 0.02, label: "Booking failure rate" },
  { key: "webhook_failure_rate", max: 0.001, label: "Webhook failure rate" },
  { key: "db_connection_utilization", max: 0.85, label: "DB connection utilization" },
];

let failures = 0;
console.log("== Rollout Gate Evaluation ==");
for (const g of gates) {
  const value = Number(summary[g.key]);
  if (!Number.isFinite(value)) {
    console.log(`FAIL: ${g.label} missing/invalid (${g.key})`);
    failures += 1;
    continue;
  }
  if (value > g.max) {
    console.log(`FAIL: ${g.label} ${value} > ${g.max}`);
    failures += 1;
  } else {
    console.log(`OK: ${g.label} ${value} <= ${g.max}`);
  }
}

console.log("");
if (failures > 0) {
  console.log("decision=rollback");
  process.exit(1);
}
console.log("decision=advance");
