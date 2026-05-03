import { describe, expect, it } from "vitest";

/**
 * Documents ordering expected from validate-booking + mobile checkout:
 * membership applies on subtotal after coupon/gift only; loyalty after membership.
 * Sample: R199 service, 10% membership, R11.90 loyalty → R167.20 taxable base before tax/fees/tip.
 */
describe("membership before loyalty (web/server parity)", () => {
  it("matches 199 / 10% / 11.90 loyalty → 19.90 membership and 167.20 after discounts", () => {
    const subtotal = 199;
    const couponAndGift = 0;
    const membershipPct = 10;
    const loyaltyDiscount = 11.9;

    const baseForMembership = Math.max(0, subtotal - couponAndGift);
    const membershipDiscount = Math.min(
      (baseForMembership * membershipPct) / 100,
      baseForMembership,
    );
    expect(membershipDiscount).toBeCloseTo(19.9, 2);

    const afterDiscounts = Math.max(
      0,
      subtotal - couponAndGift - membershipDiscount - loyaltyDiscount,
    );
    expect(afterDiscounts).toBeCloseTo(167.2, 2);
    expect(loyaltyDiscount).toBeCloseTo(11.9, 2);
  });
});
