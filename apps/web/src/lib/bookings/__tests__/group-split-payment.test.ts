import { describe, expect, it } from "vitest";
import {
  computeGroupSplitPaymentAmounts,
  normalizeGroupPaymentMode,
  sumOfferingPrices,
} from "../group-split-payment";

describe("group-split-payment", () => {
  it("normalizes payment mode", () => {
    expect(normalizeGroupPaymentMode("split")).toBe("split");
    expect(normalizeGroupPaymentMode("organizer_pays_all")).toBe("organizer_pays_all");
    expect(normalizeGroupPaymentMode(undefined)).toBe("organizer_pays_all");
  });

  it("sums offering prices", () => {
    const map = new Map([
      ["a", { price: 100 }],
      ["b", { price: 50 }],
    ]);
    expect(sumOfferingPrices(["a", "b"], map)).toBe(150);
  });

  it("allocates guest service totals and organizer remainder", () => {
    const { organizerCheckoutAmount, guestAmounts } = computeGroupSplitPaymentAmounts({
      totalAmount: 500,
      guestServiceTotals: [120, 80],
    });
    expect(guestAmounts).toEqual([120, 80]);
    expect(organizerCheckoutAmount).toBe(300);
  });
});
