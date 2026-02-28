import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";

/**
 * GET /api/me/on-demand/requests/[id]
 * Get a single on-demand request (customer only, RLS enforced).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const { data, error } = await supabase
      .from("on_demand_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return notFoundResponse("Request not found");
    return successResponse(data);
  } catch (error) {
    return handleApiError(error as Error, "Failed to fetch on-demand request");
  }
}
