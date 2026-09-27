import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GRC_PERMISSION_KEYS, grcEffectivePermissions, grcPermissionSeedRows, grcSuperadminHasPermission } from "./grc";

const BEGIN = "-- BEGIN GENERATED GRC ROLE PERMISSIONS";
const END = "-- END GENERATED GRC ROLE PERMISSIONS";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations");

/** The effective seed is the generated block in the highest-numbered migration that contains one. */
function latestSeedBlock(): { file: string; block: string } {
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort().reverse();
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    const start = sql.indexOf(BEGIN);
    const end = sql.indexOf(END);
    if (start >= 0 && end > start) return { file, block: sql.slice(start, end) };
  }
  throw new Error("No generated GRC permission block found in supabase/migrations");
}

function parseRows(block: string): string[] {
  return Array.from(block.matchAll(/\('([^']+)',\s*'([^']+)'\)/g)).map((m) => `${m[1]}:${m[2]}`);
}

describe("GRC permission parity (TS matrix vs SQL seed)", () => {
  it("latest generated SQL block matches grcPermissionSeedRows exactly", () => {
    const { file, block } = latestSeedBlock();
    const sqlRows = parseRows(block);
    const tsRows = grcPermissionSeedRows().map((r) => `${r.grc_role}:${r.permission_key}`);
    expect(tsRows.length).toBeGreaterThan(0);
    expect(new Set(sqlRows).size, `duplicate rows in ${file}`).toBe(sqlRows.length);
    expect([...sqlRows].sort(), `regenerate with node scripts/generate-grc-rbac-seed.mjs (${file})`).toEqual([...tsRows].sort());
    expect(block).toContain("DELETE FROM public.grc_role_permissions");
  });

  it("superadmin baseline can view and administer but never approve", () => {
    for (const key of GRC_PERMISSION_KEYS) {
      const allowed = grcSuperadminHasPermission(key);
      const approvalLike = /\.(approve|accept|review|close|decide|submit|edit|generate)$/.test(key);
      if (approvalLike) expect(allowed, key).toBe(false);
    }
    expect(grcEffectivePermissions([], true)).toContain("grc.assignments.manage");
    expect(grcEffectivePermissions([], true)).not.toContain("grc.documents.approve");
  });
});
