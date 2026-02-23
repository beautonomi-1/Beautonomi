import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/admin/provider-subscriptions
 * Get all provider subscriptions (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get("provider_id");
    const status = searchParams.get("status");

    let query = supabase
      .from("provider_subscriptions")
      .select(`
        *,
        providers:provider_id (
          id,
          business_name,
          slug,
          status
        ),
        subscription_plans:plan_id (
          id,
          name,
          price_monthly,
          price_yearly
        )
      `)
      .order("created_at", { ascending: false });

    if (providerId) {
      query = query.eq("provider_id", providerId);
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data: subscriptions, error } = await query;

    if (error) {
      return handleApiError(error, "Failed to fetch provider subscriptions");
    }

    return successResponse(subscriptions || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch provider subscriptions");
  }
}
