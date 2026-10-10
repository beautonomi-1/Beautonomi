import { getStripeClient } from "@/lib/payments/stripe-server";

type StripeChargeLike = {
  id?: string;
  balance_transaction?: { fee?: number } | string | null;
};

type StripePaymentIntentLike = {
  id?: string;
  latest_charge?: StripeChargeLike | string | null;
};

export function feeMinorFromExpandedCharge(
  charge: StripeChargeLike | null | undefined,
): number {
  if (!charge || typeof charge !== "object") return 0;
  const bt = charge.balance_transaction;
  if (bt && typeof bt === "object" && typeof bt.fee === "number") return bt.fee;
  return 0;
}

export async function retrieveStripeFeeMinorForPaymentIntent(
  paymentIntentId: string,
  tenantId?: string | null,
): Promise<number> {
  const stripe = await getStripeClient(tenantId ?? null);
  const pi = (await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge.balance_transaction"],
  })) as StripePaymentIntentLike;
  const charge =
    pi.latest_charge && typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  return feeMinorFromExpandedCharge(charge);
}

export async function retrieveStripeFeeMinorForCharge(
  chargeId: string,
  tenantId?: string | null,
): Promise<number> {
  const stripe = await getStripeClient(tenantId ?? null);
  const charge = (await stripe.charges.retrieve(chargeId, {
    expand: ["balance_transaction"],
  })) as StripeChargeLike;
  return feeMinorFromExpandedCharge(charge);
}
