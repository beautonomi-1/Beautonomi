/**
 * Providers on the free catalog plan while apple_iap_transactions still show an
 * entitled subscription — re-apply the logged JWS (same as POST /iap/resync).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  providerHasEntitledAppleSubscriptionInLog,
  resyncProviderSubscriptionFromAppleLog,
} from "@/lib/iap/apple/resync-subscription-from-log";

export const DESYNCED_APPLE_FREE_BATCH = 25;

export async function reconcileDesyncedAppleFreeRows(params: {
  supabase: SupabaseClient;
  batchSize?: number;
}): Promise<{ scanned: number; resynced: number; errors: number }> {
  const batchSize = params.batchSize ?? DESYNCED_APPLE_FREE_BATCH;
  const now = new Date();

  const { data: txRows, error: txErr } = await params.supabase
    .from("apple_iap_transactions")
    .select("provider_id, expires_date, grace_period_expires_date, revocation_date")
    .eq("transaction_type", "Auto-Renewable Subscription")
    .not("provider_id", "is", null)
    .is("revocation_date", null)
    .order("expires_date", { ascending: false })
    .limit(200);

  if (txErr) {
    console.error("[reconcile-desynced-apple-free]", txErr);
    return { scanned: 0, resynced: 0, errors: 1 };
  }

  const entitledProviderIds: string[] = [];
  const seen = new Set<string>();
  for (const row of txRows ?? []) {
    const providerId = (row as { provider_id?: string | null }).provider_id?.trim();
    if (!providerId || seen.has(providerId)) continue;
    const endRaw =
      (row as { grace_period_expires_date?: string | null }).grace_period_expires_date ??
      (row as { expires_date?: string | null }).expires_date;
    if (!endRaw || new Date(endRaw) <= now) continue;
    seen.add(providerId);
    entitledProviderIds.push(providerId);
  }

  let scanned = 0;
  let resynced = 0;
  let errors = 0;

  for (const providerId of entitledProviderIds) {
    if (scanned >= batchSize) break;

    const { data: subRow } = await params.supabase
      .from("provider_subscriptions")
      .select("plan:subscription_plans!plan_id(is_free)")
      .eq("provider_id", providerId)
      .maybeSingle();
    const plan = (subRow as { plan?: { is_free?: boolean } | { is_free?: boolean }[] } | null)
      ?.plan;
    const planRow = Array.isArray(plan) ? plan[0] : plan;
    if (planRow?.is_free !== true) continue;

    if (!(await providerHasEntitledAppleSubscriptionInLog(params.supabase, providerId))) {
      continue;
    }

    scanned += 1;
    const result = await resyncProviderSubscriptionFromAppleLog(params.supabase, providerId);
    if (result.ok && result.applied) resynced += 1;
    else if (!result.ok) errors += 1;
  }

  return { scanned, resynced, errors };
}
