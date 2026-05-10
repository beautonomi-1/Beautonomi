import { describe, it, expect } from "vitest";
import { computeTaxPlatformTipTotal } from "../booking-pricing";

describe("computeTaxPlatformTipTotal", () => {
  it("adds exclusive tax and percentage platform fee", () => {
    const r = computeTaxPlatformTipTotal({
      baseAfterMembershipAndLoyalty: 100,
      tipAmount: 10,
      tax: { taxRatePercent: 15, taxIncluded: false },
      platformFeePercentage: 5,
      platformFeeFixed: 0,
      platformFeeType: "percentage",
    });
    expect(r.taxAmount).toBeCloseTo(15, 5);
    expect(r.platformFeeAmount).toBeCloseTo(5, 5);
    expect(r.totalAmount).toBeCloseTo(130, 5);
  });

  it("tax-inclusive base excludes extra VAT line in total composition", () => {
    const r = computeTaxPlatformTipTotal({
      baseAfterMembershipAndLoyalty: 115,
      tipAmount: 0,
      tax: { taxRatePercent: 15, taxIncluded: true },
      platformFeePercentage: 0,
      platformFeeFixed: 0,
      platformFeeType: "percentage",
    });
    expect(r.taxAmount).toBeGreaterThan(0);
    expect(r.totalAmount).toBeCloseTo(115, 5);
  });
});
