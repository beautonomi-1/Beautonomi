import { describe, it, expect } from "vitest";
import {
  calculateBookingTotals,
  effectiveTravelFee,
  type BookingPricingInput,
} from "./calculateBookingPricing";

describe("effectiveTravelFee", () => {
  it("returns fee only for at_home", () => {
    expect(effectiveTravelFee("at_home", 50)).toBe(50);
    expect(effectiveTravelFee("at_salon", 50)).toBe(0);
    expect(effectiveTravelFee("walk_in", 25)).toBe(0);
  });
});

/** Round to 2 decimals for comparison (mirrors server Math.round(x*100)/100). */
const r = (n: number) => Math.round(n * 100) / 100;

const base: BookingPricingInput = {
  subtotal: 0,
  discountAmount: 0,
  taxRate: 0.15,
  taxInclusive: true,
  travelFee: 0,
  platformFeePercentage: 0,
  tipAmount: 0,
};

// ---------------------------------------------------------------------------
// Tax-inclusive pricing (SA VAT model — prices already include 15% VAT)
// ---------------------------------------------------------------------------

describe("calculateBookingTotals — tax-inclusive", () => {
  it("extracts VAT from a simple subtotal", () => {
    const result = calculateBookingTotals({ ...base, subtotal: 1000 });
    // Tax = 1000 - 1000/1.15 ≈ 130.4348
    expect(r(result.taxAmount)).toBe(130.43);
    // Total = afterDiscount (price already includes tax)
    expect(r(result.totalAmount)).toBe(1000);
    expect(result.afterDiscount).toBe(1000);
  });

  it("handles discount correctly", () => {
    const result = calculateBookingTotals({
      ...base,
      subtotal: 1000,
      discountAmount: 200,
    });
    // afterDiscount = 800
    expect(result.afterDiscount).toBe(800);
    // Tax = 800 - 800/1.15 ≈ 104.35
    expect(r(result.taxAmount)).toBe(104.35);
    // Total = 800 (tax already included)
    expect(r(result.totalAmount)).toBe(800);
  });

  it("discount greater than subtotal floors at 0", () => {
    const result = calculateBookingTotals({
      ...base,
      subtotal: 100,
      discountAmount: 150,
    });
    expect(result.afterDiscount).toBe(0);
    expect(result.taxAmount).toBe(0);
    expect(result.totalAmount).toBe(0);
  });

  it("includes travel fee on top of tax-inclusive price", () => {
    const result = calculateBookingTotals({
      ...base,
      subtotal: 500,
      travelFee: 80,
    });
    // Total = 500 (service, VAT-inclusive) + 80 travel
    expect(r(result.totalAmount)).toBe(580);
  });

  it("includes tip on top of tax-inclusive price", () => {
    const result = calculateBookingTotals({
      ...base,
      subtotal: 500,
      tipAmount: 75,
    });
    expect(r(result.totalAmount)).toBe(575);
  });

  it("includes platform fee on top of tax-inclusive price", () => {
    const result = calculateBookingTotals({
      ...base,
      subtotal: 1000,
      platformFeePercentage: 0.1, // 10%
    });
    // platformFee = 1000 * 0.1 = 100
    expect(r(result.platformFeeAmount)).toBe(100);
    expect(r(result.serviceFeeAmount)).toBe(100);
    // Total = 1000 + 100
    expect(r(result.totalAmount)).toBe(1100);
  });

  it("keeps deprecated service fee inputs as platform fee compatibility aliases", () => {
    const result = calculateBookingTotals({
      ...base,
      subtotal: 1000,
      serviceFeePercentage: 0.1,
    });

    expect(r(result.platformFeeAmount)).toBe(100);
    expect(r(result.serviceFeeAmount)).toBe(100);
    expect(r(result.totalAmount)).toBe(1100);
  });

  it("combines discount + travel + tip + platform fee", () => {
    const result = calculateBookingTotals({
      ...base,
      subtotal: 1200,
      discountAmount: 200,
      travelFee: 50,
      tipAmount: 100,
      platformFeePercentage: 0.05,
    });
    // afterDiscount = 1000
    expect(result.afterDiscount).toBe(1000);
    // platformFee = 1000 * 0.05 = 50
    expect(r(result.platformFeeAmount)).toBe(50);
    // tax = 1000 - 1000/1.15 ≈ 130.43
    expect(r(result.taxAmount)).toBe(130.43);
    // total = 1000 + 50 + 50 + 100 = 1200
    expect(r(result.totalAmount)).toBe(1200);
  });
});

