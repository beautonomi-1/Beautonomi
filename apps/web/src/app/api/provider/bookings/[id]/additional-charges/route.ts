import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { assertProviderUserCanAccessBookingBranch } from "@/lib/provider-booking/booking-branch-access";

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
      .select("id, location_id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!booking) return notFoundResponse("Booking not found");

    const supabaseAdminCharges = getSupabaseAdmin();
    const branchAccess = await assertProviderUserCanAccessBookingBranch(
      supabaseAdminCharges,
      user.id,
      user.role,
      providerId,
      (booking as { location_id?: string | null }).location_id ?? null
    );
    if (branchAccess.allowed === false) {
      return errorResponse(branchAccess.message, "FORBIDDEN", 403);
    }

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

