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

  it("999 fixes create_booking_payment status check and keeps service_role grant", () => {
    const sql = readMigration("999_fix_create_booking_payment_status_enum.sql");
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.create_booking_payment/i);
    expect(sql).toMatch(/status::text IN \('cancelled', 'no_show'\)/);
    expect(sql).not.toMatch(/'refunded'.*INVALID_BOOKING_STATUS|status IN \('cancelled', 'refunded'/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.create_booking_payment/i);
    expect(sql).toMatch(/service_role/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.create_booking_payment/i);
    expect(sql).toMatch(/FROM authenticated/i);
  });

  it("1017 widens service fee validation and no-ops cancellation snapshot when policy missing", () => {
    const sql = readMigration("1017_booking_fee_validation_and_policy_snapshot.sql");
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION validate_service_fee_calculation/i);
    expect(sql).toMatch(/loyalty_discount_amount/);
    expect(sql).toMatch(/travel_fee/);
    expect(sql).toMatch(/base_after_discounts/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.set_booking_cancellation_policy_snapshot/i);
    expect(sql).toMatch(/IF NOT FOUND THEN\s*\n\s*RETURN NEW;/);
    expect(sql).not.toMatch(/COALESCE\(v_policy\.id/);
  });
});
