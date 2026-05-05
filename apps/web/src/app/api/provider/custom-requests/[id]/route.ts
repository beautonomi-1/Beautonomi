import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/custom-requests/[id]
 * Fetch a single custom request by id (must belong to the provider).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { id } = await params;
    const { data, error } = await supabase
      .from("custom_requests")
      .select(
        `
        *,
        customer:users(id, full_name, email, avatar_url),
        service_category:global_service_categories!service_category_id(id, name, slug),
        attachments:custom_request_attachments(id, url, created_at),
        offers:custom_offers(id, price, currency, duration_minutes, expiration_at, notes, status, booking_id, payment_url, payment_reference, paid_at, created_at, staff_id, location_id, scheduled_at, travel_fee, staff:provider_staff(id, name), location:provider_locations(id, name))
      `
      )
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (error || !data) return notFoundResponse("Custom request not found");
    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to fetch custom request");
  }
}
