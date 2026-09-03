/**
 * Pay an ads budget order from marketing credits (no Paystack redirect).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { creditMarketingBalance, debitMarketingBalance } from "@/lib/marketing/credits";
import { generateTransactionReference } from "@/lib/payments/paystack";
import { recordAdsBudgetOrderPayment } from "@/lib/ads/ads-budget-order-payment";

export type PayAdsWithMarketingCreditResult =
  | { ok: true; reference: string; campaignId: string | null }
  | { ok: false; reason: string };

export async function payAdsBudgetOrderWithMarketingCredit(params: {
  supabase: SupabaseClient;
  orderId: string;
  providerId: string;
}): Promise<PayAdsWithMarketingCreditResult> {
  const { supabase, orderId, providerId } = params;

  const { data: orderData } = await supabase
    .from("ads_budget_orders")
    .select("id, amount, status, campaign_id, provider_id")
    .eq("id", orderId)
    .eq("provider_id", providerId)
    .maybeSingle();

  const order = orderData as {
    amount?: number | string | null;
    status?: string | null;
    campaign_id?: string | null;
  } | null;

  if (!order) return { ok: false, reason: "Order not found" };
  if (String(order.status ?? "") === "paid") {
    return { ok: true, reference: "", campaignId: order.campaign_id ?? null };
  }

  const amountMajor = Number(order.amount ?? 0);
  if (amountMajor <= 0) return { ok: false, reason: "Invalid order amount" };

  const reference = generateTransactionReference("ads_mkt", orderId);
  const debit = await debitMarketingBalance({
    providerId,
    amountZar: amountMajor,
    reason: "campaign_send",
    idempotencyKey: `ads_budget_mkt:${orderId}`,
    campaignId: order.campaign_id ?? undefined,
    metadata: { ads_budget_order_id: orderId },
    supabase,
  });

  if (debit.ok === false) {
    return { ok: false, reason: debit.reason ?? "Insufficient marketing credit" };
  }

  await supabase
    .from("ads_budget_orders")
    .update({
      payment_method: "marketing_credit",
      paystack_reference: reference,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  const result = await recordAdsBudgetOrderPayment({
    supabase,
    orderId,
    reference,
    amountMajor,
    feesMajor: 0,
    providerIdHint: providerId,
    campaignIdHint: order.campaign_id ?? null,
    paymentProvider: "paystack",
  });

  if (!result.finalized && !result.alreadyPaid) {
    await creditMarketingBalance({
      providerId,
      amountZar: amountMajor,
      reason: "refund",
      idempotencyKey: `ads_budget_mkt_rollback:${orderId}`,
      metadata: { ads_budget_order_id: orderId },
      supabase,
    }).catch(() => undefined);
    return { ok: false, reason: "Failed to fund campaign after debit" };
  }

  return { ok: true, reference, campaignId: result.campaignId };
}
