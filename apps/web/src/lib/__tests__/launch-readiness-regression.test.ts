/**
 * Launch readiness regression tests (Phases 2–4).
 * Static + unit checks that protect money-path fixes without a live DB.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isCardMachineTipBookingPayment } from "@/lib/reports/recorded-takings";

const repoRoot = join(__dirname, "../../../../..");

function readMigration(name: string): string {
  return readFileSync(join(repoRoot, "supabase/migrations", name), "utf8");
}

describe("Launch readiness regressions", () => {
  it("803 reconciliation gate excludes unshadowed finance types", () => {
    const sql = readMigration("803_finance_reconciliation_and_stripe_ledger.sql");
    expect(sql).toContain("provider_earnings");
    expect(sql).toContain("gift_card_liability_reduction");
    expect(sql).toMatch(/transaction_type NOT IN/i);
  });

  it("804 shadow refund branches on refund_component", () => {
    const sql = readMigration("804_gl_shadow_refund_components.sql");
    expect(sql).toContain("refund_component");
    expect(sql).toContain("membership_discount");
  });

  it("recorded-takings excludes PayCloud tip booking_payments rows", () => {
    expect(
      isCardMachineTipBookingPayment({
        payment_provider_data: { tip: "true" },
        payment_provider_id: "pc-1",
      }),
    ).toBe(true);
    expect(
      isCardMachineTipBookingPayment({
        payment_provider_data: {},
        payment_provider_id: "abc:tip",
      }),
    ).toBe(true);
    expect(
      isCardMachineTipBookingPayment({
        payment_provider_data: {},
        payment_provider_id: "paystack-ref-1",
      }),
    ).toBe(false);
  });

  it("stripe-charge throws when booking payment record fails", () => {
    const src = readFileSync(
      join(repoRoot, "apps/web/src/app/api/payments/stripe/webhook/_handlers/stripe-charge.ts"),
      "utf8",
    );
    expect(src).toContain("throw new Error(`Failed to record Stripe booking payment");
    expect(src).toContain("recordBookingOnlineChargeLedger");
  });

  it("settle-paycloud-payment caps group allocations to captured amount", () => {
    const src = readFileSync(
      join(repoRoot, "apps/web/src/lib/payments/settle-paycloud-payment.ts"),
      "utf8",
    );
    expect(src).toMatch(/baseBudget|remainingBudget|input\.amount/);
  });

  it("802 scopes financial_period_locks and Yoco tables to service_role", () => {
    const sql = readMigration("802_launch_readiness_rls_hardening.sql");
    expect(sql).toContain("financial_period_locks");
    expect(sql).toContain("service_role");
    expect(sql).toContain("provider_yoco_webhook_events");
  });
});
