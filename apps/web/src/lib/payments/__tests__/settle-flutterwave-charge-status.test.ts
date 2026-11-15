import { beforeEach, describe, expect, it, vi } from "vitest";

const processFailedPayment = vi.fn();
const markOnlinePaymentCheckoutStatus = vi.fn();

vi.mock("@/app/api/payments/webhook/_handlers/charge-success", () => ({
  processSuccessfulPayment: vi.fn(),
  processFailedPayment: (...args: unknown[]) => processFailedPayment(...args),
}));

vi.mock("@/lib/payments/flutterwave-server", () => ({
  verifyFlutterwaveTransactionById: vi.fn(),
}));

vi.mock("@/lib/payments/online-payment-checkouts", () => ({
  getOnlinePaymentCheckoutByReference: vi.fn(),
  markOnlinePaymentCheckoutStatus: (...args: unknown[]) => markOnlinePaymentCheckoutStatus(...args),
}));

describe("settleFlutterwaveChargeWebhookData status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the wallet only after an explicit failure, and leaves a pending charge open", async () => {
    const { settleFlutterwaveChargeWebhookData } = await import(
      "../settle-flutterwave-online-payment"
    );
    const supabase = {} as never;

    await settleFlutterwaveChargeWebhookData(
      { id: 1, tx_ref: "ref-pending", status: "pending", meta: { booking_id: "booking-1" } },
      supabase,
    );
    await settleFlutterwaveChargeWebhookData(
      { id: 2, tx_ref: "ref-blank", status: "", meta: { booking_id: "booking-1" } },
      supabase,
    );
    expect(processFailedPayment).not.toHaveBeenCalled();

    await settleFlutterwaveChargeWebhookData(
      {
        id: 3,
        tx_ref: "ref-failed",
        status: "failed",
        meta: { booking_id: "booking-1", wallet_amount_applied: 30 },
      },
      supabase,
    );
    expect(processFailedPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: "ref-failed",
        __paymentProvider: "flutterwave",
        metadata: expect.objectContaining({ booking_id: "booking-1", wallet_amount_applied: 30 }),
      }),
      supabase,
    );
    expect(markOnlinePaymentCheckoutStatus).toHaveBeenCalledWith("ref-failed", "failed");
  });
});
