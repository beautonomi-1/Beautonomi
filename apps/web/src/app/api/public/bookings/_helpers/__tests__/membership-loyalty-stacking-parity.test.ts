import { describe, expect, it } from "vitest";

/**
 * Documents ordering expected from validate-booking + mobile/web checkout:
 * membership applies on subtotal after coupon only; loyalty after membership.
 * Gift cards are tender after total calculation, not a booking discount.
 * Sample: R199 service, 10% membership, R11.90 loyalty → R167.20 taxable base before tax/fees/tip.
 */
describe("membership before loyalty (web/server parity)", () => {
  it("matches 199 / 10% / 11.90 loyalty → 19.90 membership and 167.20 after discounts", () => {
    const subtotal = 199;
    const couponDiscount = 0;
    const membershipPct = 10;
    const loyaltyDiscount = 11.9;

    const baseForMembership = Math.max(0, subtotal - couponDiscount);
    const membershipDiscount = Math.min(
      (baseForMembership * membershipPct) / 100,
      baseForMembership,
    );
    expect(membershipDiscount).toBeCloseTo(19.9, 2);

    const afterDiscounts = Math.max(
      0,
      subtotal - couponDiscount - membershipDiscount - loyaltyDiscount,
    );
    expect(afterDiscounts).toBeCloseTo(167.2, 2);
    expect(loyaltyDiscount).toBeCloseTo(11.9, 2);
  });

  it("does not reduce taxable booking total by gift-card tender", () => {
    const subtotal = 200;
    const couponDiscount = 20;
    const giftCardTender = 50;
    const membershipPct = 10;
    const taxPct = 15;

    const afterCoupon = subtotal - couponDiscount;
    const membershipDiscount = (afterCoupon * membershipPct) / 100;
    const taxableBase = afterCoupon - membershipDiscount;
    const taxAmount = (taxableBase * taxPct) / 100;
    const bookingTotal = taxableBase + taxAmount;
    const dueFromCardAfterGift = Math.max(0, bookingTotal - giftCardTender);

    expect(taxableBase).toBe(162);
    expect(bookingTotal).toBeCloseTo(186.3, 2);
    expect(dueFromCardAfterGift).toBeCloseTo(136.3, 2);
  });
});
