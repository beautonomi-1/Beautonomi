import { describe, expect, it } from "vitest";
import { computeDashboardEarningsMix } from "../provider-revenue-semantics";

describe("computeDashboardEarningsMix", () => {
  it("splits service earnings from platform and walk-in additional charges", () => {
    const mix = computeDashboardEarningsMix([
      {
        transaction_type: "provider_earnings",
        net: 100,
        booking_id: "b1",
        description: "Provider earnings for booking BN-1",
      },
      {
        transaction_type: "provider_earnings",
        net: 25,
        booking_id: "b1",
        description: "Provider earnings (additional charge) for booking BN-1",
      },
      {
        transaction_type: "walk_in_additional_charge",
        net: 15,
        booking_id: "b1",
      },
      {
        transaction_type: "provider_earnings",
        net: 40,
        product_order_id: "po1",
      },
    ]);

    expect(mix.serviceEarningsTotal).toBe(100);
    expect(mix.additionalChargeEarningsTotal).toBe(40);
    expect(mix.platformAdditionalChargeEarnings).toBe(25);
    expect(mix.walkInAdditionalChargeEarnings).toBe(15);
    expect(mix.productOrderEarningsTotal).toBe(40);
    expect(mix.bookingEarningsTotal).toBe(125);
  });

  it("customer online booking service earnings stay in Services line only", () => {
    const mix = computeDashboardEarningsMix([
      {
        transaction_type: "provider_earnings",
        net: 280,
        booking_id: "online-b1",
        description: "Provider earnings for booking BN-ONLINE (card)",
      },
      {
        transaction_type: "tip",
        net: 20,
        booking_id: "online-b1",
      },
    ]);

    expect(mix.serviceEarningsTotal).toBe(280);
    expect(mix.additionalChargeEarningsTotal).toBe(0);
  });
});
