import { describe, expect, it } from "vitest";
import { extractStripeExchangeRateForTest } from "../stripe-exchange-rate";

describe("stripe exchange rate extraction", () => {
  it("reads balance_transaction.exchange_rate from latest_charge", () => {
    const rate = extractStripeExchangeRateForTest({
      latest_charge: {
        balance_transaction: { exchange_rate: 18.45 },
      },
    });
    expect(rate).toBe(18.45);
  });

  it("returns null when absent", () => {
    expect(extractStripeExchangeRateForTest({})).toBeNull();
  });
});