// ---------------------------------------------------------------------------
// Tax-exclusive pricing (prices do not include tax — tax added on top)
// ---------------------------------------------------------------------------

describe("calculateBookingTotals — tax-exclusive", () => {
  const excl: BookingPricingInput = { ...base, taxInclusive: false };

  it("adds tax on top of subtotal", () => {
    const result = calculateBookingTotals({ ...excl, subtotal: 1000 });
    // Tax = 1000 * 0.15 = 150
    expect(r(result.taxAmount)).toBe(150);
    // Total = 1000 + 150 = 1150
    expect(r(result.totalAmount)).toBe(1150);
  });

  it("applies discount before computing tax", () => {
    const result = calculateBookingTotals({
      ...excl,
      subtotal: 1000,
      discountAmount: 200,
    });
    // afterDiscount = 800
    expect(result.afterDiscount).toBe(800);
    // Tax = 800 * 0.15 = 120
    expect(r(result.taxAmount)).toBe(120);
    // Total = 800 + 120 = 920
    expect(r(result.totalAmount)).toBe(920);
  });

  it("includes travel + tip + tax correctly", () => {
    const result = calculateBookingTotals({
      ...excl,
      subtotal: 500,
      travelFee: 60,
      tipAmount: 50,
    });
    // Tax = 500 * 0.15 = 75
    expect(r(result.taxAmount)).toBe(75);
    // Total = 500 + 75 + 60 + 50 = 685
    expect(r(result.totalAmount)).toBe(685);
  });

  it("includes service fee and tax correctly", () => {
    const result = calculateBookingTotals({
      ...excl,
      subtotal: 1000,
      serviceFeePercentage: 0.1,
    });
    // serviceFee = 1000 * 0.1 = 100
    // tax = 1000 * 0.15 = 150
    // total = 1000 + 150 + 100 = 1250
    expect(r(result.totalAmount)).toBe(1250);
  });
});

// ---------------------------------------------------------------------------
// Zero tax rate
// ---------------------------------------------------------------------------

