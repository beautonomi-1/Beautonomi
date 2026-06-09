import { describe, expect, it } from "vitest";

/**
 * Pure simulations of migration-663 ledger semantics. These document the contracts
 * enforced in SQL (award_provider_points, remove_provider_points_for_source,
 * check_provider_badges) without requiring a live database.
 */

type LedgerRow = { source: string; source_id: string; points: number };

/** Mirrors calculate_provider_points + GREATEST(0, ...) in migration 663. */
function flooredLedgerTotal(rows: LedgerRow[]): number {
  const sum = rows.reduce((s, r) => s + r.points, 0);
  return Math.max(0, sum);
}

/** Mirrors ON CONFLICT DO NOTHING idempotency for (provider_id, source, source_id). */
function tryAward(ledger: LedgerRow[], row: LedgerRow): boolean {
  const exists = ledger.some(
    (r) => r.source === row.source && r.source_id === row.source_id,
  );
  if (exists) return false;
  ledger.push(row);
  return true;
}

/** Mirrors remove_provider_points_for_source. */
function clawback(ledger: LedgerRow[], source: string, sourceId: string): void {
  const idx = ledger.findIndex((r) => r.source === source && r.source_id === sourceId);
  if (idx >= 0) ledger.splice(idx, 1);
}

/** Mirrors booking completion eligibility in migration 663. */
function shouldAwardBookingCompletion(status: string, paymentStatus: string | null): boolean {
  return status === "completed" && paymentStatus !== "refunded";
}

/** Mirrors check_provider_badges renew branch: same eligible badge → extend maintenance. */
function shouldRenewBadgeWhileEligible(
  eligibleBadgeId: string | null,
  currentBadgeId: string | null,
): boolean {
  return eligibleBadgeId !== null && eligibleBadgeId === currentBadgeId;
}

describe("provider points ledger integrity (663 contracts)", () => {
  it("floors total at 0 when admin penalties exceed the balance", () => {
    const ledger: LedgerRow[] = [
      { source: "booking_completed", source_id: "b1", points: 20 },
      { source: "admin_penalty", source_id: "penalty-1", points: -50 },
    ];
    expect(flooredLedgerTotal(ledger)).toBe(0);
  });

  it("idempotent re-award does not change the ledger total", () => {
    const ledger: LedgerRow[] = [];
    const row = { source: "booking_completed", source_id: "b1", points: 10 };
    expect(tryAward(ledger, row)).toBe(true);
    expect(tryAward(ledger, row)).toBe(false);
    expect(flooredLedgerTotal(ledger)).toBe(10);
  });

  it("clawback removes booking points when a completion is undone", () => {
    const ledger: LedgerRow[] = [
      { source: "booking_completed", source_id: "b1", points: 10 },
      { source: "booking_completed", source_id: "b2", points: 10 },
    ];
    clawback(ledger, "booking_completed", "b1");
    expect(flooredLedgerTotal(ledger)).toBe(10);
    expect(ledger).toHaveLength(1);
  });

  it("does not award booking points for refunded completions", () => {
    expect(shouldAwardBookingCompletion("completed", "paid")).toBe(true);
    expect(shouldAwardBookingCompletion("completed", "refunded")).toBe(false);
    expect(shouldAwardBookingCompletion("cancelled", "paid")).toBe(false);
  });

  it("re-grading a review replaces the prior award (delete + re-insert)", () => {
    const ledger: LedgerRow[] = [
      { source: "review_received", source_id: "r1", points: 15 },
    ];
    clawback(ledger, "review_received", "r1");
    tryAward(ledger, { source: "review_received", source_id: "r1", points: 10 });
    expect(flooredLedgerTotal(ledger)).toBe(10);
  });

  it("renew-while-eligible when the provider still holds the same tier badge", () => {
    expect(shouldRenewBadgeWhileEligible("silver", "silver")).toBe(true);
    expect(shouldRenewBadgeWhileEligible("gold", "silver")).toBe(false);
    expect(shouldRenewBadgeWhileEligible(null, "silver")).toBe(false);
  });
});
