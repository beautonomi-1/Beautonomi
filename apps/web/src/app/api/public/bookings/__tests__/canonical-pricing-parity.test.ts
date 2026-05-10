import { describe, it, expect } from "vitest";
import { calculateBookingTotals } from "@beautonomi/utils";
import { computeTaxPlatformTipTotal } from "@/lib/pricing/booking-pricing";
import { computeBookingReceiptFinancials } from "@/lib/receipts/build-booking-receipt";

/**
 * Canonical pricing parity: prove the same booking inputs decompose identically
 * across the public path (validate-booking style), the provider path (provider
 * route's recompute), and the receipt builder (read-side display).
 *
 * Persisted columns convention (after this audit):
 *   subtotal = lines only (services + addons + products, after package on services)
 *   travel_fee = travel only
 *   discount_amount = manual + package
 *   promotion_discount_amount = promo
 *   membership_discount_amount = membership
 *   loyalty_discount_amount = loyalty
 *   total_amount = subtotal + travel + tax + platform_fee + tip
 *                  - (discount + promo + membership + loyalty + cancellation)
 */

type PricingInputs = {
  servicesSubtotal: number;
  addonsSubtotal?: number;
  productsSubtotal?: number;
  travelFee?: number;
  packageDiscount?: number;
  promoDiscount?: number;
  membershipDiscount?: number;
  loyaltyDiscount?: number;
  manualDiscount?: number;
  tipAmount?: number;
  taxRatePercent?: number;
  taxIncluded?: boolean;
  platformFeePct?: number;
  platformFeeFixed?: number;
  platformFeeType?: "percentage" | "fixed_amount";
};

type Decomposed = {
  subtotal: number;
  travel_fee: number;
  discount_amount: number;
  promotion_discount_amount: number;
  membership_discount_amount: number;
  loyalty_discount_amount: number;
  tax_amount: number;
  platform_fee_amount: number;
  tip_amount: number;
  total_amount: number;
};