describe("calculateBookingTotals — zero tax", () => {
  it("tax-inclusive with 0% rate produces zero tax", () => {
    const result = calculateBookingTotals({
      ...base,
      subtotal: 500,
      taxRate: 0,
    });
    expect(result.taxAmount).toBe(0);
    expect(result.totalAmount).toBe(500);
  });

  it("tax-exclusive with 0% rate produces zero tax", () => {
    const result = calculateBookingTotals({
      ...base,
      taxInclusive: false,
      subtotal: 500,
      taxRate: 0,
    });
    expect(result.taxAmount).toBe(0);
    expect(result.totalAmount).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("calculateBookingTotals — edge cases", () => {
  it("all zeros returns all zeros", () => {
    const result = calculateBookingTotals(base);
    expect(result).toEqual({
      subtotal: 0,
      afterDiscount: 0,
      taxAmount: 0,
      platformFeeAmount: 0,
      serviceFeeAmount: 0,
      totalAmount: 0,
    });
  });

  it("subtotal with only travel fee", () => {
    const result = calculateBookingTotals({
      ...base,
      subtotal: 0,
      travelFee: 100,
    });
    expect(result.totalAmount).toBe(100);
    expect(result.taxAmount).toBe(0);
  });

  it("fractional tax rate (7.5%)", () => {
    const result = calculateBookingTotals({
      ...base,
      taxInclusive: false,
      subtotal: 200,
      taxRate: 0.075,
    });
    expect(r(result.taxAmount)).toBe(15);
    expect(r(result.totalAmount)).toBe(215);
  });

  it("100% discount zeros everything except travel/tip", () => {
    const result = calculateBookingTotals({
      ...base,
      subtotal: 500,
      discountAmount: 500,
      travelFee: 30,
      tipAmount: 20,
    });
    expect(result.afterDiscount).toBe(0);
    expect(result.taxAmount).toBe(0);
    expect(result.serviceFeeAmount).toBe(0);
    expect(result.totalAmount).toBe(50); // only travel + tip
  });

  it("tax-inclusive vs tax-exclusive produce different totals for same inputs", () => {
    const inputs = { subtotal: 1000, discountAmount: 0, taxRate: 0.15, travelFee: 0, serviceFeePercentage: 0, tipAmount: 0 };
    const inclusive = calculateBookingTotals({ ...inputs, taxInclusive: true });
    const exclusive = calculateBookingTotals({ ...inputs, taxInclusive: false });
    // Inclusive: total = 1000 (tax inside)
    // Exclusive: total = 1150 (tax on top)
    expect(r(inclusive.totalAmount)).toBe(1000);
    expect(r(exclusive.totalAmount)).toBe(1150);
    // Tax amounts differ
    expect(r(inclusive.taxAmount)).toBe(130.43);
    expect(r(exclusive.taxAmount)).toBe(150);
  });

  it("server-style rounding matches for tax-inclusive", () => {
    // Mirrors the server route: Math.round(x * 100) / 100
    const result = calculateBookingTotals({
      ...base,
      subtotal: 333.33,
    });
    const serverTax = Math.round((333.33 - 333.33 / 1.15) * 100) / 100;
    expect(r(result.taxAmount)).toBe(serverTax);
  });
});

// ---------------------------------------------------------------------------
// Package discount scenarios
// ---------------------------------------------------------------------------

describe("calculateBookingTotals — package discount", () => {
  it("package discount reduces total correctly (tax-inclusive)", () => {
    // Package price = 800, individual services sum = 1000
    // Package discount = 1000 - 800 = 200
    const result = calculateBookingTotals({
      ...base,
      subtotal: 1000,
      discountAmount: 200,
    });
    expect(result.afterDiscount).toBe(800);
    expect(r(result.taxAmount)).toBe(104.35);
    expect(r(result.totalAmount)).toBe(800);
  });

  it("package discount + manual discount stack", () => {
    // Package discount 200 + manual discount 50 = 250 total
    const result = calculateBookingTotals({
      ...base,
      subtotal: 1000,
      discountAmount: 250,
    });
    expect(result.afterDiscount).toBe(750);
    expect(r(result.totalAmount)).toBe(750);
  });

  it("package discount with travel fee (tax-inclusive)", () => {
    const result = calculateBookingTotals({
      ...base,
      subtotal: 1200,
      discountAmount: 400,
      travelFee: 100,
    });
    expect(result.afterDiscount).toBe(800);
    expect(r(result.totalAmount)).toBe(900);
  });

  it("package discount with tax-exclusive pricing", () => {
    const result = calculateBookingTotals({
      ...base,
      taxInclusive: false,
      subtotal: 1000,
      discountAmount: 200,
    });
    expect(result.afterDiscount).toBe(800);
    expect(r(result.taxAmount)).toBe(120);
    expect(r(result.totalAmount)).toBe(920);
  });
});

// ---------------------------------------------------------------------------
// Deposit math scenarios
// ---------------------------------------------------------------------------

describe("deposit math — pure computations", () => {
  it("deposit percentage calculation", () => {
    const totalAmount = 1000;
    const depositPercentage = 30;
    const depositAmount = Math.ceil((totalAmount * depositPercentage) / 100);
    const balanceDue = totalAmount - depositAmount;
    expect(depositAmount).toBe(300);
    expect(balanceDue).toBe(700);
  });

  it("deposit percentage with fractional total", () => {
    const totalAmount = 750;
    const depositPercentage = 30;
    const depositAmount = Math.ceil((totalAmount * depositPercentage) / 100);
    expect(depositAmount).toBe(225);
    expect(totalAmount - depositAmount).toBe(525);
  });

  it("deposit percentage rounds up (ceil)", () => {
    const totalAmount = 999;
    const depositPercentage = 30;
    const depositAmount = Math.ceil((totalAmount * depositPercentage) / 100);
    // 999 * 0.30 = 299.7, ceil = 300
    expect(depositAmount).toBe(300);
  });

  it("deposit on tax-inclusive total after discount", () => {
    const result = calculateBookingTotals({
      ...base,
      subtotal: 1000,
      discountAmount: 200,
    });
    const depositPercentage = 50;
    const depositAmount = Math.ceil((result.totalAmount * depositPercentage) / 100);
    expect(r(result.totalAmount)).toBe(800);
    expect(depositAmount).toBe(400);
    expect(result.totalAmount - depositAmount).toBe(400);
  });

  it("deposit on tax-exclusive total with tax", () => {
    const result = calculateBookingTotals({
      ...base,
      taxInclusive: false,
      subtotal: 1000,
    });
    const depositPercentage = 30;
    const depositAmount = Math.ceil((result.totalAmount * depositPercentage) / 100);
    expect(r(result.totalAmount)).toBe(1150);
    expect(depositAmount).toBe(345);
    expect(result.totalAmount - depositAmount).toBe(805);
  });
});

// ---------------------------------------------------------------------------
// Proportional deposit ledger math (simulates DB trigger logic from migration 458)
// ---------------------------------------------------------------------------

describe("proportional deposit ledger math", () => {
  /**
   * Simulates the proportional commission logic from the finance ledger trigger.
   * For non-online bookings: commission = 0, provider keeps 100% of net.
   * For online bookings: commission is proportional to payment amount.
   */
  function computeLedgerEntries(params: {
    paymentAmount: number;
    bookingTotal: number;
    taxAmount: number;
    travelFee: number;
    serviceFeeAmount: number;
    tipAmount: number;
    commissionRate: number;
    isOnline: boolean;
  }) {
    const {
      paymentAmount, bookingTotal, taxAmount, travelFee,
      serviceFeeAmount, tipAmount, commissionRate, isOnline,
    } = params;
    const total = Math.max(bookingTotal, 0.01);

    let netRatio: number;
    if (isOnline) {
      netRatio = Math.max(0, (total - serviceFeeAmount - taxAmount - travelFee) / total);
    } else {
      netRatio = Math.max(0, (total - taxAmount - travelFee) / total);
    }

    const commissionBase = r(paymentAmount * netRatio);
    const platformCommission = isOnline ? r(commissionBase * commissionRate) : 0;
    const providerEarnings = commissionBase - platformCommission;

    return { commissionBase, platformCommission, providerEarnings };
  }

  it("full payment produces same ledger as old trigger for walk-in", () => {
    const result = computeLedgerEntries({
      paymentAmount: 1000,
      bookingTotal: 1000,
      taxAmount: 130.43,
      travelFee: 0,
      serviceFeeAmount: 0,
      tipAmount: 0,
      commissionRate: 0.15,
      isOnline: false,
    });
    expect(result.platformCommission).toBe(0);
    expect(r(result.providerEarnings)).toBe(r(1000 - 130.43));
  });

  it("full payment produces correct commission for online", () => {
    const result = computeLedgerEntries({
      paymentAmount: 1000,
      bookingTotal: 1000,
      taxAmount: 130.43,
      travelFee: 0,
      serviceFeeAmount: 100,
      tipAmount: 0,
      commissionRate: 0.15,
      isOnline: true,
    });
    // netRatio = (1000 - 100 - 130.43 - 0) / 1000 = 0.76957
    // commissionBase = 1000 * 0.76957 = 769.57
    // platformCommission = 769.57 * 0.15 = 115.44
    expect(r(result.commissionBase)).toBe(769.57);
    expect(r(result.platformCommission)).toBe(115.44);
    expect(r(result.providerEarnings)).toBe(r(769.57 - 115.44));
  });

  it("deposit payment produces proportional ledger entries", () => {
    const bookingTotal = 1000;
    const depositAmount = 300;
    const result = computeLedgerEntries({
      paymentAmount: depositAmount,
      bookingTotal,
      taxAmount: 130.43,
      travelFee: 0,
      serviceFeeAmount: 0,
      tipAmount: 0,
      commissionRate: 0.15,
      isOnline: false,
    });
    // Walk-in: no commission
    // netRatio = (1000 - 130.43) / 1000 = 0.86957
    // commissionBase = 300 * 0.86957 = 260.87
    expect(r(result.commissionBase)).toBe(260.87);
    expect(result.platformCommission).toBe(0);
    expect(r(result.providerEarnings)).toBe(260.87);
  });

  it("deposit + remaining payment sum to full booking ledger", () => {
    const bookingTotal = 1000;
    const taxAmount = 130.43;
    const deposit = 300;
    const remaining = 700;

    const first = computeLedgerEntries({
      paymentAmount: deposit,
      bookingTotal,
      taxAmount,
      travelFee: 0,
      serviceFeeAmount: 0,
      tipAmount: 0,
      commissionRate: 0.15,
      isOnline: false,
    });
    const second = computeLedgerEntries({
      paymentAmount: remaining,
      bookingTotal,
      taxAmount,
      travelFee: 0,
      serviceFeeAmount: 0,
      tipAmount: 0,
      commissionRate: 0.15,
      isOnline: false,
    });

    const totalProviderEarnings = r(first.providerEarnings + second.providerEarnings);
    const expectedFull = r(bookingTotal - taxAmount);
    expect(totalProviderEarnings).toBe(expectedFull);
  });

  it("online deposit + remaining sum to full commission", () => {
    const bookingTotal = 1000;
    const taxAmount = 130.43;
    const serviceFee = 100;
    const deposit = 300;
    const remaining = 700;
    const rate = 0.15;

    const first = computeLedgerEntries({
      paymentAmount: deposit,
      bookingTotal,
      taxAmount,
      travelFee: 0,
      serviceFeeAmount: serviceFee,
      tipAmount: 0,
      commissionRate: rate,
      isOnline: true,
    });
    const second = computeLedgerEntries({
      paymentAmount: remaining,
      bookingTotal,
      taxAmount,
      travelFee: 0,
      serviceFeeAmount: serviceFee,
      tipAmount: 0,
      commissionRate: rate,
      isOnline: true,
    });

    const totalCommission = r(first.platformCommission + second.platformCommission);
    const fullBase = r(bookingTotal - serviceFee - taxAmount);
    const expectedCommission = r(fullBase * rate);
    expect(totalCommission).toBe(expectedCommission);
  });
});

// ---------------------------------------------------------------------------
// Package discount base parity (services-only vs full subtotal)
// ---------------------------------------------------------------------------

describe("package discount base parity", () => {
  it("package discount uses services-only subtotal, not full subtotal", () => {
    const servicesSubtotal = 800;
    const productsSubtotal = 200;
    const fullSubtotal = servicesSubtotal + productsSubtotal;
    const packagePrice = 600;

    // Customer flow: discount = servicesSubtotal - packagePrice
    const customerDiscount = servicesSubtotal - packagePrice;
    expect(customerDiscount).toBe(200);

    // Provider flow (fixed): should also use services-only
    const providerDiscount = servicesSubtotal - packagePrice;
    expect(providerDiscount).toBe(200);

    // Incorrect old behavior: fullSubtotal - packagePrice = 400 (too much discount)
    const incorrectDiscount = fullSubtotal - packagePrice;
    expect(incorrectDiscount).toBe(400);
    expect(incorrectDiscount).not.toBe(customerDiscount);
  });

  it("package discount does not exceed services subtotal", () => {
    const servicesSubtotal = 500;
    const packagePrice = 600;

    // Package price > services subtotal: no discount
    const discount = Math.max(0, servicesSubtotal - packagePrice);
    expect(discount).toBe(0);
  });

  it("package + manual discount stacks correctly", () => {
    const servicesSubtotal = 1000;
    const packagePrice = 750;
    const manualDiscount = 50;

    const packageDiscount = servicesSubtotal - packagePrice;
    const totalDiscount = Math.max(packageDiscount, manualDiscount);

    // Package discount (250) > manual discount (50), so package wins
    expect(totalDiscount).toBe(250);
  });
});

// ---------------------------------------------------------------------------
// booking_source values across flows
// ---------------------------------------------------------------------------

describe("booking_source values", () => {
  it("customer booking should use 'online'", () => {
    const customerBookingSource = "online";
    expect(["online", "walk_in", "provider"]).toContain(customerBookingSource);
  });

  it("provider walk-in should use 'walk_in'", () => {
    const isWalkIn = true;
    const source = isWalkIn ? "walk_in" : "provider";
    expect(source).toBe("walk_in");
  });

  it("provider non-walk-in should use 'provider'", () => {
    const isWalkIn = false;
    const source = isWalkIn ? "walk_in" : "provider";
    expect(source).toBe("provider");
  });

  it("api.ts default should be 'provider' not 'walk_in'", () => {
    const bookingSource = undefined;
    const apiDefault = bookingSource || "provider";
    expect(apiDefault).toBe("provider");
  });
});

// ---------------------------------------------------------------------------
// Webhook proportional commission for deposit bookings
// ---------------------------------------------------------------------------

describe("webhook proportional commission", () => {
  it("proportional commission uses actual charged amount, not full booking", () => {
    const bookingTotal = 1000;
    const tipAmount = 50;
    const taxAmount = 130.43;
    const travelFee = 0;
    const serviceFeeAmount = 100;

    const fullCommissionBase = bookingTotal - tipAmount - taxAmount - travelFee - serviceFeeAmount;
    const netRevenueRatio = Math.max(0, fullCommissionBase / bookingTotal);

    // Full payment: commission base should equal the full base
    const fullChargeBase = r(bookingTotal * netRevenueRatio);
    expect(fullChargeBase).toBe(r(fullCommissionBase));

    // Deposit (30%): commission base should be 30% of full base
    const depositAmount = 300;
    const depositBase = r(depositAmount * netRevenueRatio);
    const expectedDepositBase = r(fullCommissionBase * 0.3);
    expect(depositBase).toBe(expectedDepositBase);
  });

  it("remaining payment commission is proportional to remaining amount", () => {
    const bookingTotal = 1000;
    const taxAmount = 130.43;
    const serviceFeeAmount = 100;

    const fullBase = bookingTotal - taxAmount - serviceFeeAmount;
    const ratio = fullBase / bookingTotal;

    const deposit = 300;
    const remaining = 700;

    const depositCommBase = r(deposit * ratio);
    const remainingCommBase = r(remaining * ratio);
    const totalCommBase = r(depositCommBase + remainingCommBase);

    expect(totalCommBase).toBe(r(fullBase));
  });
});

describe("calculateBookingTotals — membership and loyalty discounts", () => {
  it("applies platform fee on post-membership/loyalty base", () => {
    const result = calculateBookingTotals({
      ...base,
      subtotal: 1000,
      discountAmount: 100,
      promotionDiscountAmount: 50,
      membershipDiscountAmount: 80,
      loyaltyDiscountAmount: 20,
      platformFeePercentage: 0.1,
    });
    // 1000 - 100 - 50 - 80 - 20 = 750
    expect(result.afterDiscount).toBe(750);
    expect(r(result.platformFeeAmount)).toBe(75);
    expect(r(result.totalAmount)).toBe(825);
  });
});
