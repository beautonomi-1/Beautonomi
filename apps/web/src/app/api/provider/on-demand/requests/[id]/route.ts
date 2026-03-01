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
 * GET /api/provider/on-demand/requests/[id]
 * Get a single on-demand request (provider only, RLS enforced).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data, error } = await supabase
      .from("on_demand_requests")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return notFoundResponse("Request not found");
    return successResponse(data);
  } catch (error) {
    return handleApiError(error as Error, "Failed to fetch on-demand request");
  }
}
