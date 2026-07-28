import { describe, expect, it } from "vitest";
import {
  formatPaycloudCollectLabel,
  inferBookingCollectContext,
} from "../paycloud-collect-cta";

describe("paycloud collect CTA labels", () => {
  it("formats booking with amount", () => {
    expect(
      formatPaycloudCollectLabel({ context: "booking", amount: 420, currency: "ZAR" }),
    ).toContain("Card machine ·");
    expect(
      formatPaycloudCollectLabel({ context: "booking", amount: 420, currency: "ZAR" }),
    ).toContain("420");
  });

  it("formats add-ons only label", () => {
    const label = formatPaycloudCollectLabel({
      context: "booking_addons",
      amount: 80,
      currency: "ZAR",
    });
    expect(label).toContain("add-ons");
  });

  it("formats in-flight resume label", () => {
    expect(
      formatPaycloudCollectLabel({
        context: "booking",
        amount: 100,
        inFlight: true,
      }),
    ).toBe("Payment in progress — tap to resume");
  });

  it("omits money when amount is zero or negative", () => {
    expect(formatPaycloudCollectLabel({ context: "booking", amount: 0 })).toBe("Card machine");
    expect(formatPaycloudCollectLabel({ context: "booking", amount: -5 })).toBe("Card machine");
    expect(formatPaycloudCollectLabel({ context: "booking", amount: NaN })).toBe("Card machine");
  });

  it("keeps deposit form for real amounts", () => {
    const label = formatPaycloudCollectLabel({
      context: "booking",
      amount: 100,
      depositAmount: 100,
      fullOutstanding: 500,
      currency: "ZAR",
    });
    expect(label).toContain("deposit");
  });

  it("infers add-ons-only booking context", () => {
    expect(
      inferBookingCollectContext({
        totalAmount: 500,
        totalPaid: 500,
        unpaidAdditionalCharges: 80,
        outstanding: 80,
      }),
    ).toBe("booking_addons");
  });
});
