/**
 * Marketing credit topup payment — single idempotent finance recorder.
 *
 * Mirrors `recordAdsBudgetOrderPayment`: posts the platform-finance side of a
 * provider marketing credit purchase (Paystack) so the cash received is
 * attributed in `payment_transactions` + `finance_transactions` and the
 * double-entry shadow ledger (DR Cash 1000 / CR Marketing revenue 3400).
 *
 * The provider-facing prepaid balance is updated separately by
 * `applyMarketingTopupFromPaystackSuccess` (credits.ts). This function only
 * owns the *platform finance attribution*. Both are idempotent on the Paystack
 * reference so duplicate webhooks / verify-after-webhook are no-ops.
 *
 * Revenue is recognised at purchase (credits are a non-refundable prepaid
 * platform service, consistent with ads). Consumption at send time draws down
 * the balance only — no further finance rows. A reversal of the purchase
 * (refund/chargeback) posts `provider_marketing_credit_refund`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";

export type RecordMarketingCreditTopupResult = {
  recorded: boolean;
  alreadyRecorded: boolean;
};

/**
 * Record platform finance for a successful marketing credit topup.
 * Idempotent on the Paystack reference (checked against payment_transactions).
 */
export async function recordMarketingCreditTopupPayment(params: {
  supabase: SupabaseClient;
  providerId: string;
  reference: string;
  /** Gross paid amount in major units (ZAR), already converted from kobo/cents. */
  amountMajor: number;
  /** Paystack fees in major units, already converted. */
  feesMajor?: number;
  currency?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<RecordMarketingCreditTopupResult> {
  const { supabase, providerId, reference } = params;
  const amountMajor = Number(params.amountMajor) || 0;
  const feesMajor = Number(params.feesMajor ?? 0) || 0;

  if (!providerId || !reference || amountMajor <= 0) {
    return { recorded: false, alreadyRecorded: false };
  }

  // Idempotency: a payment_transactions row for this reference + kind means we
  // already recorded the platform finance side.
  const { data: existing } = await supabase
    .from("payment_transactions")
    .select("id")
    .eq("reference", reference)
    .contains("metadata", { kind: "marketing_credit_topup" })
    .maybeSingle();
  if (existing) {
    return { recorded: false, alreadyRecorded: true };
  }

  const nowIso = new Date().toISOString();
  const netAmount = amountMajor - feesMajor;

  const financeTenantId = await resolveTenantIdForFinanceLedger(supabase, {
    tenant_id: typeof params.metadata?.tenant_id === "string" ? (params.metadata.tenant_id as string) : null,
    provider_id: providerId,
  });

  await supabase.from("payment_transactions").insert({
    booking_id: null,
    reference,
    amount: amountMajor,
    fees: feesMajor,
    net_amount: netAmount,
    status: "success",
    provider: "paystack",
    transaction_type: "charge",
    metadata: {
      kind: "marketing_credit_topup",
      provider_id: providerId,
      currency: params.currency ?? null,
    },
    created_at: nowIso,
  });

  await supabase.from("finance_transactions").insert({
    booking_id: null,
    provider_id: providerId,
    tenant_id: financeTenantId,
    transaction_type: "provider_marketing_credit_topup",
    amount: amountMajor,
    fees: feesMajor,
    commission: 0,
    net: netAmount,
    description: "Marketing credit top-up (pre-pay)",
    metadata: {
      kind: "marketing_credit_topup",
      paystack_reference: reference,
    },
    created_at: nowIso,
  });

  return { recorded: true, alreadyRecorded: false };
}

/**
 * Reverse a marketing credit purchase (refund / chargeback). Does TWO things,
 * each independently idempotent:
 *
 *   1. Operational: claws back unspent purchased credits (clamped at zero, so
 *      already-spent credits don't go negative) via the marketing ledger.
 *   2. Finance: posts a negative provider_marketing_credit_refund row; the
 *      shadow trigger debits Marketing revenue and credits Cash.
 *
 * Safe to replay (duplicate refund webhook + dispute for the same charge).
 */
export async function reverseMarketingCreditTopupPayment(params: {
  supabase: SupabaseClient;
  providerId: string;
  reference: string;
  amountMajor: number;
  reason: string;
}): Promise<{ reversed: boolean; alreadyReversed: boolean; clawedZar: number }> {
  const { supabase, providerId, reference, reason } = params;
  const amountMajor = Number(params.amountMajor) || 0;
  if (!providerId || !reference || amountMajor <= 0) {
    return { reversed: false, alreadyReversed: false, clawedZar: 0 };
  }

  // 1) Operational clawback of unspent purchased credits (idempotent, clamped).
  let clawedZar = 0;
  try {
    const { clawbackPurchasedMarketingBalance } = await import("@/lib/marketing/credits");
    const claw = await clawbackPurchasedMarketingBalance({
      providerId,
      amountZar: amountMajor,
      idempotencyKey: `marketing_topup_refund:${reference}`,
      reason: "refund",
      metadata: {
        kind: "marketing_credit_topup_refund",
        paystack_reference: reference,
        refund_reason: reason,
      },
      supabase,
    });
    if (claw.ok) clawedZar = claw.clawed_zar;
  } catch (clawError) {
    console.error("[marketing_topup_refund] balance clawback failed:", clawError);
  }

  // 2) Finance contra (idempotent on provider + reference).
  const { data: existingReversal } = await supabase
    .from("finance_transactions")
    .select("id")
    .eq("provider_id", providerId)
    .eq("transaction_type", "provider_marketing_credit_refund")
    .contains("metadata", { paystack_reference: reference })
    .maybeSingle();
  if (existingReversal) {
    return { reversed: false, alreadyReversed: true, clawedZar };
  }

  const nowIso = new Date().toISOString();
  const financeTenantId = await resolveTenantIdForFinanceLedger(supabase, {
    tenant_id: null,
    provider_id: providerId,
  });

  await supabase.from("finance_transactions").insert({
    booking_id: null,
    provider_id: providerId,
    tenant_id: financeTenantId,
    transaction_type: "provider_marketing_credit_refund",
    amount: -amountMajor,
    fees: 0,
    commission: 0,
    net: -amountMajor,
    description: `Marketing credit top-up reversed (${reason})`,
    metadata: {
      kind: "marketing_credit_topup_refund",
      paystack_reference: reference,
      reason,
    },
    created_at: nowIso,
  });

  return { reversed: true, alreadyReversed: false, clawedZar };
}
