import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "..", "..", "supabase", "migrations");

function readMigration(name: string): string {
  return readFileSync(join(migrationsDir, name), "utf8");
}

describe("finance audit migrations (static contract)", () => {
  it("revokes wallet_credit_self from authenticated", () => {
    const sql = readMigration("929_revoke_wallet_credit_self.sql");
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.wallet_credit_self/i);
    expect(sql).toMatch(/FROM authenticated/i);
  });

  it("defines create_booking_payment for service_role only", () => {
    const sql = readMigration("930_create_booking_payment_and_rls.sql");
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.create_booking_payment/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.create_booking_payment/i);
    expect(sql).toMatch(/service_role/i);
  });

  it("creates payment_disputes with open status", () => {
    const sql = readMigration("931_payment_disputes.sql");
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.payment_disputes/i);
    expect(sql).toMatch(/'open'/);
  });

  it("removes user UPDATE on wallet_topups", () => {
    const sql = readMigration("935_wallet_topups_no_user_update.sql");
    expect(sql).toMatch(/DROP POLICY.*wallet topups/i);
  });

  it("backfills null refund_component on refund rows", () => {
    const sql = readMigration("936_refund_component_legacy_backfill.sql");
    expect(sql).toMatch(/refund_component = '_legacy'/);
    expect(sql).toMatch(/transaction_type = 'refund'/);
  });

  it("booking_payments RLS: providers SELECT only (no manage policy)", () => {
    const sql = readMigration("930_create_booking_payment_and_rls.sql");
    expect(sql).toMatch(/Providers can view own booking payments/);
    expect(sql).toMatch(/DROP POLICY IF EXISTS "Providers can manage own booking payments"/);
    expect(sql).toMatch(/create_booking_payment/);
  });
});
