import { convertToSmallestUnit } from "@/lib/payments/paystack";

export type VerifiedCustomOfferCharge = {
  provider: "paystack" | "stripe" | "flutterwave" | "none";
  amountMinor: number;
  feesMinor: number;
  currency: string;
  /** Checkout metadata written at accept time (wallet/gift/loyalty split). */
  metadata: Record<string, unknown>;
  customerEmail: string | null;
};

/**
 * Re-read a custom-offer payment from the gateway that captured it so admin
 * recovery acts on what the customer actually paid, never on the offer price.
 * `co_split_*` references are wallet/gift-only finalizes with no card leg.
 */
export async function loadVerifiedCustomOfferCharge(
  offerId: string,
  reference: string,
  fallbackCurrency: string,
): Promise<{ ok: true; charge: VerifiedCustomOfferCharge } | { ok: false; reason: string }> {
  const currencyFallback = (fallbackCurrency || "ZAR").toUpperCase();
  if (reference.startsWith("co_split_")) {
    return {
      ok: true,
      charge: {
        provider: "none",
        amountMinor: 0,
        feesMinor: 0,
        currency: currencyFallback,
        metadata: {},
        customerEmail: null,
      },
    };
  }

  const { getOnlinePaymentCheckoutByReference } = await import(
    "@/lib/payments/online-payment-checkouts"
  );
  const checkout = await getOnlinePaymentCheckoutByReference(reference);
  const provider = checkout?.provider ?? "paystack";
  let charge: VerifiedCustomOfferCharge;

  if (provider === "stripe") {
    const intentId = checkout?.payment_intent_id;
    if (!intentId) return { ok: false, reason: "stripe_intent_missing" };
    const { getStripeClient } = await import("@/lib/payments/stripe-server");
    const stripe = await getStripeClient(checkout?.tenant_id ?? null);
    const intent = await stripe.paymentIntents.retrieve(intentId);
    if (intent.status !== "succeeded") return { ok: false, reason: `stripe_${intent.status}` };
    charge = {
      provider: "stripe",
      amountMinor: Number(intent.amount_received ?? 0),
      feesMinor: 0,
      currency: String(intent.currency || currencyFallback).toUpperCase(),
      metadata: { ...(intent.metadata ?? {}), ...(checkout?.metadata ?? {}) },
      customerEmail: intent.receipt_email ?? null,
    };
  } else if (provider === "flutterwave") {
    const transactionId = checkout?.payment_intent_id;
    if (!transactionId) return { ok: false, reason: "flutterwave_transaction_missing" };
    const { verifyFlutterwaveTransactionById } = await import("@/lib/payments/flutterwave-server");
    const verified = await verifyFlutterwaveTransactionById(transactionId, {
      tenantId: checkout?.tenant_id ?? null,
      expectedTxRef: reference,
    });
    if (verified.ok === false) return { ok: false, reason: `flutterwave_${verified.reason}` };
    const currency = verified.tx.currency.toUpperCase();
    charge = {
      provider: "flutterwave",
      amountMinor: convertToSmallestUnit(verified.tx.amount, currency),
      feesMinor: convertToSmallestUnit(Number(verified.tx.app_fee ?? 0), currency),
      currency,
      metadata: { ...(verified.tx.meta ?? {}), ...(checkout?.metadata ?? {}) },
      customerEmail: verified.tx.customer?.email ?? null,
    };
  } else {
    const { verifyTransaction } = await import("@/lib/payments/paystack-complete");
    const verified = await verifyTransaction(reference);
    const tx = verified?.data as
      | {
          status?: string;
          amount?: number;
          fees?: number;
          currency?: string;
          metadata?: unknown;
          customer?: { email?: string };
        }
      | undefined;
    if (!verified?.status || tx?.status !== "success") {
      return { ok: false, reason: `paystack_${tx?.status ?? "unverified"}` };
    }
    const rawMeta =
      tx.metadata && typeof tx.metadata === "object" && !Array.isArray(tx.metadata)
        ? (tx.metadata as Record<string, unknown>)
        : {};
    charge = {
      provider: "paystack",
      amountMinor: Number(tx.amount ?? 0),
      feesMinor: Number(tx.fees ?? 0),
      currency: String(tx.currency || currencyFallback).toUpperCase(),
      metadata: { ...rawMeta, ...(checkout?.metadata ?? {}) },
      customerEmail: tx.customer?.email ?? null,
    };
  }

  const chargedOfferId = String(charge.metadata.custom_offer_id ?? "").trim();
  if (chargedOfferId && chargedOfferId !== offerId) {
    return { ok: false, reason: "offer_mismatch" };
  }
  if (!(charge.amountMinor > 0)) return { ok: false, reason: "zero_amount" };
  return { ok: true, charge };
}
