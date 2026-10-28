import { describe, expect, it } from "vitest";

/** Mirrors create-booking-record loyalty success patch (same keys in one update). */
function loyaltySuccessPatch(input: {
  loyaltyPointsRedeemed: number;
  loyaltyDiscountAmount: number;
  packageDiscountAmount: number;
}) {
  if (input.loyaltyPointsRedeemed <= 0) return null;
  return {
    loyalty_points_used: input.loyaltyPointsRedeemed,
    loyalty_discount_amount: input.loyaltyDiscountAmount,
    discount_amount: input.packageDiscountAmount,
  };
}

describe("loyalty booking patch contract", () => {
  it("restores package-only discount_amount alongside loyalty columns", () => {
    expect(
      loyaltySuccessPatch({
        loyaltyPointsRedeemed: 100,
        loyaltyDiscountAmount: 10,
        packageDiscountAmount: 25,
      }),
    ).toEqual({
      loyalty_points_used: 100,
      loyalty_discount_amount: 10,
      discount_amount: 25,
    });
  });

  it("skips patch when no points redeemed", () => {
    expect(
      loyaltySuccessPatch({
        loyaltyPointsRedeemed: 0,
        loyaltyDiscountAmount: 0,
        packageDiscountAmount: 25,
      }),
    ).toBeNull();
  });
});
