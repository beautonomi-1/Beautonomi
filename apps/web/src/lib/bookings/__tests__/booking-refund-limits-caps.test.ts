import { describe, expect, it } from "vitest";
import { deriveRefundMethodFromCaps, type RefundCaps } from "@/lib/bookings/booking-refund-limits";

describe("deriveRefundMethodFromCaps", () => {
  const base: RefundCaps = {
    maxRefundable: 100,
    onlineCap: 0,
    cashCap: 100,
    terminalCap: 0,
    hasCustomerAccount: true,
    suggestedMethod: "cash",
  };

  it("derives cash when only in-person cap fits", () => {
    expect(deriveRefundMethodFromCaps(50, base)).toBe("cash");
  });

  it("returns null when multiple rails fit", () => {
    const mixed: RefundCaps = {
      ...base,
      onlineCap: 100,
      cashCap: 100,
      suggestedMethod: "store_credit",
    };
    expect(deriveRefundMethodFromCaps(50, mixed)).toBe(null);
  });

  it("derives store_credit when only online cap fits", () => {
    const onlineOnly: RefundCaps = {
      ...base,
      onlineCap: 80,
      cashCap: 0,
      terminalCap: 0,
      suggestedMethod: "store_credit",
    };
    expect(deriveRefundMethodFromCaps(40, onlineOnly)).toBe("store_credit");
  });
});
