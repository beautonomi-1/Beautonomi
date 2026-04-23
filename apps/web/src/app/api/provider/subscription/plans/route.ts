import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { ensurePlanOptionHasBarePlanId } from "@/lib/subscription/extract-subscription-plan-uuid";
import { getDisplayFeatureBulletsForSubscriptionPlans } from "@/lib/subscription/pricing-plan-display-features";
import {
  filterPlansForPublishedCatalog,
  getPublishedPaidSubscriptionPlanIds,
} from "@/lib/subscription/published-subscription-plans";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);

    if (!providerId) return notFoundResponse("Provider not found");

    const { data: prow } = await supabaseAdmin
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    const effectiveTenantId =
      (prow as { tenant_id?: string | null } | null)?.tenant_id ??
      (await resolveTenantIdWithZaFallback(request));
    const tenantRegion = await getTenantRegionConfig(effectiveTenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    const { data: plansRaw, error } = await supabaseAdmin
      .from("subscription_plans")
      .select("*")
      .eq("is_active", true)
      .order("display_order", { ascending: true, nullsFirst: false });

    if (error) {
      console.error("Error fetching subscription plans:", error);
      return handleApiError(error, "Failed to load subscription plans");
    }

    const publishedPaidIds = await getPublishedPaidSubscriptionPlanIds(supabaseAdmin, effectiveTenantId);
    const plans = filterPlansForPublishedCatalog(plansRaw as { id: string; is_free?: boolean }[], publishedPaidIds);

    const planRows = (plans || []) as { id: string }[];
    const featureMap = await getDisplayFeatureBulletsForSubscriptionPlans(
      supabaseAdmin,
      effectiveTenantId,
      planRows.map((p) => p.id)
    );

    const result = (plans || []).flatMap((p: any) => {
      const features = featureMap.get(p.id) ?? [];
      const description =
        typeof p.description === "string" && p.description.trim() ? p.description.trim() : null;
      const limits = p.limits || { max_bookings: null, max_staff: null, max_locations: null };
      const options: any[] = [];

      if (p.is_free) {
        options.push({
          id: `${p.id}:free`,
          plan_id: p.id,
          name: p.name,
          description,
          amount: 0,
          price: 0,
          currency: p.currency || lastResortCurrency,
          interval: "month",
          billing_period: "monthly",
          features,
          limits,
          is_popular: p.is_popular || false,
          is_free: true,
        });
        return options;
      }

      if (p.price_monthly != null) {
        options.push({
          id: `${p.id}:monthly`,
          plan_id: p.id,
          name: p.name,
          description,
          amount: Number(p.price_monthly),
          price: Number(p.price_monthly),
          currency: p.currency || lastResortCurrency,
          interval: "month",
          billing_period: "monthly",
          features,
          limits,
          is_popular: p.is_popular || false,
          is_free: false,
        });
      }
      if (p.price_yearly != null) {
        options.push({
          id: `${p.id}:yearly`,
          plan_id: p.id,
          name: p.name,
          description,
          amount: Number(p.price_yearly),
          price: Number(p.price_yearly),
          currency: p.currency || lastResortCurrency,
          interval: "year",
          billing_period: "yearly",
          features,
          limits,
          is_popular: p.is_popular || false,
          is_free: false,
        });
      }

      if (options.length === 0) {
        options.push({
          id: p.id,
          plan_id: p.id,
          name: p.name,
          description,
          amount: Number(p.amount || 0),
          price: Number(p.amount || 0),
          currency: p.currency || lastResortCurrency,
          interval: p.interval || "month",
          billing_period: p.interval === "year" ? "yearly" : "monthly",
          features,
          limits,
          is_popular: p.is_popular || false,
          is_free: Number(p.amount || 0) === 0,
        });
      }

      return options;
    });

    return successResponse(result.map(ensurePlanOptionHasBarePlanId));
  } catch (error) {
    console.error("Error fetching subscription plans:", error);
    return handleApiError(error, "Failed to load subscription plans");
  }
}
