/**
 * Refund (part of) a hosted-checkout charge to the payer's original card, on whichever
 * gateway captured it (Paystack, Stripe or Flutterwave), resolved from the checkout row.
 */

import { convertToSmallestUnit } from "@/lib/payments/paystack";

export type RefundGatewayChargeInput = {
  reference: string;
  amountMajor: number;
  currency: string;
  tenantId?: string | null;
  reason: string;
  idempotencyKey: string;
  /** Used only when no checkout row exists for the reference. */
  fallbackProvider?: "paystack" | "stripe" | "flutterwave";
};

export type RefundGatewayChargeResult = {
  provider: string;
  refundId: string | null;
};

export async function refundGatewayCharge(
  input: RefundGatewayChargeInput,
): Promise<RefundGatewayChargeResult> {
  const reference = input.reference.trim();
  if (!reference) throw new Error("refundGatewayCharge: missing reference");
  const amountSmallest = convertToSmallestUnit(input.amountMajor, input.currency);
  if (!Number.isFinite(amountSmallest) || amountSmallest <= 0) {
    throw new Error("refundGatewayCharge: invalid amount");
  }

  const { getOnlinePaymentCheckoutByReference } = await import(
    "@/lib/payments/online-payment-checkouts"
  );
  const checkout = await getOnlinePaymentCheckoutByReference(reference);
  const provider = checkout?.provider ?? input.fallbackProvider ?? "paystack";
  const tenantId = input.tenantId ?? checkout?.tenant_id ?? null;
  const common = {
    amountInSmallestUnit: amountSmallest,
    currency: input.currency,
    reason: input.reason,
    tenantId,
    idempotencyKey: input.idempotencyKey,
  };

  if (provider === "stripe") {
    const paymentIntentId = checkout?.payment_intent_id;
    if (!paymentIntentId) throw new Error("refundGatewayCharge: Stripe payment intent not found");
    const { stripeProvider } = await import("@/lib/payments/provider/stripe-provider");
    const result = await stripeProvider.refund({ providerPaymentId: paymentIntentId, ...common });
    return { provider: "stripe", refundId: result.refundId || null };
  }

  if (provider === "flutterwave") {
    const transactionId = checkout?.payment_intent_id ?? reference;
    const { flutterwaveProvider } = await import("@/lib/payments/provider/flutterwave-provider");
    const result = await flutterwaveProvider.refund({ providerPaymentId: transactionId, ...common });
    return { provider: "flutterwave", refundId: result.refundId || null };
  }

  const { paystackProvider } = await import("@/lib/payments/provider/paystack-provider");
  const result = await paystackProvider.refund({ providerPaymentId: reference, ...common });
  return { provider: "paystack", refundId: result.refundId || null };
}
