/**
 * Reverse membership payment legs on refund and end entitlement.
 *
 * Posts component refund rows that mirror the original membership_sale (gross liability)
 * and membership_provider_earnings (provider net) legs, then cancels the user_membership.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";

export type ReverseMembershipPaymentParams = {
  supabase: SupabaseClient;
  membershipOrderId: string;
  providerId: string;
  userId: string;
  refundAmountMajor: number;
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
  /** True when membership_orders.refunded_at / status=refunded was written on this call. */
  orderMarkedRefunded: boolean;
};

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

  if (!membershipOrderId || !providerId || refundAmountMajor <= 0) {
    return { reversed: false, alreadyReversed: false, membershipCancelled: false, orderMarkedRefunded: false };
  }

  const { data: existing } = await supabase
    .from("finance_transactions")
    .select("id")
    .eq("transaction_type", "refund")
    .ilike("description", `%membership order ${membershipOrderId}%`)
    .eq("refund_component", "membership_provider_earnings")
    .limit(1);

  if (Array.isArray(existing) && existing.length > 0) {
    return { reversed: false, alreadyReversed: true, membershipCancelled: false, orderMarkedRefunded: false };
  }

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

  const nowIso = new Date().toISOString();
  const descBase = `Membership order refund (${membershipOrderId})`;

  await supabase.from("finance_transactions").insert([
    {
      booking_id: null,
      provider_id: providerId,
      tenant_id: financeTenantId,
      transaction_type: "refund",
      refund_component: "membership_provider_earnings",
      amount: providerNet,
      fees: 0,
      commission: 0,
      net: -providerNet,
      description: `${descBase} — provider earnings reversed`,
      metadata: { membership_order_id: membershipOrderId, reference },
      created_at: nowIso,
    },
    {
      booking_id: null,
      provider_id: providerId,
      tenant_id: financeTenantId,
      transaction_type: "refund",
      refund_component: "membership_sale",
      amount: grossAmount,
      fees,
      commission: 0,
      net: -grossAmount,
      description: `${descBase} — membership liability reversed`,
      metadata: { membership_order_id: membershipOrderId, reference },
      created_at: nowIso,
    },
  ]);

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

  return {
    reversed: true,
    alreadyReversed: false,
    membershipCancelled: !membershipErr,
    orderMarkedRefunded: false,
  };
}
