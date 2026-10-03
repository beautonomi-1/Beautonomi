#!/usr/bin/env node

/**
 * Lightweight observability readiness checks for scale rollouts.
 * - Verifies baseline monitoring env is configured
 * - Prints actionable warnings/errors for missing gates
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webEnvLocal = join(__dirname, "..", "..", "apps", "web", ".env.local");

if (existsSync(webEnvLocal)) {
  const raw = readFileSync(webEnvLocal, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const eq = trimmed.indexOf("=");
      if (eq > 0) {
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (value && !process.env[key]) process.env[key] = value;
      }
    }
  }
}

const checks = [
  {
    key: "NEXT_PUBLIC_SENTRY_DSN",
    required: true,
    description: "Web Sentry DSN",
  },
  {
    key: "EXPO_PUBLIC_SENTRY_DSN",
    required: false,
    description: "Shared mobile Sentry DSN (if both apps use a common env source)",
  },
  {
    key: "SLACK_ALERT_WEBHOOK_URL",
    required: false,
    description: "Slack alert webhook (recommended for paging)",
  },
];

let hardFailures = 0;

console.log("== Observability Gate Check ==");
for (const c of checks) {
  const value = process.env[c.key];
  if (!value) {
    if (c.required) {
      hardFailures += 1;
      console.log(`FAIL: ${c.key} missing (${c.description})`);
    } else {
      console.log(`WARN: ${c.key} not set (${c.description})`);
    }
  } else {
    console.log(`OK: ${c.key}`);
  }
}

console.log("");
console.log("Operational checks (manual evidence required):");
console.log("- Route metrics logs include request_id, route, status, duration_ms.");
console.log("- Alerts configured for 5xx burn, booking failures, webhook failures, and queue lag.");
console.log("- On-call runbook and escalation path are documented.");

if (hardFailures > 0) {
  console.log("");
  console.log(`Result: NO-GO (${hardFailures} required check(s) failed).`);
  process.exit(1);
}

console.log("");
console.log("Result: PASS (required observability gates satisfied).");
