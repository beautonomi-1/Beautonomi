import { describe, expect, it } from "vitest";
import {
  computeProviderCreateTaxableAmount,
  computeWalletGiftCoverageOutstanding,
  normalizeProviderCreateDiscounts,
  resolveProviderBookingDeposit,
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

describe("resolveProviderBookingDeposit", () => {
  it("derives the deposit from the percentage against the server total, not the client amount", () => {
    // Client computed 50% of its own (stale) 200 total; the server total is 220.
    const result = resolveProviderBookingDeposit({
      paymentOption: "deposit",
      depositRequired: true,
      depositPercentage: 50,
      depositAmount: 100,
      totalAmount: 220,
    });

    expect(result.paymentOption).toBe("deposit");
    expect(result.depositAmount).toBe(110);
    expect(result.depositPercentage).toBe(50);
    expect(result.depositRequired).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("accepts a bare deposit amount when no percentage is given", () => {
    const result = resolveProviderBookingDeposit({
      paymentOption: "deposit",
      depositRequired: true,
      depositPercentage: null,
      depositAmount: 75.256,
      totalAmount: 300,
    });

    expect(result.depositAmount).toBe(75.26);
    expect(result.depositPercentage).toBeNull();
    expect(result.warnings).toEqual([]);
  });

  it("caps a deposit larger than the booking total and says so", () => {
    const result = resolveProviderBookingDeposit({
      paymentOption: "deposit",
      depositRequired: true,
      depositPercentage: null,
      depositAmount: 500,
      totalAmount: 300,
    });

    expect(result.depositAmount).toBe(300);
    expect(result.warnings.join(" ")).toMatch(/larger than the booking total/i);
  });

  it("falls back to a full payment when the deposit settings resolve to nothing", () => {
    // A provider with "deposit required" but a 0% deposit configured must still
    // be able to take the money — blocking the sale is the worse failure.
    const result = resolveProviderBookingDeposit({
      paymentOption: "deposit",
      depositRequired: true,
      depositPercentage: 0,
      depositAmount: 0,
      totalAmount: 300,
    });

    expect(result.paymentOption).toBe("full");
    expect(result.depositRequired).toBe(false);
    expect(result.depositAmount).toBeNull();
    expect(result.warnings.join(" ")).toMatch(/full payment/i);
  });

  it("ignores an out-of-range percentage rather than silently clamping", () => {
    const result = resolveProviderBookingDeposit({
      paymentOption: "deposit",
      depositRequired: true,
      depositPercentage: 150,
      depositAmount: 0,
      totalAmount: 300,
    });

    // 150% is not a valid percentage and there is no fallback amount.
    expect(result.paymentOption).toBe("full");
    expect(result.depositPercentage).toBeNull();
  });

  it("caps a 100% deposit at the booking total", () => {
    const result = resolveProviderBookingDeposit({
      paymentOption: "deposit",
      depositRequired: true,
      depositPercentage: 100,
      depositAmount: 999,
      totalAmount: 180,
    });

    expect(result.depositAmount).toBe(180);
    expect(result.warnings).toEqual([]);
  });

  it("leaves full-payment bookings without a deposit amount", () => {
    const result = resolveProviderBookingDeposit({
      paymentOption: "full",
      depositRequired: false,
      depositPercentage: null,
      depositAmount: null,
      totalAmount: 250,
    });

    expect(result).toEqual({
      paymentOption: "full",
      depositRequired: false,
      depositPercentage: null,
      depositAmount: null,
      warnings: [],
    });
  });
});
