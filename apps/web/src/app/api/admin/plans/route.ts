import { NextRequest } from "next/server";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { fetchScopedListMerged, resolveAdminTenantContext } from "@/lib/tenant/scoped-overrides";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/admin/plans
 * Returns subscription plans with their linked pricing plan (if any), plus pricing-only rows
 * when active marketing cards exist without a resolvable subscription plan link.
 *
 * Uses the service-role client for reads so RLS cannot hide global `tenant_id` null rows
 * while still merging tenant overrides the same way as scoped helpers.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const supabaseAdmin = getSupabaseAdmin();
    const { currentTenantId } = await resolveAdminTenantContext(request, undefined, user.role ?? null);

    const scopedSubscriptionPlans = await fetchScopedListMerged<Record<string, unknown>>({
      supabase: supabaseAdmin,
      table: "subscription_plans",
      tenantId: currentTenantId,
      select: "*",
      dedupeKey: (row) => String(row.name ?? row.id ?? ""),
      orderBy: { column: "display_order", ascending: true },
    });
    const subscriptionPlans = scopedSubscriptionPlans.data || [];

    const scopedPricingPlans = await fetchScopedListMerged<Record<string, unknown>>({
      supabase: supabaseAdmin,
      table: "pricing_plans",
      tenantId: currentTenantId,
      select: "*",
      dedupeKey: (row) =>
        String(row.subscription_plan_id ?? row.name ?? row.id ?? ""),
      orderBy: { column: "display_order", ascending: true },
    });
    const pricingPlans = scopedPricingPlans.data || [];

    const subscriptionPlanIdSet = new Set(
      subscriptionPlans.map((p) => String(p.id ?? "")).filter(Boolean),
    );

    const activePricingPlans = pricingPlans.filter((p) => p.is_active !== false);
    const inactivePricingCount = pricingPlans.length - activePricingPlans.length;

    const pricingPlanBySubscriptionPlanId = new Map<string, Record<string, unknown>>();
    for (const plan of pricingPlans) {
      const subscriptionPlanId = String(plan.subscription_plan_id ?? "");
      if (subscriptionPlanId) pricingPlanBySubscriptionPlanId.set(subscriptionPlanId, plan);
    }

    const linkedSubscriptionPlanIds = new Set(pricingPlanBySubscriptionPlanId.keys());

    const pricingOnlyRows: Record<string, unknown>[] = [];
    for (const pp of activePricingPlans) {
      const sid = String(pp.subscription_plan_id ?? "").trim();
      if (!sid) {
        pricingOnlyRows.push({
          row_kind: "pricing_only",
          reason: "no_subscription_link",
          orphan_subscription_plan_id: null,
          pricing_plan_id: String(pp.id ?? ""),
          pricing_plan: { ...pp },
        });
        continue;
      }
      if (!subscriptionPlanIdSet.has(sid)) {
        pricingOnlyRows.push({
          row_kind: "pricing_only",
          reason: "unknown_subscription_plan",
          orphan_subscription_plan_id: sid,
          pricing_plan_id: String(pp.id ?? ""),
          pricing_plan: { ...pp },
        });
      }
    }

    const unlinkedSubscriptionCount = subscriptionPlans.filter((sp) => {
      const id = String(sp.id ?? "");
      return id && !linkedSubscriptionPlanIds.has(id);
    }).length;

    const diagnostics = {
      tenant_id: currentTenantId,
      subscription_plan_count: subscriptionPlans.length,
      pricing_plan_count: pricingPlans.length,
      active_pricing_plan_count: activePricingPlans.length,
      inactive_pricing_plan_count: inactivePricingCount,
      pricing_only_active_count: pricingOnlyRows.length,
      unlinked_subscription_plans_count: unlinkedSubscriptionCount,
      subscription_scope_source: scopedSubscriptionPlans.source,
      pricing_scope_source: scopedPricingPlans.source,
      read_client: "service_role",
      empty_reason:
        subscriptionPlans.length === 0 && pricingOnlyRows.length === 0
          ? currentTenantId
            ? "No tenant-specific or global subscription_plans are visible for the current admin tenant merge."
            : "No global subscription_plans are visible for the current admin tenant merge."
          : subscriptionPlans.length === 0 && pricingOnlyRows.length > 0
            ? "subscription_plans merge is empty but active pricing_plans exist — use pricing-only actions below to create or link subscription rows."
            : null,
    };

    const pricingPlanIds = pricingPlans
      .map((plan) => String(plan.id ?? ""))
      .filter(Boolean);
    const featureLinesByPlanId = new Map<string, string[]>();
    if (pricingPlanIds.length > 0) {
      const { data: features, error: featureErr } = await supabaseAdmin
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

    for (const row of pricingOnlyRows) {
      const pp = row.pricing_plan as Record<string, unknown>;
      const pid = String(pp.id ?? row.pricing_plan_id ?? "");
      if (pid) {
        row.pricing_plan = {
          ...pp,
          feature_lines: featureLinesByPlanId.get(pid) || [],
        };
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
      pricing_only: pricingOnlyRows,
      meta: diagnostics,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch plans");
  }
}
