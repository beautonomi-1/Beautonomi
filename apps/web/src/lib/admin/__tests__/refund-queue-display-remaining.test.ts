import { describe, expect, it } from "vitest";
import { computeDisplayRemaining } from "../refund-queue-reason";

describe("computeDisplayRemaining", () => {
  it("subtracts only pending cash, not other pending refunds, while awaiting confirmation", () => {
    const remaining = computeDisplayRemaining({
      remainingRefundable: 110,
      queueReason: "awaiting_cash_confirmation",
      pendingCashTotal: 60,
      reservedPendingTotal: 90,
    });
    expect(remaining).toBe(50);
  });
});
