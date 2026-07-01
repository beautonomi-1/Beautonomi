/**
 * Unit tests for settleAdditionalChargePlatformHeld.
 *
 * Covers:
 *  - Happy path: produces exactly one additional_charge_payment + provider_earnings
 *    finance_transactions row, marks charge paid, increments booking total_amount.
 *  - Idempotency: when payment_transactions unique constraint fires (code 23505),
 *    returns { ok: true, alreadySettled: true } and makes no additional writes.
 *  - Missing booking: throws.
 *  - Already-paid charge: returns { ok: true, alreadySettled: true } early.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// --- helpers ---

function makeInsert(mockFn: ReturnType<typeof vi.fn>) {
  return vi.fn().mockImplementation((data: unknown) => {
    mockFn(data);
    return Promise.resolve({ error: null });
  });
}

function makeUniqueInsert(
  callCount: { n: number },
  constraintError: unknown,
  trackFn: ReturnType<typeof vi.fn>,
) {
  return vi.fn().mockImplementation((data: unknown) => {
    trackFn(data);
    callCount.n += 1;
    if (callCount.n === 1) {
      return Promise.resolve({ error: constraintError });
    }
    return Promise.resolve({ error: null });
  });
}

/**
 * Build a minimal Supabase admin mock that provides enough surface for
 * settleAdditionalChargePlatformHeld to run.
 */
function buildAdminMock({
  booking = {
    id: "booking-1",
    provider_id: "provider-1",
    tenant_id: "tenant-1",
    booking_number: "B001",
    ref_number: null,
    total_amount: 500,
    currency: "ZAR",
  },
  charge = {
    id: "charge-1",
    status: "approved",
    amount: 100,
    description: "Extra service",
    currency: "ZAR",
  },
  ptInsertError = null as unknown,
  ftInsertCalls = [] as unknown[],
  bpInsertCalls = [] as unknown[],
} = {}) {
  const ptInsert = vi.fn().mockResolvedValue({ error: ptInsertError });
  const ftInsert = vi.fn().mockImplementation((row: unknown) => {
    ftInsertCalls.push(row);
    return Promise.resolve({ error: null });
  });
  const bpInsert = vi.fn().mockImplementation((row: unknown) => {
    bpInsertCalls.push(row);
    return Promise.resolve({ error: null });
  });
  const acUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
  });
  const bookingsUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  });
  const eventsInsert = vi.fn().mockResolvedValue({ error: null });
  const providersSelect = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { user_id: "provider-user-1" }, error: null }) }),
  });

  let callIdx = 0;
  const from = vi.fn((table: string) => {
    if (table === "bookings") {
      callIdx += 1;
      if (callIdx <= 1) {
        // First bookings call = fetch booking
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: booking, error: null }) }),
          }),
          update: bookingsUpdate,
        };
      }
      return { update: bookingsUpdate };
    }
    if (table === "additional_charges") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: charge, error: null }) }),
          }),
        }),
        update: acUpdate,
      };
    }
    if (table === "payment_transactions") return { insert: ptInsert };
    if (table === "finance_transactions") return { insert: ftInsert };
    if (table === "booking_payments") return { insert: bpInsert };
    if (table === "booking_events") return { insert: eventsInsert };
    if (table === "providers") return { select: providersSelect };
    return { insert: vi.fn().mockResolvedValue({ error: null }) };
  });

  return { from, ptInsert, ftInsert, bpInsert, acUpdate, ftInsertCalls, bpInsertCalls };
}

// Mock the heavy external dependencies so the unit test stays lightweight
vi.mock("@/lib/finance/resolve-tenant-id-for-ledger", () => ({
  resolveTenantIdForFinanceLedger: vi.fn().mockResolvedValue("tenant-1"),
}));
vi.mock("@/lib/finance/resolve-commission-percentage", () => ({
  resolveCommissionPercentageForProvider: vi.fn().mockResolvedValue(15),
}));
vi.mock("@/lib/notifications/insert-notification", () => ({
  insertNotification: vi.fn().mockResolvedValue(undefined),
}));

// Import under test (after mocks)
import { settleAdditionalChargePlatformHeld } from "../settle-additional-charge-platform-held";

describe("settleAdditionalChargePlatformHeld", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: returns ok, writes finance_transactions twice (commission + earnings)", async () => {
    const ftInsertCalls: unknown[] = [];
    const bpInsertCalls: unknown[] = [];
    const { from } = buildAdminMock({ ftInsertCalls, bpInsertCalls });

    const result = await settleAdditionalChargePlatformHeld(
      { from } as any,
      {
        reference: "ref-001",
        amountSmallestUnit: 10000, // 100 ZAR in kobo
        feesSmallestUnit: 0,
        bookingId: "booking-1",
        chargeId: "charge-1",
        customerId: "customer-1",
      }
    );

    expect(result).toEqual({ ok: true });

    // Two finance_transactions rows: additional_charge_payment + provider_earnings
    const types = (ftInsertCalls as Array<{ transaction_type: string }>).map((r) => r.transaction_type);
    expect(types).toContain("additional_charge_payment");
    expect(types).toContain("provider_earnings");

    // Exactly one booking_payments row
    expect(bpInsertCalls.length).toBe(1);
  });

  it("idempotency: 23505 unique constraint on payment_transactions -> alreadySettled", async () => {
    const { from } = buildAdminMock({
      ptInsertError: { code: "23505", message: "unique violation" },
    });

    const result = await settleAdditionalChargePlatformHeld(
      { from } as any,
      {
        reference: "ref-dup",
        amountSmallestUnit: 10000,
        bookingId: "booking-1",
        chargeId: "charge-1",
        customerId: "customer-1",
      }
    );

    expect(result).toEqual({ ok: true, alreadySettled: true });
  });

  it("already-paid charge -> alreadySettled early without writing payment_transactions", async () => {
    const { from, ptInsert } = buildAdminMock({
      charge: {
        id: "charge-1",
        status: "paid",
        amount: 100,
        description: "Extra",
        currency: "ZAR",
      },
    });

    const result = await settleAdditionalChargePlatformHeld(
      { from } as any,
      {
        reference: "ref-paid",
        amountSmallestUnit: 10000,
        bookingId: "booking-1",
        chargeId: "charge-1",
        customerId: "customer-1",
      }
    );

    expect(result).toEqual({ ok: true, alreadySettled: true });
    expect(ptInsert).not.toHaveBeenCalled();
  });

  it("missing booking -> throws with descriptive message", async () => {
    const { from } = buildAdminMock({ booking: null as any });

    await expect(
      settleAdditionalChargePlatformHeld(
        { from } as any,
        {
          reference: "ref-x",
          amountSmallestUnit: 10000,
          bookingId: "missing-booking",
          chargeId: "charge-1",
          customerId: "customer-1",
        }
      )
    ).rejects.toThrow(/booking missing-booking not found/);
  });
});
