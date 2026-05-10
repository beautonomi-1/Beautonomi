import { describe, expect, it } from "vitest";
import {
  computeProviderCreateTaxableAmount,
  computeWalletGiftCoverageOutstanding,
  normalizeProviderCreateDiscounts,
  sumExplicitProviderAddonsSubtotal,
} from "../provider-booking-finance";

describe("provider booking finance helpers", () => {
  it("keeps provider promo out of discount_amount and subtracts it exactly once from tax base", () => {
    const discounts = normalizeProviderCreateDiscounts({
      discountAmount: 25,
      promotionDiscountAmount: 25,
      membershipDiscountAmount: 0,
      discountCode: "SAVE25",
    });

    expect(discounts.discountAmount).toBe(0);
    expect(discounts.promotionDiscountAmount).toBe(25);
    expect(
      computeProviderCreateTaxableAmount({
        subtotal: 200,
        discountAmount: discounts.discountAmount,
        promotionDiscountAmount: discounts.promotionDiscountAmount,
        membershipDiscountAmount: discounts.membershipDiscountAmount,
      }),
    ).toBe(175);
  });

  it("strips explicit membership from legacy discount_amount before tax base", () => {
    const discounts = normalizeProviderCreateDiscounts({
      discountAmount: 30,
      promotionDiscountAmount: 0,
      membershipDiscountAmount: 10,
    });

    expect(discounts.discountAmount).toBe(20);
    expect(
      computeProviderCreateTaxableAmount({
        subtotal: 100,
        discountAmount: discounts.discountAmount,
        promotionDiscountAmount: 0,
        membershipDiscountAmount: discounts.membershipDiscountAmount,
      }),
    ).toBe(70);
  });

  it("uses max wallet/gift coverage for group mark-paid outstanding", () => {
    expect(
      computeWalletGiftCoverageOutstanding({
        totalAmount: 300,
        totalPaid: 100,
        totalRefunded: 0,
        walletAmount: 100,
        giftCardAmount: 0,
      }),
    ).toBe(200);
  });

  it("includes explicit provider add-ons in server-side line subtotal", () => {
    expect(
      sumExplicitProviderAddonsSubtotal([
        { addon_id: "addon-1", price: 50, quantity: 1 },
        { addon_id: "addon-2", price: 25, quantity: 2 },
      ]),
    ).toBe(100);
  });
});
