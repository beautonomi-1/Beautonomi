import { describe, expect, it } from "vitest";
import { computeWalletBankRefundFee } from "../settings";
import { bankRefundFee, parseRefundAmount, validateBankRefundAmount } from "../client-validation";

describe("bank refund client validation", () => {
  const settings = { min_amount: 50, max_amount_per_request: 1000, fee_type: "fixed" as const, fee_value: 10 };

  it("matches the server fee calculation", () => {
    for (const s of [settings, { fee_type: "percentage" as const, fee_value: 2.5 }, { fee_type: "fixed" as const, fee_value: 500 }]) {
      for (const amount of [1, 49.99, 100, 333.33]) {
        expect(bankRefundFee(amount, s)).toEqual(computeWalletBankRefundFee(amount, s as never));
      }
    }
  });

  it("parses comma decimals", () => {
    expect(parseRefundAmount("120,50")).toBe(120.5);
    expect(Number.isNaN(parseRefundAmount("abc"))).toBe(true);
  });

  it("blocks amounts outside min, max, and eligible", () => {
    expect(validateBankRefundAmount(NaN, settings, 500)).toBe("invalid");
    expect(validateBankRefundAmount(40, settings, 500)).toBe("below_min");
    expect(validateBankRefundAmount(1200, settings, 5000)).toBe("above_max");
    expect(validateBankRefundAmount(600, settings, 500)).toBe("above_eligible");
    expect(validateBankRefundAmount(10, { fee_type: "fixed", fee_value: 10 }, 500)).toBe("fee_exceeds");
    expect(validateBankRefundAmount(200, settings, 500)).toBeNull();
  });
});
