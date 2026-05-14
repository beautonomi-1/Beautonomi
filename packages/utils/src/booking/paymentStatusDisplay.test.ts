import { describe, expect, it } from "vitest";
import {
  getBookingLifecycleDisplay,
  getBookingPaymentDisplay,
  resolveEffectiveBookingLifecycleStatus,
} from "./paymentStatusDisplay";

describe("resolveEffectiveBookingLifecycleStatus", () => {
  it("treats pending_payment + paid as pending (awaiting provider confirmation)", () => {
    expect(
      resolveEffectiveBookingLifecycleStatus({
        status: "pending_payment",
        paymentStatus: "paid",
      }),
    ).toBe("pending");
  });

  it("treats pending_payment + partially_paid as pending", () => {
    expect(
      resolveEffectiveBookingLifecycleStatus({
        status: "pending_payment",
        paymentStatus: "partially_paid",
      }),
    ).toBe("pending");
  });

  it("treats pending_payment with outstanding_balance=0 as pending even when payment_status is stale", () => {
    expect(
      resolveEffectiveBookingLifecycleStatus({
        status: "pending_payment",
        paymentStatus: "pending",
        outstandingBalance: 0,
      }),
    ).toBe("pending");
  });

  it("keeps pending_payment when payment is not settled", () => {
    expect(
      resolveEffectiveBookingLifecycleStatus({
        status: "pending_payment",
        paymentStatus: "pending",
        outstandingBalance: 100,
      }),
    ).toBe("pending_payment");
  });

  it("does not modify other statuses", () => {
    expect(resolveEffectiveBookingLifecycleStatus({ status: "confirmed" })).toBe("confirmed");
    expect(resolveEffectiveBookingLifecycleStatus({ status: "cancelled" })).toBe("cancelled");
    expect(resolveEffectiveBookingLifecycleStatus({ status: "in_progress" })).toBe("in_progress");
  });
});

describe("getBookingLifecycleDisplay with payment context", () => {
  it("shows 'Awaiting provider confirmation' for stuck pending_payment + paid (data-drift safety)", () => {
    const lifecycle = getBookingLifecycleDisplay({
      status: "pending_payment",
      paymentStatus: "paid",
      providerName: "Bantu",
    });
    expect(lifecycle.label).toBe("Awaiting provider confirmation");
    expect(lifecycle.isAwaitingProviderConfirmation).toBe(true);
    expect(lifecycle.isPaymentInProgress).toBe(false);
  });

  it("preserves 'Payment pending' for genuine pending_payment with no payment context", () => {
    const lifecycle = getBookingLifecycleDisplay({ status: "pending_payment" });
    expect(lifecycle.label).toBe("Payment pending");
    expect(lifecycle.isPaymentInProgress).toBe(true);
  });
});

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
