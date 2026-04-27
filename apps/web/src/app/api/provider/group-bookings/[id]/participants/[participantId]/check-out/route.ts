import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
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
    const admin = getSupabaseAdmin();
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const { id, participantId } = await params;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: group, error: groupError } = await admin
      .from("group_bookings")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .maybeSingle();

    if (groupError) {
      throw groupError;
    }
    if (!group) {
      return notFoundResponse("Group booking not found");
    }

    const now = new Date().toISOString();
    const { data: participant, error } = await admin
      .from("booking_participants")
      .update({
        checked_out_at: now,
        updated_at: now,
      })
      .eq("id", participantId)
      .eq("group_booking_id", id)
      .select("id, booking_id, checked_out_at")
      .maybeSingle();

    if (error || !participant) {
      return notFoundResponse("Participant not found");
    }

    if (participant.booking_id) {
      const { error: bookingError } = await admin
        .from("bookings")
        .update({
          status: "completed",
          checked_out_at: now,
          updated_at: now,
        })
        .eq("id", participant.booking_id)
        .eq("group_booking_id", id)
        .eq("provider_id", providerId)
        .not("status", "in", "(cancelled,no_show)");
      if (bookingError) {
        throw bookingError;
      }
    }

    const { count, error: remainingError } = await admin
      .from("booking_participants")
      .select("id", { count: "exact", head: true })
      .eq("group_booking_id", id)
      .is("checked_out_at", null);
    if (remainingError) {
      throw remainingError;
    }
    if (count === 0) {
      const { error: statusError } = await admin
        .from("group_bookings")
        .update({ status: "completed", updated_at: now })
        .eq("id", id)
        .eq("provider_id", providerId)
        .not("status", "in", "(cancelled)");
      if (statusError) {
        throw statusError;
      }
    }

    return successResponse({
      success: true,
      message: "Participant checked out successfully",
      checked_out_at: participant.checked_out_at,
      participant,
    });
  } catch (error) {
    return handleApiError(error, "Failed to check out participant");
  }
}
