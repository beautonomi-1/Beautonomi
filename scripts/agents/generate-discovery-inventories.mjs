#!/usr/bin/env node
/**
 * Regenerates agent-workforce discovery inventories from the current branch.
 * Usage: node scripts/agents/generate-discovery-inventories.mjs
 */
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "../..");
const OUT = join(ROOT, "docs/agents/inventories");
mkdirSync(OUT, { recursive: true });

function walk(dir, pred, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const e of entries) {
    const full = join(dir, e);
    try {
      if (statSync(full).isDirectory()) {
        if (e === "node_modules" || e === ".next" || e === "dist") continue;
        walk(full, pred, acc);
      } else if (pred(e, full)) acc.push(full);
    } catch {
      /* skip */
    }
  }
  return acc;
}

const adminRoutes = walk(join(ROOT, "apps/web/src/app/api/admin"), (_, p) => p.endsWith("route.ts"));
const cronRoutes = walk(join(ROOT, "apps/web/src/app/api/cron"), (_, p) => p.endsWith("route.ts"));
const geminiRefs = [];
walk(ROOT, (_, p) => {
  if (!/\.(ts|tsx|sql|js|mjs)$/.test(p)) return false;
  if (p.includes("node_modules")) return false;
  return true;
}).forEach((p) => {
  const t = readFileSync(p, "utf8");
  if (/gemini-1\.5|gemini-2\.0/.test(t)) geminiRefs.push(relative(ROOT, p));
});

const auditCoverage = adminRoutes.filter((p) => {
  const t = readFileSync(p, "utf8");
  return t.includes("writeAuditLog");
});

const serviceRoleRefs = walk(ROOT, (_, p) => {
  if (!/\.(ts|tsx)$/.test(p) || p.includes("node_modules")) return false;
  const t = readFileSync(p, "utf8");
  return t.includes("getSupabaseAdmin");
}).map((p) => relative(ROOT, p));

const vercelCrons = JSON.parse(readFileSync(join(ROOT, "apps/web/vercel.json"), "utf8")).crons ?? [];

const inventory = {
  generated_at: new Date().toISOString(),
  branch_note: "Regenerate on each release; counts are not permanent architectural facts.",
  admin_api_routes: adminRoutes.length,
  admin_api_route_paths: adminRoutes.map((p) =>
    relative(join(ROOT, "apps/web/src/app"), p).replace(/\\/g, "/").replace(/\/route\.ts$/, ""),
  ),
  admin_mutation_routes_with_audit: auditCoverage.length,
  cron_route_files: cronRoutes.length,
  cron_schedules: vercelCrons.length,
  deprecated_gemini_model_refs: geminiRefs,
  service_role_file_count: serviceRoleRefs.length,
  rls_harness: "apps/web/src/lib/security/__tests__/rls-harness.test.ts",
  finance_maker_checker: "supabase/migrations/794_reconciliation_exceptions.sql (maker_user_id, checker_user_id)",
  role_section_source: "packages/admin-access/src/index.ts",
};

writeFileSync(join(OUT, "discovery-inventory.json"), JSON.stringify(inventory, null, 2));
writeFileSync(
  join(OUT, "discovery-summary.md"),
  `# Agent discovery inventory\n\nGenerated: ${inventory.generated_at}\n\n| Metric | Count |\n|---|---|\n| Admin API routes | ${inventory.admin_api_routes} |\n| Admin routes with writeAuditLog | ${inventory.admin_mutation_routes_with_audit} |\n| Cron route files | ${inventory.cron_route_files} |\n| Vercel cron schedules | ${inventory.cron_schedules} |\n| Deprecated Gemini refs | ${inventory.deprecated_gemini_model_refs.length} |\n| getSupabaseAdmin files | ${inventory.service_role_file_count} |\n`,
);
console.log(`Wrote ${OUT}/discovery-inventory.json (${inventory.admin_api_routes} admin routes)`);
