import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/admin/plans
 * Returns subscription plans with their linked pricing plan (if any).
 * Use this for the consolidated Plans admin so superadmin manages both in one place.
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const supabase = await getSupabaseServer(request);

    const { data: subscriptionPlans, error: subError } = await supabase
      .from("subscription_plans")
      .select("*")
      .order("display_order", { ascending: true });

    if (subError) throw subError;

    // For each subscription plan, get the pricing_plan that links to it (subscription_plan_id = id)
    const plansWithPricing = await Promise.all(
      (subscriptionPlans || []).map(async (sp) => {
        const { data: pricingPlan } = await supabase
          .from("pricing_plans")
          .select("*")
          .eq("subscription_plan_id", sp.id)
          .maybeSingle();
        return {
          ...sp,
          pricing_plan: pricingPlan || null,
        };
      })
    );

    return successResponse(plansWithPricing);
  } catch (error) {
    return handleApiError(error, "Failed to fetch plans");
  }
}
