import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  errorResponse,
  handleApiError,
  notFoundResponse,
  requireAuthInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { normalizeGroupBookingId, resolveMeGroupAccess } from "@/lib/bookings/me-group-access";
import { cancelGroupGuest } from "@/lib/bookings/cancelGroupGuest";

/**
 * POST /api/me/group-bookings/[id]/participants/[participantId]/cancel
 * A guest cancels their own spot, or the organizer removes a guest.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; participantId: string }> },
) {
  try {
    const { user } = await requireAuthInApi(request);
    const { id: rawId, participantId } = await params;
    const groupId = normalizeGroupBookingId(rawId);
    const admin = getSupabaseAdmin();

    const access = await resolveMeGroupAccess(admin, groupId, user.id);
    if (!access) return notFoundResponse("Group booking not found");
    const isSelf = access.ownParticipantIds.includes(participantId);
    if (!access.isPrimary && !isSelf) {
      return errorResponse("You can only cancel your own spot.", "FORBIDDEN", 403);
    }

    const result = await cancelGroupGuest(admin, {
      participantId,
      groupBookingId: groupId,
      cancelledBy: user.id,
      reason: isSelf ? "Guest cancelled their spot" : "Organizer removed guest",
      enforcePolicyWindow: true,
    });
    if (result.ok === false) {
      switch (result.code) {
        case "PRIMARY_PARTICIPANT":
          return errorResponse(
            "The organizer must cancel the whole booking instead.",
            "PRIMARY_PARTICIPANT",
            400,
          );
        case "CANCELLATION_WINDOW_CLOSED":
          return errorResponse(
            "It's too late to cancel online. Please contact the venue.",
            "CANCELLATION_WINDOW_CLOSED",
            409,
          );
        case "BOOKING_CLOSED":
          return errorResponse("This group booking is already closed.", "BOOKING_CLOSED", 409);
        default:
          return notFoundResponse("Participant not found");
      }
    }

    return successResponse({
      mode: result.mode,
      guest_refunded: result.guestRefunded,
      wallet_credited: result.walletCredited,
      overpaid_amount: result.overpaidAmount,
    });
  } catch (error) {
    return handleApiError(error, "Failed to cancel guest");
  }
}
