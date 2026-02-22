import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/admin/automations/stats
 * 
 * Get automation statistics for admin dashboard
 */
export async function GET(_request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin']);

    const supabaseAdmin = getSupabaseAdmin();

    // Get total automations
    const { count: totalCount } = await supabaseAdmin
      .from("marketing_automations")
      .select("*", { count: "exact", head: true })
      .eq("is_template", false);

    // Get active automations
    const { count: activeCount } = await supabaseAdmin
      .from("marketing_automations")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true)
      .eq("is_template", false);

    // Get total executions
    const { count: totalExecutions } = await supabaseAdmin
      .from("automation_executions")
      .select("*", { count: "exact", head: true });

    // Get executions today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { count: executionsToday } = await supabaseAdmin
      .from("automation_executions")
      .select("*", { count: "exact", head: true })
      .gte("executed_at", today.toISOString());

    // Get executions this month
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const { count: executionsThisMonth } = await supabaseAdmin
      .from("automation_executions")
      .select("*", { count: "exact", head: true })
      .gte("executed_at", monthStart.toISOString());

    // Get providers with automations
    const { data: providersWithAutomations } = await supabaseAdmin
      .from("marketing_automations")
      .select("provider_id")
      .eq("is_template", false)
      .not("provider_id", "is", null);

    const uniqueProviders = new Set(
      providersWithAutomations?.map((p) => p.provider_id) || []
    ).size;

    // Calculate revenue from automation-enabled subscriptions
    // This is an estimate based on providers who have automations and their subscription plans
    const { data: providerSubscriptions } = await supabaseAdmin
      .from("provider_subscriptions")
      .select(`
        provider_id,
        plan:subscription_plans(
          id,
          name,
          price_monthly,
          features
        )
      `)
      .eq("status", "active")
      .gte("expires_at", new Date().toISOString());

    let revenueFromAutomations = 0;
    const providersWithActiveAutomations = new Set(
      providersWithAutomations?.map((p) => p.provider_id) || []
    );

    providerSubscriptions?.forEach((sub: any) => {
      if (
        providersWithActiveAutomations.has(sub.provider_id) &&
        sub.plan?.features?.marketing_automations?.enabled
      ) {
        revenueFromAutomations += sub.plan.price_monthly || 0;
      }
    });

    // Calculate average automations per provider
    const avgAutomationsPerProvider =
      uniqueProviders > 0
        ? (totalCount || 0) / uniqueProviders
        : 0;

    return successResponse({
      total_automations: totalCount || 0,
      active_automations: activeCount || 0,
      total_executions: totalExecutions || 0,
      executions_today: executionsToday || 0,
      executions_this_month: executionsThisMonth || 0,
      providers_with_automations: uniqueProviders,
      revenue_from_automations: revenueFromAutomations,
      avg_automations_per_provider: avgAutomationsPerProvider,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch automation statistics");
  }
}
