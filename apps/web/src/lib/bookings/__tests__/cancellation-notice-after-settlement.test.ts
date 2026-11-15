import { describe, expect, it } from "vitest";
import {
  cancellationNoticeFromSettlement,
  describeResendCancellationRefund,
  describeSettledCancellationRefund,
  refundWalletIdempotencyKeys,
} from "../cancellation-outcome-bridge";

describe("describeSettledCancellationRefund", () => {
  it("states the wallet amount settlement credited", () => {
    expect(
      describeSettledCancellationRefund({
        walletRefundAmount: 200,
        currency: "ZAR",
        refundPending: false,
      }),
    ).toBe("A refund of ZAR 200.00 was credited to your wallet.");
  });

  it("names a restored gift card and does not put that amount in the wallet sentence", () => {
    expect(
      describeSettledCancellationRefund({
        walletRefundAmount: 200,
        currency: "ZAR",
        refundPending: false,
        giftCardRestored: true,
      }),
    ).toBe(
      "A refund of ZAR 200.00 was credited to your wallet. Your gift card was returned to the card.",
    );
    expect(
      describeSettledCancellationRefund({
        walletRefundAmount: 0,
        currency: "ZAR",
        refundPending: false,
        giftCardRestored: true,
      }),
    ).toBe("Your gift card was returned to the card.");
  });

  it("does not describe a pending refund as already credited", () => {
    const text = describeSettledCancellationRefund({
      walletRefundAmount: 250,
      currency: "ZAR",
      refundPending: true,
      giftValueStillDue: true,
    });
    expect(text).toBe(
      "Your refund is still processing and will be credited once it completes. The gift card return is still processing.",
    );
    expect(text).not.toContain("250.00");
  });

  it("keeps an in-person return on its own sentence", () => {
    expect(
      describeSettledCancellationRefund({
        walletRefundAmount: 50,
        currency: "ZAR",
        refundPending: false,
        inPersonRefundDue: 20,
      }),
    ).toBe(
      "A refund of ZAR 50.00 was credited to your wallet. ZAR 20.00 paid in person will be returned to you by the provider.",
    );
  });

  it("uses the card-machine sentence when a terminal refund is still due", () => {
    expect(
      describeSettledCancellationRefund({
        walletRefundAmount: 40,
        currency: "ZAR",
        refundPending: false,
        terminalRefundDue: 80,
      }),
    ).toBe(
      "Card payments are being refunded to the card you paid with; the rest has been credited to your Beautonomi wallet.",
    );
  });
});

describe("describeResendCancellationRefund", () => {
  it("names the wallet keys that are not stored on the booking id", () => {
    const keys = refundWalletIdempotencyKeys("booking-1", ["refund-1"]);
    expect(keys).toContain("admin_payment_refund:refund-1");
    expect(keys).toContain("admin_refund_gift_spent:refund-1");
    expect(keys).toContain("provider_booking_refund_gift:refund-1");
    expect(keys).toContain("gift_value_still_due:booking-1");
    expect(keys).toContain("provider_charge_refund:refund-1");
  });

  it("does not call a missed wallet credit a gift card when the lookup failed", () => {
    const notice = describeResendCancellationRefund({
      currency: "ZAR",
      feeRetained: 0,
      totalPaid: 300,
      settled: true,
      walletCredited: 0,
      storeCreditRecorded: 300,
      inPersonAmount: 0,
      cardAmount: 0,
      recordsKnown: false,
    });
    expect(notice.walletRefund).toBeUndefined();
    expect(notice.refundInfo).toContain("still processing");
    expect(notice.refundInfo).not.toContain("returned to the card");
    expect(notice.refundInfo).not.toContain("300.00");
  });

  it("keeps a store-credit row that matches the wallet credit off the gift card", () => {
    const notice = describeResendCancellationRefund({
      currency: "ZAR",
      feeRetained: 0,
      totalPaid: 300,
      settled: true,
      walletCredited: 300,
      storeCreditRecorded: 300,
      inPersonAmount: 0,
      cardAmount: 0,
    });
    expect(notice.walletRefund).toBe(300);
    expect(notice.refundInfo).toContain("ZAR 300.00");
    expect(notice.refundInfo).not.toContain("returned to the card");
  });

  it("keeps an unpaid visit with no refund rows on the unpaid sentence when the paid amount is known", () => {
    const notice = describeResendCancellationRefund({
      currency: "ZAR",
      feeRetained: 0,
      totalPaid: 0,
      settled: true,
      walletCredited: 0,
      storeCreditRecorded: 0,
      inPersonAmount: 0,
      cardAmount: 0,
      recordsKnown: false,
    });
    expect(notice.refundInfo).toBe("No amounts were collected on this booking.");
  });

  it("does not call a restored gift card a wallet credit", () => {
    const notice = describeResendCancellationRefund({
      currency: "ZAR",
      feeRetained: 0,
      totalPaid: 300,
      settled: true,
      walletCredited: 250,
      storeCreditRecorded: 300,
      inPersonAmount: 0,
      cardAmount: 0,
    });
    expect(notice.walletRefund).toBe(250);
    expect(notice.refundInfo).toContain("ZAR 250.00");
    expect(notice.refundInfo).toContain("returned to the card");
    expect(notice.refundInfo).not.toContain("300.00");
  });

  it("keeps an in-person return off the wallet amount", () => {
    const notice = describeResendCancellationRefund({
      currency: "ZAR",
      feeRetained: 0,
      totalPaid: 80,
      settled: true,
      walletCredited: 0,
      storeCreditRecorded: 0,
      inPersonAmount: 80,
      cardAmount: 0,
    });
    expect(notice.walletRefund).toBeUndefined();
    expect(notice.refundInfo).toContain("ZAR 80.00 paid in person");
  });

  it("says the refund is still processing when a paid visit has not been settled", () => {
    const notice = describeResendCancellationRefund({
      currency: "ZAR",
      cancellationType: "no_show",
      feeRetained: 0,
      totalPaid: 200,
      settled: false,
      walletCredited: 0,
      storeCreditRecorded: 0,
      inPersonAmount: 0,
      cardAmount: 0,
    });
    expect(notice.walletRefund).toBeUndefined();
    expect(notice.refundInfo).toContain("Marked as no-show.");
    expect(notice.refundInfo).toContain("still processing");
    expect(notice.refundInfo).not.toContain("Beautonomi wallet");
  });
});

describe("cancellationNoticeFromSettlement", () => {
  it("omits the template wallet amount when the credit did not finish", () => {
    const notice = cancellationNoticeFromSettlement({
      currency: "ZAR",
      walletRefundAmount: 250,
      refundSucceeded: false,
    });
    expect(notice.refundPending).toBe(true);
    expect(notice.walletRefund).toBeUndefined();
    expect(notice.refundInfo).not.toContain("250.00");
  });

  it("passes the credited wallet amount through when settlement succeeded", () => {
    const notice = cancellationNoticeFromSettlement({
      currency: "ZAR",
      walletRefundAmount: 200,
      refundSucceeded: true,
      giftCardRestored: true,
    });
    expect(notice.walletRefund).toBe(200);
    expect(notice.refundInfo).toContain("ZAR 200.00");
    expect(notice.refundInfo).toContain("returned to the card");
  });
});
