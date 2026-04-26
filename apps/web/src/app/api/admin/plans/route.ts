import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection, successResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { fetchScopedListMerged, resolveAdminTenantContext } from "@/lib/tenant/scoped-overrides";

/**
 * GET /api/admin/plans
 * Returns subscription plans with their linked pricing plan (if any).
 * Use this for the consolidated Plans admin so superadmin manages both in one place.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const supabase = await getSupabaseServer(request);
    const { currentTenantId } = await resolveAdminTenantContext(request, undefined, user.role ?? null);

    const scopedSubscriptionPlans = await fetchScopedListMerged<Record<string, unknown>>({
      supabase,
      table: "subscription_plans",
      tenantId: currentTenantId,
      select: "*",
      dedupeKey: (row) => String(row.name ?? row.id ?? ""),
      orderBy: { column: "display_order", ascending: true },
    });
    const subscriptionPlans = scopedSubscriptionPlans.data || [];

    const scopedPricingPlans = await fetchScopedListMerged<Record<string, unknown>>({
      supabase,
      table: "pricing_plans",
      tenantId: currentTenantId,
      select: "*",
      dedupeKey: (row) =>
        String(row.subscription_plan_id ?? row.name ?? row.id ?? ""),
      orderBy: { column: "display_order", ascending: true },
    });
    const pricingPlans = scopedPricingPlans.data || [];
    const diagnostics = {
      tenant_id: currentTenantId,
      subscription_plan_count: subscriptionPlans.length,
      pricing_plan_count: pricingPlans.length,
      source: "tenant_global_merged",
      empty_reason:
        subscriptionPlans.length === 0
          ? currentTenantId
            ? "No tenant-specific or global subscription_plans are visible for the current admin tenant."
            : "No global subscription_plans are visible in the current admin scope."
          : null,
    };
    const pricingPlanBySubscriptionPlanId = new Map<string, Record<string, unknown>>();
    for (const plan of pricingPlans) {
      const subscriptionPlanId = String(plan.subscription_plan_id ?? "");
      if (subscriptionPlanId) pricingPlanBySubscriptionPlanId.set(subscriptionPlanId, plan);
    }

    const pricingPlanIds = pricingPlans
      .map((plan) => String(plan.id ?? ""))
      .filter(Boolean);
    const featureLinesByPlanId = new Map<string, string[]>();
    if (pricingPlanIds.length > 0) {
      const { data: features, error: featureErr } = await supabase
        .from("pricing_plan_features")
        .select("plan_id, feature_text, display_order")
        .in("plan_id", pricingPlanIds)
        .order("display_order", { ascending: true });
      if (featureErr) throw featureErr;
      for (const feature of features || []) {
        const planId = String(feature.plan_id ?? "");
        if (!planId) continue;
        const current = featureLinesByPlanId.get(planId) || [];
        current.push(String(feature.feature_text ?? ""));
        featureLinesByPlanId.set(planId, current);
      }
    }

    const plansWithPricing = subscriptionPlans.map((subscriptionPlan) => {
      const planId = String(subscriptionPlan.id ?? "");
      const pricingPlan = pricingPlanBySubscriptionPlanId.get(planId) || null;
      if (!pricingPlan) {
        return { ...subscriptionPlan, pricing_plan: null };
      }
      const pricingPlanId = String(pricingPlan.id ?? "");
      return {
        ...subscriptionPlan,
        pricing_plan: {
          ...pricingPlan,
          feature_lines: pricingPlanId ? featureLinesByPlanId.get(pricingPlanId) || [] : [],
        },
      };
    });

    return successResponse({
      plans: plansWithPricing,
      meta: diagnostics,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch plans");
  }
}
