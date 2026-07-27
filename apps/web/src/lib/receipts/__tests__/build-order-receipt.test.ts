import { describe, expect, it } from "vitest";
import {
  computeOrderReceiptFinancials,
  mapOrderReceiptItems,
} from "@/lib/receipts/build-order-receipt";

describe("build-order-receipt", () => {
  it("maps line totals and variant labels", () => {
    const items = mapOrderReceiptItems([
      {
        product_name: "Shampoo",
        quantity: 2,
        unit_price: 50,
        total_price: 100,
        product_variant: { option_values: { Size: "500ml" } },
      },
    ]);
    expect(items[0]?.variant_label).toBe("500ml");
    expect(items[0]?.line_total).toBe(100);
  });

  it("derives balance due for unpaid orders", () => {
    const finances = computeOrderReceiptFinancials({
      order: {
        subtotal: 100,
        tax_amount: 15,
        delivery_fee: 0,
        discount_amount: 0,
        platform_fee: 0,
        wallet_amount: 0,
        total_amount: 115,
        payment_status: "pending",
      },
    });
    expect(finances.totalFromRow).toBe(115);
    expect(finances.amountPaid).toBe(0);
    expect(finances.balanceDue).toBe(115);
  });

  it("treats paid orders as fully settled", () => {
    const finances = computeOrderReceiptFinancials({
      order: {
        subtotal: 200,
        tax_amount: 0,
        delivery_fee: 0,
        discount_amount: 0,
        platform_fee: 0,
        wallet_amount: 0,
        total_amount: 200,
        payment_status: "paid",
      },
    });
    expect(finances.amountPaid).toBe(200);
    expect(finances.balanceDue).toBe(0);
  });

  it("wallet-only pending order shows wallet as paid portion", () => {
    const finances = computeOrderReceiptFinancials({
      order: {
        subtotal: 100,
        tax_amount: 0,
        delivery_fee: 0,
        discount_amount: 0,
        platform_fee: 0,
        wallet_amount: 40,
        total_amount: 100,
        payment_status: "pending",
      },
    });
    expect(finances.amountPaid).toBe(40);
    expect(finances.balanceDue).toBe(60);
  });

  it("refunded order nets to zero paid with no balance due", () => {
    const finances = computeOrderReceiptFinancials({
      order: {
        subtotal: 200,
        tax_amount: 0,
        delivery_fee: 0,
        discount_amount: 0,
        platform_fee: 0,
        wallet_amount: 0,
        total_amount: 200,
        payment_status: "refunded",
        refunded_amount: 200,
      },
    });
    expect(finances.amountPaid).toBe(0);
    expect(finances.balanceDue).toBe(0);
  });

  it("partially refunded order reduces net paid without balance due", () => {
    const finances = computeOrderReceiptFinancials({
      order: {
        subtotal: 200,
        tax_amount: 0,
        delivery_fee: 0,
        discount_amount: 0,
        platform_fee: 0,
        wallet_amount: 0,
        total_amount: 200,
        payment_status: "partially_refunded",
        refunded_amount: 50,
      },
    });
    expect(finances.amountPaid).toBe(150);
    expect(finances.balanceDue).toBe(0);
  });
});
