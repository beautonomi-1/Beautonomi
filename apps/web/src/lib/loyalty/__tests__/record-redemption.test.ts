import { describe, expect, it, vi } from "vitest";
import { recordLoyaltyRedemption } from "../record-redemption";

function makeAdmin() {
  const from = vi.fn();
  const rpc = vi.fn();
  return { from, rpc, chain: { from, rpc } } as any;
}

describe("recordLoyaltyRedemption", () => {
  it("no-ops when booking already has a redeemed ledger row", async () => {
    const admin = makeAdmin();
    admin.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              limit: () => ({
                maybeSingle: async () => ({ data: { id: "existing" }, error: null }),
              }),
            }),
          }),
        }),
      }),
    }));

    const out = await recordLoyaltyRedemption(admin, {
      customerId: "c1",
      points: 50,
      description: "Test",
      bookingId: "b1",
    });
    expect(out.recorded).toBe(false);
    expect(out.reason).toBe("already_redeemed");
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("calls append_loyalty_ledger_entry when not yet redeemed", async () => {
    const admin = makeAdmin();
    admin.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              limit: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }),
    }));
    admin.rpc.mockResolvedValue({ error: null });

    const out = await recordLoyaltyRedemption(admin, {
      customerId: "c1",
      points: 50,
      description: "Redeemed for booking 1",
      bookingId: "b1",
      metadata: { x: 1 },
    });
    expect(out.recorded).toBe(true);
    expect(out.points).toBe(50);
    expect(admin.rpc).toHaveBeenCalledWith("append_loyalty_ledger_entry", {
      p_customer_id: "c1",
      p_transaction_type: "redeemed",
      p_points_amount: -50,
      p_booking_id: "b1",
      p_description: "Redeemed for booking 1",
      p_metadata: { x: 1 },
      p_expires_at: null,
    });
  });
});
