import { describe, it, expect } from "vitest";

/**
 * Mirrors the sanitization in POST /api/provider/bookings:
 * legacy clients send membership folded into `discount_amount` while also sending
 * `membership_discount_amount` — strip once before tax base.
 */
function stripFoldedMembershipFromDiscount(
  discountAmount: number,
  explicitMembershipDiscount: number,
): number {
  let serverDiscountAmount = discountAmount;
  if (explicitMembershipDiscount > 0.001) {
    serverDiscountAmount = Math.max(0, serverDiscountAmount - explicitMembershipDiscount);
  }
  return serverDiscountAmount;
}

describe("provider discount vs membership_discount_amount", () => {
  it("strips membership from discount when explicit membership is sent", () => {
    expect(stripFoldedMembershipFromDiscount(15.4, 5.4)).toBeCloseTo(10, 5);
  });

  it("does not change discount when membership is zero", () => {
    expect(stripFoldedMembershipFromDiscount(12, 0)).toBe(12);
  });
});
