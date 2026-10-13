import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ecommerce/refund-product-order-online-tender", () => ({
  refundProductOrderOnlineTender: vi.fn(),
}));
vi.mock("@/lib/orders/product-order-lifecycle", () => ({
  voidProductOrderGiftCardIfNeeded: vi.fn(),
}));

import { refundProductOrderOnlineTender } from "@/lib/ecommerce/refund-product-order-online-tender";
import { voidProductOrderGiftCardIfNeeded } from "@/lib/orders/product-order-lifecycle";
import { splitProductOrderRefundTender } from "../product-order-refund-tender";

describe("splitProductOrderRefundTender", () => {
  const order = {
    id: "order-1",
    payment_status: "paid",
    payment_method: "paystack",
    payment_reference: "ref-1",
    total_amount: 150,
    wallet_amount: 0,
    gift_card_amount: 0,
  };

  beforeEach(() => {
    vi.mocked(refundProductOrderOnlineTender).mockReset();
    vi.mocked(voidProductOrderGiftCardIfNeeded).mockReset();
  });

  it("full refund: wallet credit is total minus gateway refund", async () => {
    vi.mocked(refundProductOrderOnlineTender).mockResolvedValue({
      attempted: true,
      refundedAmount: 100,
      refundId: "gw-1",
    });
    const result = await splitProductOrderRefundTender({} as never, order, {
      refundAmount: 150,
      reason: "refund",
      idempotencyKey: "k1",
    });
    expect(result.walletCreditAmount).toBe(50);
    expect(result.onlineRefundedAmount).toBe(100);
    expect(result.onlineRefundFailed).toBe(false);
    expect(result.tenderMoved).toBe(true);
  });

  it("full refund: wallet credit is full amount when gateway refund fails (fallback)", async () => {
    vi.mocked(refundProductOrderOnlineTender).mockResolvedValue({
      attempted: true,
      refundedAmount: 0,
      refundId: null,
      error: "gateway down",
    });
    const result = await splitProductOrderRefundTender({} as never, order, {
      refundAmount: 150,
      reason: "refund",
      idempotencyKey: "k2",
    });
    expect(result.walletCreditAmount).toBe(150);
    expect(result.onlineRefundFailed).toBe(true);
    expect(result.tenderMoved).toBe(false);
  });

  it("full refund: gift leg is voided and excluded from wallet credit", async () => {
    vi.mocked(refundProductOrderOnlineTender).mockResolvedValue({
      attempted: true,
      refundedAmount: 90,
      refundId: "gw-2",
    });
    const giftOrder = { ...order, gift_card_amount: 40, wallet_amount: 20 };
    const result = await splitProductOrderRefundTender({} as never, giftOrder, {
      refundAmount: 150,
      reason: "refund",
      idempotencyKey: "k3",
    });
    expect(voidProductOrderGiftCardIfNeeded).toHaveBeenCalledOnce();
    expect(result.giftCardRestored).toBe(40);
    expect(result.walletCreditAmount).toBe(20);
    expect(40 + 90 + result.walletCreditAmount).toBe(150);
  });

  it("partial refund: wallet only, never touches gateway or gift card", async () => {
    const giftOrder = { ...order, gift_card_amount: 40 };
    const result = await splitProductOrderRefundTender({} as never, giftOrder, {
      refundAmount: 50,
      reason: "partial",
      idempotencyKey: "k4",
    });
    expect(refundProductOrderOnlineTender).not.toHaveBeenCalled();
    expect(voidProductOrderGiftCardIfNeeded).not.toHaveBeenCalled();
    expect(result.walletCreditAmount).toBe(50);
    expect(result.onlineRefundedAmount).toBe(0);
    expect(result.tenderMoved).toBe(false);
  });
});
