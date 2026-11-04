import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  errorResponse,
  handleApiError,
  notFoundResponse,
  requireRoleInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { getGroupInviteByToken } from "@/lib/bookings/group-invites";
import { cancelGroupGuest } from "@/lib/bookings/cancelGroupGuest";
import { buildGroupInviteView, rateLimitGroupInvite } from "@/lib/bookings/group-invite-view";

/**
 * POST /api/public/group-invites/[token]/cancel
 * Guest "Cancel my spot": removes the guest's services from the group booking and refunds a
 * paid share to the guest's original payment method.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const limited = await rateLimitGroupInvite(request);
    if (limited) return limited;
    const { user } = await requireRoleInApi(["customer", "superadmin"], request);
    const { token } = await params;
    const admin = getSupabaseAdmin();
    const invite = await getGroupInviteByToken(admin, token);
    if (!invite) return notFoundResponse("Invite not found");
    if (invite.status !== "pending" && invite.status !== "accepted") {
      return errorResponse("This invite is no longer active.", "INVITE_INACTIVE", 409);
    }
    if (invite.status === "accepted" && invite.accepted_by && invite.accepted_by !== user.id) {
      return errorResponse(
        "Only the guest who accepted this invite can cancel it.",
        "FORBIDDEN",
        403,
      );
    }
    if (!invite.booking_participant_id) {
      return errorResponse("Invite is not linked to a participant.", "INVALID_INVITE", 400);
    }

    const result = await cancelGroupGuest(admin, {
      participantId: invite.booking_participant_id,
      groupBookingId: invite.group_booking_id,
      cancelledBy: user.id,
      reason: "Guest cancelled their spot",
      enforcePolicyWindow: true,
    });
    if (result.ok === false) {
      if (result.code === "CANCELLATION_WINDOW_CLOSED") {
        return errorResponse(
          "It's too late to cancel online. Please contact the organizer or the venue.",
          "CANCELLATION_WINDOW_CLOSED",
          409,
        );
      }
      if (result.code === "BOOKING_CLOSED") {
        return errorResponse("This group booking is already closed.", "BOOKING_CLOSED", 409);
      }
      if (result.code === "PRIMARY_PARTICIPANT") {
        return errorResponse(
          "The organizer must cancel the whole booking instead.",
          "PRIMARY_PARTICIPANT",
          400,
        );
      }
      return notFoundResponse("Participant not found");
    }

    const refreshed = await getGroupInviteByToken(admin, token);
    return successResponse({
      invite: refreshed ? await buildGroupInviteView(admin, refreshed) : null,
      guest_refunded: result.guestRefunded,
    });
  } catch (error) {
    return handleApiError(error, "Failed to cancel your spot");
  }
}
