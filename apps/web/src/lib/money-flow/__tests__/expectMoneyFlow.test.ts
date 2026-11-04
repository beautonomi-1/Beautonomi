import { describe, expect, it } from "vitest";
import { expectMoneyFlow } from "../expectMoneyFlow";

describe("expectMoneyFlow", () => {
  it("matches a simple booking charge fixture", () => {
    expect(() =>
      expectMoneyFlow(
        [
          { transaction_type: "payment", amount: 100, net: 15 },
          { transaction_type: "provider_earnings", amount: 85, net: 85 },
          { transaction_type: "tax", amount: 15, net: 0, metadata: { vat_held_for_provider: true } },
        ],
        {
          legs: [
            { type: "payment", amount: 100 },
            { type: "provider_earnings", amount: 85 },
            { type: "tax", amount: 15, metadata: { vat_held_for_provider: true } },
          ],
        },
      ),
    ).not.toThrow();
  });

  it("throws when a leg is missing", () => {
    expect(() =>
      expectMoneyFlow([{ transaction_type: "payment", amount: 1 }], { legs: [{ type: "tax" }] }),
    ).toThrow(/Missing ledger leg/);
  });
});
