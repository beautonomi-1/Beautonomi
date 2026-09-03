/**
 * Idempotent membership payment ledger helper.
 *
 * Every membership money event (initial purchase, auto-renewal cron, renewal
 * webhook back-stop) posts exactly one:
 *   - payment_transactions  (kind: membership_order | membership_renewal)
 *   - finance_transactions  membership_sale   (gross)
 *   - finance_transactions  provider_earnings (net = gross - fees)
 *
 * Idempotency key: payment_transactions.reference (Paystack reference).
 * 23505 (unique-violation) guard on finance_transactions inserts prevents
 * concurrent webhook + cron from double-posting.
 *
 * Commission is intentionally 0 — provider keeps gross minus Paystack fees.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";

export type RecordMembershipPaymentParams = {
  supabase: SupabaseClient;
  /** Paystack reference — idempotency key. */
  reference: string;
  orderId: string;
  userId: string;
  providerId: string;
  planId: string;
  /** Gross amount in major currency units (already converted from kobo/cents). */
  grossAmount: number;
  /** Paystack fee in major currency units. */
  feeAmount: number;
  /** "membership_order" for initial purchase, "membership_renewal" for cron charges. */
  kind: "membership_order" | "membership_renewal";
  tenantIdHint?: string | null;
  /** Payment rail. Defaults to Paystack (webhook / saved-card). Wallet purchases use "wallet". */
  paymentProvider?: "paystack" | "wallet";
};

export type RecordMembershipPaymentResult = {
  recorded: boolean;
  alreadyRecorded: boolean;
  netAmount: number;
  reference: string;
};

export async function recordMembershipPayment(
  params: RecordMembershipPaymentParams,
): Promise<RecordMembershipPaymentResult> {
  const {
    supabase,
    reference,
    orderId,
    userId,
    providerId,
    planId,
    grossAmount,
    feeAmount,
    kind,
    tenantIdHint = null,
    paymentProvider = "paystack",
  } = params;

  const netAmount = Math.max(0, grossAmount - feeAmount);

  if (!reference || !providerId) {
    console.error("[recordMembershipPayment] missing reference or providerId", { reference, providerId });
    return { recorded: false, alreadyRecorded: false, netAmount, reference };
  }

  // Idempotency: one recognized payment per Paystack reference.
  // A prior failed row must not block a later successful recognition.
  const { data: existingTx } = await supabase
    .from("payment_transactions")
    .select("id, status")
    .eq("provider", paymentProvider)
    .eq("reference", reference)
    .maybeSingle();

  if (existingTx) {
    const existingStatus = String(
      (existingTx as { status?: string }).status ?? "",
    ).toLowerCase();
    if (existingStatus === "success") {
      return { recorded: false, alreadyRecorded: true, netAmount, reference };
    }
    if (existingStatus === "failed") {
      await supabase
        .from("payment_transactions")
        .delete()
        .eq("id", (existingTx as { id: string }).id);
    } else {
      return { recorded: false, alreadyRecorded: true, netAmount, reference };
    }
  }

  const financeTenantId = await resolveTenantIdForFinanceLedger(supabase, {
    tenant_id: tenantIdHint,
    provider_id: providerId,
  });

  const nowIso = new Date().toISOString();

  // payment_transactions row
  const { error: ptErr } = await supabase.from("payment_transactions").insert({
    booking_id: null,
    reference,
    amount: grossAmount,
    fees: feeAmount,
    net_amount: netAmount,
    status: "success",
    provider: paymentProvider,
    transaction_type: "charge",
    metadata: {
      kind,
      membership_order_id: orderId,
      user_id: userId,
      plan_id: planId,
      provider_id: providerId,
    },
    created_at: nowIso,
  });

  if (ptErr) {
    // 23505 = unique_violation; the record was inserted by a concurrent call.
    if ((ptErr as { code?: string }).code === "23505") {
      return { recorded: false, alreadyRecorded: true, netAmount, reference };
    }
    console.error("[recordMembershipPayment] payment_transactions insert error:", ptErr);
    throw ptErr;
  }

  // finance_transactions: membership_sale (gross recognition)
  const { error: ftSaleErr } = await supabase.from("finance_transactions").insert({
    booking_id: null,
    provider_id: providerId,
    tenant_id: financeTenantId,
    transaction_type: "membership_sale",
    amount: grossAmount,
    fees: feeAmount,
    commission: 0,
    net: 0,
    description: kind === "membership_renewal" ? "Membership renewal (gross)" : "Membership sale (gross)",
    metadata: { kind, reference, membership_order_id: orderId, plan_id: planId, user_id: userId },
    created_at: nowIso,
  });

  if (ftSaleErr && (ftSaleErr as { code?: string }).code !== "23505") {
    console.error("[recordMembershipPayment] finance_transactions membership_sale error:", ftSaleErr);
  }

  // finance_transactions: membership_provider_earnings (net)
  // Uses a dedicated type so the GL trigger can post DR 2600 Membership liability /
  // CR 2000 Provider payable — rather than a wash entry — correctly crediting
  // provider payable from the deferred membership liability.
  if (providerId) {
    const { error: ftEarnErr } = await supabase.from("finance_transactions").insert({
      booking_id: null,
      provider_id: providerId,
      tenant_id: financeTenantId,
      transaction_type: "membership_provider_earnings",
      amount: grossAmount,
      fees: feeAmount,
      commission: 0,
      net: netAmount,
      description: kind === "membership_renewal" ? "Provider earnings from membership renewal" : "Provider earnings from membership sale",
      metadata: { kind, reference, membership_order_id: orderId, plan_id: planId },
      created_at: nowIso,
    });

    if (ftEarnErr && (ftEarnErr as { code?: string }).code !== "23505") {
      console.error("[recordMembershipPayment] finance_transactions provider_earnings error:", ftEarnErr);
    }
  }

  return { recorded: true, alreadyRecorded: false, netAmount, reference };
}
