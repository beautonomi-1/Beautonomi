import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyAndSettleOnlinePayment = vi.fn();
const releaseBookingSlotAfterPaymentFailure = vi.fn(async () => true);
const returnBorrowedSessionIfReleased = vi.fn(async () => undefined);
const processSuccessfulPayment = vi.fn(async () => undefined);

vi.mock("@/lib/payments/resolve-online-verify", () => ({
  verifyAndSettleOnlinePayment: (...args: unknown[]) => verifyAndSettleOnlinePayment(...args),
}));

vi.mock("@/app/api/public/bookings/_helpers/release-booking-slot-after-payment-failure", () => ({
  releaseBookingSlotAfterPaymentFailure: (...args: unknown[]) =>
    releaseBookingSlotAfterPaymentFailure(...args),
}));

vi.mock("@/lib/bookings/reschedule-carry-over", () => ({
  returnBorrowedSessionIfReleased: (...args: unknown[]) => returnBorrowedSessionIfReleased(...args),
}));

vi.mock("@/app/api/payments/webhook/_handlers/charge-success", () => ({
  processSuccessfulPayment: (...args: unknown[]) => processSuccessfulPayment(...args),
}));

import {
  releaseOwnOpenCheckouts,
  settleOrReleasePendingCheckout,
} from "../release-own-open-checkouts";

describe("releaseOwnOpenCheckouts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("releases when the gateway says not paid", async () => {
    verifyAndSettleOnlinePayment.mockResolvedValue({
      paid: false,
      provider: "paystack",
      paystackVerifyJson: { data: { status: "abandoned" } },
    });

    const admin = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  in: vi.fn(() => ({
                    gte: vi.fn(() => ({
                      lte: vi.fn(async () => ({
                        data: [
                          {
                            id: "booking-1",
                            customer_id: "cust-1",
                            payment_reference: "ref-1",
                            tenant_id: "tenant-1",
                          },
                        ],
                        error: null,
                      })),
                    })),
                  })),
                })),
              })),
            })),
          })),
        })),
      })),
    };

    const result = await releaseOwnOpenCheckouts(admin as never, {
      customerId: "cust-1",
      providerId: "prov-1",
      windowStart: new Date().toISOString(),
      windowEnd: new Date().toISOString(),
    });

    expect(result.outcomes[0]).toEqual({ bookingId: "booking-1", action: "released" });
    expect(releaseBookingSlotAfterPaymentFailure).toHaveBeenCalled();
    expect(returnBorrowedSessionIfReleased).toHaveBeenCalled();
  });

  it("settles a Paystack success instead of releasing", async () => {
    verifyAndSettleOnlinePayment.mockResolvedValue({
      paid: true,
      provider: "paystack",
      paystackVerifyJson: { data: { status: "success", reference: "ref-1" } },
    });

    const outcome = await settleOrReleasePendingCheckout(
      {} as never,
      {
        id: "booking-1",
        customer_id: "cust-1",
        payment_reference: "ref-1",
        tenant_id: "tenant-1",
      },
      "cust-1",
    );

    expect(outcome).toEqual({ bookingId: "booking-1", action: "settled" });
    expect(processSuccessfulPayment).toHaveBeenCalled();
    expect(releaseBookingSlotAfterPaymentFailure).not.toHaveBeenCalled();
  });

  it("blocks while the gateway is still processing", async () => {
    verifyAndSettleOnlinePayment.mockResolvedValue({
      paid: false,
      provider: "paystack",
      paystackVerifyJson: { data: { status: "ongoing" } },
    });

    const outcome = await settleOrReleasePendingCheckout(
      {} as never,
      {
        id: "booking-1",
        customer_id: "cust-1",
        payment_reference: "ref-1",
        tenant_id: "tenant-1",
      },
      "cust-1",
    );

    expect(outcome).toEqual({ bookingId: "booking-1", action: "in_progress" });
    expect(releaseBookingSlotAfterPaymentFailure).not.toHaveBeenCalled();
  });
});
