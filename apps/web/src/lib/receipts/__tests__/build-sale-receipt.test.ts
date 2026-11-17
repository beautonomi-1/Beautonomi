import { describe, expect, it } from "vitest";
import { buildSaleReceiptPayload } from "@/lib/receipts/build-sale-receipt";
import { buildWalkInProductOrderSaleReceipt } from "@/lib/provider-sales/build-walk-in-order-sale-receipt";

describe("build-sale-receipt", () => {
  it("keeps a completed sale paid in full with nothing due", () => {
    const receipt = buildSaleReceiptPayload({
      sale: { total_amount: 130, payment_status: "completed" },
    });
    expect(receipt.total_amount).toBe(130);
    expect(receipt.refunded_amount).toBe(0);
    expect(receipt.amount_paid).toBe(130);
    expect(receipt.balance_due).toBe(0);
  });

  it("leaves a pending sale unpaid", () => {
    const receipt = buildSaleReceiptPayload({
      sale: { total_amount: 130, payment_status: "pending" },
    });
    expect(receipt.amount_paid).toBe(0);
    expect(receipt.balance_due).toBe(130);
    expect(receipt.refunded_amount).toBe(0);
  });

  it("treats a refunded till sale as fully returned with nothing due", () => {
    const receipt = buildSaleReceiptPayload({
      sale: { total_amount: 130, payment_status: "refunded" },
    });
    expect(receipt.total_amount).toBe(130);
    expect(receipt.refunded_amount).toBe(130);
    expect(receipt.amount_paid).toBe(0);
    expect(receipt.balance_due).toBe(0);
  });

  it("keeps the remainder of a partly refunded walk-in with nothing due", () => {
    const receipt = buildWalkInProductOrderSaleReceipt({
      order: {
        order_number: "WO-1",
        payment_status: "partially_refunded",
        total_amount: 130,
        refunded_amount: 50,
        subtotal: 130,
      },
      items: [],
    });
    expect(receipt.total_amount).toBe(130);
    expect(receipt.refunded_amount).toBe(50);
    expect(receipt.amount_paid).toBe(80);
    expect(receipt.balance_due).toBe(0);
  });
});
