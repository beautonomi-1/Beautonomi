import { describe, expect, it } from "vitest";
import { deriveQueueReason } from "../refund-queue-reason";

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
