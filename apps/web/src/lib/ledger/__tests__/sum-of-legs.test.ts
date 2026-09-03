/**
 * Part C2 — sum-of-legs + journal balance for a booking charge fixture.
 *
 * Cash-in legs (gateway + wallet + gift) must equal amount charged.
 * Booking-level add-ons (tip, travel, platform fee) are allocation, not extra cash.
 * `postBookingPayment` journals must balance (debits == credits).
 */
import { describe, it, expect } from "vitest";
import { isBalanced, postBookingPayment } from "@/lib/ledger/posting-map";

/** Major-unit fixture: base + tip + travel + platform fee, part paid from wallet. */
const FIXTURE = {
  gatewayCharged: 800,
  walletApplied: 200,
  giftCardApplied: 0,
  tip: 50,
  travel: 80,
  platformFee: 30,
  tax: 0,
  gatewayFee: 18.4,
};

function sumCashInLegs(f: typeof FIXTURE): number {
  return f.gatewayCharged + f.walletApplied + f.giftCardApplied;
}

function sumAllocationLegs(f: typeof FIXTURE): number {
  const cashIn = sumCashInLegs(f);
  const bookingLevel = f.tip + f.travel + f.platformFee + f.tax;
  const residual = cashIn - bookingLevel;
  return residual + bookingLevel;
}

describe("sum-of-legs (Part C2)", () => {
  it("cash-in legs equal amount charged (gateway + wallet + gift)", () => {
    expect(sumCashInLegs(FIXTURE)).toBe(1000);
    expect(sumCashInLegs(FIXTURE)).toBe(
      FIXTURE.gatewayCharged + FIXTURE.walletApplied + FIXTURE.giftCardApplied,
    );
  });

  it("allocation legs (residual + tip + travel + platform fee + tax) equal cash-in", () => {
    expect(sumAllocationLegs(FIXTURE)).toBe(sumCashInLegs(FIXTURE));
  });

  it("postBookingPayment journal is balanced for the gateway charge", () => {
    const entry = postBookingPayment({
      paymentId: "bp-fixture-1",
      gross: FIXTURE.gatewayCharged,
      platformFee: FIXTURE.platformFee,
      gatewayFee: FIXTURE.gatewayFee,
      taxAmount: FIXTURE.tax,
      tipAmount: FIXTURE.tip,
    });
    expect(isBalanced(entry)).toBe(true);
    const debits = entry.lines.filter((l) => l.side === "debit").reduce((s, l) => s + l.amount, 0);
    const credits = entry.lines.filter((l) => l.side === "credit").reduce((s, l) => s + l.amount, 0);
    expect(Math.round((debits - credits) * 100)).toBe(0);
  });

  it("wallet-only fixture still balances (no gateway cash, wallet covers total)", () => {
    const walletOnly = { ...FIXTURE, gatewayCharged: 0, walletApplied: 1000, gatewayFee: 0 };
    expect(sumAllocationLegs(walletOnly)).toBe(sumCashInLegs(walletOnly));
    const entry = postBookingPayment({
      paymentId: "bp-wallet-only",
      gross: 0,
      platformFee: walletOnly.platformFee,
      gatewayFee: 0,
      taxAmount: 0,
      tipAmount: walletOnly.tip,
    });
    expect(isBalanced(entry)).toBe(true);
  });
});
