import { describe, expect, it } from "vitest";
import { getBookingLifecycleDisplay, getBookingPaymentDisplay } from "./paymentStatusDisplay";

describe("booking payment and lifecycle display", () => {
  it("separates paid payment truth from pending provider confirmation", () => {
    const lifecycle = getBookingLifecycleDisplay({
      status: "pending",
      providerName: "Bantu",
    });
    const payment = getBookingPaymentDisplay({
      paymentStatus: "paid",
      outstandingBalance: 0,
    });

    expect(lifecycle.label).toBe("Awaiting provider confirmation");
    expect(lifecycle.isAwaitingProviderConfirmation).toBe(true);
    expect(payment.label).toBe("Paid in full");
    expect(payment.isPaymentSettled).toBe(true);
  });

  it("does not treat a missing outstanding balance as paid", () => {
    const payment = getBookingPaymentDisplay({
      paymentStatus: "pending",
    });

    expect(payment.label).toBe("Payment pending");
    expect(payment.isPaymentPending).toBe(true);
  });

  it("labels deposit payments separately from full payments", () => {
    const payment = getBookingPaymentDisplay({
      paymentStatus: "partially_paid",
      paymentOption: "deposit",
      outstandingBalance: 100,
    });

    expect(payment.label).toBe("Deposit paid");
    expect(payment.isDepositPaid).toBe(true);
  });
});
