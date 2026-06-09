/**
 * Regression for the money-correctness bug: a walk-in mid-visit additional charge must be
 * recognized EXACTLY ONCE in provider recognized revenue / earnings mix.
 *
 * Root cause (pre-fix): `record_walk_in_additional_charge_payment` (migration 580) inserts
 * BOTH a `booking_payments` row — which fired `create_finance_ledger_from_payment()` and
 * produced a sibling `provider_earnings` ledger row — AND a `walk_in_additional_charge`
 * ledger row for the same amount. Because `recognizedRevenue()` /
 * `computeDashboardEarningsMix()` sum BOTH types, the charge was counted ~2x.
 *
 * Real fix: migration 659 guards the trigger so it SKIPS the sibling `provider_earnings`
 * insert for walk-in additional-charge `booking_payments` rows. The
 * `walk_in_additional_charge` row stays the single source of recognition.
 *
 * These pure-function tests pin the recognition math at the layer that is unit-testable:
 * (1) the post-fix ledger (only the walk_in_additional_charge row) recognizes the charge
 * once, and (2) the pre-fix ledger (both rows) demonstrably double-counts — which is the
 * exact behavior migration 659 removes by never creating the sibling row.
 */
import { describe, it, expect } from "vitest";
import {
  recognizedRevenue,
  computeDashboardEarningsMix,
  computeProviderRevenueBreakdown,
  type ProviderRevenueLedgerRow,
} from "../provider-revenue-semantics";

const row = (
  transaction_type: string,
  net: number,
  extra: Partial<ProviderRevenueLedgerRow> = {},
): ProviderRevenueLedgerRow => ({ transaction_type, amount: net, net, ...extra });

const CHARGE_AMOUNT = 150;

/** Post-fix (migration 659): only the walk_in_additional_charge recognition row exists. */
const POST_FIX_LEDGER: ProviderRevenueLedgerRow[] = [
  row("walk_in_additional_charge", CHARGE_AMOUNT, { booking_id: "b1" } as any),
];

/**
 * Pre-fix ledger: the trigger ALSO posted a sibling cash provider_earnings row for the
 * same charge. This is the double-count migration 659 eliminates.
 */
const PRE_FIX_LEDGER: ProviderRevenueLedgerRow[] = [
  row("walk_in_additional_charge", CHARGE_AMOUNT, { booking_id: "b1" } as any),
  row("provider_earnings", CHARGE_AMOUNT, {
    booking_id: "b1",
    description: "Provider earnings for booking BN-1 (via cash, source: walk_in)",
  } as any),
];

describe("walk-in additional charge — single recognition (migration 659)", () => {
  it("recognizes the charge exactly once when only the walk_in_additional_charge row exists", () => {
    expect(recognizedRevenue(POST_FIX_LEDGER)).toBe(CHARGE_AMOUNT);

    const mix = computeDashboardEarningsMix(
      POST_FIX_LEDGER.map((r) => ({
        transaction_type: r.transaction_type,
        net: r.net,
        amount: r.amount,
        booking_id: (r as any).booking_id ?? null,
        description: (r as any).description ?? null,
      })),
    );
    expect(mix.walkInAdditionalChargeEarnings).toBe(CHARGE_AMOUNT);
    expect(mix.additionalChargeEarningsTotal).toBe(CHARGE_AMOUNT);
    // No sibling provider_earnings ⇒ nothing leaks into Services.
    expect(mix.serviceEarningsTotal).toBe(0);
    expect(mix.bookingEarningsTotal).toBe(0);

    const breakdown = computeProviderRevenueBreakdown(POST_FIX_LEDGER);
    expect(breakdown.walkInAdditionalCharges).toBe(CHARGE_AMOUNT);
    expect(breakdown.serviceEarnings).toBe(0);
    expect(breakdown.recognizedRevenue).toBe(CHARGE_AMOUNT);
  });

  it("documents the double-count the trigger guard removes (sibling provider_earnings present)", () => {
    // With BOTH rows present (pre-659), recognized revenue is the charge counted twice.
    expect(recognizedRevenue(PRE_FIX_LEDGER)).toBe(CHARGE_AMOUNT * 2);

    const mix = computeDashboardEarningsMix(
      PRE_FIX_LEDGER.map((r) => ({
        transaction_type: r.transaction_type,
        net: r.net,
        amount: r.amount,
        booking_id: (r as any).booking_id ?? null,
        description: (r as any).description ?? null,
      })),
    );
    // The sibling provider_earnings inflates the mix on top of the walk-in line — the
    // exact double-count. Migration 659 prevents the sibling from ever being created.
    expect(mix.walkInAdditionalChargeEarnings).toBe(CHARGE_AMOUNT);
    expect(mix.bookingEarningsTotal).toBe(CHARGE_AMOUNT);
    expect(mix.additionalChargeEarningsTotal + mix.serviceEarningsTotal).toBe(CHARGE_AMOUNT * 2);
  });
});

