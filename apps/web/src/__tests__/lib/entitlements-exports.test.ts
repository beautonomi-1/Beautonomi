import { describe, it, expect } from "vitest";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";

describe("feature-flag-keys", () => {
  it("exports stable payment flag keys", () => {
    expect(FEATURE_FLAG_KEYS.PAYMENT_PAYSTACK).toBe("payment_paystack");
    expect(FEATURE_FLAG_KEYS.PAYMENT_WALLET).toBe("payment_wallet");
    expect(FEATURE_FLAG_KEYS.GIFT_CARDS).toBe("gift_cards");
  });
});
