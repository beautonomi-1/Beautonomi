import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

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
    const { planId } = await params;
    if (!planId) {
      return NextResponse.json(
        { error: "Plan ID is required" },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseServer();

    const { data: plan, error: planError } = await supabase
      .from("pricing_plans")
      .select(
        "id, name, price, period, description, cta_text, is_popular, paystack_plan_code_monthly, paystack_plan_code_yearly"
      )
      .eq("id", planId)
      .eq("is_active", true)
      .single();

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
