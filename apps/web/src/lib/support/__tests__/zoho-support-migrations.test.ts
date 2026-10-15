import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "..", "..", "supabase", "migrations");

function readMigration(name: string): string {
  return readFileSync(join(migrationsDir, name), "utf8");
}

describe("Zoho support migrations (static contract)", () => {
  it("1000 creates Zoho tables, ticket tenant trigger, and extends support_agent access", () => {
    const sql = readMigration("1000_zoho_support_mail.sql");
    expect(sql).toMatch(/support_zoho_connections/);
    expect(sql).toMatch(/support_mail_folder_cursors/);
    expect(sql).toMatch(/support_tickets_set_tenant_id_before_insert/);
    expect(sql).toMatch(/support_tickets\.tenant_id = utr\.tenant_id/);
  });

  it("1001 compliance reset includes mail tables and tenant_id tickets", () => {
    const sql = readMigration("1001_compliance_reset_zoho_support.sql");
    expect(sql).toMatch(/support_mail_messages/);
    expect(sql).toMatch(/support_mailboxes/);
    expect(sql).toMatch(/"tenant_id = \$1"/);
  });

  it("1002 advisory lock serializes OAuth refresh per connection", () => {
    const sql = readMigration("1002_zoho_connection_advisory_lock.sql");
    expect(sql).toMatch(/with_zoho_connection_lock/);
    expect(sql).toMatch(/pg_advisory_xact_lock/);
    expect(sql).toMatch(/GRANT EXECUTE.*service_role/s);
  });
});
