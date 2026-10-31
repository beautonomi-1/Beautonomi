import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertAdminWalletInPersonSubstituteAllowed } from "../admin-wallet-in-person-guard";

vi.mock("@/lib/bookings/booking-refund-limits", () => ({
  fetchBookingPaymentsForRefundCap: vi.fn().mockResolvedValue([
    { payment_method: "cash", payment_provider: "cash", status: "completed", amount: 100 },
  ]),
}));

function mockSupabase(refundRows: Array<Record<string, unknown>>): SupabaseClient {
  return {
    from(table: string) {
      if (table !== "booking_refunds") return {};
      return {
        select: () => ({
          eq: () => Promise.resolve({ data: refundRows, error: null }),
        }),
      };
    },
  } as unknown as SupabaseClient;
}

describe("assertAdminWalletInPersonSubstituteAllowed", () => {
  it("requires substitute_reason when pending cash exists", async () => {
    const result = await assertAdminWalletInPersonSubstituteAllowed(mockSupabase([
      { id: "r1", amount: 100, refund_method: "cash", status: "pending" },
    ]), {
      bookingId: "b1",
      amount: 100,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("SUBSTITUTE_REASON_REQUIRED");
    }
  });

  it("allows wallet credit with substitute_reason and returns pending ids", async () => {
    const result = await assertAdminWalletInPersonSubstituteAllowed(mockSupabase([
      { id: "r1", amount: 100, refund_method: "cash", status: "pending" },
    ]), {
      bookingId: "b1",
      amount: 100,
      substituteReason: "goodwill",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pendingCashRefundIds).toEqual(["r1"]);
    }
  });

  it("rejects wallet credit when in-person cash is already completed", async () => {
    const result = await assertAdminWalletInPersonSubstituteAllowed(mockSupabase([
      { id: "r1", amount: 100, refund_method: "cash", status: "completed" },
    ]), {
      bookingId: "b1",
      amount: 50,
      substituteReason: "goodwill",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("IN_PERSON_ALREADY_REFUNDED");
    }
  });

  it("rejects wallet amount above still-owed in-person balance", async () => {
    const result = await assertAdminWalletInPersonSubstituteAllowed(mockSupabase([
      { id: "r1", amount: 40, refund_method: "cash", status: "pending" },
    ]), {
      bookingId: "b1",
      amount: 150,
      substituteReason: "goodwill",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("IN_PERSON_CAP_EXCEEDED");
    }
  });
});