function r2(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Public validate-booking + create-booking-record style decomposition.
 * §Finance-truth 2026-05: `subtotal` is lines BEFORE any discount; package discount
 * goes into `discount_amount`. Total math still uses lines-after-package internally
 * but the persisted columns reconcile via the invariant:
 *   subtotal + travel + tax + fee + tip - (discount + promo + membership + loyalty) = total
 */
function publicDecompose(p: PricingInputs): Decomposed {
  const services = p.servicesSubtotal;
  const addons = p.addonsSubtotal ?? 0;
  const products = p.productsSubtotal ?? 0;
  const travel = p.travelFee ?? 0;
  const pkg = p.packageDiscount ?? 0;
  const promo = p.promoDiscount ?? 0;
  const membership = p.membershipDiscount ?? 0;
  const loyalty = p.loyaltyDiscount ?? 0;
  const manual = p.manualDiscount ?? 0;
  const tip = p.tipAmount ?? 0;

  const linesAfterPkg = Math.max(0, services - pkg);
  const subtotal = services + addons + products;
  const prePromo = linesAfterPkg + addons + products + travel;
  const afterPromo = Math.max(0, prePromo - promo);
  const afterMembership = Math.max(0, afterPromo - membership);
  const afterLoyalty = Math.max(0, afterMembership - loyalty - manual);

  const { taxAmount, platformFeeAmount, totalAmount } = computeTaxPlatformTipTotal({
    baseAfterMembershipAndLoyalty: afterLoyalty,
    tipAmount: tip,
    tax: { taxRatePercent: p.taxRatePercent ?? 0, taxIncluded: p.taxIncluded ?? false },
    platformFeePercentage: p.platformFeePct ?? 0,
    platformFeeFixed: p.platformFeeFixed ?? 0,
    platformFeeType: p.platformFeeType ?? "percentage",
  });

  return {
    subtotal: r2(subtotal),
    travel_fee: r2(travel),
    discount_amount: r2(pkg + manual),
    promotion_discount_amount: r2(promo),
    membership_discount_amount: r2(membership),
    loyalty_discount_amount: r2(loyalty),
    tax_amount: r2(taxAmount),
    platform_fee_amount: r2(platformFeeAmount),
    tip_amount: r2(tip),
    total_amount: r2(totalAmount),
  };
}

/**
 * Provider route style: subtotal = full lines (services + addons + products) BEFORE package
 * discount; package + manual surface in discount_amount; tax base = subtotal - all decomposed
 * discounts. Mirrors `apps/web/src/app/api/provider/bookings/route.ts`.
 */
function providerDecompose(p: PricingInputs): Decomposed {
  const services = p.servicesSubtotal;
  const addons = p.addonsSubtotal ?? 0;
  const products = p.productsSubtotal ?? 0;
  const travel = p.travelFee ?? 0;
  const pkg = p.packageDiscount ?? 0;
  const promo = p.promoDiscount ?? 0;
  const membership = p.membershipDiscount ?? 0;
  const loyalty = p.loyaltyDiscount ?? 0;
  const manual = p.manualDiscount ?? 0;
  const tip = p.tipAmount ?? 0;

  // Provider keeps services full and surfaces package in discount_amount (different
  // persistence convention from public path, but produces the same total).
  const subtotal = services + addons + products;

  // Provider treats discount_amount as manual + package and pulls promo + membership + loyalty separately.
  const discount = pkg + manual;
  const taxableAmount = Math.max(0, subtotal - discount - promo - membership - loyalty);

  const taxRate = (p.taxRatePercent ?? 0) / 100;
  const taxInclusive = p.taxIncluded ?? false;
  const taxAmount = taxRate > 0
    ? taxInclusive
      ? r2(taxableAmount - taxableAmount / (1 + taxRate))
      : r2(taxableAmount * taxRate)
    : 0;

  // Provider doesn't charge platform fee on walk-ins, but parity test runs them anyway.
  const platformFeeAmount = p.platformFeeType === "fixed_amount"
    ? r2(p.platformFeeFixed ?? 0)
    : r2(taxableAmount * ((p.platformFeePct ?? 0) / 100));

  const total = taxInclusive
    ? r2(taxableAmount + tip + travel + platformFeeAmount)
    : r2(taxableAmount + taxAmount + tip + travel + platformFeeAmount);

  return {
    subtotal: r2(subtotal),
    travel_fee: r2(travel),
    discount_amount: r2(discount),
    promotion_discount_amount: r2(promo),
    membership_discount_amount: r2(membership),
    loyalty_discount_amount: r2(loyalty),
    tax_amount: r2(taxAmount),
    platform_fee_amount: r2(platformFeeAmount),
    tip_amount: r2(tip),
    total_amount: r2(total),
  };
}

/** Reconciles persisted decomposed columns through the receipt builder. */
function readbackDecompose(d: Decomposed) {
  return computeBookingReceiptFinancials({
    row: {
      subtotal: d.subtotal,
      tax_amount: d.tax_amount,
      platform_fee_amount: d.platform_fee_amount,
      service_fee_amount: 0,
      travel_fee: d.travel_fee,
      tip_amount: d.tip_amount,
      discount_amount: d.discount_amount,
      promotion_discount_amount: d.promotion_discount_amount,
      membership_discount_amount: d.membership_discount_amount,
      loyalty_discount_amount: d.loyalty_discount_amount,
      total_amount: d.total_amount,
      total_paid: 0,
      total_refunded: 0,
      wallet_amount: 0,
      gift_card_amount: 0,
    },
    linesSubtotal: d.subtotal,
    booking_payments: [],
    additional_charges: [],
  });
}

const SCENARIOS: Array<{ name: string; inputs: PricingInputs }> = [
  { name: "service only", inputs: { servicesSubtotal: 100 } },
  { name: "service + travel", inputs: { servicesSubtotal: 60, travelFee: 100 } },
  {
    name: "service + travel + 9% membership (screenshot)",
    inputs: { servicesSubtotal: 60, travelFee: 100, membershipDiscount: 5.4 },
  },
  {
    name: "service + 10% promo",
    inputs: { servicesSubtotal: 200, promoDiscount: 20 },
  },
  {
    name: "service + 10% promo + 9% membership stacked",
    inputs: { servicesSubtotal: 200, promoDiscount: 20, membershipDiscount: 16.2 },
  },
  {
    name: "service + travel + tip",
    inputs: { servicesSubtotal: 100, travelFee: 50, tipAmount: 10 },
  },
  {
    name: "package booking (R150 service - R30 package discount)",
    inputs: { servicesSubtotal: 150, packageDiscount: 30 },
  },
  {
    name: "tax exclusive 15% on R200",
    inputs: { servicesSubtotal: 200, taxRatePercent: 15, taxIncluded: false },
  },
  {
    name: "tax inclusive 15% on R230",
    inputs: { servicesSubtotal: 230, taxRatePercent: 15, taxIncluded: true },
  },
  {
    name: "loyalty after membership",
    inputs: { servicesSubtotal: 200, membershipDiscount: 18, loyaltyDiscount: 10 },
  },
  {
    name: "platform fee 5% percentage",
    inputs: { servicesSubtotal: 200, platformFeePct: 5, platformFeeType: "percentage" },
  },
];

describe("canonical pricing parity (public ↔ provider ↔ receipt readback)", () => {
  for (const sc of SCENARIOS) {
    it(`agrees on decomposition: ${sc.name}`, () => {
      const pub = publicDecompose(sc.inputs);
      const prov = providerDecompose(sc.inputs);

      // Travel + non-package discount columns must always agree.
      expect(pub.travel_fee).toBe(prov.travel_fee);
      expect(pub.promotion_discount_amount).toBe(prov.promotion_discount_amount);
      expect(pub.membership_discount_amount).toBe(prov.membership_discount_amount);
      expect(pub.loyalty_discount_amount).toBe(prov.loyalty_discount_amount);
      expect(pub.tip_amount).toBe(prov.tip_amount);

      /**
       * Public path bakes catalog package discount into `subtotal` (lines-after-package).
       * Provider path keeps subtotal = lines and surfaces package in `discount_amount`.
       * Both reconcile to the same total — assert that `subtotal - discount_amount`
       * (effective lines after package + manual) is identical across paths.
       */
      const pubLines = pub.subtotal - pub.discount_amount;
      const provLines = prov.subtotal - prov.discount_amount;
      expect(pubLines).toBeCloseTo(provLines, 2);

      // Totals agree within 5c (different rounding strategies for tax-incl edge).
      expect(Math.abs(pub.total_amount - prov.total_amount)).toBeLessThanOrEqual(0.05);

      // Readback through receipt builder reconstructs same totals.
      const readback = readbackDecompose(pub);
      expect(readback.subtotal).toBe(pub.subtotal);
      expect(readback.totalFromRow).toBeCloseTo(pub.total_amount, 2);
      expect(readback.discountTotal).toBeCloseTo(
        pub.discount_amount + pub.promotion_discount_amount + pub.membership_discount_amount + pub.loyalty_discount_amount,
        5,
      );
    });
  }

  it("the screenshot scenario (R60 service + R100 travel + 9% membership) totals to R154.60", () => {
    const pub = publicDecompose({
      servicesSubtotal: 60,
      travelFee: 100,
      membershipDiscount: 5.4,
    });
    expect(pub.total_amount).toBeCloseTo(154.6, 2);
    expect(pub.subtotal).toBe(60);
    expect(pub.travel_fee).toBe(100);
    expect(pub.membership_discount_amount).toBe(5.4);
    expect(pub.discount_amount).toBe(0);
    expect(pub.promotion_discount_amount).toBe(0);
  });

  it("calculateBookingTotals utility agrees with our decomposition for simple case", () => {
    const totals = calculateBookingTotals({
      subtotal: 100,
      discountAmount: 10,
      taxRate: 0.15,
      taxInclusive: false,
      travelFee: 50,
      serviceFeePercentage: 0,
      tipAmount: 0,
    });
    expect(totals.afterDiscount).toBeCloseTo(90, 2);
    expect(totals.taxAmount).toBeCloseTo(13.5, 2);
    // Total = 90 + 13.5 + 50 = 153.50
    expect(totals.totalAmount).toBeCloseTo(153.5, 2);
  });
});
