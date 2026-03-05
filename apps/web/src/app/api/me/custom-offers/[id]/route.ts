import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";

/**
 * GET /api/me/custom-offers/[id]
 * Returns the offer for the current customer (for success page to poll for booking_id after payment).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireRoleInApi(["customer", "superadmin"], request);
    const supabase = await getSupabaseServer();
    const { id } = await params;

    const { data: offerRow, error } = await supabase
      .from("custom_offers")
      .select("id, status, booking_id, paid_at, request_id")
      .eq("id", id)
      .single();
    if (error || !offerRow) return notFoundResponse("Offer not found");

    const offer = offerRow as { id: string; status: string; booking_id?: string | null; paid_at?: string | null; request_id: string };
    const { data: reqRow } = await supabase
      .from("custom_requests")
      .select("customer_id")
      .eq("id", offer.request_id)
      .single();
    const req = reqRow as { customer_id: string } | null;
    if (!req || req.customer_id !== user.id) return notFoundResponse("Offer not found");

    return successResponse({
      id: offer.id,
      status: offer.status,
      booking_id: offer.booking_id ?? null,
      paid_at: offer.paid_at ?? null,
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch offer");
  }
}
