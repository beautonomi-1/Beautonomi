import { describe, expect, it } from "vitest";
import { recoveredOrderAmountDue } from "../recovered-order-amount-due";

describe("recoveredOrderAmountDue", () => {
  it("charges only what the gift card and wallet did not cover", () => {
    expect(
      recoveredOrderAmountDue({
        paymentStatus: "pending",
        totalAmount: 100,
        walletAmount: 10,
        giftCardAmount: 40,
      }),
    ).toBe(50);
  });

  it("charges nothing when the order is already paid", () => {
    expect(
      recoveredOrderAmountDue({
        paymentStatus: "paid",
        totalAmount: 100,
        walletAmount: 10,
        giftCardAmount: 40,
      }),
    ).toBe(0);
  });
});
