import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getProviderIdForUser, successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { requireRoleInApi } from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/custom-offers/[id]
 * Fetch a single offer with its request for editing/resend. Provider must own the offer.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { id: offerId } = await params;

    const { data: row, error } = await supabase
      .from("custom_offers")
      .select(`
        id,
        request_id,
        provider_id,
        price,
        currency,
        duration_minutes,
        expiration_at,
        notes,
        staff_id,
        travel_fee,
        status,
        request:custom_requests(
          id,
          customer_id,
          provider_id,
          service_category_id,
          service_name,
          location_type,
          description,
          preferred_start_at,
          address_line1,
          address_line2,
          address_city,
          address_state,
          address_country,
          address_postal_code
        )
      `)
      .eq("id", offerId)
      .single();

    if (error || !row) return notFoundResponse("Offer not found");
    const offer = row as any;
    if (offer.provider_id !== providerId) return notFoundResponse("Offer not found");

    return successResponse(offer);
  } catch (error) {
    return handleApiError(error, "Failed to fetch offer");
  }
}
