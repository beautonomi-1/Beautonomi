import { describe, expect, it } from "vitest";
import { expectMoneyFlow } from "../expectMoneyFlow";

/**
 * Golden money-flow legs for booking online charge (see record-booking-online-charge-ledger.ts).
 * Expand with provider-specific commission fixtures as ledger capture matures.
 */
describe("recordBookingOnlineChargeLedger money-flow stubs", () => {
  it("matches platform-held VAT on tax leg", () => {
    expect(() =>
      expectMoneyFlow(
        [
          { transaction_type: "payment", amount: 115, net: 15 },
          { transaction_type: "provider_earnings", amount: 85, net: 85 },
          { transaction_type: "tax", amount: 15, net: 0, metadata: { vat_held_for_provider: true } },
          { transaction_type: "platform_fee", amount: 15, net: 15 },
        ],
        {
          legs: [
            { type: "payment", amount: 115 },
            { type: "provider_earnings", amount: 85 },
            { type: "tax", amount: 15, metadata: { vat_held_for_provider: true } },
            { type: "platform_fee", amount: 15 },
          ],
        },
      ),
    ).not.toThrow();
  });
});
