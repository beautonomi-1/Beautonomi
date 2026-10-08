import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { resolveTenantFromRequest } from "@/lib/tenant/resolve-tenant-from-db";
import {
  buildPublicPricingBillingPeriods,
  loadLinkedSubscriptionPlanPrices,
} from "@/lib/pricing/public-pricing-billing-periods";

function derivePricingPlanIsFree(plan: {
  price: string;
  paystack_plan_code_monthly?: string | null;
  paystack_plan_code_yearly?: string | null;
}): boolean {
  const hasAnyPaystackCode = Boolean(
    plan.paystack_plan_code_monthly || plan.paystack_plan_code_yearly,
  );
  const priceStr = String(plan.price ?? "").replace(/[^0-9.]/g, "");
  const isFreeByPrice =
    !priceStr || parseFloat(priceStr) === 0 || /free/i.test(String(plan.price ?? ""));
  return isFreeByPrice && !hasAnyPaystackCode;
}

/**
 * GET /api/public/pricing/plans/[planId]
 *
 * Returns a single pricing plan for subscription checkout: display fields plus
 * available_billing_periods so the UI only offers monthly/yearly when Paystack
 * plan codes are configured. Does not expose Paystack plan codes.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  try {
    const request = _request as Request;
    const { planId } = await params;
    if (!planId) {
      return NextResponse.json(
        { error: "Plan ID is required" },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseServer();
    const tenant = await resolveTenantFromRequest(request);
    const tenantId = tenant?.id ?? "";

    let tenantPlan: {
      id: string;
      name: string;
      price: string;
      period: string | null;
      description: string | null;
      cta_text: string;
      is_popular: boolean;
      paystack_plan_code_monthly?: string | null;
      paystack_plan_code_yearly?: string | null;
    } | null = null;
    if (tenantId) {
      const { data } = await supabase
        .from("pricing_plans")
        .select(
          "id, name, price, period, description, cta_text, is_popular, currency, paystack_plan_code_monthly, paystack_plan_code_yearly"
        )
        .eq("id", planId)
        .eq("is_active", true)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      tenantPlan = (data as typeof tenantPlan) ?? null;
    }

    const { data: globalPlan, error: planError } = await supabase
      .from("pricing_plans")
      .select(
        "id, name, price, period, description, cta_text, is_popular, currency, paystack_plan_code_monthly, paystack_plan_code_yearly"
      )
      .eq("id", planId)
      .eq("is_active", true)
      .is("tenant_id", null)
      .maybeSingle();

    const plan = tenantPlan ?? globalPlan;
    if (!plan && tenantId) {
      // fallback by stable marketing key (plan name) if URL id points to global row.
      const { data: requested } = await supabase
        .from("pricing_plans")
        .select("name")
        .eq("id", planId)
        .maybeSingle();
      if (requested?.name) {
        const { data: overrideByName } = await supabase
          .from("pricing_plans")
          .select(
            "id, name, price, period, description, cta_text, is_popular, currency, paystack_plan_code_monthly, paystack_plan_code_yearly"
          )
          .eq("name", requested.name)
          .eq("is_active", true)
          .eq("tenant_id", tenantId)
          .maybeSingle();
        if (overrideByName) {
          const { data: overrideLink } = await supabase
            .from("pricing_plans")
            .select("subscription_plan_id")
            .eq("id", overrideByName.id)
            .maybeSingle();
          const subscriptionPlanId =
            (overrideLink as { subscription_plan_id?: string | null } | null)?.subscription_plan_id ??
            null;
          const linked = await loadLinkedSubscriptionPlanPrices(supabase, subscriptionPlanId);
          const isFree = derivePricingPlanIsFree(overrideByName);
          const available_billing_periods = buildPublicPricingBillingPeriods({
            isFree,
            paystackPlanCodeMonthly: overrideByName.paystack_plan_code_monthly,
            paystackPlanCodeYearly: overrideByName.paystack_plan_code_yearly,
            linkedPriceMonthly: linked.price_monthly,
            linkedPriceYearly: linked.price_yearly,
          });
          return NextResponse.json({
            data: {
              id: overrideByName.id,
              name: overrideByName.name,
              price: overrideByName.price,
              period: overrideByName.period,
              description: overrideByName.description,
              cta_text: overrideByName.cta_text,
              is_popular: overrideByName.is_popular,
              currency: linked.currency ?? (overrideByName as { currency?: string | null }).currency ?? null,
              features: [],
              available_billing_periods,
              is_free: isFree,
              subscription_plan_id: subscriptionPlanId,
              price_monthly: linked.price_monthly,
              price_yearly: linked.price_yearly,
            },
          });
        }
      }
    }

    if (planError || !plan) {
      return NextResponse.json(
        { error: "Pricing plan not found or inactive" },
        { status: 404 }
      );
    }

    const { data: features } = await supabase
      .from("pricing_plan_features")
      .select("feature_text")
      .eq("plan_id", plan.id)
      .order("display_order", { ascending: true });

    const isFree = derivePricingPlanIsFree(
      plan as {
        price: string;
        paystack_plan_code_monthly?: string | null;
        paystack_plan_code_yearly?: string | null;
      },
    );

    const { data: fullPlan } = await supabase
      .from("pricing_plans")
      .select("subscription_plan_id")
      .eq("id", plan.id)
      .maybeSingle();
    const subscriptionPlanId =
      (fullPlan as { subscription_plan_id?: string | null } | null)?.subscription_plan_id ?? null;
    const linked = await loadLinkedSubscriptionPlanPrices(supabase, subscriptionPlanId);

    const available_billing_periods = buildPublicPricingBillingPeriods({
      isFree,
      paystackPlanCodeMonthly: (plan as { paystack_plan_code_monthly?: string | null }).paystack_plan_code_monthly,
      paystackPlanCodeYearly: (plan as { paystack_plan_code_yearly?: string | null }).paystack_plan_code_yearly,
      linkedPriceMonthly: linked.price_monthly,
      linkedPriceYearly: linked.price_yearly,
    });

    return NextResponse.json({
      data: {
        id: plan.id,
        name: plan.name,
        price: plan.price,
        period: plan.period,
        description: plan.description,
        cta_text: plan.cta_text,
        is_popular: plan.is_popular,
        currency: linked.currency ?? (plan as { currency?: string | null }).currency ?? null,
        features: features?.map((f) => f.feature_text) ?? [],
        available_billing_periods,
        is_free: isFree,
        subscription_plan_id: subscriptionPlanId,
        price_monthly: linked.price_monthly,
        price_yearly: linked.price_yearly,
      },
    });
  } catch (error) {
    console.error("Error fetching pricing plan:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
