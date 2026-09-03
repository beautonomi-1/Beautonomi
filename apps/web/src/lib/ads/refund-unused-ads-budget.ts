/**
 * Refund unspent CPC/pack ad budget when a campaign ends early.
 * Time-based boosts are non-refundable after start (caller must skip those).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { creditMarketingBalance } from "@/lib/marketing/credits";
import { createRefund } from "@/lib/payments/paystack-complete";
import { convertToSmallestUnit } from "@/lib/payments/paystack";

export type RefundUnusedAdsBudgetResult = {
  refunded: boolean;
  amountMajor: number;
  tender: string | null;
  skippedReason?: string;
};

export async function refundUnusedAdsBudget(params: {
  supabase: SupabaseClient;
  campaignId: string;
  providerId: string;
  reason: string;
}): Promise<RefundUnusedAdsBudgetResult> {
  const { supabase, campaignId, providerId, reason } = params;

  const { data: campaignData } = await supabase
    .from("ads_campaigns")
    .select("id, budget, spent, billing_model, paid_order_id, status")
    .eq("id", campaignId)
    .eq("provider_id", providerId)
    .maybeSingle();

  const campaign = campaignData as {
    budget?: number | string | null;
    spent?: number | string | null;
    billing_model?: string | null;
    paid_order_id?: string | null;
  } | null;

  if (!campaign?.paid_order_id) {
    return { refunded: false, amountMajor: 0, tender: null, skippedReason: "not_funded" };
  }

  const billingModel = String(campaign.billing_model ?? "cpc_budget");
  if (billingModel === "time_based") {
    return { refunded: false, amountMajor: 0, tender: null, skippedReason: "time_based_non_refundable" };
  }

  const budget = Number(campaign.budget ?? 0);
  const spent = Number(campaign.spent ?? 0);
  const unspent = Math.max(0, Math.round((budget - spent) * 100) / 100);
  if (unspent < 0.01) {
    return { refunded: false, amountMajor: 0, tender: null, skippedReason: "nothing_unspent" };
  }

  const orderId = String(campaign.paid_order_id);
  const idempotencyKey = `ads_unused_refund:${campaignId}:${orderId}`;

  const { data: existing } = await supabase
    .from("finance_transactions")
    .select("id")
    .eq("provider_id", providerId)
    .eq("transaction_type", "provider_ads_refund")
    .contains("metadata", { unused_budget_refund: true, campaign_id: campaignId })
    .maybeSingle();

  if (existing) {
    return { refunded: false, amountMajor: unspent, tender: null, skippedReason: "already_refunded" };
  }

  const { data: orderData } = await supabase
    .from("ads_budget_orders")
    .select("id, amount, payment_method, paystack_reference, currency")
    .eq("id", orderId)
    .maybeSingle();

  const order = orderData as {
    payment_method?: string | null;
    paystack_reference?: string | null;
    currency?: string | null;
  } | null;

  const tender = String(order?.payment_method ?? "paystack");
  const financeTenantId = await resolveTenantIdForFinanceLedger(supabase, {
    tenant_id: null,
    provider_id: providerId,
  });
  const nowIso = new Date().toISOString();

  await supabase.from("finance_transactions").insert({
    booking_id: null,
    provider_id: providerId,
    tenant_id: financeTenantId,
    transaction_type: "provider_ads_refund",
    amount: -unspent,
    fees: 0,
    commission: 0,
    net: -unspent,
    description: `Unused ad budget refund (${reason})`,
    metadata: {
      kind: "ads_unused_budget_refund",
      unused_budget_refund: true,
      ads_budget_order_id: orderId,
      campaign_id: campaignId,
      reason,
      payment_method: tender,
      idempotency_key: idempotencyKey,
    },
    created_at: nowIso,
  });

  if (tender === "marketing_credit") {
    await creditMarketingBalance({
      providerId,
      amountZar: unspent,
      reason: "refund",
      idempotencyKey,
      metadata: { campaign_id: campaignId, ads_budget_order_id: orderId },
      supabase,
    });
  } else if (order?.paystack_reference && tender !== "apple") {
    try {
      await createRefund({
        transaction: order.paystack_reference,
        amount: convertToSmallestUnit(unspent),
        currency: order.currency ?? undefined,
        customer_note: "Unused ad campaign budget",
        merchant_note: `Campaign ${campaignId}: ${reason}`,
      });
    } catch (refundErr) {
      console.warn("[ads_unused_refund] Paystack refund failed (ledger posted):", refundErr);
    }
  }

  return { refunded: true, amountMajor: unspent, tender };
}
