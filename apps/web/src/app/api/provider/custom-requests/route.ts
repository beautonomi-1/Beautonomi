import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/custom-requests
 * Provider inbox of custom requests
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return successResponse([]);

    const { data, error } = await supabase
      .from("custom_requests")
      .select(
        `
        *,
        customer:users(id, full_name, email, avatar_url),
        attachments:custom_request_attachments(id, url, created_at),
        offers:custom_offers(id, price, currency, duration_minutes, expiration_at, notes, status, payment_url, payment_reference, paid_at, created_at)
      `
      )
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    return successResponse(data || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch custom requests");
  }
}

