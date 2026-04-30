import { describe, expect, it } from "vitest";
import { buildReceiptCacheKey } from "./pdf-cache";

const baseInput = {
  bookingId: "booking-1",
  totalAmount: 500,
  totalPaid: 300,
  walletAmount: 0,
  giftCardAmount: 0,
  totalRefunded: 0,
  paymentStatus: "paid",
  balanceDue: 0,
};

describe("buildReceiptCacheKey", () => {
  it("changes when wallet or gift-card credits change", () => {
    const baseKey = buildReceiptCacheKey(baseInput);

    expect(buildReceiptCacheKey({ ...baseInput, walletAmount: 50 })).not.toBe(baseKey);
    expect(buildReceiptCacheKey({ ...baseInput, giftCardAmount: 50 })).not.toBe(baseKey);
  });
});
