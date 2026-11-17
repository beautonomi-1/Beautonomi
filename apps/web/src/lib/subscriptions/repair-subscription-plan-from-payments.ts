import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCatalogPlanIdForProviderSubscription } from "@/lib/subscriptions/ensure-provider-free-subscription";
import { isAppleBillingActive } from "@/lib/iap/apple/billing-active";

function paymentTermStillActive(meta: Record<string, unknown> | null | undefined): boolean {
  if (typeof meta?.reversed_at === "string" && meta.reversed_at.trim()) return false;
  if (typeof meta?.access_relinquished_at === "string" && meta.access_relinquished_at.trim()) {
    return false;
  }
  const termEnd = meta?.term_end;
  if (typeof termEnd === "string" && termEnd.trim()) {
    const end = new Date(termEnd);
    if (!Number.isNaN(end.getTime()) && end >= new Date()) {
      return true;
    }
  }
  const createdAt = meta?.created_at ?? meta?.paid_at;
  if (typeof createdAt === "string" && createdAt.trim()) {
    const paidAt = new Date(createdAt);
    if (!Number.isNaN(paidAt.getTime())) {
      const fortyFiveDaysMs = 45 * 24 * 60 * 60 * 1000;
      if (Date.now() - paidAt.getTime() <= fortyFiveDaysMs) {
        return true;
      }
    }
  }
  return false;
}

/** Repair State B: providers with paid ledger but free plan_id. */
export async function repairSubscriptionPlanFromPayments(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<number> {
  const freePlanId = await resolveCatalogPlanIdForProviderSubscription(supabase);
  if (!freePlanId) return 0;

  const { data: payments } = await supabase
    .from("finance_transactions")
    .select("id, provider_id, metadata, created_at")
    .eq("tenant_id", tenantId)
    .eq("transaction_type", "provider_subscription_payment");

  const { data: refunds } = await supabase
    .from("finance_transactions")
    .select("metadata")
    .eq("tenant_id", tenantId)
    .eq("transaction_type", "provider_subscription_refund");

  const refundedPaymentIds = new Set<string>();
  const refundedReferences = new Set<string>();
  for (const refund of refunds ?? []) {
    const meta = (refund as { metadata?: Record<string, unknown> }).metadata;
    const sourceId = meta?.source_payment_id;
    if (typeof sourceId === "string" && sourceId.trim()) refundedPaymentIds.add(sourceId);
    const reference = meta?.reference;
    if (typeof reference === "string" && reference.trim()) refundedReferences.add(reference);
  }

  let repaired = 0;
  const now = new Date();
  for (const p of payments ?? []) {
    const providerId = String((p as { provider_id?: string }).provider_id ?? "");
    const meta = (p as { metadata?: Record<string, unknown> }).metadata;
    const paymentId = String((p as { id?: string }).id ?? "");
    const reference = typeof meta?.reference === "string" ? meta.reference : "";
    if (
      (paymentId && refundedPaymentIds.has(paymentId)) ||
      (reference && refundedReferences.has(reference))
    ) {
      continue;
    }
    const paidPlanId =
      meta && typeof meta.plan_id === "string" ? meta.plan_id : null;
    if (!providerId || !paidPlanId || paidPlanId === freePlanId) continue;

    const enrichedMeta = {
      ...(meta ?? {}),
      created_at:
        (meta?.created_at as string | undefined) ??
        (p as { created_at?: string }).created_at ??
        undefined,
    };
    if (!paymentTermStillActive(enrichedMeta)) continue;

    const { data: sub } = await supabase
      .from("provider_subscriptions")
      .select("id, plan_id, billing_provider, status, expires_at, paystack_sync_pending")
      .eq("provider_id", providerId)
      .maybeSingle();

    if (!sub || String((sub as { plan_id?: string }).plan_id) !== freePlanId) continue;

    const subRow = sub as {
      billing_provider?: string | null;
      status?: string | null;
      expires_at?: string | null;
      paystack_sync_pending?: boolean | null;
    };
    if (isAppleBillingActive(subRow.billing_provider, subRow.status)) continue;
    if (subRow.billing_provider === "apple") continue;
    if (subRow.status === "expired" || subRow.status === "cancelled") continue;
    if (subRow.paystack_sync_pending) continue;
    if (subRow.expires_at) {
      const exp = new Date(subRow.expires_at);
      if (!Number.isNaN(exp.getTime()) && exp < now) continue;
    }

    await supabase
      .from("provider_subscriptions")
      .update({
        plan_id: paidPlanId,
        status: "active",
        past_due_since: null,
        billing_provider: "paystack",
        paystack_sync_pending: false,
        paystack_sync_note: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", (sub as { id: string }).id);
    repaired += 1;
  }
  return repaired;
}
