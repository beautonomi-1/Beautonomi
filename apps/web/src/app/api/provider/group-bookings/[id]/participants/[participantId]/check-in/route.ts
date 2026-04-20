import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * POST /api/provider/group-bookings/[id]/participants/[participantId]/check-in
 * 
 * Check in a group booking participant
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

    // §Provider-audit 2026-04 (round 8): constrain the update to the caller's
    // provider so a staff user cannot mutate bookings that belong to
    // another tenant just by guessing (or being handed) IDs. We also
    // reject a check-in if the booking is already cancelled / no-show
    // since those statuses should never silently flip to "checked_in".
    const { data, error } = await supabase
      .from("bookings")
      .update({
        status: "checked_in",
        checked_in_at: new Date().toISOString(),
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
      message: "Participant checked in successfully",
      checked_in_at: data.checked_in_at,
      booking: data,
    });
  } catch (error) {
    return handleApiError(error, "Failed to check in participant");
  }
}
