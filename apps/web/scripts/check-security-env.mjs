#!/usr/bin/env node
/**
 * Production security environment gate.
 *
 * Fails (exit 1) when required security secrets are absent in a production
 * context, preventing a silent no-op CSRF protection deployment.
 *
 * Usage (called by prepare:production / pre-rollout):
 *   node apps/web/scripts/check-security-env.mjs
 *
 * Set NODE_ENV=production or VERCEL_ENV=production to trigger hard failures.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = join(__dirname, "..");
const envPath = join(webRoot, ".env.local");

// Load .env.local into process.env if present
if (existsSync(envPath)) {
  const raw = readFileSync(envPath, "utf8");
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
        )
          value = value.slice(1, -1);
        if (value && !process.env[key]) process.env[key] = value;
      }
    }
  }
}

const isProd =
  process.env.NODE_ENV === "production" ||
  process.env.VERCEL_ENV === "production" ||
  process.env.VERCEL_ENV === "preview" ||
  process.env.CI_PRODUCTION === "true";

const vars = [
  {
    key: "CSRF_SECRET",
    required: false,
    desc: "HMAC secret for CSRF token generation/verification. Generate with: openssl rand -hex 32",
  },
  {
    key: "CRON_SECRET",
    required: true,
    desc: "Bearer secret for Vercel cron job authentication",
  },
  {
    key: "NEXT_PUBLIC_SUPABASE_URL",
    required: true,
    desc: "Supabase project URL",
  },
  {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    required: true,
    desc: "Supabase service role key (server-only)",
  },
];

console.log("Security environment check (apps/web):\n");
let missingRequired = false;
let warnSharedSecret = false;

for (const { key, required, desc } of vars) {
  const value = process.env[key];
  const set = !!value;
  if (required && !set) missingRequired = true;
  const status = set ? "✓" : required ? "✗" : "-";
  console.log(`  ${status} ${key}`);
  console.log(`      ${desc}`);
  console.log("");
}

// Warn if CSRF_SECRET is absent but CRON_SECRET is present — this means csrf.ts
// silently falls back to CRON_SECRET (dual-use secret) which is a security smell.
const hasCsrf = !!process.env.CSRF_SECRET;
const hasCron = !!process.env.CRON_SECRET;
if (!hasCsrf && hasCron) {
  warnSharedSecret = true;
  console.warn(
    "  ⚠ CSRF_SECRET is not set — csrf.ts will fall back to CRON_SECRET.\n" +
      "    This shares one secret across two distinct security domains.\n" +
      "    Generate a dedicated CSRF_SECRET: openssl rand -hex 32\n",
  );
}

// CSRF requires at least one secret; dedicated CSRF_SECRET is strongly preferred.
if (!hasCsrf && !hasCron) {
  missingRequired = true;
  console.error(
    "  ✗ CSRF protection: neither CSRF_SECRET nor CRON_SECRET is set.\n" +
      "    Cookie-authenticated mutations will have no CSRF protection.\n",
  );
}

if (missingRequired && isProd) {
  console.error(
    "FATAL: Required security env vars are missing in production/preview.\n" +
      "Set CRON_SECRET, NEXT_PUBLIC_SUPABASE_URL, and\n" +
      "SUPABASE_SERVICE_ROLE_KEY before deploying.\n" +
      "Set CSRF_SECRET (recommended) or ensure CRON_SECRET is present for CSRF.\n",
  );
  process.exit(1);
}

if (missingRequired && !isProd) {
  console.warn(
    "WARNING: Required security env vars are missing.\n" +
      "(Non-production environment — continuing with warnings.)\n",
  );
} else if (!warnSharedSecret) {
  console.log("Security environment is correctly configured.\n");
}
