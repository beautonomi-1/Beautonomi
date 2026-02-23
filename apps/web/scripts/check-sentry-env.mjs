#!/usr/bin/env node
/**
 * Check which Sentry-related env vars are set (for apps/web).
 * Loads apps/web/.env.local if present.
 *
 * Usage: cd apps/web && node scripts/check-sentry-env.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = join(__dirname, "..");
const envPath = join(webRoot, ".env.local");

// Load .env.local into process.env if present (no dotenv dependency)
if (existsSync(envPath)) {
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const eq = trimmed.indexOf("=");
      if (eq > 0) {
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
          value = value.slice(1, -1);
        if (value && !process.env[key]) process.env[key] = value;
      }
    }
  }
}

const vars = [
  { key: "SENTRY_DSN", required: true, desc: "Server/edge error reporting" },
  { key: "NEXT_PUBLIC_SENTRY_DSN", required: true, desc: "Client error reporting" },
  { key: "SENTRY_AUTH_TOKEN", required: false, desc: "Source map uploads (CI/Vercel)" },
  { key: "SENTRY_ORG", required: false, desc: "Source map uploads" },
  { key: "SENTRY_PROJECT", required: false, desc: "Source map uploads" },
];

console.log("Sentry env (apps/web):\n");
let allRequired = true;
for (const { key, required, desc } of vars) {
  const value = process.env[key];
  const set = !!value;
  if (required && !set) allRequired = false;
  const status = set ? "✓" : (required ? "✗" : "-");
  const preview = set ? (value.length > 50 ? value.slice(0, 47) + "..." : value) : "(not set)";
  console.log(`  ${status} ${key}`);
  console.log(`      ${desc}`);
  if (set) console.log(`      value: ${preview}`);
  console.log("");
}

if (!allRequired) {
  console.log("Add SENTRY_DSN and NEXT_PUBLIC_SENTRY_DSN to apps/web/.env.local (see docs/SENTRY_WEB_SETUP.md).\n");
  process.exit(1);
}
console.log("Sentry is configured for the web app.\n");
