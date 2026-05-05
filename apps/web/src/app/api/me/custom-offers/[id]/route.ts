import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";

/**
 * GET /api/me/custom-offers/[id]
 * Returns full offer + request detail for the current customer.
 * Used both for post-payment booking_id polling and for the in-chat detail sheet.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireRoleInApi(["customer", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    const { data: offerRow, error } = await supabase
      .from("custom_offers")
      .select(`
        id,
        status,
        booking_id,
        paid_at,
        request_id,
        price,
        currency,
        duration_minutes,
        expiration_at,
        notes,
        travel_fee,
        staff_id,
        request:custom_requests(
          id,
          customer_id,
          service_name,
          description,
          location_type,
          preferred_start_at,
          address_line1,
          address_line2,
          address_city,
          address_state,
          address_postal_code
        )
      `)
      .eq("id", id)
      .single();

    if (error || !offerRow) return notFoundResponse("Offer not found");

    const offer = offerRow as any;
    const req = offer.request as { customer_id: string } | null;
    if (!req || req.customer_id !== user.id) return notFoundResponse("Offer not found");

    return successResponse(offer);
  } catch (err) {
    return handleApiError(err, "Failed to fetch offer");
  }
}
