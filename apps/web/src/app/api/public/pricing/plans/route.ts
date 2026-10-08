import { NextResponse } from "next/server";
import { resolveTenantFromRequest } from "@/lib/tenant/resolve-tenant-from-db";
import { fetchScopedListMerged } from "@/lib/tenant/scoped-overrides";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  buildPublicPricingBillingPeriods,
  loadLinkedSubscriptionPlanPricesMap,
} from "@/lib/pricing/public-pricing-billing-periods";

/**
 * GET /api/public/pricing/plans
 *
 * Active pricing plans with feature lines for marketing / native onboarding.
 * Does not expose Paystack plan codes.
 *
 * Uses the service-role client for reads so anonymous / cookie-less clients
 * (e.g. provider app onboarding) still see tenant + global merged cards,
 * consistent with /pricing and admin catalog visibility.
 */
export async function GET(request: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const tenant = await resolveTenantFromRequest(request);
    const tenantId = tenant?.id ?? "";

    const scopedPlans = await fetchScopedListMerged<Record<string, unknown>>({
      supabase: supabaseAdmin,
      table: "pricing_plans",
      tenantId,
      select:
        "id, name, price, period, description, cta_text, is_popular, display_order, currency, paystack_plan_code_monthly, paystack_plan_code_yearly, subscription_plan_id",
      apply: (q) => q.eq("is_active", true),
      dedupeKey: (row) => String(row.name ?? row.id ?? ""),
      orderBy: { column: "display_order", ascending: true },
    });
    const plans = scopedPlans.data as Array<{
      id: string;
      name: string;
      price: string;
      period: string | null;
      description: string | null;
      cta_text: string;
      is_popular: boolean;
      display_order: number;
      currency: string | null;
      paystack_plan_code_monthly?: string | null;
      paystack_plan_code_yearly?: string | null;
      subscription_plan_id?: string | null;
    }>;

    if (!plans?.length) {
      return NextResponse.json({ data: [] });
    }

    const linkedIds = plans
      .map((p) => p.subscription_plan_id?.trim())
      .filter((id): id is string => Boolean(id));
    const linkedMap = await loadLinkedSubscriptionPlanPricesMap(supabaseAdmin, linkedIds);

    const withFeatures = await Promise.all(
      plans.map(async (plan) => {
        const { data: features } = await supabaseAdmin
          .from("pricing_plan_features")
          .select("feature_text")
          .eq("plan_id", plan.id)
          .order("display_order", { ascending: true });

        const hasAnyPaystackCode = Boolean(
          plan.paystack_plan_code_monthly || plan.paystack_plan_code_yearly,
        );
        const priceStr = String(plan.price ?? "").replace(/[^0-9.]/g, "");
        const numericPrice = priceStr ? parseFloat(priceStr) : NaN;
        const isFreeByPrice =
          !priceStr || Number.isNaN(numericPrice) || numericPrice === 0 || /free/i.test(String(plan.price ?? ""));
        const isFree = isFreeByPrice && !hasAnyPaystackCode;

        const linked = plan.subscription_plan_id
          ? linkedMap.get(plan.subscription_plan_id.trim())
          : undefined;

        const available_billing_periods = buildPublicPricingBillingPeriods({
          isFree,
          paystackPlanCodeMonthly: plan.paystack_plan_code_monthly,
          paystackPlanCodeYearly: plan.paystack_plan_code_yearly,
          linkedPriceMonthly: linked?.price_monthly,
          linkedPriceYearly: linked?.price_yearly,
        });

        const displayCurrency = linked?.currency ?? plan.currency ?? null;

        return {
          id: plan.id,
          name: plan.name,
          price: plan.price,
          period: plan.period,
          description: plan.description,
          cta_text: plan.cta_text,
          is_popular: plan.is_popular,
          currency: displayCurrency,
          features: features?.map((f) => f.feature_text).filter(Boolean) ?? [],
          is_free: isFree,
          available_billing_periods,
          subscription_plan_id: plan.subscription_plan_id ?? null,
          price_monthly: linked?.price_monthly ?? null,
          price_yearly: linked?.price_yearly ?? null,
        };
      }),
    );

    return NextResponse.json({ data: withFeatures });
  } catch (e) {
    console.error("GET /api/public/pricing/plans:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
