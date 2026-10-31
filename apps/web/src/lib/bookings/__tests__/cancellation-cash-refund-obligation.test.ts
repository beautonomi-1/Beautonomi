import { describe, expect, it } from "vitest";
import {
  computeNonTerminalCashObligationAmount,
  sumNonTerminalInPersonCollected,
  bookingHasDisputedCashRefund,
  CASH_CLOSED_BY_STORE_CREDIT_NOTE,
} from "@/lib/bookings/cancellation-cash-refund-obligation";

describe("cancellation cash obligation", () => {
  it("sums non-terminal in-person excluding PayCloud and Yoco", () => {
    const collected = sumNonTerminalInPersonCollected([
      { payment_method: "cash", payment_provider: "cash", amount: 60, status: "completed" },
      { payment_method: "card", payment_provider: "yoco", amount: 40, status: "completed" },
      { payment_method: "card", payment_provider: "paystack", amount: 50, status: "completed" },
    ]);
    expect(collected).toBe(60);
  });

  it("computes obligation minus pending and completed cash refunds", () => {
    const due = computeNonTerminalCashObligationAmount(
      [{ payment_method: "cash", payment_provider: "cash", amount: 60, status: "completed" }],
      [{ refund_method: "cash", status: "pending", amount: 20 }],
    );
    expect(due).toBe(40);
  });

  it("returns zero when customer disputed cash refund", () => {
    expect(
      bookingHasDisputedCashRefund([
        {
          refund_method: "cash",
          status: "failed",
          customer_disputed_at: "2026-01-01T00:00:00Z",
          amount: 60,
        },
      ]),
    ).toBe(true);
    expect(
      computeNonTerminalCashObligationAmount(
        [{ payment_method: "cash", payment_provider: "cash", amount: 60, status: "completed" }],
        [
          {
            refund_method: "cash",
            status: "failed",
            customer_disputed_at: "2026-01-01T00:00:00Z",
            amount: 60,
          },
        ],
      ),
    ).toBe(0);
  });

  it("treats admin-closed substitute cash as reserved (no second obligation)", () => {
    const due = computeNonTerminalCashObligationAmount(
      [{ payment_method: "cash", payment_provider: "cash", amount: 60, status: "completed" }],
      [
        {
          refund_method: "cash",
          status: "failed",
          amount: 60,
          notes: CASH_CLOSED_BY_STORE_CREDIT_NOTE,
        },
      ],
    );
    expect(due).toBe(0);
  });
});
