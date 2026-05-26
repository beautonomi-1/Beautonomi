import { describe, expect, it } from "vitest";
import {
  buildExplicitTerminalSuggestion,
  classifyTerminalAmountMatch,
} from "../paystack-terminal-allocation";
import { isPaystackTerminalCharge } from "../paystack-terminal-webhook";

describe("Paystack Terminal allocation helpers", () => {
  it("classifies exact, partial, and overpayment amounts against the outstanding balance", () => {
    expect(classifyTerminalAmountMatch({ paidAmount: 250, expectedAmount: 250 })).toMatchObject({
      amountMatchStatus: "exact_match",
      amountDifference: 0,
    });

    expect(classifyTerminalAmountMatch({ paidAmount: 100, expectedAmount: 250 })).toMatchObject({
      amountMatchStatus: "partial_payment",
      amountDifference: -150,
    });

    expect(classifyTerminalAmountMatch({ paidAmount: 300, expectedAmount: 250 })).toMatchObject({
      amountMatchStatus: "overpayment",
      amountDifference: 50,
    });
  });

  it("suggests provider confirmation for exact booking matches", () => {
    const suggestion = buildExplicitTerminalSuggestion({
      entityType: "booking",
      entityId: "booking-1",
      paidAmount: 250,
      expectedAmount: 250,
      currency: "ZAR",
      expectedCurrency: "ZAR",
    });

    expect(suggestion).toMatchObject({
      entityType: "booking",
      entityId: "booking-1",
      amountMatchStatus: "exact_match",
      allocationStatus: "suggested",
    });
  });

  it("detects Paystack Virtual Terminal charges from metadata or terminal objects", () => {
    expect(
      isPaystackTerminalCharge({
        reference: "ref_1",
        amount: 10000,
        currency: "ZAR",
        metadata: { source: "beautonomi_provider_terminal" },
      }),
    ).toBe(true);

    expect(
      isPaystackTerminalCharge({
        reference: "ref_2",
        amount: 10000,
        currency: "ZAR",
        metadata: {},
        virtual_terminal: { code: "VT_123" } as never,
      }),
    ).toBe(true);

    expect(
      isPaystackTerminalCharge({
        reference: "ref_3",
        amount: 10000,
        currency: "ZAR",
        metadata: {
          virtual_terminal: { code: "VT_68SBY77G" },
          referrer: "https://paystack.shop/pay/vt_68sby77g",
        },
        source: {
          type: "offline",
          source: "virtual_terminal",
          identifier: "VT_68SBY77G",
        },
      }),
    ).toBe(true);
  });
});
