import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { resolveTenantFromRequest } from "@/lib/tenant/resolve-tenant-from-db";

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
          return NextResponse.json({
            data: {
              id: overrideByName.id,
              name: overrideByName.name,
              price: overrideByName.price,
              period: overrideByName.period,
              description: overrideByName.description,
              cta_text: overrideByName.cta_text,
              is_popular: overrideByName.is_popular,
              currency: (overrideByName as { currency?: string | null }).currency ?? null,
              features: [],
              available_billing_periods: [
                ...(overrideByName.paystack_plan_code_monthly ? ["monthly" as const] : []),
                ...(overrideByName.paystack_plan_code_yearly ? ["yearly" as const] : []),
              ],
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

    const available_billing_periods: ("monthly" | "yearly")[] = [];
    if ((plan as any).paystack_plan_code_monthly) {
      available_billing_periods.push("monthly");
    }
    if ((plan as any).paystack_plan_code_yearly) {
      available_billing_periods.push("yearly");
    }

    return NextResponse.json({
      data: {
        id: plan.id,
        name: plan.name,
        price: plan.price,
        period: plan.period,
        description: plan.description,
        cta_text: plan.cta_text,
        is_popular: plan.is_popular,
        currency: (plan as { currency?: string | null }).currency ?? null,
        features: features?.map((f) => f.feature_text) ?? [],
        available_billing_periods,
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
