import { describe, expect, it, vi } from "vitest";
import { refundRedeemedLoyaltyPoints } from "../refund-redeemed-points";

function makeAdmin() {
  const from = vi.fn();
  const rpc = vi.fn();
  return { from, rpc } as any;
}

describe("refundRedeemedLoyaltyPoints", () => {
  it("no-ops when booking_refund marker already exists", async () => {
    const admin = makeAdmin();
    admin.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              contains: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: { id: "done" }, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    }));

    const out = await refundRedeemedLoyaltyPoints(admin, {
      bookingId: "b1",
      customerId: "c1",
      pointsRedeemed: 20,
      reason: "cancel",
    });
    expect(out.refunded).toBe(false);
    expect(out.reason).toBe("already_refunded");
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("appends adjusted positive points with booking_refund metadata", async () => {
    const admin = makeAdmin();
    admin.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              contains: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    }));
    admin.rpc.mockResolvedValue({ error: null });

    const out = await refundRedeemedLoyaltyPoints(admin, {
      bookingId: "b1",
      customerId: "c1",
      pointsRedeemed: 20,
      reason: "customer_cancel",
    });
    expect(out.refunded).toBe(true);
    expect(admin.rpc).toHaveBeenCalledWith("append_loyalty_ledger_entry", {
      p_customer_id: "c1",
      p_transaction_type: "adjusted",
      p_points_amount: 20,
      p_booking_id: "b1",
      p_description: "Refund of redeemed points (customer_cancel)",
      p_metadata: { reason: "customer_cancel", source: "booking_refund" },
      p_expires_at: null,
    });
  });
});
