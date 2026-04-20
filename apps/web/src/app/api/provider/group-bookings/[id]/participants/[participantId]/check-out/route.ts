import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * POST /api/provider/group-bookings/[id]/participants/[participantId]/check-out
 * 
 * Check out a group booking participant
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; participantId: string }> }
) {
  try {
    const supabase = await getSupabaseServer(request);
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const { id, participantId } = await params;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // §Provider-audit 2026-04 (round 8): scope the update to the caller's
    // provider to prevent cross-tenant writes. We also refuse to "complete"
    // a booking that's already cancelled / no-show — those are terminal
    // states and should not silently flip back.
    const { data, error } = await supabase
      .from("bookings")
      .update({
        status: "completed",
        checked_out_at: new Date().toISOString(),
      })
      .eq("id", participantId)
      .eq("group_booking_id", id)
      .eq("provider_id", providerId)
      .not("status", "in", "(cancelled,no_show)")
      .select()
      .single();

    if (error || !data) {
      return notFoundResponse("Participant booking not found");
    }

    return successResponse({
      success: true,
      message: "Participant checked out successfully",
      checked_out_at: data.checked_out_at,
      booking: data,
    });
  } catch (error) {
    return handleApiError(error, "Failed to check out participant");
  }
}
