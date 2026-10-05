import { describe, expect, it } from "vitest";
import { resolveProductOrderRecordPaymentInput } from "../resolve-product-order-record-payment-input";

describe("resolveProductOrderRecordPaymentInput", () => {
  it("resolves wallet-only orders", () => {
    expect(
      resolveProductOrderRecordPaymentInput({
        id: "o1",
        payment_method: "wallet",
        payment_reference: "wallet_product_order_o1",
        total_amount: 120,
      }),
    ).toEqual({
      provider: "wallet",
      source: "wallet_checkout",
      reference: "wallet_product_order_o1",
      amountMajor: 120,
      feesMajor: 0,
    });
  });

  it("resolves paystack with wallet partial from payment tx", () => {
    expect(
      resolveProductOrderRecordPaymentInput(
        {
          id: "o2",
          payment_method: "paystack",
          payment_reference: "ps-ref",
          total_amount: 100,
          wallet_amount: 30,
        },
        { reference: "ps-ref", amount: 70, fees: 2, provider: "paystack" },
      ),
    ).toEqual({
      provider: "paystack",
      source: "paystack_webhook",
      reference: "ps-ref",
      amountMajor: 70,
      feesMajor: 2,
    });
  });

  it("derives paystack amount from total minus wallet when tx missing", () => {
    expect(
      resolveProductOrderRecordPaymentInput({
        id: "o3",
        payment_method: "paystack",
        total_amount: 100,
        wallet_amount: 25,
      }),
    ).toMatchObject({
      amountMajor: 75,
      feesMajor: 0,
    });
  });
});
