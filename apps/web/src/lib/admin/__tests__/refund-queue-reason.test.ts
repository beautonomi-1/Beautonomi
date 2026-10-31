import { describe, expect, it } from "vitest";
import { computeDisplayRemaining, deriveQueueReason } from "../refund-queue-reason";

describe("deriveQueueReason", () => {
  it("prioritises failed wallet credit over open dispute", () => {
    const result = deriveQueueReason({
      bookingStatus: "cancelled",
      paymentStatus: "paid",
      remainingRefundable: 50,
      hasOpenDispute: true,
      bookingRefunds: [
        { id: "1", status: "failed", refund_method: "store_credit", amount: 50, reason: "Auto cancel" },
      ],
    });
    expect(result.queue_reason).toBe("wallet_credit_failed");
    expect(result.needs_action).toBe(true);
  });

  it("explains retained cancellation fee", () => {
    const result = deriveQueueReason({
      bookingStatus: "cancelled",
      paymentStatus: "partially_refunded",
      remainingRefundable: 30,
      retainedFeeTotal: 30,
      hasGatewayCapture: true,
    });
    expect(result.queue_reason).toBe("kept_per_policy");
    expect(result.needs_action).toBe(false);
  });

  it("still needs action when cancelled unrefunded and an open dispute exists", () => {
    const result = deriveQueueReason({
      bookingStatus: "cancelled",
      paymentStatus: "paid",
      remainingRefundable: 120,
      hasOpenDispute: true,
      hasGatewayCapture: true,
    });
    expect(result.queue_reason).toBe("open_dispute");
    expect(result.needs_action).toBe(true);
  });

  it("flags cancelled bookings with unrefunded balance", () => {
    const result = deriveQueueReason({
      bookingStatus: "cancelled",
      paymentStatus: "paid",
      remainingRefundable: 120,
      hasGatewayCapture: true,
    });
    expect(result.queue_reason).toBe("cancelled_unrefunded");
    expect(result.needs_action).toBe(true);
  });

  it("labels disputed cash refunds separately from wallet failures", () => {
    const result = deriveQueueReason({
      bookingStatus: "cancelled",
      paymentStatus: "paid",
      remainingRefundable: 60,
      bookingRefunds: [
        {
          id: "1",
          status: "failed",
          refund_method: "cash",
          amount: 60,
          reason: "x",
          customer_disputed_at: "2026-01-01T00:00:00Z",
        },
      ],
    });
    expect(result.queue_reason).toBe("cash_refund_disputed");
  });

  it("does not label failed cash closed by store credit as wallet_credit_failed", () => {
    const result = deriveQueueReason({
      bookingStatus: "cancelled",
      paymentStatus: "paid",
      remainingRefundable: 0,
      walletRemainingRefundable: 0,
      bookingRefunds: [
        {
          id: "1",
          status: "failed",
          refund_method: "cash",
          amount: 60,
          notes: "Closed — store credit issued by admin instead of in-person cash",
        },
        {
          id: "2",
          status: "completed",
          refund_method: "store_credit",
          amount: 60,
        },
      ],
    });
    expect(result.queue_reason).not.toBe("wallet_credit_failed");
    expect(result.queue_reason).not.toBe("cash_refund_disputed");
    expect(result.needs_action).toBe(false);
  });

  it("does not use cancelled_unrefunded when only in-person cash is owed", () => {
    const result = deriveQueueReason({
      bookingStatus: "cancelled",
      paymentStatus: "paid",
      remainingRefundable: 60,
      walletRemainingRefundable: 0,
      pendingCashTotal: 60,
      hasGatewayCapture: false,
    });
    expect(result.queue_reason).toBe("awaiting_cash_confirmation");
    expect(result.needs_action).toBe(false);
  });

  it("does not action completed paid bookings", () => {
    const result = deriveQueueReason({
      bookingStatus: "completed",
      paymentStatus: "paid",
      remainingRefundable: 50,
      hasGatewayCapture: true,
    });
    expect(result.queue_reason).toBe("no_refund_due");
    expect(result.needs_action).toBe(false);
  });
});
