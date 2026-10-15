import { describe, it, expect, vi } from "vitest";
import { resolveBookingPendingAmount } from "@/lib/payments/resolve-paystack-initialize-amount";

function mockSupabase(payRow: Record<string, unknown> | null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
  };
  return {
    from: vi.fn((table: string) => {
      if (table === "bookings") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: "b1",
              customer_id: "u1",
              payment_status: "pending",
              currency: "ZAR",
            },
            error: null,
          }),
        };
      }
      if (table === "payments") {
        chain.maybeSingle.mockResolvedValue({ data: payRow, error: null });
        return chain;
      }
      return chain;
    }),
  };
}

describe("resolveBookingPendingAmount", () => {
  it("returns amount for stripe pending row", async () => {
    const supabase = mockSupabase({
      id: "p1",
      amount: 150,
      payment_provider: "stripe",
      currency: "ZAR",
    });
    const result = await resolveBookingPendingAmount(supabase as any, "b1", "u1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.paymentProvider).toBe("stripe");
      expect(result.amountMajor).toBe(150);
    }
  });
});
