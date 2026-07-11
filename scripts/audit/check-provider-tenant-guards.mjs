#!/usr/bin/env node
/**
 * Regression check: provider API routes using getSupabaseAdmin() must include
 * a tenant/provider access guard (getProviderIdForUser, userHasProviderAccessAdmin,
 * resourceTenantMatchesHostTenant, or inline providers.user_id lookup).
 *
 * Usage: node scripts/audit/check-provider-tenant-guards.mjs
 * Exit 1 when unguarded routes are found.
 */
import { readFileSync, readdirSync } from "fs";
import { join, dirname, relative } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const PROVIDER_API = join(ROOT, "apps", "web", "src", "app", "api", "provider");

function hasTenantGuard(content) {
  if (/getProviderIdForUser/.test(content)) return true;
  if (/userHasProviderAccessAdmin/.test(content)) return true;
  if (/requireProviderSupportTicketAccess/.test(content)) return true;
  if (/resourceTenantMatchesHostTenant/.test(content)) return true;
  if (/\.from\s*\(\s*["']providers["']\s*\)[\s\S]{0,500}?\.eq\s*\(\s*["']user_id["']\s*,\s*user\.id/.test(content)) {
    return true;
  }
  if (/provider-tenant-guard:\s*ok/i.test(content)) return true;
  return false;
}

function walk(dir, results = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, results);
    else if (entry.name === "route.ts") results.push(full);
  }
  return results;
}

const unguarded = [];
for (const routeFile of walk(PROVIDER_API)) {
  const content = readFileSync(routeFile, "utf8");
  const hasAuth = /requireRoleInApi|requireRole\s*\(/.test(content);
  const usesAdmin = /getSupabaseAdmin/.test(content);
  if (!hasAuth || !usesAdmin) continue;
  if (!hasTenantGuard(content)) {
    unguarded.push(relative(ROOT, routeFile).replace(/\\/g, "/"));
  }
}

if (unguarded.length > 0) {
  console.error(
    JSON.stringify(
      {
        check: "provider-tenant-guard",
        status: "fail",
        count: unguarded.length,
        routes: unguarded,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

console.log(
  JSON.stringify({ check: "provider-tenant-guard", status: "ok", count: 0 }),
);
process.exit(0);
