import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/on-demand/requests
 * List active on-demand requests for the provider (requested and not expired).
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("on_demand_requests")
      .select("*")
      .eq("provider_id", providerId)
      .eq("status", "requested")
      .gt("expires_at", now)
      .order("requested_at", { ascending: false });

    if (error) throw error;
    return successResponse(data ?? []);
  } catch (error) {
    return handleApiError(error as Error, "Failed to list on-demand requests");
  }
}
