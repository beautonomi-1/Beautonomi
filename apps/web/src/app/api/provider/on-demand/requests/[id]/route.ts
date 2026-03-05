import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
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
 * Lazy expiry: if status is requested and expires_at has passed, mark expired and return updated row.
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

    const now = new Date().toISOString();
    if (data.status === "requested" && data.expires_at && data.expires_at <= now) {
      const admin = getSupabaseAdmin();
      const { data: updated } = await admin
        .from("on_demand_requests")
        .update({ status: "expired", updated_at: now })
        .eq("id", id)
        .eq("provider_id", providerId)
        .eq("status", "requested")
        .select()
        .maybeSingle();
      return successResponse(updated ?? { ...data, status: "expired", updated_at: now });
    }
    return successResponse(data);
  } catch (error) {
    return handleApiError(error as Error, "Failed to fetch on-demand request");
  }
}
