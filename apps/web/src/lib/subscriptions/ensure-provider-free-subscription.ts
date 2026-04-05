import type { SupabaseClient } from "@supabase/supabase-js";

async function resolveTenantIdForSubscription(
  supabaseAdmin: SupabaseClient,
  preferred: string | null | undefined
): Promise<string | null> {
  if (preferred) return preferred;
  const { data, error } = await supabaseAdmin.rpc("tenant_default_za_id");
  if (error || data == null) {
    console.warn("[ensureProviderFreeSubscriptionRow] tenant_default_za_id failed", error);
    return null;
  }
  return String(data);
}

/**
 * Ensures a new provider has a `provider_subscriptions` row on the free catalog plan
 * so booking-limit RPCs and analytics see an explicit subscription.
 * Safe to call when a paid plan will be added later (unique on provider_id → upsert/replace via webhooks).
 */
export async function ensureProviderFreeSubscriptionRow(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  tenantId?: string | null
): Promise<{ ok: boolean; planId?: string; skipped?: "already_subscribed" | "no_free_plan" | "no_tenant" }> {
  const { data: existing } = await supabaseAdmin
    .from("provider_subscriptions")
    .select("id")
    .eq("provider_id", providerId)
    .maybeSingle();

  if (existing) {
    return { ok: true, skipped: "already_subscribed" };
  }

  const planId = await resolveCatalogPlanIdForProviderSubscription(supabaseAdmin);
  if (!planId) {
    console.warn(
      "[ensureProviderFreeSubscriptionRow] No subscription_plans row usable (need active catalog or migration 400)"
    );
    return { ok: false, skipped: "no_free_plan" };
  }

  const resolvedTenantId = await resolveTenantIdForSubscription(supabaseAdmin, tenantId);
  if (!resolvedTenantId) {
    return { ok: false, skipped: "no_tenant" };
  }

  const { error: insertErr } = await supabaseAdmin.from("provider_subscriptions").insert({
    provider_id: providerId,
    plan_id: planId,
    tenant_id: resolvedTenantId,
    status: "active" as const,
    started_at: new Date().toISOString(),
    expires_at: null,
  });

  if (insertErr) {
    console.error("[ensureProviderFreeSubscriptionRow] insert failed", insertErr);
    return { ok: false, skipped: "no_free_plan" };
  }

  return { ok: true, planId };
}

/**
 * Prefer an active free plan; then free-tier-default; then any active catalog plan so limit RPCs
 * always resolve a plan when migrations were skipped or flags are inconsistent.
 */
async function resolveCatalogPlanIdForProviderSubscription(
  supabaseAdmin: SupabaseClient
): Promise<string | null> {
  const { data: freeActive } = await supabaseAdmin
    .from("subscription_plans")
    .select("id")
    .eq("is_free", true)
    .eq("is_active", true)
    .order("display_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (freeActive?.id) return freeActive.id;

  const { data: bySlugActive } = await supabaseAdmin
    .from("subscription_plans")
    .select("id")
    .eq("slug", "free-tier-default")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (bySlugActive?.id) return bySlugActive.id;

  const { data: bySlug } = await supabaseAdmin
    .from("subscription_plans")
    .select("id")
    .eq("slug", "free-tier-default")
    .limit(1)
    .maybeSingle();
  if (bySlug?.id) return bySlug.id;

  const { data: anyActive } = await supabaseAdmin
    .from("subscription_plans")
    .select("id")
    .eq("is_active", true)
    .order("display_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  return anyActive?.id ?? null;
}
