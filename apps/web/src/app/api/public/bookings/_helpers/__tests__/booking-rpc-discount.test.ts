import { describe, expect, it } from "vitest";
import { discountAmountForBookingRpcInsert } from "../create-booking-record";

describe("discountAmountForBookingRpcInsert", () => {
  it("uses package discount only when no loyalty redeem", () => {
    expect(
      discountAmountForBookingRpcInsert({
        packageDiscountAmount: 20,
        loyaltyDiscountAmount: 15,
        loyaltyPointsRedeemed: 0,
      }),
    ).toBe(20);
  });

  it("folds loyalty into discount_amount for RPC insert", () => {
    expect(
      discountAmountForBookingRpcInsert({
        packageDiscountAmount: 20,
        loyaltyDiscountAmount: 15,
        loyaltyPointsRedeemed: 150,
      }),
    ).toBe(35);
  });
});
