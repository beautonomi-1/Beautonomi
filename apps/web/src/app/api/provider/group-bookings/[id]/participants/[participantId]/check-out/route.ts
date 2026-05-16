import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  notFoundResponse,
  handleApiError,
  forbiddenResponse,
  userHasProviderAccessAdmin,
} from "@/lib/supabase/api-helpers";

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
    const admin = getSupabaseAdmin();
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const { id, participantId } = await params;

    const { data: group, error: groupError } = await admin
      .from("group_bookings")
      .select("id, provider_id")
      .eq("id", id)
      .maybeSingle();

    if (groupError) {
      throw groupError;
    }
    if (!group) {
      return notFoundResponse("Group booking not found");
    }
    if (
      user.role !== "superadmin" &&
      !(await userHasProviderAccessAdmin(admin, user.id, group.provider_id))
    ) {
      return forbiddenResponse("You do not have access to this group booking");
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
        .eq("provider_id", group.provider_id)
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
        .eq("provider_id", group.provider_id)
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
