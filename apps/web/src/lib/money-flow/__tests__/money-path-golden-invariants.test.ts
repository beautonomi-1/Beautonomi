import { describe, expect, it } from "vitest";
import { computeBookingOutstandingDisplay } from "@/lib/bookings/display-invariants";
import {
  computeInPersonCollectibleAmount,
  displayedProductOrderAmountStillDue,
  productOrderTenderSplit,
} from "@/lib/orders/product-order-tender";
import { productOrderAmountStillDue } from "@/lib/payments/resolve-paystack-initialize-amount";
import { computeOrderReceiptFinancials } from "@/lib/receipts/build-order-receipt";
import { classifyRescheduleCarryOver } from "@/lib/bookings/reschedule-carry-over";
import { isPayoutRefundComponent } from "@/lib/ledger/refund-components";

/**
 * Golden invariants: pure helpers that must agree on the same tender math.
 * Run after any change to due/outstanding/coverage/receipt/report splits.
 */
describe("money-path golden invariants", () => {
  it("product order server due matches displayedProductOrderAmountStillDue when amount_still_due is set", () => {
    const order = {
      total_amount: 100,
      wallet_amount: 20,
      gift_card_amount: 10,
      amount_still_due: 40,
    };
    const fromServer = displayedProductOrderAmountStillDue(order);
    const fromFormula = productOrderAmountStillDue({
      total: 100,
      wallet: 20,
      gift: 10,
      priorCardPayments: 30,
    });
    expect(fromServer).toBe(fromFormula);
    expect(fromServer).toBe(40);
  });

  it("product order tender remainder matches in-person collectible when no prior card", () => {
    const order = { total_amount: 150, wallet_amount: 40, gift_card_amount: 10 };
    expect(computeInPersonCollectibleAmount(order)).toBe(productOrderTenderSplit(order).remainder);
    expect(computeInPersonCollectibleAmount(order)).toBe(100);
  });

  it("in-person vs online is distinct: platform-held methods have zero retail takings", async () => {
    const { providerRetailTakingsAmount } = await import("@/lib/reports/provider-retail-takings");
    expect(
      providerRetailTakingsAmount({ total_amount: 100, wallet_amount: 0, gift_card_amount: 0, payment_method: "paystack" } as any),
    ).toBe(0);
    expect(
      providerRetailTakingsAmount({ total_amount: 100, wallet_amount: 0, gift_card_amount: 0, payment_method: "wallet" } as any),
    ).toBe(0);
    expect(
      providerRetailTakingsAmount({ total_amount: 100, wallet_amount: 40, gift_card_amount: 0, payment_method: "yoco" } as any),
    ).toBe(60);
  });

  it("booking outstanding uses coverage without double-subtracting wallet/gift from total_paid", () => {
    const outstanding = computeBookingOutstandingDisplay({
      totalAmount: 200,
      totalPaid: 120,
      totalRefunded: 0,
      walletAmount: 40,
      giftCardAmount: 20,
      pendingWalletGiftAmount: 0,
      unpaidAdditionalCharges: 0,
    });
    expect(outstanding).toBe(80);
  });

  it("unpaid order receipt balance due includes wallet, gift, and card already recorded", () => {
    const finances = computeOrderReceiptFinancials({
      order: {
        total_amount: 100,
        wallet_amount: 20,
        gift_card_amount: 10,
        payment_status: "pending",
      },
      cardPaid: 30,
    });
    expect(finances.amountPaid).toBe(60);
    expect(finances.balanceDue).toBe(40);
  });

  it("reschedule carry-over excludes a still-reserved gift card and blocks in-person money", () => {
    const same = classifyRescheduleCarryOver({ collected: 200, reservedGiftAmount: 0, inPersonAmount: 0 });
    expect(same.ok && same.credit).toBe(200);
    const gift = classifyRescheduleCarryOver({ collected: 200, reservedGiftAmount: 50, inPersonAmount: 0 });
    expect(gift.ok && gift.credit).toBe(150);
    const cash = classifyRescheduleCarryOver({ collected: 80, reservedGiftAmount: 0, inPersonAmount: 80 });
    expect(cash.ok).toBe(false);
  });

  it("membership sale refunds are not a second payout clawback", () => {
    expect(isPayoutRefundComponent("membership_provider_earnings")).toBe(true);
    expect(isPayoutRefundComponent("membership_sale")).toBe(false);
  });
});
