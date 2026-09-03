/**
 * Ads budget order payment — single idempotent finalize/reverse helper.
 *
 * Every ads-funding side effect flows through exactly two functions so the
 * webhook (`charge.success`), the client verify path, refunds, disputes, and
 * any future entry point all agree:
 *
 *   - recordAdsBudgetOrderPayment(): mark the order paid, fund + activate the
 *     campaign (set funded_at + paid_order_id), and post the revenue ledger.
 *   - reverseAdsBudgetOrderPayment(): stop serving (campaign -> ended), clear
 *     funding, mark the order failed/refunded, and post a full reversal ledger.
 *
 * Both are idempotent: replaying the same Paystack event (duplicate webhook,
 * verify-after-webhook, retried delivery) is a no-op once the terminal state is
 * reached. A campaign serves IFF status='active' AND funded_at IS NOT NULL, so
 * a reversed/never-paid campaign can never be served by the auction.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { campaignNeedsModeration } from "@/lib/ads/campaign-needs-moderation";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

type AdsBudgetOrderRow = {
  id: string;
  amount: number | string | null;
  status: string | null;
  campaign_id: string | null;
  provider_id: string | null;
  currency?: string | null;
  paystack_reference?: string | null;
};

type AdsCampaignRow = {
  id: string;
  billing_model: string | null;
  duration_days: number | string | null;
  budget: number | string | null;
  status: string | null;
  funded_at: string | null;
  paid_order_id: string | null;
};

export type RecordAdsBudgetOrderPaymentResult = {
  finalized: boolean;
  alreadyPaid: boolean;
  campaignId: string | null;
};

export type ReverseAdsBudgetOrderPaymentResult = {
  reversed: boolean;
  alreadyReversed: boolean;
  campaignId: string | null;
  /** True when revenue was actually backed out (the order had been paid). */
  ledgerReversed: boolean;
};

