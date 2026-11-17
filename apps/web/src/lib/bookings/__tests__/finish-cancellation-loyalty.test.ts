import { beforeEach, describe, expect, it, vi } from "vitest";

const refund = vi.fn();
const claw = vi.fn();

vi.mock("@/lib/loyalty/refund-redeemed-points", () => ({
  refundRedeemedLoyaltyPoints: (...args: unknown[]) => refund(...args),
}));
vi.mock("@/lib/loyalty/claw-back-earned-for-booking", () => ({
  clawBackEarnedLoyaltyForBooking: (...args: unknown[]) => claw(...args),
}));

describe("finishCancellationLoyalty", () => {
  beforeEach(() => {
    refund.mockReset();
    claw.mockReset();
    refund.mockResolvedValue({ refunded: false, points: 0, reason: "no_redeem_row" });
    claw.mockResolvedValue(false);
  });

  it("leaves the cancellation finished when the visit never used points", async () => {
    const { finishCancellationLoyalty } = await import("../settle-booking-cancellation");
    const result = await finishCancellationLoyalty({} as never, {
      id: "booking-1",
      customer_id: "cust-1",
      booking_number: "BN-1",
    });
    expect(result.stillDue).toBe(false);
  });

  it("keeps the points due when the return does not finish", async () => {
    refund.mockResolvedValue({ refunded: false, points: 0, reason: "rpc_error" });
    const { finishCancellationLoyalty } = await import("../settle-booking-cancellation");
    const result = await finishCancellationLoyalty({} as never, {
      id: "booking-1",
      customer_id: "cust-1",
      booking_number: "BN-1",
    });
    expect(result.stillDue).toBe(true);
    expect(result.redeemedRestored).toBe(false);
  });

  it("keeps the earned points due when the reversal does not finish", async () => {
    claw.mockRejectedValue(new Error("ledger down"));
    const { finishCancellationLoyalty } = await import("../settle-booking-cancellation");
    const result = await finishCancellationLoyalty({} as never, {
      id: "booking-1",
      customer_id: "cust-1",
      booking_number: "BN-1",
    });
    expect(result.stillDue).toBe(true);
    expect(result.earnClawed).toBe(false);
  });
});

describe("markLoyaltyStillDue", () => {
  it("marks the visit when the points are still due and does not replace an open refund", async () => {
    const updates: Record<string, unknown>[] = [];
    const filters: string[] = [];
    const admin = {
      from() {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.update = (payload: Record<string, unknown>) => {
          updates.push(payload);
          return chain;
        };
        chain.eq = self;
        chain.is = (column: string, value: unknown) => {
          filters.push(`${column}:${String(value)}`);
          return chain;
        };
        return chain;
      },
    };
    const { markLoyaltyStillDue, LOYALTY_POINTS_STILL_DUE } = await import(
      "../settle-booking-cancellation"
    );

    await markLoyaltyStillDue(admin as never, "booking-1", false);
    expect(updates).toHaveLength(0);

    await markLoyaltyStillDue(admin as never, "booking-1", true);
    expect(updates).toEqual([{ cancellation_settlement_error: LOYALTY_POINTS_STILL_DUE }]);
    expect(filters).toContain("cancellation_settlement_error:null");
  });

  it("marks the visit when the gift card is still held and does not replace an open refund", async () => {
    const updates: Record<string, unknown>[] = [];
    const admin = {
      from() {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.update = (payload: Record<string, unknown>) => {
          updates.push(payload);
          return chain;
        };
        chain.eq = self;
        chain.is = self;
        return chain;
      },
    };
    const { markGiftCardStillHeld, GIFT_CARD_STILL_HELD } = await import(
      "../settle-booking-cancellation"
    );

    await markGiftCardStillHeld(admin as never, "booking-1", false);
    expect(updates).toHaveLength(0);

    await markGiftCardStillHeld(admin as never, "booking-1", true);
    expect(updates).toEqual([{ cancellation_settlement_error: GIFT_CARD_STILL_HELD }]);
  });
});

describe("settlementMarkAfterGiftVoid", () => {
  it("keeps the gift card due after the wallet refund is in, and keeps an open wallet refund ahead of it", async () => {
    const { settlementMarkAfterGiftVoid, settlementErrorAfterWalletCredit, giftValueFollowUp, GIFT_CARD_STILL_HELD, LOYALTY_POINTS_STILL_DUE } =
      await import("../settle-booking-cancellation");

    expect(
      settlementMarkAfterGiftVoid({
        refundPending: false,
        walletError: "unused",
        giftStillHeld: true,
        giftHeldOut: 50,
        loyaltyStillDue: true,
      }),
    ).toEqual({ stampSettled: true, error: "Gift card value could not be returned: 50.00" });

    expect(
      settlementMarkAfterGiftVoid({
        refundPending: true,
        walletError: "Cancellation refund could not be credited",
        giftStillHeld: true,
        giftHeldOut: 50,
        loyaltyStillDue: false,
      }).error,
    ).toContain("Gift card value could not be returned: 50.00");

    expect(
      settlementErrorAfterWalletCredit(
        "Gift card value could not be returned: 50.00. Cancellation refund could not be credited",
        true,
      ),
    ).toBe("Gift card value could not be returned: 50.00");

    expect(settlementErrorAfterWalletCredit("Cancellation refund could not be credited", true)).toBe(
      LOYALTY_POINTS_STILL_DUE,
    );
    expect(settlementErrorAfterWalletCredit("Cancellation refund could not be credited", false)).toBeNull();

    expect(
      settlementMarkAfterGiftVoid({
        refundPending: false,
        walletError: "unused",
        giftStillHeld: true,
        giftHeldOut: 0,
        loyaltyStillDue: false,
      }).error,
    ).toBe(GIFT_CARD_STILL_HELD);

    expect(giftValueFollowUp("unknown", "spent")).toBe("credit");
    expect(giftValueFollowUp("unknown", "unknown")).toBe("mark");
    expect(giftValueFollowUp("unknown", "restored")).toBe("none");
    expect(giftValueFollowUp("spent", "unknown")).toBe("none");
  });
});
