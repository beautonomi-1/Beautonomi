import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "../../../../../..");
const migrationsDir = join(repoRoot, "supabase/migrations");

function readMigration(name: string): string {
  return readFileSync(join(migrationsDir, name), "utf8");
}

/** Migration filenames in apply order (numeric prefix, then lexical). */
function listMigrations(): string[] {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => {
      const na = Number.parseInt(a, 10);
      const nb = Number.parseInt(b, 10);
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
      return a.localeCompare(b);
    });
}

describe("RLS harness (static policy verification)", () => {
  it("gift_cards migration removes global authenticated SELECT", () => {
    const sql = readMigration("787_gift_cards_rls_hardening.sql");
    expect(sql).toContain('DROP POLICY IF EXISTS "Authenticated can read active gift cards"');
    expect(sql).not.toMatch(/FOR SELECT[\s\S]*auth\.role\(\) = 'authenticated'[\s\S]*is_active = true/);
    expect(sql).toContain("lookup_gift_card_by_code");
  });

  it("message-attachments bucket is private with path-scoped policies", () => {
    const sql = readMigration("788_message_attachments_storage_hardening.sql");
    expect(sql).toContain("public = false");
    expect(sql).toContain("user_can_access_message_attachment_object");
    expect(sql).toContain("message_attachments_select_participant");
    expect(sql).not.toMatch(/CREATE POLICY "Public read message attachments"/);
  });

  it("production tenant_domains seed includes ZA market hosts", () => {
    const sql = readMigration("789_tenant_domains_production_hosts.sql");
    expect(sql).toContain("beautonomi.co.za");
    expect(sql).toContain("environment");
    expect(sql).toContain("admin.beautonomi.co.za");
  });

  it("802 launch readiness RLS hardens financial_period_locks and Yoco tables", () => {
    const sql = readMigration("802_launch_readiness_rls_hardening.sql");
    expect(sql).toContain("financial_period_locks");
    expect(sql).toContain("provider_yoco_webhook_events");
    expect(sql).toMatch(/service_role/i);
  });

  it("805 completes agent table RLS and FX reporting helper", () => {
    const sql = readMigration("805_agent_rls_and_fx_reporting.sql");
    expect(sql).toContain("agent_eval_outcomes");
    expect(sql).toContain("convert_to_reporting_amount");
  });

  it("801 restores wallet/gift_card to booking_payments provider check", () => {
    const sql = readMigration("801_restore_wallet_gift_payment_provider_check.sql");
    expect(sql).toContain("'wallet'");
    expect(sql).toContain("'gift_card'");
    expect(sql).toContain("'paycloud'");
  });

  // 842 bulk-revoked EXECUTE on every SECURITY DEFINER function in public and
  // forgot to re-grant is_superadmin to anon. Because the superadmin policies on
  // public.users call is_superadmin(), and permissive policies are all evaluated,
  // every anonymous read (global_service_categories, providers, offerings, ...)
  // failed with 42501. 844 restores it.
  it("anon keeps EXECUTE on is_superadmin after any SECURITY DEFINER bulk revoke", () => {
    const migrations = listMigrations();
    const grantsAnonExecute = (sql: string) =>
      /'is_superadmin'/.test(sql) &&
      /GRANT EXECUTE ON FUNCTION %s TO anon/.test(sql);

    const bulkRevokeIndexes = migrations
      .map((name, index) => ({ name, index, sql: readMigration(name) }))
      .filter(
        ({ sql }) =>
          /p\.prosecdef/.test(sql) &&
          /REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated/.test(sql),
      );

    expect(bulkRevokeIndexes.length).toBeGreaterThan(0);

    const lastRevoke = bulkRevokeIndexes[bulkRevokeIndexes.length - 1];
    const restoredAtOrAfter = migrations
      .slice(lastRevoke.index)
      .some((name) => grantsAnonExecute(readMigration(name)));

    expect(
      restoredAtOrAfter,
      `${lastRevoke.name} revokes EXECUTE on all SECURITY DEFINER functions from anon, ` +
        "but no migration at or after it grants is_superadmin back to anon. " +
        "Anonymous reads will fail with 'permission denied for function is_superadmin'.",
    ).toBe(true);
  });

  it("844 restores the anon RLS helper grants dropped by 842", () => {
    const sql = readMigration("844_restore_anon_rls_helper_execute.sql");
    expect(sql).toContain("'is_superadmin'");
    expect(sql).toContain("'reserve_gift_card_redemption'");
    expect(sql).toContain("TO anon, authenticated");
    // Portal tokens stay service_role-only per 843.
    expect(sql).not.toMatch(/GRANT EXECUTE[\s\S]{0,80}validate_portal_token[\s\S]{0,40}anon/);
  });

  it("STRICT_TENANT_HOST_RESOLUTION documented in web env example", () => {
    const envExample = readFileSync(join(repoRoot, "apps/web/.env.example"), "utf8");
    expect(envExample).toContain("STRICT_TENANT_HOST_RESOLUTION=true");
  });
});

describe("RLS harness (live — optional)", () => {
  it("runs integration script when SUPABASE_TEST_URL is set", async () => {
    if (!process.env.SUPABASE_TEST_URL?.trim()) {
      expect(true).toBe(true);
      return;
    }
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync(
      "node",
      [join(repoRoot, "scripts/security/run-rls-integration-tests.mjs")],
      { stdio: "pipe", encoding: "utf8", env: process.env },
    );
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });
});
