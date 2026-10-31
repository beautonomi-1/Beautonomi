import { describe, expect, it } from "vitest";
import {
  computeWalletRefundableRemaining,
  resolveWalletCreditMaxAmount,
} from "@/lib/admin/refund-queue-rails";

describe("resolveWalletCreditMaxAmount", () => {
  it("caps auto-wallet and admin credit to the platform leg on mixed bookings", () => {
    expect(
      resolveWalletCreditMaxAmount({
        remainingRefundable: 110,
        walletRemainingRefundable: 50,
        isWalletSubstituteAllowed: false,
      }),
    ).toBe(50);
  });

  it("uses full display remaining for store-credit substitute rows", () => {
    expect(
      resolveWalletCreditMaxAmount({
        remainingRefundable: 60,
        walletRemainingRefundable: 0,
        isWalletSubstituteAllowed: true,
      }),
    ).toBe(60);
  });
});

describe("computeWalletRefundableRemaining", () => {
  it("uses capture remaining when gateway exists", () => {
    expect(
      computeWalletRefundableRemaining({
        hasGatewayCapture: true,
        captureRemainingTotal: 45,
        payments: [{ payment_method: "cash", payment_provider: "cash", amount: 60, status: "completed" }],
        bookingRefunds: [],
      }),
    ).toBe(45);
  });

  it("uses platform payments only for booking tender", () => {
    expect(
      computeWalletRefundableRemaining({
        hasGatewayCapture: false,
        captureRemainingTotal: 0,
        payments: [
          { payment_method: "card", payment_provider: "paystack", amount: 50, status: "completed" },
          { payment_method: "cash", payment_provider: "cash", amount: 60, status: "completed" },
        ],
        bookingRefunds: [],
      }),
    ).toBe(50);
  });
});