/**
 * Regression for the SECOND money-correctness bug (migration 660): for a COMMISSION-ENABLED
 * tenant, the walk-in add-on must be recognized NET-of-commission — consistent with walk-in
 * base service, whose provider_earnings row stores net-of-commission. Pre-660 the
 * `walk_in_additional_charge` row stored net = GROSS while the trigger still booked the
 * platform commission on a sibling `payment` row, overstating provider income by the
 * commission.
 *
 * Post-660 the settlement RPC stores the recognition row at net = gross - commission (amount
 * stays gross) by reading back the exact commission the trigger booked, so:
 *   • recognized revenue = gross - commission (the provider's true take), and
 *   • the platform commission is captured exactly once on the `payment` row (ignored by
 *     recognized-revenue math), and
 *   • gross = walk_in.net + payment.commission reconciles to the cent.
 *
 * Migration 662 update: the platform only commissions money it holds, so for the usual
 * provider-collected walk-in tenders (cash, Yoco, EFT) the trigger now books ZERO commission
 * and the 660 read-back yields 0, i.e. net = gross (provider keeps 100%). The net-of-commission
 * scenario below therefore only applies when a walk-in add-on is settled by a platform-held
 * tender (wallet/gift_card). The math the helper must honour is unchanged.
 */
describe("walk-in additional charge — net-of-commission for commission-enabled tenants (migration 660)", () => {
  const GROSS = 150;
  const COMMISSION = 15; // e.g. 10% platform commission booked by the trigger's payment row.
  const NET = GROSS - COMMISSION; // 135 — what migration 660 stores in walk_in_additional_charge.net.

  /**
   * Post-660 ledger for a commission-enabled walk-in add-on: the recognition row carries
   * net-of-commission (amount still gross), and the platform commission lives on the sibling
   * `payment` row exactly as for walk-in base service.
   */
  const COMMISSION_ENABLED_LEDGER: ProviderRevenueLedgerRow[] = [
    row("walk_in_additional_charge", NET, { amount: GROSS, booking_id: "b1" } as any),
    // Platform commission leg (net == commission). Not a recognized-revenue type.
    { transaction_type: "payment", amount: GROSS, net: COMMISSION, commission: COMMISSION } as any,
  ];

  it("recognizes the add-on NET-of-commission (not gross), commission captured once", () => {
    // recognizedRevenue reads `net ?? amount`, so it must use the net-of-commission value.
    expect(recognizedRevenue(COMMISSION_ENABLED_LEDGER)).toBe(NET);

    const breakdown = computeProviderRevenueBreakdown(COMMISSION_ENABLED_LEDGER);
    expect(breakdown.walkInAdditionalCharges).toBe(NET);
    expect(breakdown.recognizedRevenue).toBe(NET);
    // The `payment` row is a platform leg and must NOT inflate provider service earnings.
    expect(breakdown.serviceEarnings).toBe(0);

    const mix = computeDashboardEarningsMix(
      COMMISSION_ENABLED_LEDGER.map((r) => ({
        transaction_type: r.transaction_type,
        net: r.net,
        amount: r.amount,
        booking_id: (r as any).booking_id ?? null,
        description: (r as any).description ?? null,
      })),
    );
    expect(mix.walkInAdditionalChargeEarnings).toBe(NET);
    expect(mix.additionalChargeEarningsTotal).toBe(NET);
    expect(mix.serviceEarningsTotal).toBe(0);

    // Reconciliation: provider net + platform commission == gross, to the cent.
    expect(recognizedRevenue(COMMISSION_ENABLED_LEDGER) + COMMISSION).toBe(GROSS);
  });

  it("commission-disabled tenants still recognize the full gross (net == gross)", () => {
    // No `payment` commission row ⇒ migration 660 stores net = gross (provider keeps 100%).
    const disabled: ProviderRevenueLedgerRow[] = [
      row("walk_in_additional_charge", GROSS, { amount: GROSS, booking_id: "b1" } as any),
    ];
    expect(recognizedRevenue(disabled)).toBe(GROSS);
    expect(computeProviderRevenueBreakdown(disabled).walkInAdditionalCharges).toBe(GROSS);
  });

  it("migration 662: provider-collected (cash/Yoco/EFT) walk-in add-ons recognize full gross — no commission", () => {
    // Even for a commission-ENABLED tenant, a cash/Yoco/EFT walk-in add-on now books no
    // platform commission (the platform never held that cash), so the recognition row stores
    // net = gross and there is no sibling `payment` commission leg.
    const cashAddOn: ProviderRevenueLedgerRow[] = [
      row("walk_in_additional_charge", GROSS, { amount: GROSS, booking_id: "b1" } as any),
    ];
    expect(recognizedRevenue(cashAddOn)).toBe(GROSS);
    const breakdown = computeProviderRevenueBreakdown(cashAddOn);
    expect(breakdown.walkInAdditionalCharges).toBe(GROSS);
    expect(breakdown.serviceEarnings).toBe(0);
  });
});
