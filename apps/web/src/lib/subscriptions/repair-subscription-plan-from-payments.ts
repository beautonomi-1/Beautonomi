import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCatalogPlanIdForProviderSubscription } from "@/lib/subscriptions/ensure-provider-free-subscription";

/** Repair State B: providers with paid ledger but free plan_id. */
export async function repairSubscriptionPlanFromPayments(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<number> {
  const freePlanId = await resolveCatalogPlanIdForProviderSubscription(supabase);
  if (!freePlanId) return 0;

  const { data: payments } = await supabase
    .from("finance_transactions")
    .select("provider_id, metadata")
    .eq("tenant_id", tenantId)
    .eq("transaction_type", "provider_subscription_payment");

  let repaired = 0;
  for (const p of payments ?? []) {
    const providerId = String((p as { provider_id?: string }).provider_id ?? "");
    const meta = (p as { metadata?: Record<string, unknown> }).metadata;
    const paidPlanId =
      meta && typeof meta.plan_id === "string" ? meta.plan_id : null;
    if (!providerId || !paidPlanId || paidPlanId === freePlanId) continue;

    const { data: sub } = await supabase
      .from("provider_subscriptions")
      .select("id, plan_id")
      .eq("provider_id", providerId)
      .maybeSingle();

    if (!sub || String((sub as { plan_id?: string }).plan_id) !== freePlanId) continue;

    await supabase
      .from("provider_subscriptions")
      .update({
        plan_id: paidPlanId,
        status: "active",
        paystack_sync_pending: false,
        paystack_sync_note: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", (sub as { id: string }).id);
    repaired += 1;
  }
  return repaired;
}
