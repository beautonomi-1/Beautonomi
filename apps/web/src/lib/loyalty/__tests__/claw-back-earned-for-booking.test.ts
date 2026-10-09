import { describe, expect, it, vi } from "vitest";
import { clawBackEarnedLoyaltyForBooking } from "../claw-back-earned-for-booking";
import { LOYALTY_EARN_CLAWBACK_SOURCE } from "../earn-clawback";

function chainMaybeSingle(result: { data: unknown; error: unknown }) {
  const self = {
    eq: () => self,
    contains: () => self,
    lt: () => self,
    limit: () => ({
      maybeSingle: async () => result,
    }),
    maybeSingle: async () => result,
  };
  return self;
}

describe("clawBackEarnedLoyaltyForBooking", () => {
  it("no-ops when a negative adjusted row already exists (trigger ran first)", async () => {
    let fromCalls = 0;
    const from = vi.fn(() => {
      fromCalls += 1;
      if (fromCalls === 1) {
        return { select: () => chainMaybeSingle({ data: { id: "claw" }, error: null }) };
      }
      return { select: () => chainMaybeSingle({ data: null, error: null }) };
    });
    const rpc = vi.fn();
    const admin = { from, rpc } as any;

    const ok = await clawBackEarnedLoyaltyForBooking(admin, {
      bookingId: "b1",
      customerId: "c1",
    });

    expect(ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("appends earn_clawback when earned row exists and no prior clawback", async () => {
    let fromCalls = 0;
    const from = vi.fn(() => {
      fromCalls += 1;
      if (fromCalls === 1) {
        return { select: () => chainMaybeSingle({ data: null, error: null }) };
      }
      return {
        select: () =>
          chainMaybeSingle({ data: { id: "e1", points_amount: 120 }, error: null }),
      };
    });
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const admin = { from, rpc } as any;

    const ok = await clawBackEarnedLoyaltyForBooking(admin, {
      bookingId: "b1",
      customerId: "c1",
      bookingNumber: "BN-1",
    });

    expect(ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith(
      "append_loyalty_ledger_entry",
      expect.objectContaining({
        p_points_amount: -120,
        p_metadata: { source: LOYALTY_EARN_CLAWBACK_SOURCE },
      }),
    );
  });
});
