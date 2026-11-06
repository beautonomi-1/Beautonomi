/**
 * Reverse membership payment legs on refund and end entitlement.
 *
 * Posts component refund rows that mirror the original membership_sale (gross liability)
 * and membership_provider_earnings (provider net) legs, pro-rated by the refund amount and
 * capped so several partial refunds never reverse more than the original legs. The
 * user_membership is cancelled once the order is fully refunded.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";

export type ReverseMembershipPaymentParams = {
  supabase: SupabaseClient;
  membershipOrderId: string;
  providerId: string;
  userId: string;
  refundAmountMajor: number;
  /** Idempotency key for this refund (gateway refund id). A retry with the same key is a no-op. */
  reference?: string | null;
  tenantIdHint?: string | null;
  /** Why the payment was reversed (paystack_refund | admin_refund | ...). Stored in metadata. */
  reason?: string | null;
  /** Admin/staff who triggered the refund (admin path). Stored in metadata. */
  actorUserId?: string | null;
};

export type ReverseMembershipPaymentResult = {
  reversed: boolean;
  alreadyReversed: boolean;
  membershipCancelled: boolean;
  /** True when the original sale is now fully reversed (this and earlier refunds). */
  fullyReversed: boolean;
  /** True when membership_orders.refunded_at / status=refunded was written on this call. */
  orderMarkedRefunded: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function reverseMembershipPayment(
  params: ReverseMembershipPaymentParams,
): Promise<ReverseMembershipPaymentResult> {
  const {
    supabase,
    membershipOrderId,
    providerId,
    userId,
    refundAmountMajor,
    reference = null,
    tenantIdHint = null,
    reason = null,
    actorUserId = null,
  } = params;

  const none: ReverseMembershipPaymentResult = {
    reversed: false,
    alreadyReversed: false,
    membershipCancelled: false,
    fullyReversed: false,
    orderMarkedRefunded: false,
  };
  if (!membershipOrderId || !providerId || refundAmountMajor <= 0) return none;

  const { data: priorRows, error: priorErr } = await supabase
    .from("finance_transactions")
    .select("amount, refund_component, metadata")
    .eq("transaction_type", "refund")
    .eq("provider_id", providerId)
    .in("refund_component", ["membership_provider_earnings", "membership_sale"])
    .contains("metadata", { membership_order_id: membershipOrderId });
  if (priorErr) throw new Error(`Could not load prior membership reversals: ${priorErr.message}`);

  const prior = (priorRows ?? []) as Array<{
    amount?: number | string | null;
    refund_component?: string | null;
    metadata?: { reference?: string | null } | null;
  }>;
  // Without a refund key a retry cannot be told apart from a new refund.
  if (prior.length > 0 && (!reference || prior.some((r) => r.metadata?.reference === reference))) {
    return { ...none, alreadyReversed: true };
  }
  const priorProvider = round2(
    prior
      .filter((r) => r.refund_component === "membership_provider_earnings")
      .reduce((s, r) => s + Math.abs(Number(r.amount ?? 0)), 0),
  );
  const priorSale = round2(
    prior
      .filter((r) => r.refund_component === "membership_sale")
      .reduce((s, r) => s + Math.abs(Number(r.amount ?? 0)), 0),
  );

  const financeTenantId = await resolveTenantIdForFinanceLedger(supabase, {
    tenant_id: tenantIdHint,
    provider_id: providerId,
  });

  const { data: earnRows } = await supabase
    .from("finance_transactions")
    .select("net, amount, fees")
    .eq("transaction_type", "membership_provider_earnings")
    .eq("provider_id", providerId)
    .contains("metadata", { membership_order_id: membershipOrderId })
    .limit(1);

  const earnRow = Array.isArray(earnRows) ? earnRows[0] : null;
  const providerNet = Math.abs(Number(earnRow?.net ?? earnRow?.amount ?? refundAmountMajor));

  const { data: saleRows } = await supabase
    .from("finance_transactions")
    .select("amount, fees")
    .eq("transaction_type", "membership_sale")
    .eq("provider_id", providerId)
    .contains("metadata", { membership_order_id: membershipOrderId })
    .limit(1);

  const saleRow = Array.isArray(saleRows) ? saleRows[0] : null;
  const grossAmount = Math.abs(Number(saleRow?.amount ?? refundAmountMajor));
  const fees = Math.abs(Number(saleRow?.fees ?? earnRow?.fees ?? 0));
  const ratio = grossAmount > 0 ? Math.min(1, refundAmountMajor / grossAmount) : 1;
  const providerReversed = round2(
    Math.max(0, Math.min(providerNet * ratio, providerNet - priorProvider)),
  );
  const saleReversed = round2(Math.max(0, Math.min(grossAmount * ratio, grossAmount - priorSale)));
  if (providerReversed <= 0 && saleReversed <= 0) {
    return { ...none, alreadyReversed: true, fullyReversed: priorSale + 0.01 >= grossAmount };
  }
  const fullyReversed = priorSale + saleReversed + 0.01 >= grossAmount;
  const legRatio = grossAmount > 0 ? saleReversed / grossAmount : ratio;

  const nowIso = new Date().toISOString();
  const descBase = `Membership order refund (${membershipOrderId})`;
  const metadata = {
    membership_order_id: membershipOrderId,
    reference,
    reason,
    actor_user_id: actorUserId,
    refund_ratio: legRatio,
  };

  const { error: insertErr } = await supabase.from("finance_transactions").insert([
    {
      booking_id: null,
      provider_id: providerId,
      tenant_id: financeTenantId,
      transaction_type: "refund",
      refund_component: "membership_provider_earnings",
      amount: providerReversed,
      fees: 0,
      commission: 0,
      net: -providerReversed,
      description: `${descBase} — provider earnings reversed`,
      metadata,
      created_at: nowIso,
    },
    {
      booking_id: null,
      provider_id: providerId,
      tenant_id: financeTenantId,
      transaction_type: "refund",
      refund_component: "membership_sale",
      amount: saleReversed,
      fees: round2(fees * legRatio),
      commission: 0,
      net: -saleReversed,
      description: `${descBase} — membership liability reversed`,
      metadata,
      created_at: nowIso,
    },
  ]);
  if (insertErr) throw new Error(`Membership reversal insert failed: ${insertErr.message}`);

  let membershipCancelled = false;
  if (fullyReversed) {
    const { error: membershipErr } = await supabase
      .from("user_memberships")
      .update({
        status: "cancelled",
        auto_renew: false,
        cancelled_at: nowIso,
        next_billing_at: null,
        updated_at: nowIso,
      })
      .eq("user_id", userId)
      .eq("provider_id", providerId)
      .in("status", ["active", "past_due", "paused"]);
    membershipCancelled = !membershipErr;
  }

  return {
    reversed: true,
    alreadyReversed: false,
    membershipCancelled,
    fullyReversed,
    orderMarkedRefunded: false,
  };
}