function toNumber(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function notifyProviderSafe(
  providerId: string,
  payload: {
    type: string;
    title: string;
    message: string;
    data?: Record<string, unknown>;
    action_url?: string;
  },
): Promise<void> {
  try {
    const { notifyProviderTeamUsers } = await import("@/lib/notifications/notify-provider-team");
    await notifyProviderTeamUsers(providerId, payload, { push: true });
  } catch (notificationError) {
    console.warn("[ads_budget_order] notification failed:", notificationError);
  }
}

/**
 * Finalize a paid ads budget order: fund + activate its campaign and post the
 * provider_ads_payment revenue row. Idempotent — a second call for an already
 * paid order returns without re-funding or double-posting.
 */
export async function recordAdsBudgetOrderPayment(params: {
  supabase: SupabaseClient;
  orderId: string;
  reference: string;
  /** Gross paid amount in major currency units (e.g. ZAR), already converted. */
  amountMajor: number;
  /** Paystack fees in major currency units, already converted. */
  feesMajor: number;
  providerIdHint?: string | null;
  campaignIdHint?: string | null;
  paymentProvider?: "paystack" | "apple";
}): Promise<RecordAdsBudgetOrderPaymentResult> {
  const { supabase, orderId, reference, amountMajor, feesMajor, paymentProvider = "paystack" } =
    params;
  if (!orderId) {
    console.error("[ads_budget_order] recordAdsBudgetOrderPayment: missing orderId");
    return { finalized: false, alreadyPaid: false, campaignId: null };
  }

  const { data: orderData } = await supabase
    .from("ads_budget_orders")
    .select("id, amount, status, campaign_id, provider_id, currency")
    .eq("id", orderId)
    .single();
  const order = orderData as AdsBudgetOrderRow | null;

  if (!order) {
    console.error("[ads_budget_order] recordAdsBudgetOrderPayment: order not found", { orderId });
    return { finalized: false, alreadyPaid: false, campaignId: null };
  }

  // Idempotent: already finalized.
  if (String(order.status ?? "") === "paid") {
    return { finalized: false, alreadyPaid: true, campaignId: order.campaign_id ?? null };
  }

  const providerId = String(order.provider_id || params.providerIdHint || "").trim();
  const campaignId = String(order.campaign_id || params.campaignIdHint || "").trim();
  if (!providerId || !campaignId) {
    console.error("[ads_budget_order] recordAdsBudgetOrderPayment: missing provider/campaign", {
      orderId,
      providerId,
      campaignId,
    });
    return { finalized: false, alreadyPaid: false, campaignId: campaignId || null };
  }

  // Verify the charged amount matches the agreed order amount (defense in depth;
  // the verify/webhook callers also check, but keep the money invariant here too).
  const expectedMajor = toNumber(order.amount);
  if (Math.abs(amountMajor - expectedMajor) > 0.02) {
    console.error("[ads_budget_order] amount mismatch — not funding", {
      orderId,
      amountMajor,
      expectedMajor,
      reference,
    });
    return { finalized: false, alreadyPaid: false, campaignId };
  }

  const nowIso = new Date().toISOString();
  const netAmount = amountMajor - feesMajor;

  const financeTenantId = await resolveTenantIdForFinanceLedger(supabase, {
    tenant_id: null,
    provider_id: providerId,
  });

  const resolvedCurrency =
    order.currency ||
    (await (async () => {
      if (!financeTenantId) return LAST_RESORT_CURRENCY;
      const { data: tenantRow } = await supabase
        .from("tenants")
        .select("default_currency")
        .eq("id", financeTenantId)
        .maybeSingle();
      return (tenantRow as { default_currency?: string | null } | null)?.default_currency ?? LAST_RESORT_CURRENCY;
    })());

  // 1) Mark the order paid.
  await supabase
    .from("ads_budget_orders")
    .update({
      status: "paid",
      paystack_reference: reference,
      paid_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", orderId);

  // 2) Fund + activate the campaign (sets funded_at — the serve-time guard key).
  const { data: campaignData } = await supabase
    .from("ads_campaigns")
    .select("billing_model, duration_days, targeting, bid_settings")
    .eq("id", campaignId)
    .single();
  const campaignRow = campaignData as Pick<
    AdsCampaignRow,
    "billing_model" | "duration_days"
  > & {
    targeting?: Record<string, unknown> | null;
    bid_settings?: Record<string, unknown> | null;
  } | null;

  const needsReview = campaignNeedsModeration(
    campaignRow?.targeting ?? null,
    campaignRow?.bid_settings ?? null,
  );

  const campaignUpdate: Record<string, unknown> = {
    budget: amountMajor,
    status: needsReview ? "pending_review" : "active",
    funded_at: nowIso,
    paid_order_id: orderId,
    start_at: nowIso,
    updated_at: nowIso,
  };
  if (campaignRow?.billing_model === "time_based") {
    const days = toNumber(campaignRow.duration_days) || 7;
    campaignUpdate.end_at = new Date(Date.now() + days * 86400000).toISOString();
  }

  const termStart = nowIso;
  const termEnd =
    campaignRow?.billing_model === "time_based"
      ? String(campaignUpdate.end_at ?? "")
      : null;

  await supabase
    .from("ads_campaigns")
    .update(campaignUpdate)
    .eq("id", campaignId)
    .eq("provider_id", providerId);

  // 3) Revenue ledger: payment_transactions + finance_transactions.
  await supabase.from("payment_transactions").insert({
    booking_id: null,
    reference,
    amount: amountMajor,
    fees: feesMajor,
    net_amount: netAmount,
    status: "success",
    provider: paymentProvider,
    transaction_type: "charge",
    metadata: {
      kind: "ads_budget_order",
      ads_budget_order_id: orderId,
      provider_id: providerId,
      campaign_id: campaignId,
      payment_provider: paymentProvider,
    },
    created_at: nowIso,
  });

  const billingLabel =
    campaignRow?.billing_model === "time_based"
      ? `Ads time-based boost (${campaignRow?.duration_days ?? "N"} days)`
      : "Ads campaign budget (pre-pay)";

  await supabase.from("finance_transactions").insert({
    booking_id: null,
    provider_id: providerId,
    tenant_id: financeTenantId,
    transaction_type: "provider_ads_payment",
    amount: amountMajor,
    fees: feesMajor,
    commission: 0,
    net: 0,
    currency: resolvedCurrency,
    description: billingLabel,
    metadata: {
      kind: "ads_budget_order",
      ads_budget_order_id: orderId,
      campaign_id: campaignId,
      payment_provider: paymentProvider,
      recognition_basis: campaignRow?.billing_model === "time_based" ? "term" : "consumption",
      term_start: termStart,
      ...(termEnd ? { term_end: termEnd } : {}),
    },
    created_at: nowIso,
  });

  await notifyProviderSafe(providerId, {
    type: needsReview ? "ads_pending_review" : "ads_payment_confirmed",
    title: needsReview ? "Ad payment received — under review" : "Ad payment confirmed",
    message: needsReview
      ? `${billingLabel} payment confirmed. Your campaign is queued for review before it goes live.`
      : `${billingLabel} payment confirmed. Your campaign is funded.`,
    data: { ads_budget_order_id: orderId, campaign_id: campaignId, amount: amountMajor },
    action_url: "/provider/settings/ads",
  });

  return { finalized: true, alreadyPaid: false, campaignId };
}

/**
 * Reverse an ads budget order: stop serving and (if the order had been paid)
 * back out the recognized revenue. Used for charge.failed-after-success,
 * refund.processed, and chargebacks. Idempotent.
 *
 * - finalOrderStatus 'refunded' for refunds/disputes, 'failed' for failed charges.
 * - When the order was never paid (no revenue recognized) we only mark the order
 *   status and leave an unfunded draft as-is so the provider can retry payment.
 */
export async function reverseAdsBudgetOrderPayment(params: {
  supabase: SupabaseClient;
  orderId: string;
  finalOrderStatus: "failed" | "refunded";
  reason: string;
  reference?: string | null;
}): Promise<ReverseAdsBudgetOrderPaymentResult> {
  const { supabase, orderId, finalOrderStatus, reason } = params;
  if (!orderId) {
    console.error("[ads_budget_order] reverseAdsBudgetOrderPayment: missing orderId");
    return { reversed: false, alreadyReversed: false, campaignId: null, ledgerReversed: false };
  }

  const { data: orderData } = await supabase
    .from("ads_budget_orders")
    .select("id, amount, status, campaign_id, provider_id, currency, paystack_reference")
    .eq("id", orderId)
    .single();
  const order = orderData as AdsBudgetOrderRow | null;
  if (!order) {
    console.error("[ads_budget_order] reverseAdsBudgetOrderPayment: order not found", { orderId });
    return { reversed: false, alreadyReversed: false, campaignId: null, ledgerReversed: false };
  }

  const campaignId = order.campaign_id ?? null;
  const providerId = String(order.provider_id || "").trim();
  const nowIso = new Date().toISOString();
  const wasPaid = String(order.status ?? "") === "paid";

  // Idempotent: a non-paid order already in a terminal state with no funded
  // campaign means there is nothing left to reverse.
  let campaign: AdsCampaignRow | null = null;
  if (campaignId) {
    const { data: campaignData } = await supabase
      .from("ads_campaigns")
      .select("id, billing_model, duration_days, budget, status, funded_at, paid_order_id")
      .eq("id", campaignId)
      .maybeSingle();
    campaign = campaignData as AdsCampaignRow | null;
  }

  const orderAlreadyTerminal = ["failed", "refunded"].includes(String(order.status ?? ""));
  const campaignStillFundedByThisOrder = Boolean(
    campaign && campaign.funded_at && campaign.paid_order_id === orderId,
  );
  if (orderAlreadyTerminal && !campaignStillFundedByThisOrder) {
    return {
      reversed: false,
      alreadyReversed: true,
      campaignId,
      ledgerReversed: false,
    };
  }

  // 1) Stop serving: end the campaign and clear funding so the auction guard
  //    (status='active' AND funded_at IS NOT NULL) can no longer pick it up.
  if (campaign && (campaignStillFundedByThisOrder || wasPaid)) {
    await supabase
      .from("ads_campaigns")
      .update({
        status: "ended",
        funded_at: null,
        paid_order_id: null,
        updated_at: nowIso,
      })
      .eq("id", campaign.id);
  }

  // 2) Mark the order terminal.
  if (String(order.status ?? "") !== finalOrderStatus) {
    await supabase
      .from("ads_budget_orders")
      .update({ status: finalOrderStatus, updated_at: nowIso })
      .eq("id", orderId);
  }

  // 3) Ledger reversal — only if revenue had been recognized (order was paid).
  let ledgerReversed = false;
  if (wasPaid && providerId) {
    // Idempotency guard: don't double-post a reversal for the same order.
    const { data: existingReversal } = await supabase
      .from("finance_transactions")
      .select("id")
      .eq("provider_id", providerId)
      .eq("transaction_type", "provider_ads_refund")
      .contains("metadata", { ads_budget_order_id: orderId })
      .maybeSingle();

    if (!existingReversal) {
      const grossMajor = toNumber(order.amount);
      const financeTenantId = await resolveTenantIdForFinanceLedger(supabase, {
        tenant_id: null,
        provider_id: providerId,
      });

      // Negative finance_transactions row nets the operational ledger to zero;
      // the shadow trigger posts the reversing journal (debit ads / credit cash).
      await supabase.from("finance_transactions").insert({
        booking_id: null,
        provider_id: providerId,
        tenant_id: financeTenantId,
        transaction_type: "provider_ads_refund",
        amount: -grossMajor,
        fees: 0,
        commission: 0,
        net: -grossMajor,
        description: `Ads payment reversed (${reason})`,
        metadata: {
          kind: "ads_budget_order_refund",
          ads_budget_order_id: orderId,
          campaign_id: campaignId,
          reason,
        },
        created_at: nowIso,
      });
      ledgerReversed = true;
    }

    await notifyProviderSafe(providerId, {
      type: "ads_payment_reversed",
      title: "Ad campaign stopped",
      message:
        "Your ad payment was reversed, so the campaign has been stopped. You can start a new boost anytime.",
      data: { ads_budget_order_id: orderId, campaign_id: campaignId, reason },
      action_url: "/provider/settings/ads",
    });
  }

  return {
    reversed: true,
    alreadyReversed: false,
    campaignId,
    ledgerReversed,
  };
}
