import { describe, expect, it, vi } from "vitest";
import { refundRedeemedLoyaltyPoints } from "../refund-redeemed-points";

function chainMaybeSingle(result: { data: unknown; error: unknown }) {
  return {
    eq: () => chainMaybeSingle(result),
    contains: () => chainMaybeSingle(result),
    limit: () => ({
      maybeSingle: async () => result,
    }),
    maybeSingle: async () => result,
  };
}

function makeAdmin(sequence: Array<{ data: unknown; error: unknown }>) {
  let call = 0;
  const from = vi.fn(() => ({
    select: () => chainMaybeSingle(sequence[call++] ?? { data: null, error: null }),
  }));
  const rpc = vi.fn();
  return { from, rpc } as any;
}

describe("refundRedeemedLoyaltyPoints", () => {
  it("no-ops when booking_refund marker already exists", async () => {
    const admin = makeAdmin([{ data: { id: "done" }, error: null }]);

    const out = await refundRedeemedLoyaltyPoints(admin, {
      bookingId: "b1",
      customerId: "c1",
      reason: "cancel",
    });
    expect(out.refunded).toBe(false);
    expect(out.reason).toBe("already_refunded");
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("no-ops when no redeemed ledger row exists", async () => {
    const admin = makeAdmin([
      { data: null, error: null },
      { data: null, error: null },
    ]);

    const out = await refundRedeemedLoyaltyPoints(admin, {
      bookingId: "b1",
      customerId: "c1",
      reason: "cancel",
    });
    expect(out.refunded).toBe(false);
    expect(out.reason).toBe("no_redeem_row");
  });

  it("refunds absolute value of redeemed ledger row", async () => {
    const admin = makeAdmin([
      { data: null, error: null },
      { data: { id: "r1", points_amount: -20 }, error: null },
    ]);
    admin.rpc.mockResolvedValue({ error: null });

    const out = await refundRedeemedLoyaltyPoints(admin, {
      bookingId: "b1",
      customerId: "c1",
      reason: "customer_cancel",
    });
    expect(out.refunded).toBe(true);
    expect(out.points).toBe(20);
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
