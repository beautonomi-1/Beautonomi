import type { RecordProductOrderPaymentInput } from "@/lib/orders/record-product-order-payment";

export type ProductOrderForPaymentResolve = {
  id: string;
  payment_method?: string | null;
  payment_reference?: string | null;
  total_amount?: number | string | null;
  wallet_amount?: number | string | null;
};

export type PaymentTransactionForProductOrder = {
  reference: string;
  amount?: number | string | null;
  fees?: number | string | null;
  provider?: string | null;
};

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Derive recordProductOrderPayment args for reconcile / backfill (matches live checkout conventions). */
export function resolveProductOrderRecordPaymentInput(
  order: ProductOrderForPaymentResolve,
  paymentTx?: PaymentTransactionForProductOrder | null,
): Pick<
  RecordProductOrderPaymentInput,
  "reference" | "amountMajor" | "feesMajor" | "provider" | "source"
> {
  const method = String(order.payment_method ?? "").trim().toLowerCase();
  const total = num(order.total_amount);
  const wallet = num(order.wallet_amount);
  const id = order.id;

  if (method === "wallet") {
    return {
      provider: "wallet",
      source: "wallet_checkout",
      reference: order.payment_reference?.trim() || `wallet_product_order_${id}`,
      amountMajor: total,
      feesMajor: 0,
    };
  }

  if (method === "gift_card") {
    return {
      provider: "gift_card",
      source: "wallet_checkout",
      reference: order.payment_reference?.trim() || `gift_card_product_order_${id}`,
      amountMajor: total,
      feesMajor: 0,
    };
  }

  if (method === "paystack") {
    const ref =
      order.payment_reference?.trim() ||
      paymentTx?.reference?.trim() ||
      `paystack_product_order_${id}`;
    return {
      provider: "paystack",
      source: "paystack_webhook",
      reference: ref,
      amountMajor: paymentTx != null ? num(paymentTx.amount) : Math.max(0, total - wallet),
      feesMajor: paymentTx != null ? num(paymentTx.fees) : 0,
    };
  }

  return {
    provider: "wallet",
    source: "wallet_checkout",
    reference: order.payment_reference?.trim() || `wallet_product_order_${id}`,
    amountMajor: total,
    feesMajor: 0,
  };
}
