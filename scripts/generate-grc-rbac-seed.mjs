#!/usr/bin/env node
/**
 * Regenerates the grc_role_permissions seed block inside the latest GRC hardening migration
 * from packages/admin-access/src/grc.ts (the single source of truth).
 *
 * Usage: pnpm --filter @beautonomi/admin-access build && node scripts/generate-grc-rbac-seed.mjs
 *
 * When the matrix changes after a migration has shipped, add a new migration that copies the
 * BEGIN/END block and point TARGET at it; the parity test reads the latest file containing the markers.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = join(root, "supabase/migrations/959_grc_hardening_workflows.sql");
const BEGIN = "-- BEGIN GENERATED GRC ROLE PERMISSIONS";
const END = "-- END GENERATED GRC ROLE PERMISSIONS";

const mod = await import(pathToFileURL(join(root, "packages/admin-access/dist/index.mjs")).href);
const rows = mod.grcPermissionSeedRows();

const values = rows.map(({ grc_role, permission_key }) => `  ('${grc_role}', '${permission_key}')`).join(",\n");
const block = `${BEGIN} (node scripts/generate-grc-rbac-seed.mjs — do not edit by hand)
DELETE FROM public.grc_role_permissions;
INSERT INTO public.grc_role_permissions (grc_role, permission_key)
VALUES
${values};
${END}`;

const sql = readFileSync(TARGET, "utf8");
const start = sql.indexOf(BEGIN);
const end = sql.indexOf(END);
if (start < 0 || end < 0) throw new Error(`Markers not found in ${TARGET}`);
writeFileSync(TARGET, sql.slice(0, start) + block + sql.slice(end + END.length));
console.log(`Wrote ${rows.length} permission rows into ${TARGET}`);
