import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/bookings/[id]/additional-charges
 *
 * List additional charges for a booking (provider view).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: booking } = await supabase
      .from("bookings")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!booking) return notFoundResponse("Booking not found");

    const { data: charges, error } = await (supabase
      .from("additional_charges") as any)
      .select("*")
      .eq("booking_id", id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return successResponse({ charges: charges || [] });
  } catch (error) {
    return handleApiError(error, "Failed to fetch additional charges");
  }
}

